import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Retain actual records as archive/replay fixture input, then prove erasure
// through the owner HTTP operation, including all old credential versions.
export async function eraseAndAssert(DB,owner,id,{expectedCredentials,exerciseHistory=false}){
 const rows=async table=>(await DB.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results;
 const preservedTables=['monitors','revisions','slots','observations','outbox'];
 const snapshot=async()=>Object.fromEntries(await Promise.all(preservedTables.map(async table=>[table,await rows(table)])));
 const preserved=await snapshot(),priorReceipts=await rows('uptime_erasure_receipts'),priorAudit=await rows('uptime_audit');
 const destination=(await rows('notification_destinations')).find(row=>row.id===id);
 const credentials=(await rows('notification_credentials')).filter(row=>row.destination_id===id);
 const jobs=(await rows('notification_jobs')).filter(row=>row.destination_id===id),jobIds=new Set(jobs.map(row=>row.id));
 const deliveries=(await rows('integration_deliveries')).filter(row=>jobIds.has(row.id));
 assert.ok(destination);assert.equal(credentials.length,expectedCredentials,'every expected credential version exists before erasure');
 if(exerciseHistory)assert.ok(jobs.length>0&&deliveries.length>0);
 const dependentTables=['notification_claim_custody','integration_attempts','integration_resolutions'];
 const dependentCounts=Object.fromEntries(await Promise.all(dependentTables.map(async table=>[table,(await rows(table)).filter(row=>jobIds.has(row.delivery_id)).length])));
 if(exerciseHistory){assert.ok(dependentCounts.notification_claim_custody>0,'real claims exist before erasure');assert.ok(dependentCounts.integration_attempts>0,'real attempts exist before erasure')}
 const copies=(exerciseHistory?[['notification_destinations',destination],['notification_jobs',jobs[0]],['integration_deliveries',deliveries[0]]]:[]).map(([table,record])=>({id:randomUUID(),table,record}));
 const replayId=randomUUID(),delivery=deliveries[0];
 if(exerciseHistory)await DB.batch([
  ...copies.map(copy=>DB.prepare('INSERT INTO archive_history(id,table_name,record) VALUES(?,?,?)').bind(copy.id,copy.table,JSON.stringify(copy.record))),
  DB.prepare('INSERT INTO integration_replays(namespace,id,fingerprint,envelope,received_at) VALUES(?,?,?,?,?)').bind(delivery.namespace,replayId,delivery.fingerprint,delivery.envelope,Date.now()),
 ]);
 const response=await owner.api(`/api/notifications/destinations/${id}`,'DELETE');assert.equal(response.status,200);assert.equal(response.data.erased,true);
 const {receipt}=response.data;assert.equal(receipt.entityKind,'destination');assert.equal(receipt.counts.notification_destinations,1);assert.equal(receipt.counts.notification_credentials,credentials.length);assert.equal(receipt.counts.notification_jobs??0,jobs.length);
 assert.equal(receipt.counts.integration_deliveries??0,deliveries.length);for(const table of dependentTables)assert.equal(receipt.counts[table]??0,dependentCounts[table]);
 assert.equal(receipt.counts.archive_history??0,copies.length);assert.equal(receipt.counts.integration_replays??0,exerciseHistory?1:0);
 assert.deepEqual((await rows('notification_destinations')).filter(row=>row.id===id),[]);
 assert.deepEqual((await rows('notification_credentials')).filter(row=>row.destination_id===id),[],'ALL credential versions are erased');
 assert.deepEqual((await rows('notification_jobs')).filter(row=>row.destination_id===id),[]);
 assert.deepEqual((await rows('integration_deliveries')).filter(row=>jobIds.has(row.id)),[]);
 for(const table of dependentTables)assert.deepEqual((await rows(table)).filter(row=>jobIds.has(row.delivery_id)),[],`${table} dependents are erased`);
 assert.deepEqual(await rows('integration_replays'),[],'dependent replay history is erased');
 assert.deepEqual(await rows('archive_history'),[],'all copied destination/job/delivery history is erased');
 assert.deepEqual(await DB.prepare('SELECT * FROM uptime_erasure_receipts WHERE id=?').bind(receipt.id).first(),{id:receipt.id,entity_kind:'destination',counts:JSON.stringify(receipt.counts),completed_at:receipt.completedAt});
 const audit=await DB.prepare("SELECT * FROM uptime_audit WHERE action='erase' AND subject_ref=?").bind(receipt.id).first();
 assert.ok(audit);assert.equal(audit.subject_kind,'destination');assert.equal(audit.subject_ref,receipt.id);assert.notEqual(audit.subject_ref,id);assert.equal(audit.occurred_at,receipt.completedAt);
 assert.deepEqual((await rows('uptime_erasure_receipts')).filter(row=>row.id!==receipt.id),priorReceipts,'earlier receipts remain permanent');
 assert.deepEqual((await rows('uptime_audit')).filter(row=>row.id!==receipt.id),priorAudit,'earlier opaque audit entries remain permanent');
 assert.deepEqual(await snapshot(),preserved,'destination erasure preserves unrelated monitor evidence and accepted incident');
}
