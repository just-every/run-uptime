import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bindings,installation,migrate} from './probe-native-support.mjs';
import {probeHeartbeat} from '../runners/src/probes.mjs';

const dir=await mkdtemp(join(tmpdir(),'uptime-archive-timing-'));
const originalBindings={...bindings};
bindings.UPTIME_SYNTHETIC_PORT='15509';

let source,recovery,passed=0,rejections=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const assertion=(name,pass=true)=>({assertion:name,pass,reason:'Historical sampled assertion'});
const rehash=archive=>({...archive,sha256:createHash('sha256').update(JSON.stringify(archive.payload)).digest('hex')});
const evidence=(task,changes={})=>({id:randomUUID(),probe:'local-a',attempt:0,runnerVersion:'uptime-node/0.1.0',startedAt:task.dueAt,completedAt:task.dueAt+100,durationMs:100,outcome:'pass',status:200,bytes:5,checks:[assertion('status'),assertion('latency')],...changes});
const tables=['monitors','revisions','slots','observations','outbox','runner_contact','heartbeat_authority','heartbeat_claims','migrations','d1_migrations'];
async function durable(installation){
 return Promise.all(tables.map(async table=>(await installation.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
}
async function receiving(name){
 await recovery?.worker.dispose();recovery=null;
 await migrate(join(dir,name));recovery=await installation(join(dir,name),15505);
}
async function assertInactive(archive){
 const overview=(await recovery.api('/api/overview')).data;
 assert.equal(overview.runner.contact.state,'Never seen');
 for(const monitor of overview.monitors){
  const original=archive.payload.tables.monitors.find(row=>row.id===monitor.id);
  assert.equal(monitor.revision,original.revision+1);
  assert.equal(monitor.definition.enabled,false);
  assert.equal(monitor.definition.request,undefined);
  assert.equal(monitor.state.state,'Paused');
  assert.equal(monitor.state.targetState,'Unknown');
  assert.deepEqual(monitor.storedState,{state:'Unknown',confirmedFailure:false,notificationOpen:false});
 }
 const observations=(await recovery.DB.prepare('SELECT * FROM observations ORDER BY rowid').all()).results;
 assert.deepEqual(observations,archive.payload.tables.observations);
 const revisions=(await recovery.DB.prepare('SELECT * FROM revisions ORDER BY rowid').all()).results;
 for(const row of archive.payload.tables.revisions)assert.deepEqual(revisions.find(r=>r.monitor_id===row.monitor_id&&r.revision===row.revision),row);
 for(const table of ['heartbeat_authority','heartbeat_claims'])assert.equal((await recovery.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
 const slots=(await recovery.DB.prepare('SELECT * FROM slots').all()).results;
 assert.ok(slots.every(slot=>slot.lease_owner==='restored-inactive'&&slot.lease_until===0&&!['queued','running'].includes(slot.status)));
 assert.ok(overview.alerts.length>0&&overview.alerts.every(alert=>alert.status==='imported-inactive'&&alert.lease_until===0&&alert.receipt===null));
 const outbox=(await recovery.DB.prepare('SELECT * FROM outbox ORDER BY rowid').all()).results;
 assert.deepEqual((await recovery.api('/api/notifications')).data.deliveries,[]);
 assert.deepEqual((await recovery.DB.prepare('SELECT * FROM outbox ORDER BY rowid').all()).results,outbox);
 assert.equal(await recovery.claim(),null);
}

let legacy,boundary,archive,heartbeat,heartbeatToken,publicMonitor;
try{
 await migrate(join(dir,'source'));source=await installation(join(dir,'source'),15504);
 await check('the exact historical 100ms/101ms passing record remains rejected by live signed completion',async()=>{
  const created=await source.api('/api/monitors','POST',{name:'Legacy latency boundary',network:'synthetic',url:'http://127.0.0.1:15509/health',assertions:{status:200,latencyMs:100},intervalMs:86400000,retries:0,confirmSlots:1,recoverSlots:1});
  assert.equal(created.status,201);legacy=created.data;
  const task=await source.claim();assert.equal(task.monitorId,legacy.id);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,task.dueAt+100-Date.now())));
  boundary=evidence(task,{durationMs:101});
  const before=await durable(source),rejected=await source.submit(task,[boundary]);
  assert.equal(rejected.status,400);assert.match(rejected.data.error,/Inconsistent HTTP assertion evidence/);
  assert.deepEqual(await durable(source),before);
  assert.equal((await source.monitor(legacy.id)).state.state,'Unknown');
  assert.equal((await source.submit(task,[{...boundary,durationMs:100}])).status,200);
  assert.equal((await source.monitor(legacy.id)).state.state,'Healthy');
 });
 await check('native source history includes both boundary outcomes, legacy response errors and current installation authority',async()=>{
  await source.due(legacy.id);const task=await source.claim();
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,task.dueAt+100-Date.now())));
  const failure=evidence(task,{durationMs:101,outcome:'target_failure',checks:[assertion('status'),assertion('latency',false)]});
  assert.equal((await source.submit(task,[failure])).status,200);
  assert.equal((await source.monitor(legacy.id)).state.state,'Failing');
  await source.due(legacy.id);const errorTask=await source.claim();
  const historicalError=evidence(errorTask,{completedAt:errorTask.dueAt,durationMs:1,outcome:'target_failure',bytes:undefined,checks:[assertion('encoding',false)]});
  assert.equal((await source.submit(errorTask,[historicalError])).status,200);
  const created=await source.api('/api/monitors','POST',{name:'Local request authority',type:'http',network:'public',url:'https://archive-only.test/health',request:{credentialRef:'installation-only'},enabled:false,intervalMs:86400000,retries:0});
  assert.equal(created.status,201);publicMonitor=created.data;
  const incoming=await source.api('/api/monitors','POST',{name:'Local heartbeat authority',type:'heartbeat',heartbeat:{maxAgeMs:60000},intervalMs:86400000,retries:0,confirmSlots:1,recoverSlots:1});
  assert.equal(incoming.status,201);heartbeat=incoming.data;
  const issued=await source.api(`/api/monitors/${heartbeat.id}/heartbeat-key`,'POST',{});
  assert.equal(issued.status,200);heartbeatToken=issued.data.token;
  assert.equal((await source.api(`/api/heartbeats/${heartbeat.id}`,'POST',{}, {authorization:`Bearer ${heartbeatToken}`,'x-heartbeat-sequence':'1'},false)).status,200);
  const heartbeatTask=await source.claim();assert.equal(heartbeatTask.monitorId,heartbeat.id);
  assert.equal((await source.submit(heartbeatTask,[{...probeHeartbeat(heartbeatTask.definition,'local-a',heartbeatTask.heartbeatReceipt),attempt:0}])).status,200);
  assert.equal((await source.monitor(heartbeat.id)).state.state,'Healthy');
  archive=(await source.api('/api/archive')).data;
  assert.deepEqual(Object.keys(archive.payload.tables).sort(),['migrations','monitors','observations','outbox','revisions','slots']);
  assert.ok(!JSON.stringify(archive).includes(heartbeatToken));
  const row=archive.payload.tables.observations.find(row=>row.id===boundary.id);
  assert.deepEqual(JSON.parse(row.evidence),{...boundary,durationMs:100});
  row.evidence=JSON.stringify(boundary);
 });
 await receiving('rejected');
 await check('restore rejects clock and assertion contradictions beyond the one-tick ambiguity before writing any rows',async()=>{
  const before=await durable(recovery);
  for(const [label,mutate] of [
   ['two-tick disagreement',value=>{value.durationMs=102}],
   ['both samples exceed limit',value=>{value.completedAt=value.startedAt+101}],
   ['one-tick interval entirely above limit',value=>{value.completedAt=value.startedAt+101;value.durationMs=102}],
   ['gross slow pass',value=>{value.completedAt=value.startedAt+121;value.durationMs=121}],
   ['false latency below both bounds',value=>{value.durationMs=100;value.outcome='target_failure';value.checks[1].pass=false}],
   ['false matching status',value=>{value.outcome='target_failure';value.checks[0].pass=false}],
   ['foreign HTTP failure',value=>{value.outcome='target_failure';value.checks=[assertion('heartbeat',false)]}],
   ['omitted latency',value=>{value.checks=[assertion('status')]}],
   ['contradictory outcome',value=>{value.outcome='target_failure'}],
   ['fractional clock',value=>{value.durationMs=100.5}],
   ['negative clock',value=>{value.startedAt=-1;value.completedAt=99}],
   ['unsafe clock',value=>{value.startedAt=Number.MAX_SAFE_INTEGER+1;value.completedAt=value.startedAt}],
   ['future completion',value=>{value.startedAt=Date.now()+60000;value.completedAt=value.startedAt+100}],
   ['reversed clock',value=>{value.completedAt=value.startedAt-1;value.durationMs=0}],
   ['pre-slot start',value=>{value.startedAt--}],
   ['caller-supplied validation mode',value=>{value.validationMode='historical-restore'}],
  ]){
   const forged=structuredClone(archive),row=forged.payload.tables.observations.find(row=>row.id===boundary.id),value=JSON.parse(row.evidence);
   mutate(value);row.evidence=JSON.stringify(value);
   assert.equal((await recovery.api('/api/restore','POST',rehash(forged))).status,400,label);
   assert.deepEqual(await durable(recovery),before,label+' must not write any durable state');rejections++;
  }
 });
 await check('prior migration 1/2 no-type/no-network history restores the exact boundary record paused and quarantined',async()=>{
  const old=structuredClone(archive),tables=old.payload.tables;
  tables.monitors=tables.monitors.filter(row=>row.id===legacy.id);
  for(const name of ['revisions','slots','outbox'])tables[name]=tables[name].filter(row=>row.monitor_id===legacy.id);
  const ids=new Set(tables.slots.map(row=>row.id));tables.observations=tables.observations.filter(row=>ids.has(row.slot_id));
  for(const row of [...tables.monitors,...tables.revisions,...tables.slots]){
   const definition=JSON.parse(row.definition);delete definition.type;delete definition.network;row.definition=JSON.stringify(definition);
  }
  tables.migrations=tables.migrations.filter(row=>row.version<=2);
  const result=await recovery.api('/api/restore','POST',rehash(old));assert.equal(result.status,200,JSON.stringify(result.data));
  await assertInactive(old);
  assert.deepEqual((await recovery.DB.prepare('SELECT version FROM migrations ORDER BY version').all()).results.map(row=>row.version),[1,2,3]);
  assert.deepEqual(JSON.parse((await recovery.DB.prepare('SELECT evidence FROM observations WHERE id=?').bind(boundary.id).first()).evidence),boundary);
 });
 await receiving('current');
 await check('current archives keep ambiguous history but remove request and heartbeat authority from new paused revisions',async()=>{
  const ledger=(await recovery.DB.prepare('SELECT * FROM d1_migrations ORDER BY rowid').all()).results;
  const result=await recovery.api('/api/restore','POST',rehash(archive));assert.equal(result.status,200,JSON.stringify(result.data));
  await assertInactive(archive);
  assert.deepEqual((await recovery.DB.prepare('SELECT * FROM d1_migrations ORDER BY rowid').all()).results,ledger);
  assert.equal((await recovery.api(`/api/heartbeats/${heartbeat.id}`,'POST',{}, {authorization:`Bearer ${heartbeatToken}`,'x-heartbeat-sequence':'2'},false)).status,400);
  const restored=await recovery.monitor(publicMonitor.id);assert.equal(restored.definition.request,undefined);
 });
 await check('explicit reactivation cannot reuse imported latency or receipt evidence to establish active health',async()=>{
  const restored=await recovery.monitor(legacy.id);
  assert.equal((await recovery.api(`/api/monitors/${legacy.id}`,'PATCH',{...restored.definition,enabled:true})).status,200);
  assert.equal((await recovery.monitor(legacy.id)).state.state,'Unknown');
  const task=await recovery.claim();assert.equal(task.monitorId,legacy.id);
  const before=await durable(recovery);
  assert.equal((await recovery.submit(task,[evidence(task,{durationMs:101})])).status,400);
  assert.deepEqual(await durable(recovery),before);
  assert.equal((await recovery.monitor(legacy.id)).state.state,'Unknown');
  assert.equal((await recovery.submit(task,[evidence(task)])).status,200);
  assert.equal((await recovery.monitor(legacy.id)).state.state,'Healthy');
  const restoredHeartbeat=await recovery.monitor(heartbeat.id);
  assert.equal((await recovery.api(`/api/monitors/${heartbeat.id}`,'PATCH',{...restoredHeartbeat.definition,enabled:true})).status,200);
  assert.equal((await recovery.monitor(heartbeat.id)).state.state,'Unknown');
  const heartbeatTask=await recovery.claim();assert.equal(heartbeatTask.monitorId,heartbeat.id);assert.equal(heartbeatTask.heartbeatReceipt,null);
  const oldReceipt=archive.payload.tables.observations.map(row=>JSON.parse(row.evidence)).find(value=>value.heartbeatReceivedAt);
  const replay={...oldReceipt,id:randomUUID(),startedAt:Date.now(),completedAt:Date.now(),durationMs:0};
  const beforeReplay=await durable(recovery);
  assert.equal((await recovery.submit(heartbeatTask,[replay])).status,400);
  assert.deepEqual(await durable(recovery),beforeReplay);
  assert.equal((await recovery.monitor(heartbeat.id)).state.state,'Unknown');
  const alerts=(await recovery.api('/api/overview')).data.alerts;
  assert.ok(alerts.every(alert=>alert.status==='imported-inactive'));
  assert.deepEqual((await recovery.api('/api/notifications')).data.deliveries,[]);
 });
 console.log(`ARCHIVE-TIMING-001 passed: ${passed} native signed/restore checks; ${rejections} contradictory archives rejected without writes.`);
}finally{
 await recovery?.worker.dispose();await source?.worker.dispose();
 Object.assign(bindings,originalBindings);
 await rm(dir,{recursive:true,force:true});
}
