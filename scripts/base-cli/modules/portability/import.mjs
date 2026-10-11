import { all, statement, state, guard, job, save, partStatements, parts, cleanCopies, quote, stream, insist, run } from './storage.mjs';
import { refuseDevData } from './dev-data.mjs';
import { catalogue, validateRow, bindCell, writableColumns } from './catalogue.mjs';
import { canonicalJson, unbase64 } from './hash.mjs';
import { checkManifest, checkPart, ContentVerifier } from './format.mjs';
import { fence, mergeJournal, tombstone } from './journal.mjs';
import { writeObject } from './payloads.mjs';
import { createCopy,sidecar,readCopy,restoreCopy } from './copies.mjs';
import { excludedDependentGuards } from './restore-safety.mjs';
export async function createImport(context,manifest,actor='direct') {
  const {db,config,buckets}=context;await checkManifest(manifest);await state(db);
  insist(manifest.product===config.product,'wrong_product');
  const cat=await catalogue(db,config),upgrade=config.acceptedSchemas[manifest.schema];
  insist(manifest.schema===cat.identity || upgrade,'schema_mismatch');
  insist(canonicalJson(manifest.tables.map(x=>x.name))===canonicalJson(cat.tables.map(x=>x.name)),'table_inventory');
  if(!upgrade)for(const table of manifest.tables) {
    const target=cat.tables.find(t=>t.name===table.name);
    insist(canonicalJson(table.columns)===canonicalJson(target.columns) && canonicalJson(table.dependencies)===canonicalJson(target.dependencies),'column_inventory');
  }
  insist(canonicalJson(manifest.excludedColumns)===canonicalJson(config.secretColumns),'secret_inventory');
  insist(canonicalJson(manifest.requiredConfiguration)===canonicalJson(config.requiredConfiguration),'configuration_inventory');
  for(const o of manifest.objects) insist(buckets[o.bucket] && config.buckets[o.bucket] && o.key.startsWith(config.buckets[o.bucket].prefix??''),'bucket_inventory');
  insist(canonicalJson(manifest.payloads.map(x=>x.name))===canonicalJson(Object.keys(config.extraPayloads).sort()),'payload_inventory');
  const id=crypto.randomUUID(),copies=Object.fromEntries(cat.tables.map((t,i)=>[t.name,'rer_portability_stage_'+id.replaceAll('-','')+'_'+i]));
  const row={id,kind:'import',actor,phase:'staging',completed:0,metadata:{manifest,copies,targets:cat.tables,triggers:cat.triggers}};
  try {
    await db.batch([guard(db,'(SELECT import_job FROM rer_portability_state WHERE id=1) IS NULL'),
      statement(db,'UPDATE rer_portability_state SET import_job=? WHERE id=1',id),
      ...cat.tables.flatMap(t=>createCopy(db,t,copies[t.name])),
      statement(db,'INSERT INTO rer_portability_jobs(id,kind,actor,phase,metadata) VALUES(?,?,?,?,?)',id,'import',actor,row.phase,canonicalJson(row.metadata)),db.prepare('DELETE FROM rer_portability_guard')]);
  }catch(e){if((await state(db)).import_job)throw new (await import('./storage.mjs')).PortabilityError('import_running',409);throw e;}
  return id;
}
export async function uploadPart(context,id,index,part) {
  const {db,config}=context,row=await job(db,id,'import');await checkPart(part,index,config.partBytes);
  const previous=await statement(db,'SELECT sha256 FROM rer_portability_parts WHERE job=? AND idx=?',id,index).first();
  if(previous){insist(previous.sha256===part.sha256,'part_conflict',409);return importStatus(context,id);}
  insist(row.phase==='staging','import_phase',409);insist(index===row.completed && index<row.metadata.manifest.partCount,'part_order',409);
  const inserts=[],groups=new Map(),manifest=row.metadata.manifest,upgrade=config.acceptedSchemas[manifest.schema];
  for(const item of part.items) {
    if(item.kind==='row') {
      const table=manifest.tables.find(x=>x.name===item.table);insist(table && Number.isSafeInteger(item.index) && item.index>=0 && item.index<table.count,'row_inventory');
      validateRow(table,item.row,manifest.excludedColumns[table.name]??[]);
      const target=row.metadata.targets.find(x=>x.name===table.name);
      const data=upgrade?upgrade.upgradeRow(table.name,structuredClone(item.row)):item.row;
      insist(!(data instanceof Promise),'upgrade_row_must_be_pure');validateRow(target,data,config.secretColumns[table.name]??[]);
      const columns=writableColumns(target);
      const values=columns.map(c=>bindCell(config.secretColumns[table.name]?.includes(c.name)?null:data[c.name]));
      const pk=table.columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk);
      if(!pk.length)insist(Number.isSafeInteger(item.rowid),'rowid_inventory');
      const key=pk.length?Object.fromEntries(pk.map(c=>[c.name,item.row[c.name]])):{rowid:item.rowid};
      const hash=await tombstone(manifest.sourceIdentity,table.name,key);
      if(!groups.has(table.name))groups.set(table.name,{columns:columns.map(c=>quote(c.name)).join(','),rows:[],metadata:[]});
      groups.get(table.name).rows.push(values);
      groups.get(table.name).metadata.push([item.index,item.rowid??null,hash]);
    }else{
      insist(['object','payload'].includes(item.kind) && Number.isSafeInteger(item.offset) && item.offset>=0,'binary_inventory');
      const entry=item.kind==='object'?manifest.objects.find(x=>x.bucket===item.bucket && x.key===item.key):manifest.payloads.find(x=>x.name===item.name);
      insist(entry && item.offset+unbase64(item.data).length<=entry.size,'binary_inventory');
    }
  }
  row.metadata.stagedCounts=Object.assign(Object.create(null),row.metadata.stagedCounts);
  for(const [table,group] of groups) {
    const width=group.rows[0].length,count=Math.min(30,Math.floor(100/width));
    insist(count>0,'unsupported_restore_width:'+table);
    const copy=row.metadata.copies[table],first=(row.metadata.stagedCounts[table]??0)+1;
    for(let start=0;start<group.rows.length;start+=count) {
      const chunk=group.rows.slice(start,start+count);
      inserts.push(statement(db,`INSERT INTO ${quote(copy)} (${group.columns}) VALUES${chunk.map(()=> '('+Array(width).fill('?').join(',')+')').join(',')}`,...chunk.flat()));
      inserts.push(statement(db,`INSERT INTO ${quote(sidecar(copy))} VALUES${chunk.map((_,i)=>`(?,${first+start+i},?,?)`).join(',')}`,...group.metadata.slice(start,start+count).flat()));
    }
    row.metadata.stagedCounts[table]=first-1+group.rows.length;
  }
  const before=row.completed;row.completed++;
  try{await db.batch([guard(db,'(SELECT completed FROM rer_portability_jobs WHERE id=?)=?',id,before),...inserts,...partStatements(db,id,part),save(db,row),db.prepare('DELETE FROM rer_portability_guard')]);}
  catch(e){const duplicate=await statement(db,'SELECT sha256 FROM rer_portability_parts WHERE job=? AND idx=?',id,index).first();if(!duplicate || duplicate.sha256!==part.sha256)throw e;}
  return importStatus(context,id);
}
export async function binaryStream(context,id,entry) {
  const row=await job(context.db,id,'import');
  return stream((async function*(){
    for await(const part of parts(context.db,id,row.completed))for(const item of part.items) {
      if(entry.bucket===undefined?item.kind==='payload' && item.name===entry.name:item.kind==='object' && item.bucket===entry.bucket && item.key===entry.key)yield unbase64(item.data);
    }
  })());
}
async function bucketsEmpty(context,row) {
  const owned=await all(context.db,'SELECT bucket,key FROM rer_portability_owned WHERE job=?',row.id);
  for(const [name,spec] of Object.entries(context.config.buckets)) {
    let cursor;
    do {const page=await context.buckets[name].list({prefix:spec.prefix??'',cursor});
      insist(page.objects.every(o=>owned.some(x=>x.bucket===name && x.key===o.key)),'bucket_not_empty:'+name,409);
      cursor=page.truncated?page.cursor:undefined;
    }while(cursor);
  }
}
function emptyGuards(context,row) {
  return row.metadata.targets.filter(t=>!context.config.replaceableTables.includes(t.name)).map(t=>guard(context.db,`NOT EXISTS(SELECT 1 FROM ${quote(t.name)})`));
}
async function removeOwned(context,id) {
  const owned=await all(context.db,'SELECT bucket,key FROM rer_portability_owned WHERE job=?',id);
  for(const o of owned)await context.buckets[o.bucket].delete(o.key);
  await run(context.db,'DELETE FROM rer_portability_owned WHERE job=?',id);
}
export async function finalizeImport(context,id,{contentHash,laterJournal}={}) {
  const {db,config}=context,row=await job(db,id,'import');
  if(row.phase==='complete')return importStatus(context,id);
  insist(['staging','applying'].includes(row.phase),'import_phase',409);
  const manifest=row.metadata.manifest;insist(row.completed===manifest.partCount,'parts_missing');
  const verifier=new ContentVerifier(manifest);
  for await(const part of parts(db,id,row.completed))for(const item of part.items)verifier.add(item);
  const digest=verifier.digest();if(contentHash!==undefined)insist(contentHash===digest,'content_checksum');
  for(const table of row.metadata.targets) if(!config.replaceableTables.includes(table.name))insist(!(await statement(db,`SELECT 1 FROM ${quote(table.name)} LIMIT 1`).first()),'target_not_empty:'+table.name,409);
  const dependentGuards=await excludedDependentGuards(db,row.metadata.targets,config.replaceableTables);
  await bucketsEmpty(context,row);
  const checked=await fence(db,manifest,row.metadata.copies,laterJournal);
  await refuseDevData(db,row.metadata.copies,row.metadata.targets);
  if(config.validateStaged) {
    const read=async table=>{insist(row.metadata.copies[table],'staged_table');const target=row.metadata.targets.find(t=>t.name===table);return (await readCopy(db,target,row.metadata.copies[table],0,row.metadata.manifest.tables.find(t=>t.name===table).count)).map(x=>x.row);};
    insist(await config.validateStaged({db,tables:{...row.metadata.copies},read,manifest})!==false,'staged_validation');
  }
  row.phase='applying';
  await db.batch([guard(db,'(SELECT import_job FROM rer_portability_state WHERE id=1)=?',id),db.prepare('UPDATE rer_portability_state SET applying=1 WHERE id=1'),save(db,row),db.prepare('DELETE FROM rer_portability_guard')]);
  try {
    for(const object of manifest.objects) {
      await run(db,'INSERT OR IGNORE INTO rer_portability_owned VALUES(?,?,?)',id,object.bucket,object.key);
      await writeObject(context.buckets[object.bucket],object,await binaryStream(context,id,object));
      const stored=await context.buckets[object.bucket].get(object.key);insist(stored,'object_write_failed');
      // Read back independently, including multipart results, before the commit.
      const hash=new (await import('./hash.mjs')).StreamHash();const reader=stored.body.getReader();
      for(;;){const {value,done}=await reader.read();if(done)break;hash.update(value);}reader.releaseLock();
      insist(hash.digest()===object.sha256,'object_write_checksum');
    }
    for(const payload of manifest.payloads)await config.extraPayloads[payload.name].consume(await binaryStream(context,id,payload),payload);
    row.phase='complete';row.metadata.contentHash=digest;
    await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...emptyGuards(context,row),...dependentGuards,
      guard(db,'NOT EXISTS(SELECT 1 FROM rer_portability_epochs WHERE source=? AND epoch>?) AND NOT EXISTS(SELECT 1 FROM rer_portability_state WHERE source_identity=? AND epoch>?)',manifest.sourceIdentity,checked.epoch,manifest.sourceIdentity,checked.epoch),
      ...row.metadata.targets.map(t=>guard(db,`NOT EXISTS(SELECT 1 FROM ${quote(sidecar(row.metadata.copies[t.name]))} s JOIN rer_portability_journal j ON j.source=? AND j.tombstone=s.rer_portability_tombstone)`,manifest.sourceIdentity)),
      ...row.metadata.triggers.map(t=>db.prepare(`DROP TRIGGER ${quote(t.name)}`)),
      ...config.replaceableTables.map(t=>db.prepare(`DELETE FROM ${quote(t)}`)),
      ...row.metadata.targets.flatMap(t=>restoreCopy(db,t,row.metadata.copies[t.name])),
      ...row.metadata.triggers.map(t=>db.prepare(t.sql)),...mergeJournal(db,manifest,checked),save(db,row),
      db.prepare('UPDATE rer_portability_state SET import_job=NULL,applying=0 WHERE id=1'),db.prepare('DELETE FROM rer_portability_guard')]);
  }catch(e){
    // D1 may have committed even when its acknowledgement failed.
    if((await job(db,id)).phase==='complete')return importStatus(context,id);
    await removeOwned(context,id);row.phase='staging';await db.batch([save(db,row),db.prepare('UPDATE rer_portability_state SET applying=0 WHERE id=1')]);throw e;
  }
  return importStatus(context,id);
}
export async function importStatus(context,id) {
  const row=await job(context.db,id,'import');return {id,kind:'import',phase:row.phase,completed:row.completed,total:row.metadata.manifest.partCount,
    contentHash:row.metadata.contentHash??null,requiredConfiguration:row.phase==='complete'?row.metadata.manifest.requiredConfiguration:[]};
}
export async function abortImport(context,id) {
  const row=await job(context.db,id,'import');insist(row.phase!=='complete','import_complete',409);
  await removeOwned(context,id);await cleanCopies(context.db,row);row.phase='aborted';
  await context.db.batch([save(context.db,row),statement(context.db,'UPDATE rer_portability_state SET import_job=NULL,applying=0 WHERE id=1 AND import_job=?',id)]);
  return importStatus(context,id);
}
