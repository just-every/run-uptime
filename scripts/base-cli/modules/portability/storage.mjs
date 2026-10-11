import { canonicalJson } from './hash.mjs';
export class PortabilityError extends Error {
  constructor(code, status=400) { super(code); this.code=code; this.status=status; }
}
export function insist(condition, code, status=400) { if (!condition) throw new PortabilityError(code,status); }
export const quote = name => '"'+name.replaceAll('"','""')+'"';
export const statement = (db,sql,...values) => values.length ? db.prepare(sql).bind(...values) : db.prepare(sql);
export const all = async (db,sql,...values) => (await statement(db,sql,...values).all()).results;
export const run = (db,sql,...values) => statement(db,sql,...values).run();
export function guard(db,condition,...values) {
  return statement(db,`INSERT INTO rer_portability_guard(value) SELECT CASE WHEN (${condition}) THEN 1 ELSE 0 END`,...values);
}
export async function state(db) {
  await run(db,'INSERT OR IGNORE INTO rer_portability_state(id,source_identity) VALUES(1,?)',crypto.randomUUID());
  return statement(db,'SELECT * FROM rer_portability_state WHERE id=1').first();
}
export async function job(db,id,kind) {
  const row=await statement(db,'SELECT * FROM rer_portability_jobs WHERE id=?',id).first();
  insist(row && (!kind || row.kind===kind),'job_not_found',404);
  return {...row, metadata:JSON.parse(row.metadata)};
}
export function save(db,row) {
  return statement(db,'UPDATE rer_portability_jobs SET phase=?,completed=?,metadata=? WHERE id=?',row.phase,row.completed,canonicalJson(row.metadata),row.id);
}
export function partStatements(db,id,part) {
  const json=canonicalJson(part), result=[statement(db,'INSERT INTO rer_portability_parts VALUES(?,?,?)',id,part.index,part.sha256)];
  for(let i=0,segment=0;i<json.length;segment++) {
    let end=Math.min(i+32000,json.length);
    const last=json.charCodeAt(end-1),next=json.charCodeAt(end);
    if(last>=0xd800 && last<=0xdbff && next>=0xdc00 && next<=0xdfff) end--;
    result.push(statement(db,'INSERT INTO rer_portability_segments VALUES(?,?,?,?)',id,part.index,segment,json.slice(i,end)));i=end;
  }
  return result;
}
export async function readPart(db,id,index) {
  const rows=await all(db,'SELECT data FROM rer_portability_segments WHERE job=? AND part=? ORDER BY segment',id,index);
  insist(rows.length,'part_missing');
  return JSON.parse(rows.map(x=>x.data).join(''));
}
export async function* parts(db,id,count) { for(let i=0;i<count;i++) yield await readPart(db,id,i); }
export function stream(generator) {
  const iterator=generator[Symbol.asyncIterator]();
  return new ReadableStream({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(next.value);}catch(e){controller.error(e);}},async cancel(){await iterator.return?.();}});
}
export function transferTables(row) { return Object.values(row.metadata.copies??{}).flatMap(name=>[name,name+'_meta']); }
export async function cleanCopies(db,row) {
  await db.batch([...transferTables(row).map(name=>db.prepare(`DROP TABLE IF EXISTS ${quote(name)}`)),
    statement(db,'DELETE FROM rer_portability_parts WHERE job=?',row.id),statement(db,'DELETE FROM rer_portability_segments WHERE job=?',row.id)]);
}
