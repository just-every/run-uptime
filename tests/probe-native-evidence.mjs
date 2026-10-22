import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {migrate,installation,bindings} from './probe-native-support.mjs';
import {probeHttp,probeHeartbeat} from '../runners/src/probes.mjs';
import {validateDefinition} from '../src/domain/policy.mjs';

const dir=await mkdtemp(join(tmpdir(),'uptime-signed-evidence-'));
let source,recovery,fixture,fixturePort,passed=0,rejections=0;const originalGrantPort=bindings.UPTIME_SYNTHETIC_PORT;
let response={status:200,headers:{'x-check':'yes'},body:'{"ready":true}'};
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const assertion=(name,pass=true)=>({assertion:name,pass,reason:'Signed test evidence'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rehash=value=>({...value,sha256:createHash('sha256').update(JSON.stringify(value.payload)).digest('hex')});
// Signed evidence fixtures stand at the network edge; the production canary is exercised separately by real runner flows.
function attachCanary(task,value){if(value&&typeof value==='object'&&!Array.isArray(value)&&task.definition.assignments?.[value.probe]?.canaryUrl)value.canary??={id:randomUUID(),probe:value.probe,attempt:0,startedAt:task.dueAt,completedAt:task.dueAt,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'pass',status:200,bytes:0,checks:[assertion('status')]};return value}
const outcome=(task,changes={})=>({id:randomUUID(),probe:'local-a',attempt:0,startedAt:task.dueAt,completedAt:task.dueAt,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'pass',status:200,bytes:3,checks:[assertion('status')],...changes});
const timed=(task,duration,changes={})=>outcome(task,{completedAt:task.dueAt+duration,durationMs:duration,...changes});
const failed=(task,category,outcomeName)=>{
 const value=outcome(task,{outcome:outcomeName,checks:[assertion(category,false)]});
 delete value.status;delete value.bytes;return value;
};
// The runner door claims the next eligible task across all monitors, not a
// requested monitor. Earlier heartbeat evaluations can become due between cases.
async function claimFor(monitorId){
 const seen=new Set();
 for(let count=0;count<100;count++){
  const task=await source.claim();assert.ok(task,'the monitor under test must have an eligible task');
  assert.ok(!seen.has(task.id),'a task must not be delivered twice');seen.add(task.id);
  if(task.monitorId===monitorId)return task;
 }
 assert.fail('the monitor under test was not claimed within the installation monitor bound');
}
async function create(changes={}){
 const result=await source.api('/api/monitors','POST',{name:'Signed evidence contract',type:'http',network:'public',url:'https://evidence-only.test/health',canaryUrl:'https://canary.example.test/health',intervalMs:86400000,retries:0,confirmSlots:1,recoverSlots:1,...changes});
 assert.equal(result.status,201,JSON.stringify(result.data));
 const task=await claimFor(result.data.id);assert.equal(task.monitorId,result.data.id);return task;
}
async function next(task){await source.due(task.monitorId);const value=await claimFor(task.monitorId);assert.equal(value.monitorId,task.monitorId);return value}
async function durable(){
 const tables=['monitors','slots','observations','outbox','runner_contact'];
 return Promise.all(tables.map(async name=>(await source.DB.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()).results));
}
async function reject(task,value,label){
 const before=await durable(),result=await source.submit(task,[attachCanary(task,value)]);
 assert.equal(result.status,400,label+' '+JSON.stringify(result.data));
 assert.deepEqual(await durable(),before,label+' must not commit evidence, health, alerts, contact or slot completion');rejections++;
}
async function accept(task,attempts,state){
 attempts.forEach(value=>attachCanary(task,value));const result=await source.submit(task,attempts);assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal((await source.monitor(task.monitorId)).state.state,state);
 const history=(await source.api(`/api/monitors/${task.monitorId}/history`)).data;
 assert.deepEqual(history.find(slot=>slot.id===task.id).observations,attempts);
}

try{
 fixture=http.createServer((_req,res)=>{res.sendDate=false;res.writeHead(response.status,{'x-uptime-fixture':'signed-evidence-fixture',...response.headers});res.end(response.body)});
 await new Promise((resolve,reject)=>{fixture.once('error',reject);fixture.listen(0,'127.0.0.1',resolve)});fixturePort=fixture.address().port;bindings.UPTIME_SYNTHETIC_PORT=String(fixturePort);
 await check('runner uses one completion sample for latency and stored clock evidence at an exact limit',async()=>{
  const definition=validateDefinition({name:'Clock boundary',url:`http://127.0.0.1:${fixturePort}/health`,assertions:{status:200,latencyMs:1}},[fixturePort]);
  const original=Date.now;let ticks=0,evidence;
  try{
   Date.now=()=>100000+ticks++;
   evidence=await probeHttp({...definition,fixtureIdentity:'signed-evidence-fixture'},'local-a',[fixturePort]);
  }finally{Date.now=original}
  assert.equal(evidence.outcome,'pass');assert.equal(evidence.durationMs,1);assert.equal(evidence.completedAt-evidence.startedAt,1);
  assert.equal(evidence.checks.find(c=>c.assertion==='latency').pass,true);assert.equal(ticks,2);
 });
 await migrate(join(dir,'source'));source=await installation(join(dir,'source'),0);
 await check('signed latency derives from immutable limits and consistent clocks before any health or alert commit',async()=>{
  let task=await create({assertions:{status:200,latencyMs:1}});
  await delay(Math.max(0,task.dueAt+21-Date.now()));
  const checks=[assertion('status'),assertion('latency')];
  await reject(task,timed(task,21,{checks}),'SEC-1: 21ms cannot pass a 1ms limit');
  await reject(task,timed(task,21,{durationMs:0,checks}),'zero duration cannot bypass the clock interval');
  await reject(task,timed(task,0,{durationMs:21,checks}),'duration cannot fabricate a different clock interval');
  await reject(task,timed(task,2,{durationMs:1,checks}),'one-tick tolerance cannot conceal a slow completion');
  await reject(task,timed(task,1,{durationMs:2,checks}),'one-tick tolerance uses the larger duration');
  await reject(task,timed(task,1,{outcome:'target_failure',checks:[assertion('status'),assertion('latency',false)]}),'within-limit latency cannot be reported as failing');
  await accept(task,[timed(task,1,{checks})],'Healthy');
  task=await next(task);await delay(Math.max(0,task.dueAt+21-Date.now()));
  await accept(task,[timed(task,21,{outcome:'target_failure',checks:[assertion('status'),assertion('latency',false)]})],'Failing');
  assert.equal((await source.api('/api/overview')).data.alerts.filter(a=>a.monitor_id===task.monitorId&&a.kind==='trigger').length,1);
 });
 await check('HTTP rejects foreign assertions, contradictory status and outcome, and partial response evidence',async()=>{
  const task=await create();
  for(const [label,changes] of [
   ['SEC-2: HTTP heartbeat failure',{outcome:'target_failure',checks:[assertion('heartbeat',false)]}],
   ['SEC-2: matching status marked failed',{outcome:'target_failure',checks:[assertion('status',false)]}],
   ['mismatching status marked passed',{status:503}],
   ['all passes with target failure',{outcome:'target_failure'}],
   ['HTTP response as runner error',{outcome:'runner_error'}],
   ['unconfigured body failure',{outcome:'target_failure',checks:[assertion('status'),assertion('body',false)]}],
   ['missing status',{status:undefined}],['missing byte count',{bytes:undefined}],
   ['HTTP response as transport error',{outcome:'target_failure',checks:[assertion('timeout',false)]}],
   ['HTTP receipt field',{heartbeatReceivedAt:task.dueAt}],
  ])await reject(task,outcome(task,changes),label);
  await accept(task,[outcome(task,{status:503,outcome:'target_failure',checks:[assertion('status',false)]})],'Failing');
 });
 await check('every configured assertion is required on success and failure; retries retain the original failure',async()=>{
  let task=await create({type:'keyword',retries:1,assertions:{status:[200,'201-299'],bodyIncludes:'ready',bodyExcludes:'maintenance',bodyRegex:{pattern:'ready'},header:{name:'x-check',equals:'yes'},json:{path:'$.checks[*].ready',equals:true},latencyMs:50}});
  const names=['status','body','body-absent','body-regex','header','json','latency'],checks=names.map(name=>assertion(name));
  for(const name of names){
   await reject(task,outcome(task,{checks:checks.filter(c=>c.assertion!==name)}),'omitted pass '+name);
   await reject(task,outcome(task,{status:503,outcome:'target_failure',checks:checks.filter(c=>c.assertion!==name).map(c=>c.assertion==='status'?assertion('status',false):c)}),'omitted failure '+name);
  }
  const failure=outcome(task,{outcome:'target_failure',checks:checks.map(c=>c.assertion==='body'?assertion('body',false):c)});
  await reject(task,outcome(task,{status:299,outcome:'target_failure',checks:checks.map(c=>c.assertion==='status'?assertion('status',false):c)}),'a status in the saved range must pass');
  await reject(task,outcome(task,{status:300,checks}),'a status outside the saved range must fail');
  await reject(task,{...failure,outcome:'pass'},'pass cannot include a failed assertion');
  await accept(task,[failure,outcome(task,{attempt:1,checks})],'Healthy');
  assert.equal((await source.api('/api/overview')).data.alerts.filter(a=>a.monitor_id===task.monitorId).length,0);
  for(const name of ['body','body-absent','body-regex','header','json']){
   task=await next(task);
   const exhausted=outcome(task,{outcome:'target_failure',checks:checks.map(c=>c.assertion===name?assertion(name,false):c)});await accept(task,[exhausted,{...exhausted,id:randomUUID(),attempt:1}],'Failing');
  }
 });
 await check('transport and runner errors have exact category/outcome shapes and preserve target/coverage separation',async()=>{
  let task=await create();
  for(const [category,want] of [
   ...['encoding','redirect','body-limit','transport','timeout','connection'].map(name=>[name,'target_failure']),
   ...['custody','runner','network','dns'].map(name=>[name,'runner_error']),
  ]){
   const value=failed(task,category,want);
   await reject(task,{...value,outcome:want==='runner_error'?'target_failure':'runner_error'},category+' wrong failure classification');
   await reject(task,{...value,outcome:'pass'},category+' cannot pass');
   await reject(task,{...value,checks:[assertion(category)]},category+' error must fail');
   await reject(task,{...value,checks:[...value.checks,assertion('status',false)]},category+' mixed response/error evidence');
   await reject(task,{...value,bytes:0},category+' must not claim a completed response');
   await accept(task,[value],want==='runner_error'?'Unknown':'Failing');task=await next(task);
  }
  await reject(task,failed(task,'heartbeat','target_failure'),'HTTP error cannot use heartbeat');
  await reject(task,failed(task,'unknown','target_failure'),'unknown error category');
  await accept(task,[outcome(task)],'Healthy');
 });
 await check('heartbeat accepts only its receipt evaluation or runner execution error and retains snapshot authority',async()=>{
  let task=await create({type:'heartbeat',url:undefined,heartbeat:{maxAgeMs:5000}});
  for(const category of ['status','body','latency','custody','network','dns','connection','timeout']){
   await reject(task,failed(task,category,category==='custody'||category==='network'||category==='dns'?'runner_error':'target_failure'),'foreign heartbeat category '+category);
  }
  await reject(task,failed(task,'heartbeat','runner_error'),'heartbeat assertion cannot be a runner error');
  await reject(task,{...failed(task,'runner','runner_error'),heartbeatReceivedAt:task.dueAt},'runner error cannot claim a receipt');
  await accept(task,[failed(task,'runner','runner_error')],'Unknown');
  await delay(Math.max(0,task.heartbeatReceipt.job.baselineAt+task.definition.heartbeat.maxAgeMs+(task.definition.heartbeat.graceMs??0)-Date.now()));
  task=await next(task);const absent={...probeHeartbeat(task.definition,'local-a',task.heartbeatReceipt),attempt:0};
  await reject(task,{...absent,outcome:'pass',checks:[assertion('heartbeat')]},'absent heartbeat cannot pass');
  await accept(task,[absent],'Failing');
  const issued=await source.api(`/api/monitors/${task.monitorId}/heartbeat-key`,'POST',{});assert.equal(issued.status,200);
  assert.equal((await source.api(`/api/heartbeats/${task.monitorId}`,'POST',{}, {authorization:`Bearer ${issued.data.token}`,'x-heartbeat-sequence':'1'},false)).status,200);
  task=await next(task);const fresh={...probeHeartbeat(task.definition,'local-a',task.heartbeatReceipt),attempt:0};
  await reject(task,{...fresh,outcome:'target_failure',checks:[assertion('heartbeat',false)]},'fresh heartbeat cannot manufacture failure');
  await reject(task,{...fresh,heartbeatReceivedAt:fresh.heartbeatReceivedAt-1},'freshness does not replace exact snapshot identity');
  await accept(task,[fresh],'Healthy');
 });
 await check('signed observation structure, scalar bounds and clock metadata fail closed',async()=>{
  const task=await create(),valid=outcome(task);
  for(const [label,value] of [
   ['null',null],['array',[]],['unknown observation field',{...valid,body:'not retained'}],
   ['negative duration',{...valid,durationMs:-1}],['fractional duration',{...valid,durationMs:0.5}],
   ['unsafe time',{...valid,startedAt:Number.MAX_SAFE_INTEGER+1,completedAt:Number.MAX_SAFE_INTEGER+1}],
   ['fractional time',{...valid,startedAt:valid.startedAt+0.5,completedAt:valid.completedAt+0.5}],
   ['before due',{...valid,startedAt:valid.startedAt-1}],['reversed clock',{...valid,completedAt:valid.startedAt-1}],
   ['future completion',{...valid,completedAt:Date.now()+60000,durationMs:60000}],
   ['low status',{...valid,status:99}],['high status',{...valid,status:600}],
   ['negative bytes',{...valid,bytes:-1}],['oversized body',{...valid,bytes:65537}],['fractional bytes',{...valid,bytes:0.5}],
   ['missing checks',{...valid,checks:undefined}],['empty checks',{...valid,checks:[]}],
   ['duplicate checks',{...valid,checks:[assertion('status'),assertion('status')]}],
   ['null check',{...valid,checks:[null]}],['nonboolean check',{...valid,checks:[{...assertion('status'),pass:'true'}]}],
   ['extra check field',{...valid,checks:[{...assertion('status'),value:200}]}],
   ['empty reason',{...valid,checks:[{...assertion('status'),reason:''}]}],
   ['overlong reason',{...valid,checks:[{...assertion('status'),reason:'x'.repeat(301)}]}],
  ])await reject(task,value,label);
  await accept(task,[valid],'Healthy');
 });
 await check('real synthetic HTTP response assertions pass and fail through native signed completion',async()=>{
  let task=await create({network:'synthetic',url:`http://127.0.0.1:${fixturePort}/health`,assertions:{status:[200,'201-202'],bodyIncludes:'ready',bodyExcludes:'maintenance',bodyRegex:{pattern:'"ready":true'},header:{name:'x-check',equals:'yes'},json:{path:'$["ready"]',equals:true},latencyMs:10000}});
  const execute=async()=>({...await probeHttp({...task.definition,fixtureIdentity:'signed-evidence-fixture'},'local-a',[fixturePort]),attempt:0});
  await accept(task,[await execute()],'Healthy');
  response={status:200,headers:{'x-check':'no'},body:'{"ready":false}'};task=await next(task);
  const failure=await execute();assert.equal(failure.checks.find(c=>c.assertion==='status').pass,true);assert.equal(failure.checks.find(c=>c.assertion==='header').pass,false);assert.equal(failure.checks.find(c=>c.assertion==='json').pass,false);
  await accept(task,[failure],'Failing');
  response={status:503,headers:{},body:'unavailable'};task=await next(task);await accept(task,[await execute()],'Failing');
  for(const [category,status] of [['encoding',200],['redirect',302],['body-limit',200]]){
   task=await next(task);const value={...failed(task,category,'target_failure'),status};
   await reject(task,{...value,status:600},'historical '+category+' status is bounded');
   await reject(task,{...value,bytes:65537},'historical '+category+' byte count is bounded');
   await reject(task,{...value,outcome:'runner_error'},'historical '+category+' keeps its target-failure classification');
   await accept(task,[value],'Failing');
  }
 });
 await check('restore rejects contradictory signed history but retains supported legacy clock sampling and quarantine',async()=>{
  await migrate(join(dir,'recovery'));recovery=await installation(join(dir,'recovery'),15519);
  const archive=(await source.api('/api/archive')).data;
  for(const mutation of [
   value=>{value.durationMs=0;value.completedAt=value.startedAt+21;value.checks=[assertion('status'),assertion('latency')];value.outcome='pass'},
   value=>{value.checks=[assertion('heartbeat',false)];value.outcome='target_failure'},
   value=>{value.checks=[assertion('status',false),assertion('latency')];value.outcome='target_failure'},
  ]){
   const forged=structuredClone(archive),row=forged.payload.tables.observations[0],value=JSON.parse(row.evidence);mutation(value);row.evidence=JSON.stringify(value);
   assert.equal((await recovery.api('/api/restore','POST',rehash(forged))).status,400);
   assert.equal((await recovery.DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n,0);
  }
  // Build an old-format HTTP archive with no type/network fields, and the old
  // runner's separately sampled duration one millisecond after completion.
  const old=structuredClone(archive),tables=old.payload.tables;
  delete old.payload.extensionVersion;delete old.payload.productTables;delete old.payload.erasureFence;
  const monitor=tables.monitors.find(row=>JSON.parse(row.definition).network==='synthetic');
  tables.monitors=tables.monitors.filter(row=>row.id===monitor.id);
  tables.revisions=tables.revisions.filter(row=>row.monitor_id===monitor.id);
  tables.slots=tables.slots.filter(row=>row.monitor_id===monitor.id);
  const slotIds=new Set(tables.slots.map(row=>row.id));
  tables.observations=tables.observations.filter(row=>slotIds.has(row.slot_id));tables.outbox=tables.outbox.filter(row=>row.monitor_id===monitor.id);
  for(const row of [...tables.monitors,...tables.revisions,...tables.slots]){const definition=JSON.parse(row.definition);delete definition.type;delete definition.network;row.definition=JSON.stringify(definition)}
  for(const row of tables.observations){const value=JSON.parse(row.evidence);value.durationMs=value.completedAt-value.startedAt+1;row.evidence=JSON.stringify(value)}
  tables.migrations=tables.migrations.filter(row=>row.version<=2);
  assert.equal((await recovery.api('/api/restore','POST',rehash(old))).status,200);
  const imported=(await recovery.api('/api/overview')).data;assert.ok(imported.monitors.every(m=>m.state.state==='Paused'));assert.ok(imported.alerts.length>0);assert.ok(imported.alerts.every(a=>a.status==='imported-inactive'));
  assert.deepEqual((await recovery.DB.prepare('SELECT evidence FROM observations ORDER BY rowid').all()).results.map(row=>row.evidence),tables.observations.map(row=>row.evidence));
  assert.deepEqual((await recovery.DB.prepare('SELECT version FROM migrations ORDER BY version').all()).results.map(row=>row.version),[1,2,3]);assert.equal(await recovery.claim(),null);
 });
 console.log(`SIGNED-EVIDENCE-001 passed: ${passed} native/runner/archive checks; ${rejections} contradictory or malformed signed observations rejected without durable side effects.`);
}finally{
 bindings.UPTIME_SYNTHETIC_PORT=originalGrantPort;
 await recovery?.worker.dispose();await source?.worker.dispose();
 if(fixture){fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve))}
 await rm(dir,{recursive:true,force:true});
}
