import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bindings,installation,migrate} from './probe-native-support.mjs';

const dir=await mkdtemp(join(tmpdir(),'uptime-legacy-latency-'));
const originalBindings={...bindings};
bindings.UPTIME_SYNTHETIC_PORT='15509';
const assertion=(name,pass=true)=>({assertion:name,pass,reason:'Historical signed assertion'});
const checks=()=>['status','body','header','json','latency'].map(name=>assertion(name));
const rehash=archive=>({...archive,sha256:createHash('sha256').update(JSON.stringify(archive.payload)).digest('hex')});
const tables=['monitors','revisions','slots','observations','outbox','runner_contact','heartbeat_authority','heartbeat_claims','migrations','d1_migrations'];
const records=[
 // SEC-3b's actual predecessor samples were [0,100,101,101]. The assertion
 // timestamp is absent from its serialized evidence; these are its saved fields.
 {name:'assertion before both completion samples',elapsed:101,latency:true},
 // Work between assertion and finish can be delayed beyond any one-tick grace.
 {name:'scheduler delay after passing assertion',elapsed:5000,latency:true},
 // A wall-clock adjustment after a failing assertion also loses its sample.
 {name:'clock adjustment after failing assertion',elapsed:99,latency:false},
];
let source,recovery,monitor,nativeArchive,legacyArchive,passed=0,liveRejected=0,archiveRejected=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const durable=instance=>Promise.all(tables.map(async table=>(await instance.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
function evidence(task,elapsed=100,latency=true){
 return {id:randomUUID(),probe:'local-a',attempt:0,runnerVersion:'uptime-node/0.1.0',startedAt:task.dueAt,
  completedAt:task.dueAt+elapsed,durationMs:elapsed,outcome:latency?'pass':'target_failure',status:200,bytes:14,
  checks:checks().map(c=>c.assertion==='latency'?{...c,pass:latency}:c),canary:{id:randomUUID(),probe:'local-a',attempt:0,runnerVersion:'uptime-node/0.1.0',startedAt:task.dueAt,completedAt:task.dueAt,durationMs:0,outcome:'pass',status:200,bytes:0,checks:[assertion('status')]}};
}
function changeDefinitions(archive,change){
 for(const row of [...archive.payload.tables.monitors,...archive.payload.tables.revisions,...archive.payload.tables.slots]){
  const definition=JSON.parse(row.definition);change(definition);row.definition=JSON.stringify(definition);
 }
}
async function claim(instance){
 // Keep the clock vectors in the past without sleeping or changing runtime time.
 await instance.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now()-10000,monitor.id).run();
 const task=await instance.claim();assert.equal(task.monitorId,monitor.id);return task;
}
async function rejectLive(instance,task,value,label){
 const before=await durable(instance),result=await instance.submit(task,[value]);
 assert.equal(result.status,400,label+' '+JSON.stringify(result.data));
 assert.match(result.data.error,/Inconsistent HTTP assertion evidence/);
 assert.deepEqual(await durable(instance),before,label+' must not change durable state');liveRejected++;
}
async function rejectArchive(archive,label){
 const before=await durable(recovery),result=await recovery.api('/api/restore','POST',rehash(archive));
 assert.equal(result.status,400,label+' '+JSON.stringify(result.data));
 assert.deepEqual(await durable(recovery),before,label+' must not change durable state');archiveRejected++;
}

try{
 await migrate(join(dir,'source'));source=await installation(join(dir,'source'),15504);
 const created=await source.api('/api/monitors','POST',{name:'Pre-type latency history',network:'synthetic',url:'http://127.0.0.1:15509/health',canaryUrl:'https://canary.example.test/health',
  assertions:{status:200,bodyIncludes:'ready',header:{name:'x-check',equals:'yes'},json:{path:'ready',equals:true},latencyMs:100},
  retries:0,intervalMs:86400000,confirmSlots:1,recoverSlots:1});
 assert.equal(created.status,201);monitor=created.data;
 let task=await claim(source);
 await check('typed live completion rejects every unavailable-sample historical latency vector',async()=>{
  for(const record of records)await rejectLive(source,task,evidence(task,record.elapsed,record.latency),record.name);
 });
 await check('live pre-type slots remain strict and reject status contradictions without writes',async()=>{
  // Represent a still-running slot from a pre-type installation, without API
  // normalization adding the modern fields. All immutable definitions agree.
  const definition={...task.definition};delete definition.type;delete definition.network;
  for(const table of ['monitors','revisions','slots'])await source.DB.prepare(`UPDATE ${table} SET definition=?`).bind(JSON.stringify(definition)).run();
  for(const record of records)await rejectLive(source,task,evidence(task,record.elapsed,record.latency),'legacy '+record.name);
  const wrongStatus=evidence(task);wrongStatus.status=503;
  await rejectLive(source,task,wrongStatus,'SEC-2 mismatching status marked passing');
  const falseStatus=evidence(task);falseStatus.outcome='target_failure';falseStatus.checks[0].pass=false;
  await rejectLive(source,task,falseStatus,'SEC-2 matching status marked failing');
 });
 await check('prior-format archive preserves missing assertion sample instead of inventing a timestamp',async()=>{
  for(let i=0;i<records.length;i++){
   if(i)task=await claim(source);
   const record=records[i],valid=evidence(task,record.latency?100:101,record.latency);
   assert.equal((await source.submit(task,[valid])).status,200);
  }
  nativeArchive=(await source.api('/api/archive')).data;
  assert.equal(nativeArchive.payload.tables.observations.length,3);
  assert.ok(nativeArchive.payload.tables.outbox.length>0);
  legacyArchive=structuredClone(nativeArchive);
  legacyArchive.payload.tables.migrations=legacyArchive.payload.tables.migrations.filter(row=>row.version<=2);
  legacyArchive.payload.tables.observations.forEach((row,index)=>{
   const value=JSON.parse(row.evidence),record=records[index];
   value.completedAt=value.startedAt+record.elapsed;value.durationMs=record.elapsed;
   assert.equal(value.checks.find(c=>c.assertion==='latency').pass,record.latency);
   row.evidence=JSON.stringify(value);
  });
  for(const row of legacyArchive.payload.tables.slots){const definition=JSON.parse(row.definition);assert.ok(!Object.hasOwn(definition,'type')&&!Object.hasOwn(definition,'network'))}
 });
 await migrate(join(dir,'recovery'));recovery=await installation(join(dir,'recovery'),15505);
 await check('legacy restore retains clock, status, bundle, outcome and transport validation before any writes',async()=>{
  for(const [label,mutate] of [
   ['disagreeing saved clocks',value=>{value.durationMs+=2}],
   ['negative clock',value=>{value.startedAt=-1;value.completedAt=100}],
   ['fractional clock',value=>{value.durationMs=100.5}],
   ['unsafe clock',value=>{value.startedAt=Number.MAX_SAFE_INTEGER+1;value.completedAt=value.startedAt;value.durationMs=0}],
   ['future clock',value=>{value.startedAt=Date.now()+60000;value.completedAt=value.startedAt+101}],
   ['reversed clock',value=>{value.completedAt=value.startedAt-1;value.durationMs=0}],
   ['before slot start',value=>{value.startedAt--;value.completedAt--}],
   ['false matching status',value=>{value.checks[0].pass=false;value.outcome='target_failure'}],
   ['wrong status marked pass',value=>{value.status=503}],
   ['missing latency assertion',value=>{value.checks.pop()}],
   ['missing body assertion',value=>{value.checks=value.checks.filter(c=>c.assertion!=='body')}],
   ['foreign category',value=>{value.checks=[assertion('heartbeat',false)];value.outcome='target_failure'}],
   ['contradictory outcome',value=>{value.outcome='target_failure'}],
   ['oversized response',value=>{value.bytes=65537}],
   ['missing response bytes',value=>{delete value.bytes}],
   ['nonboolean latency',value=>{value.checks.at(-1).pass='true'}],
   ['retained response body',value=>{value.body='ready'}],
  ]){
   const altered=structuredClone(legacyArchive),row=altered.payload.tables.observations[0],value=JSON.parse(row.evidence);
   mutate(value);row.evidence=JSON.stringify(value);await rejectArchive(altered,label);
  }
 });
 await check('typed and partially typed histories cannot claim the legacy sampling exemption',async()=>{
  for(const [label,fields] of [['typed',{type:'http',network:'synthetic'}],['type only',{type:'http'}],['network only',{network:'synthetic'}],['explicit null fields',{type:null,network:null}]]){
   for(const [index,record] of records.entries()){
    const altered=structuredClone(nativeArchive);changeDefinitions(altered,definition=>Object.assign(definition,fields));
    const row=altered.payload.tables.observations[index],value=JSON.parse(row.evidence);
    value.completedAt=value.startedAt+record.elapsed;value.durationMs=record.elapsed;row.evidence=JSON.stringify(value);
    await rejectArchive(altered,label+' '+record.name);
   }
  }
 });
 await check('all legacy latency booleans restore byte-for-byte only as paused quarantined history',async()=>{
  const result=await recovery.api('/api/restore','POST',rehash(legacyArchive));assert.equal(result.status,200,JSON.stringify(result.data));
  const overview=(await recovery.api('/api/overview')).data,restored=overview.monitors[0];
  assert.equal(restored.id,monitor.id);assert.equal(restored.revision,monitor.revision+1);assert.equal(restored.definition.enabled,false);
  assert.equal(restored.state.state,'Paused');assert.equal(restored.state.targetState,'Unknown');
  assert.deepEqual(restored.storedState,{state:'Unknown',confirmedFailure:false,notificationOpen:false});
  assert.equal(overview.runner.contact.state,'Never seen');
  assert.deepEqual((await recovery.DB.prepare('SELECT * FROM observations ORDER BY rowid').all()).results,legacyArchive.payload.tables.observations);
  for(const row of legacyArchive.payload.tables.revisions)assert.deepEqual(await recovery.DB.prepare('SELECT * FROM revisions WHERE monitor_id=? AND revision=?').bind(row.monitor_id,row.revision).first(),row);
  const slots=(await recovery.DB.prepare('SELECT * FROM slots').all()).results;
  assert.ok(slots.every(slot=>slot.lease_owner==='restored-inactive'&&slot.lease_until===0&&!['queued','running'].includes(slot.status)));
  for(const table of ['heartbeat_authority','heartbeat_claims'])assert.equal((await recovery.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
  assert.ok(overview.alerts.length>0&&overview.alerts.every(alert=>alert.status==='imported-inactive'&&alert.lease_until===0&&alert.receipt===null));
  assert.deepEqual((await recovery.DB.prepare('SELECT version FROM migrations ORDER BY version').all()).results.map(row=>row.version),[1,2,3]);
  assert.equal(await recovery.claim(),null);
  const before=await durable(recovery);assert.deepEqual((await recovery.api('/api/notifications')).data.deliveries,[]);
  assert.deepEqual(await durable(recovery),before);
 });
 await check('reactivation starts Unknown and needs new valid signed evidence for the new revision',async()=>{
  const restored=await recovery.monitor(monitor.id);
  assert.equal((await recovery.api(`/api/monitors/${monitor.id}`,'PATCH',{...restored.definition,assignments:undefined,canaryUrl:'https://canary.example.test/health',enabled:true})).status,200);
  const active=await recovery.monitor(monitor.id);assert.equal(active.revision,monitor.revision+2);assert.equal(active.state.state,'Unknown');
  const task=await claim(recovery);
  for(const record of records)await rejectLive(recovery,task,evidence(task,record.elapsed,record.latency),'reactivated '+record.name);
  assert.equal((await recovery.monitor(monitor.id)).state.state,'Unknown');
  const before=await durable(recovery),old=JSON.parse(legacyArchive.payload.tables.observations[0].evidence);
  assert.equal((await recovery.submit(task,[old])).status,400);assert.deepEqual(await durable(recovery),before);
  const valid=evidence(task);assert.equal((await recovery.submit(task,[valid])).status,200);
  assert.equal((await recovery.monitor(monitor.id)).state.state,'Healthy');
  const history=(await recovery.api(`/api/monitors/${monitor.id}/history`)).data;
  assert.deepEqual(history.find(slot=>slot.revision===active.revision).observations,[valid]);
  const alerts=(await recovery.api('/api/overview')).data.alerts;assert.equal(alerts.length,legacyArchive.payload.tables.outbox.length);
  assert.ok(alerts.every(alert=>alert.status==='imported-inactive'));
 });
 console.log(`LEGACY-LATENCY-001 passed: ${passed} native checks; ${liveRejected} scalar/status contradictions rejected live and ${archiveRejected} malformed or nonlegacy archives rejected without writes.`);
}finally{
 await recovery?.worker.dispose();await source?.worker.dispose();
 Object.assign(bindings,originalBindings);await rm(dir,{recursive:true,force:true});
}
