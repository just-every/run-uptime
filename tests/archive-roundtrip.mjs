// One installation-to-installation move through the same archive doors the console uses.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory,ownerAPI} from './notify-acceptance-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {populateArchiveFixture,populateProtocolArchiveFixture} from './archive-fixture.mjs';

const directory=await runtimeDirectory(),workers=[];
const tables=archive=>({...archive.payload.tables,...archive.payload.productTables});
async function installation(name){
 const bindings={...testAuthBindings,OWNER_EMAIL:name+'@example.test',SESSION_SECRET:crypto.randomUUID()+crypto.randomUUID(),SETUP_TOKEN:crypto.randomUUID(),UPTIME_RUNNER_KEY:crypto.randomUUID()+crypto.randomUUID()};
 const {worker,DB}=await migratedWorker({persist:join(directory,name),bindings});workers.push(worker);
 const origin=(await worker.ready).origin,owner=ownerAPI(origin);await owner.signIn(bindings);
 const ok=async(path,method='GET',body)=>{const response=await owner.api(path,method,body);assert.equal(response.status,200,JSON.stringify(response.data));return response.data};
 return {worker,DB,bindings,owner,ok};
}
try{
 const source=await installation('original-owner');
 // Historical, interrupted and already-sent records have no public manufacture door.
 await populateArchiveFixture({...source.bindings,DB:source.DB});
 await populateProtocolArchiveFixture({...source.bindings,DB:source.DB});
 const archive=await source.ok('/api/archive'),before=tables(archive);
 assert.ok(before.observations.length&&before.integration_attempts.length,'move a populated history, including an interrupted delivery');
 const text=JSON.stringify(archive);
 for(const secret of [source.bindings.SESSION_SECRET,source.bindings.SETUP_TOKEN,source.bindings.UPTIME_RUNNER_KEY,'private-lease','private-destination','fixture-signing-secret'])assert.ok(!text.includes(secret),'archives carry history without installation authority');
 const receiving=await installation('receiving-owner');
 const corrupt=structuredClone(archive);corrupt.payload.tables.monitors[0].definition='{}';
 assert.equal((await receiving.owner.api('/api/restore','POST',corrupt)).status,400);
 assert.equal((await receiving.ok('/api/overview')).monitors.length,0,'corrupt import writes nothing');
 await receiving.ok('/api/restore','POST',archive);
 const overview=await receiving.ok('/api/overview');
 assert.ok(overview.monitors.length===before.monitors.length&&overview.monitors.every(m=>m.definition.enabled===false&&m.state.state==='Paused'));
 const restored=await receiving.ok('/api/archive'),after=tables(restored);
 for(const name of ['observations','integration_attempts','integration_resolutions','integration_replays'])assert.deepEqual(after[name],before[name],name+' remains exact historical evidence');
 for(const revision of before.revisions)assert.deepEqual(after.revisions.find(r=>r.monitor_id===revision.monitor_id&&r.revision===revision.revision),revision,'immutable revisions survive');
 for(const type of ['tcp','dns','tls','domain']){
  const original=before.monitors.find(m=>JSON.parse(m.definition).type===type),current=after.monitors.find(m=>m.id===original.id);
  assert.deepEqual(JSON.parse(current.definition),{...JSON.parse(original.definition),enabled:false},type+' restores its saved settings paused');
  const slot=after.slots.find(s=>s.monitor_id===original.id);assert.equal(slot.status,'interrupted');assert.equal(slot.definition,original.definition);
 }
 assert.ok(after.outbox.every(event=>event.status==='imported-inactive'));
 assert.ok(after.notification_destinations.every(destination=>!destination.enabled));
 const notifications=await receiving.ok('/api/notifications');assert.ok(notifications.deliveries.every(d=>['imported-inactive','accepted','failed','uncertain','cancelled'].includes(d.state)));
 assert.equal((await receiving.owner.api('/api/restore','POST',archive)).status,400,'a nonempty destination refuses without replacing history');
 const afterRefusal=tables(await receiving.ok('/api/archive'));
 const {uptime_audit:earlierAudit,...earlierProduct}=after,{uptime_audit:laterAudit,...laterProduct}=afterRefusal;
 assert.deepEqual(laterProduct,earlierProduct,'nonempty refusal changes no product history');
 const auditIds=new Set(earlierAudit.map(row=>row.id));
 assert.deepEqual(laterAudit.filter(row=>auditIds.has(row.id)),earlierAudit,'prior audit remains exact');
 const receipts=laterAudit.filter(row=>!auditIds.has(row.id));
 assert.equal(receipts.length,1,'the subsequent archive read records its own authorization receipt');
 assert.equal(receipts[0].action,'access_export');assert.equal(receipts[0].subject_ref,receipts[0].id);
 await receiving.worker.dispose();
 const repeated=await installation('third-owner');await repeated.ok('/api/restore','POST',restored);
 const third=tables(await repeated.ok('/api/archive'));
 assert.deepEqual(third.observations,after.observations);assert.deepEqual(third.archive_history,after.archive_history,'repeated moves do not multiply original history');
 assert.equal((await repeated.owner.api('/api/runner/claim','POST',{}, {'x-runner-key':repeated.bindings.UPTIME_RUNNER_KEY})).data.task,null,'restored monitors cannot run');
 assert.ok((await repeated.ok('/auth/operators')).some(owner=>owner.email==='third-owner@example.test'),'receiving identity stays local');
 console.log('PASS archive move, corrupt/nonempty refusal, exact history, separate receiving owners and inactive repeated restore');
}finally{for(const worker of workers.toReversed())await worker.dispose();await cleanupDirectory(directory)}
