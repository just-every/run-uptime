import assert from 'node:assert/strict';
import {createPortability,readArchive} from '@runeditrun/rer/modules/portability';
import {productPolicy} from '../scripts/local/transfer-policy.mjs';
import {fixture} from './resilience/support.mjs';

export function assertStoredFailureHeaders(report,{observationId,trace,secrets}){
 const row=report.failureSnapshots.items.find(item=>item.observation_id===observationId);
 assert.ok(row,'owner incident report contains the stored failing attempt');
 const {snapshot}=row;
 assert.equal(snapshot.method,'GET');assert.equal(snapshot.status,503);
 assert.equal(snapshot.requestHeaders.authorization,'[redacted]');
 assert.equal(snapshot.requestHeaders['x-auth-mirror'],'[redacted]','marking a credential header safe cannot reveal its secret');
 assert.ok(snapshot.requestHeaders['user-agent'].startsWith('uptime-node/'));
 assert.equal(snapshot.requestHeaders['x-correlation-id'],trace,'explicitly safe request value survives storage and incident readback');
 assert.equal(snapshot.responseHeaders['set-cookie'],'[redacted]');
 assert.equal(snapshot.responseHeaders['x-request-id'],trace,'explicitly safe response value survives storage and incident readback');
 assert.equal(snapshot.responseHeaders['content-type'],'text/html');
 assert.ok(snapshot.body.includes('Checkout temporarily unavailable'),'the owner report retains the useful page excerpt');
 for(const secret of secrets)assert.ok(!JSON.stringify(snapshot).includes(secret),'the stored incident snapshot excludes every planted secret');
 for(const secret of secrets)for(const headers of [snapshot.requestHeaders,snapshot.responseHeaders])assert.ok(!JSON.stringify(headers).includes(secret),'incident headers exclude planted secrets');
}

async function durableRows(db){
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;
 return Object.fromEntries(await Promise.all(tables.map(async({name})=>[name,(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}" ORDER BY rowid`).all()).results])));
}
async function transfer(f){
 const service=await createPortability({db:f.DB,policy:productPolicy({...f.bindings,DB:f.DB},()=>null)}),id=await service.exports.create();
 while((await service.exports.advance(id,{maxParts:16})).phase==='building'){}
 const records=[];for await(const record of readArchive(await service.exports.download(id)))records.push(record);
 const payload=records.filter(record=>record.kind==='part').flatMap(part=>part.items).filter(item=>item.kind==='payload'&&item.name==='uptime').sort((a,b)=>a.offset-b.offset);
 const archive=JSON.parse(Buffer.concat(payload.map(item=>Buffer.from(item.data,'base64'))).toString('utf8'));
 return {service,id,archive};
}

export async function proveFailureSnapshotErasure(source,monitor,{incidentId,screenshot,trace,memberRead}){
 const path=`/api/monitors/${monitor.id}/failure-snapshots`;
 const rows=(await source.DB.prepare('SELECT * FROM failure_snapshots WHERE monitor_id=?').bind(monitor.id).all()).results;
 assert.equal(rows.length,1,'the restored installation holds a real snapshot before erasure');
 const stored=JSON.parse(rows[0].snapshot);
 assert.ok(stored.screenshot.ciphertext.length,'the receiving installation holds encrypted artifact bytes');
 const native=await source.request('/api/archive');assert.equal(native.status,200);
 assert.equal(native.data.payload.productTables.failure_snapshots[0].snapshot.includes(screenshot),true,'pre-erasure archive carries the actual artifact');
 const exported=await transfer(source);
 assert.equal(exported.archive.payload.productTables.failure_snapshots[0].snapshot.includes(screenshot),true,'durable transfer payload carries the actual artifact');
 const before=await durableRows(source.DB);
 assert.ok(before.rer_portability_segments.length>0,'export segments are populated before erasure');
 assert.ok(before.archive_history.length>0,'inactive restore has retained original records before erasure');
 const removedHistory=before.archive_history.filter(row=>JSON.parse(row.record).monitor_id===monitor.id||row.table_name==='monitors'&&JSON.parse(row.record).id===monitor.id);
 assert.ok(removedHistory.length>0);
 const erased=await source.request(`/api/monitors/${monitor.id}/erase`,{body:{name:monitor.definition.name}});
 assert.equal(erased.status,200);assert.equal(erased.data.erased,true);
 const {receipt}=erased.data;
 assert.equal(receipt.entityKind,'monitor');assert.equal(receipt.counts.monitors,1);
 assert.equal(receipt.counts.failure_snapshots,rows.length);
 assert.equal(receipt.counts.observations,before.observations.filter(row=>row.slot_id===rows[0].slot_id).length);
 assert.equal(receipt.counts.archive_history,removedHistory.length);
 const saved=await source.DB.prepare('SELECT * FROM uptime_erasure_receipts WHERE id=?').bind(receipt.id).first();
 assert.deepEqual(JSON.parse(saved.counts),receipt.counts,'the public erasure receipt is durable');
 const after=await durableRows(source.DB);
 assert.equal(after.failure_snapshots.length,0);
 for(const name of ['rer_portability_jobs','rer_portability_parts','rer_portability_segments'])assert.equal(after[name].length,0,`${name} retains no transfer copy`);
 assert.ok(Object.keys(after).every(name=>!name.startsWith('rer_portability_snap_')&&!name.startsWith('rer_portability_stage_')),'all durable export and import copies are removed');
 const forbidden=[screenshot,trace,stored.body,...stored.screenshot.ciphertext,rows[0].observation_id,rows[0].slot_id,monitor.id];
 for(const [table,records]of Object.entries(after))for(const value of forbidden)assert.ok(!JSON.stringify(records).includes(value),`${table} retains no erased snapshot or artifact copy`);
 await assert.rejects(exported.service.exports.download(exported.id),/job_not_found/,'the old installation-held transfer cannot be downloaded');
 assert.equal((await source.request(path)).status,404);
 assert.equal((await source.request(`/api/incidents/${incidentId}/failure-report`)).status,404);
 assert.equal((await source.request(`/api/evidence/monitors/${monitor.id}`)).status,404);
 assert.equal((await memberRead(`/api/evidence/monitors/${monitor.id}`)).status,401,'old member authority does not survive inactive restore or erasure');
 const subsequent=await source.request('/api/archive');assert.equal(subsequent.status,200);
 assert.equal(subsequent.data.payload.productTables.failure_snapshots.length,0);
 const nextTransfer=await transfer(source);assert.equal(nextTransfer.archive.payload.productTables.failure_snapshots.length,0);
 for(const value of forbidden){assert.ok(!JSON.stringify(subsequent.data).includes(value));assert.ok(!JSON.stringify(nextTransfer.archive).includes(value))}
 const journal=await source.request('/api/erasure-journal');assert.equal(journal.status,200);
 assert.equal(journal.data.sourceIdentity,native.data.payload.erasureFence.sourceIdentity);
 assert.ok(journal.data.epoch>native.data.payload.erasureFence.epoch,'the source journal postdates the snapshot-bearing archive');
 let fresh;
 try{
  fresh=await fixture();
  const freshBefore=await durableRows(fresh.DB);
  const refused=await fresh.request('/api/restore',{body:{archive:native.data,laterJournal:journal.data}});
  assert.equal(refused.status,400);assert.match(refused.data.error,/erased/,'later source journal refuses a pre-erasure snapshot-bearing archive');
  const freshAfter=await durableRows(fresh.DB);
  for(const name of [...Object.keys(native.data.payload.tables),...Object.keys(native.data.payload.productTables)].filter(name=>name!=='migrations'))assert.deepEqual(freshAfter[name],freshBefore[name],`${name} unchanged by refused restore`);
  assert.equal(freshAfter.monitors.length,0);assert.equal(freshAfter.failure_snapshots.length,0);
 }finally{await fresh?.close()}
}
