import { all, statement, state, guard, job, save, partStatements, parts, readPart, cleanCopies, quote, stream, insist, run } from './storage.mjs';
import { catalogue, encodedRow } from './catalogue.mjs';
import { createCopy,readCopy,normalizeCopy } from './copies.mjs';
import { canonicalJson, utf8, base64, StreamHash } from './hash.mjs';
import { FORMAT, makePart, checkPart, ContentVerifier } from './format.mjs';
import { journal } from './journal.mjs';
import { capturePayload, payloadRange } from './payloads.mjs';
import { dropDevData } from './dev-data.mjs';
export async function createExport(context,actor='direct') {
  const {db,config,buckets}=context,s=await state(db);insist(!s.applying,'import_applying',409);
  const cat=await catalogue(db,config),id=crypto.randomUUID(),objects=[];
  for(const [binding,spec] of Object.entries(config.buckets).sort()) {
    let cursor;
    do {
      const page=await buckets[binding].list({prefix:spec.prefix??'',cursor,include:['httpMetadata','customMetadata']});
      for(const object of page.objects) objects.push({bucket:binding,key:object.key,size:object.size,etag:object.etag,httpMetadata:object.httpMetadata??{},customMetadata:object.customMetadata??{}});
      cursor=page.truncated?page.cursor:undefined;
    }while(cursor);
  }
  objects.sort((a,b)=>a.bucket<b.bucket?-1:a.bucket>b.bucket?1:a.key<b.key?-1:a.key>b.key?1:0);
  const copies=Object.fromEntries(cat.tables.map((t,i)=>[t.name,'rer_portability_snap_'+id.replaceAll('-','')+'_'+i]));
  const manifest={kind:'manifest',format:FORMAT,version:1,product:config.product,exportedAt:new Date().toISOString(),sourceIdentity:s.source_identity,schema:cat.identity,tables:cat.tables,objects,payloads:[],excludedTables:cat.excludedTables,excludedColumns:config.secretColumns,requiredConfiguration:config.requiredConfiguration,partCount:0,epoch:s.epoch,journal:await journal(db,s.source_identity)};
  const row={id,kind:'export',actor,phase:'building',completed:0,metadata:{manifest,copies,cursor:{table:0,row:0,binary:0,offset:0},partBytes:config.partBytes}};
  await db.batch([guard(db,'EXISTS(SELECT 1 FROM rer_portability_state WHERE id=1 AND applying=0 AND source_identity=? AND epoch=?)',s.source_identity,s.epoch),
    ...cat.tables.flatMap(t=>createCopy(db,t,copies[t.name],true)),statement(db,'INSERT INTO rer_portability_jobs(id,kind,actor,phase,metadata) VALUES(?,?,?,?,?)',id,'export',actor,row.phase,canonicalJson(row.metadata)),db.prepare('DELETE FROM rer_portability_guard')]);
  try {
    await dropDevData(db,cat.tables,copies);
    for(const t of manifest.tables) t.count=(await statement(db,`SELECT COUNT(*) AS n FROM ${quote(copies[t.name])}`).first()).n;
    for(const [name,producer] of Object.entries(config.extraPayloads).sort()) {
      const descriptor=await capturePayload(db,id,manifest.payloads.length,await producer.produce());manifest.payloads.push({name,...descriptor});
    }
    await run(db,'UPDATE rer_portability_jobs SET metadata=? WHERE id=?',canonicalJson(row.metadata),id);
    await checkReferences(context,row);
    return id;
  }catch(e){await abortExport(context,id);throw e;}
}
async function checkReferences({db,config},row) {
  for(const [binding,spec] of Object.entries(config.buckets)) if(spec.objectReferences) {
    const {table,keyColumn}=spec.objectReferences,keys=new Set((await all(db,`SELECT DISTINCT ${quote(keyColumn)} AS key FROM ${quote(row.metadata.copies[table])} WHERE ${quote(keyColumn)} IS NOT NULL`)).map(x=>x.key));
    const objects=row.metadata.manifest.objects.filter(x=>x.bucket===binding);
    insist(objects.length===keys.size && objects.every(x=>keys.has(x.key)),'object_references:'+binding);
  }
}
async function nextItems(context,row) {
  const {db,config,buckets}=context,{manifest,cursor,copies,partBytes}=row.metadata;
  while(cursor.table<manifest.tables.length && cursor.row===manifest.tables[cursor.table].count){cursor.table++;cursor.row=0;}
  if(cursor.table<manifest.tables.length) {
    const table=manifest.tables[cursor.table];
    if(!row.metadata.normalized?.includes(table.name)) {
      await normalizeCopy(context,table,copies[table.name]);
      row.metadata.normalized??=[];row.metadata.normalized.push(table.name);await save(db,row).run();
    }
    const records=await readCopy(db,table,copies[table.name],cursor.row,Math.min(1000,Math.ceil(partBytes/128)),true);
    const items=[];let size=200;
    for(const {row:record,meta} of records) {
      const value=encodedRow(table,record,config.secretColumns[table.name]??[]);
      const item={kind:'row',table:table.name,index:cursor.row,row:value};
      if(table.rowidAlias){insist(Number.isSafeInteger(meta.rer_portability_source_rowid),'unsafe_integer:'+table.name+':rowid');item.rowid=meta.rer_portability_source_rowid;}
      const bytes=utf8(canonicalJson(item)).length+1;
      insist(bytes+200<=partBytes,'row_part_too_large:'+table.name);
      if(size+bytes>partBytes)break;items.push(item);size+=bytes;cursor.row++;
    }
    return items;
  }
  const entries=[...manifest.objects,...manifest.payloads];
  if(cursor.binary===entries.length)return null;
  const entry=entries[cursor.binary],length=Math.min(entry.size-cursor.offset,Math.max(1,Math.floor((partBytes-200-utf8(canonicalJson({bucket:entry.bucket??null,key:entry.key??null,name:entry.name??null})).length)*3/4)));
  let bytes,item;
  if(cursor.binary<manifest.objects.length) {
    const object=await buckets[entry.bucket].get(entry.key,length?{range:{offset:cursor.offset,length}}:undefined);
    insist(object && object.etag===entry.etag,'object_changed:'+entry.bucket+':'+entry.key);
    bytes=new Uint8Array(await object.arrayBuffer());insist(bytes.length===length,'object_changed:'+entry.key);
    item={kind:'object',bucket:entry.bucket,key:entry.key,offset:cursor.offset,data:base64(bytes)};
  }else{
    bytes=await payloadRange(db,row.id,cursor.binary-manifest.objects.length,cursor.offset,length);
    item={kind:'payload',name:entry.name,offset:cursor.offset,data:base64(bytes)};
  }
  const hash=new StreamHash();if(cursor.hash){hash.h=Uint32Array.from(cursor.hash.h);hash.block=Uint8Array.from(cursor.hash.block);hash.size=cursor.hash.size;hash.used=cursor.hash.used;}
  hash.update(bytes);cursor.offset+=length;
  if(cursor.offset===entry.size) {
    const digest=hash.digest();if(entry.sha256)insist(entry.sha256===digest,'payload_changed');entry.sha256=digest;delete entry.etag;
    cursor.binary++;cursor.offset=0;delete cursor.hash;
  }else cursor.hash={h:[...hash.h],block:[...hash.block],size:hash.size,used:hash.used};
  return [item];
}
export async function advanceExport(context,id,{expectedPart,maxParts=1}={}) {
  insist(Number.isSafeInteger(maxParts) && maxParts>0 && maxParts<=100,'advance_limit');
  for(let n=0;n<maxParts;n++) {
    const row=await job(context.db,id,'export');
    if(row.phase==='complete')return exportStatus(context,id);
    insist(row.phase==='building','export_phase',409);
    if(expectedPart!==undefined && row.completed!==expectedPart)return exportStatus(context,id);
    const before=row.completed,items=await nextItems(context,row);
    if(items) {
      const part=await makePart(before,items);await checkPart(part,before,row.metadata.partBytes);row.completed++;
      try{await context.db.batch([guard(context.db,'(SELECT completed FROM rer_portability_jobs WHERE id=?)=?',id,before),...partStatements(context.db,id,part),save(context.db,row),context.db.prepare('DELETE FROM rer_portability_guard')]);}
      catch(e){if((await job(context.db,id)).completed===before)throw e;}
      if(expectedPart!==undefined)expectedPart++;
    }else{
      // References are checked again against the archived, normalized snapshot.
      await checkReferences(context,row);
      row.metadata.manifest.partCount=row.completed;
      const verifier=new ContentVerifier(row.metadata.manifest);
      for await(const part of parts(context.db,id,row.completed))for(const item of part.items)verifier.add(item);
      row.metadata.contentHash=verifier.digest();row.phase='complete';await save(context.db,row).run();
      // Finished snapshots are kept until abort so erasure can invalidate them.
      return exportStatus(context,id);
    }
  }
  return exportStatus(context,id);
}
export async function exportStatus(context,id) {
  const row=await job(context.db,id,'export');return {id,kind:'export',phase:row.phase,completed:row.completed,total:row.phase==='complete'?row.completed:null,contentHash:row.metadata.contentHash??null};
}
export async function downloadExport(context,id) {
  const row=await job(context.db,id,'export');insist(row.phase==='complete','export_incomplete',409);
  return stream((async function*(){
    yield utf8(canonicalJson(row.metadata.manifest)+'\n');
    for(let i=0;i<row.completed;i++)yield utf8(canonicalJson(await readPart(context.db,id,i))+'\n');
    yield utf8(canonicalJson({kind:'closing',partCount:row.completed,contentHash:row.metadata.contentHash})+'\n');
  })());
}
export async function abortExport(context,id) {
  const row=await job(context.db,id,'export');await cleanCopies(context.db,row);row.phase='aborted';await save(context.db,row).run();return exportStatus(context,id);
}
