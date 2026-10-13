import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {migrate,installation} from './probe-native-support.mjs';
import {probeHeartbeat} from '../runners/src/probes.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
import {evaluate} from '../src/domain/policy.mjs';
const dir=await mkdtemp(join(tmpdir(),'uptime-probe-native-'));let source,recovery,passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const canary=task=>({id:randomUUID(),probe:'local-a',attempt:0,startedAt:task.dueAt,completedAt:task.dueAt,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'pass',status:200,bytes:0,checks:[{assertion:'status',pass:true,reason:'Network-edge canary fixture'}]});
const evidence=(task,changes={})=>({canary:canary(task),id:randomUUID(),probe:'local-a',attempt:0,startedAt:Date.now(),completedAt:Date.now(),durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'pass',status:200,bytes:2,checks:[{assertion:'status',pass:true,reason:'Expected HTTP status'},{assertion:'body',pass:true,reason:'Body contains required text'}],...changes});
const heartbeatEvidence=task=>({...probeHeartbeat(task.definition,'local-a',task.heartbeatReceipt),attempt:0,canary:canary(task)});
let publicMonitor,heartbeat,key,exported;
try{
 await migrate(join(dir,'source'));source=await installation(join(dir,'source'),15514);
 await check('native migration 0004 applied while portable domain migration ledger remains 1/2/3',async()=>{
  assert.ok((await source.DB.prepare('SELECT name FROM d1_migrations').all()).results.some(r=>r.name==='0004_heartbeat_authority.sql'));
  assert.deepEqual((await source.DB.prepare('SELECT version FROM migrations ORDER BY version').all()).results.map(r=>r.version),[1,2,3]);
  assert.equal((await source.DB.prepare('SELECT COUNT(*) n FROM heartbeat_authority').first()).n,0);
 });
 await check('native owner API accepts public HTTP/HTTPS and keyword definitions; unsupported types and secret payloads rejected',async()=>{
  assert.equal((await source.api('/api/monitors','POST',{name:'Blocked',url:'http://public-a.test/'} ,{},false)).status,401);
  for(const type of ['dns','ping','tcp','domain-expiry'])assert.equal((await source.api('/api/monitors','POST',{name:'Unsupported',type,url:'http://public-a.test/'})).status,400);
  for(const url of ['http://127.1/','https://[::ffff:7f00:1]/','http://169.254.169.254/'])assert.equal((await source.api('/api/monitors','POST',{name:'Blocked',url,network:'public'})).status,400);
  assert.equal((await source.api('/api/monitors','POST',{name:'No inline secrets',url:'https://public-a.test/',request:{headers:{authorization:'test-private'}}})).status,400);
  const result=await source.api('/api/monitors','POST',{name:'Public API',type:'keyword',network:'public',url:'http://public-a.test/health',method:'POST',request:{credentialRef:'request-a'},assertions:{status:200,bodyIncludes:'okay'},retries:1,enabled:false});assert.equal(result.status,201);publicMonitor=result.data;
  const changed=await source.api(`/api/monitors/${publicMonitor.id}`,'PATCH',{...publicMonitor.definition,url:'https://public-a.test/health',enabled:true,canaryUrl:'https://canary.example.test/health'});assert.equal(changed.status,200);publicMonitor=changed.data;
  assert.deepEqual(publicMonitor.definition.request,{credentialRef:'request-a'});assert.equal(publicMonitor.definition.method,'POST');
 });
 await check('claims preserve exact settings; signed results reject omitted keyword evidence and erased retry attempts',async()=>{
  const task=await source.claim();assert.equal(task.monitorId,publicMonitor.id);assert.deepEqual(task.definition,publicMonitor.definition);
  const valid=evidence(task);assert.equal((await source.submit(task,[{...valid,checks:valid.checks.slice(0,1)}])).status,400);
  assert.equal((await source.submit(task,[{...valid,attempt:2}])).status,400);
  assert.equal((await source.submit(task,[valid],false)).status,403);
  assert.equal((await source.submit(task,[valid])).status,200);assert.equal((await source.submit(task,[valid])).status,200);
  const result=await source.api(`/api/monitors/${publicMonitor.id}`,'PATCH',{...publicMonitor.definition,enabled:false});publicMonitor=result.data;
 });
 await check('heartbeat has owner-issued per-monitor authority; missing receipt cannot pass signed validation',async()=>{
  const result=await source.api('/api/monitors','POST',{name:'Incoming job',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:5000},retries:0,confirmSlots:2,recoverSlots:2,intervalMs:5000});assert.equal(result.status,201);heartbeat=result.data;
  assert.equal((await source.api(`/api/monitors/${heartbeat.id}/heartbeat-key`,'POST',{}, {},false)).status,401);
  const task=await source.claim();assert.equal(task.heartbeatReceipt,null);
  const omitted={...heartbeatEvidence(task),outcome:'pass',checks:[{assertion:'heartbeat',pass:true,reason:'Receipt fresh'}]};assert.equal((await source.submit(task,[omitted])).status,400);
  const forged={...omitted,heartbeatReceivedAt:Date.now()};assert.equal((await source.submit(task,[forged])).status,400);
  assert.equal((await source.submit(task,[heartbeatEvidence(task)])).status,200);assert.equal((await source.monitor(heartbeat.id)).state.state,'Degraded');
  await source.due(heartbeat.id);const second=await source.claim();assert.equal((await source.submit(second,[heartbeatEvidence(second)])).status,200);assert.equal((await source.monitor(heartbeat.id)).state.state,'Failing');
  assert.equal((await source.api('/api/overview')).data.alerts.filter(a=>a.kind==='trigger').length,1);
 });
 await check('receipt ingress authenticates monitor and monotonic sequence, uses server time and does not directly change health',async()=>{
  const issued=await source.api(`/api/monitors/${heartbeat.id}/heartbeat-key`,'POST',{});assert.equal(issued.status,200);key=issued.data.token;heartbeat=await source.monitor(heartbeat.id);
  const path=`/api/heartbeats/${heartbeat.id}`,headers={authorization:`Bearer ${key}`,'x-heartbeat-sequence':'1'};
  assert.equal((await source.api(path,'POST',{}, {},false)).status,400);
  assert.equal((await source.api(path,'POST',{receivedAt:Date.now()+99999},headers,false)).status,400);
  const at=Date.now(),receipt=await source.api(path,'POST',{},headers,false);assert.equal(receipt.status,200);assert.ok(receipt.data.receivedAt>=at&&receipt.data.receivedAt<=Date.now());
  assert.equal((await source.api(path,'POST',{},headers,false)).status,400);
  assert.equal((await source.api(`/api/heartbeats/${publicMonitor.id}`,'POST',{},headers,false)).status,400);
  assert.equal((await source.monitor(heartbeat.id)).state.state,'Unknown');
  assert.equal((await source.DB.prepare('SELECT last_sequence FROM heartbeat_authority WHERE monitor_id=?').bind(heartbeat.id).first()).last_sequence,1);
 });
 await check('scheduled signed heartbeat follows recovery thresholds; manual evidence does not recover',async()=>{
  // Force scheduled work into the future so the explicit manual queue is claimed.
  await source.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now()+60000,heartbeat.id).run();
  assert.equal((await source.api(`/api/monitors/${heartbeat.id}/run`,'POST',{})).status,200);const manual=await source.claim();assert.match(manual.id,/:manual:/);
  const run=await executeTaskProbe(manual,'local-a',{grantPath:join(dir,'absent'),controlPort:15514});assert.equal(run.outcome,'pass');assert.equal((await source.submit(manual,[{...run,attempt:0,canary:canary(manual)}])).status,200);assert.equal((await source.monitor(heartbeat.id)).state.state,'Unknown');
  await source.due(heartbeat.id);const first=await source.claim();assert.equal((await source.submit(first,[heartbeatEvidence(first)])).status,200);assert.equal((await source.monitor(heartbeat.id)).state.state,'Recovering');
  await source.due(heartbeat.id);const second=await source.claim();assert.equal((await source.submit(second,[heartbeatEvidence(second)])).status,200);assert.equal((await source.monitor(heartbeat.id)).state.state,'Healthy');
  assert.equal((await source.api('/api/overview')).data.alerts.filter(a=>a.kind==='recovery').length,1);
 });
 await check('stale/future receipts, immutable snapshots and omitted pass assertions cannot manufacture healthy evidence',async()=>{
  const authority=await source.DB.prepare('SELECT * FROM heartbeat_authority WHERE monitor_id=?').bind(heartbeat.id).first();
  for(const receivedAt of [Date.now()-6000,Date.now()+60000]){
   await source.DB.prepare('UPDATE heartbeat_authority SET received_at=? WHERE monitor_id=?').bind(receivedAt,heartbeat.id).run();await source.due(heartbeat.id);const task=await source.claim();
   const observed=heartbeatEvidence(task);assert.equal(observed.outcome,'target_failure');
   assert.equal((await source.submit(task,[{...observed,outcome:'pass',checks:[{assertion:'heartbeat',pass:true,reason:'Claimed pass'}]}])).status,400);
   assert.equal((await source.submit(task,[observed])).status,200);
  }
  await source.DB.prepare('UPDATE heartbeat_authority SET received_at=? WHERE monitor_id=?').bind(authority.received_at,heartbeat.id).run();await source.due(heartbeat.id);const task=await source.claim();
  const good=heartbeatEvidence(task);assert.equal(good.outcome,'pass');assert.equal((await source.submit(task,[{...good,checks:[]}])).status,400);
  const forged={...good,heartbeatReceivedAt:good.heartbeatReceivedAt-1};assert.equal((await source.submit(task,[forged])).status,400);assert.equal((await source.submit(task,[good])).status,200);
  assert.equal(evaluate(task.definition,[good],{},good.heartbeatReceivedAt+5001,false).state,'Unknown');
 });
 await check('edit/pause invalidates receipt authority, old in-flight results stay historical, key rotation advances revision',async()=>{
  await source.due(heartbeat.id);const old=await source.claim();const paused=await source.api(`/api/monitors/${heartbeat.id}`,'PATCH',{...(await source.monitor(heartbeat.id)).definition,enabled:false});assert.equal(paused.status,200);
  assert.equal((await source.api(`/api/heartbeats/${heartbeat.id}`,'POST',{}, {authorization:`Bearer ${key}`,'x-heartbeat-sequence':'2'},false)).status,400);
  assert.equal((await source.submit(old,[heartbeatEvidence(old)])).status,200);assert.equal((await source.monitor(heartbeat.id)).state.state,'Paused');
  await source.api(`/api/monitors/${heartbeat.id}`,'PATCH',{...paused.data.definition,enabled:true});await source.due(heartbeat.id);const task=await source.claim();assert.equal(task.heartbeatReceipt,null);assert.equal((await source.submit(task,[heartbeatEvidence(task)])).status,200);
  const before=(await source.monitor(heartbeat.id)).revision;const issued=await source.api(`/api/monitors/${heartbeat.id}/heartbeat-key`,'POST',{});key=issued.data.token;assert.equal(issued.data.revision,before+1);
  assert.equal((await source.api(`/api/heartbeats/${heartbeat.id}`,'POST',{}, {authorization:`Bearer ${key}`,'x-heartbeat-sequence':'1'},false)).status,200);
 });
 await check('restart and repeated migration preserve local receipt/authority/snapshot bytes and native migration ledger',async()=>{
  const before=await source.DB.prepare('SELECT * FROM heartbeat_authority').all(),snapshots=await source.DB.prepare('SELECT * FROM heartbeat_claims').all();await source.worker.dispose();source=null;
  await migrate(join(dir,'source'));source=await installation(join(dir,'source'),15514);
  assert.deepEqual((await source.DB.prepare('SELECT * FROM heartbeat_authority').all()).results,before.results);assert.deepEqual((await source.DB.prepare('SELECT * FROM heartbeat_claims').all()).results,snapshots.results);
  assert.equal((await source.api(`/api/heartbeats/${heartbeat.id}`,'POST',{}, {authorization:`Bearer ${key}`,'x-heartbeat-sequence':'1'},false)).status,400);
 });
 await check('portable archive omits heartbeat authority and secret material; receiving restore clears request authority and quarantines history',async()=>{
  exported=(await source.api('/api/archive')).data;
  assert.deepEqual(Object.keys(exported.payload.tables).sort(),['migrations','monitors','observations','outbox','revisions','slots']);assert.ok(!JSON.stringify(exported).includes(key));assert.ok(!JSON.stringify(exported).includes('token_hash'));
  await migrate(join(dir,'recovery'));recovery=await installation(join(dir,'recovery'),15515);
  const ledger=(await recovery.DB.prepare('SELECT * FROM d1_migrations').all()).results;
  const imported=await recovery.api('/api/restore','POST',exported);assert.equal(imported.status,200,JSON.stringify(imported.data));
  assert.deepEqual((await recovery.DB.prepare('SELECT * FROM d1_migrations').all()).results,ledger);
  assert.equal((await recovery.DB.prepare('SELECT COUNT(*) n FROM heartbeat_authority').first()).n,0);assert.equal((await recovery.DB.prepare('SELECT COUNT(*) n FROM heartbeat_claims').first()).n,0);
  const all=(await recovery.api('/api/overview')).data;assert.ok(all.monitors.every(m=>m.state.state==='Paused'));assert.ok(all.alerts.every(a=>a.status==='imported-inactive'));assert.equal(await recovery.claim(),null);
  const restored=await recovery.monitor(publicMonitor.id);assert.equal(restored.definition.request,undefined);
  // A same-named receiving credential file must never be selected by a restored definition.
  await writeFile(join(dir,'request-a.json'),JSON.stringify({monitorId:publicMonitor.id,origin:'https://public-a.test',auth:{type:'bearer',token:'receiving-only-sentinel'}}),{mode:0o600});
  const receivingId=(await recovery.api('/api/runners')).data[0].runnerId;const assign=definition=>Object.fromEntries(definition.probes.map(p=>[p,{...definition.assignments[p],runnerId:receivingId}]));
  const revision=await recovery.api(`/api/monitors/${publicMonitor.id}`,'PATCH',{...restored.definition,assignments:assign(restored.definition),enabled:true});assert.equal(revision.status,200,JSON.stringify(revision.data));assert.equal(revision.data.definition.request,undefined);const publicTask=await recovery.claim();assert.equal(publicTask.definition.request,undefined);
  await recovery.submit(publicTask,[evidence(publicTask)]);
  const resumed=await recovery.api(`/api/monitors/${heartbeat.id}`,'PATCH',{...(await recovery.monitor(heartbeat.id)).definition,assignments:assign((await recovery.monitor(heartbeat.id)).definition),enabled:true});assert.equal(resumed.status,200);
  assert.equal((await recovery.api(`/api/heartbeats/${heartbeat.id}`,'POST',{}, {authorization:`Bearer ${key}`,'x-heartbeat-sequence':'99'},false)).status,400);
  const task=await recovery.claim();assert.equal(task.monitorId,heartbeat.id);assert.equal(task.heartbeatReceipt,null);assert.equal(heartbeatEvidence(task).outcome,'target_failure');
  const replay=exported.payload.tables.observations.map(o=>JSON.parse(o.evidence)).find(o=>o.heartbeatReceivedAt&&o.outcome==='pass');assert.ok(replay);assert.equal((await recovery.submit(task,[{...replay,id:randomUUID(),startedAt:Date.now(),completedAt:Date.now()}])).status,400);
  assert.equal((await recovery.submit(task,[heartbeatEvidence(task)])).status,200);assert.notEqual((await recovery.monitor(heartbeat.id)).state.state,'Healthy');
  const poisoned=structuredClone(exported);poisoned.payload.tables.heartbeat_authority=[];poisoned.sha256=createHash('sha256').update(JSON.stringify(poisoned.payload)).digest('hex');assert.equal((await recovery.api('/api/restore','POST',poisoned)).status,400);
 });
 console.log(`REAL-TARGET-NATIVE-001 passed: ${passed} native authority, signed evidence, heartbeat lifecycle, migration/restart and archive checks.`);
}finally{await recovery?.worker.dispose();await source?.worker.dispose();await rm(dir,{recursive:true,force:true})}

await import('./probe-native-evidence.mjs');
