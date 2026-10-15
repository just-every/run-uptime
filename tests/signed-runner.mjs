import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import https from 'node:https';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,certificate,runChild,listen,close,request} from './signed-runner-runtime.mjs';
import {proveFreshResultSignature,assertRunnerAdmissionOnly} from './signed-runner-result-proof.mjs';

const directory=await mkdtemp(join(tmpdir(),'uptime-signed-runner-'));
const key='signed-runner-test-only-installation-runner-key';
let worker,db,control,target,child,origin,resultHandler,bridgeError,signatureReceipt,cookie='',mode=200,passed=0;
const requests=[],children=[];
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
const signature=(path,body,stamp)=>createHmac('sha256',key).update(`${stamp}.${path==='/api/runner/enroll'?'runner-enrolment.':''}${JSON.stringify(body)}`).digest('hex');
const signed=(path,body,extra={})=>{const stamp=String(Date.now());return {'x-runner-key':key,'x-sent-at':stamp,'x-runner-signature':signature(path,body,stamp),...extra}};
async function snapshot(){
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_METADATA' ORDER BY name").all()).results;
 return Promise.all(tables.map(async({name})=>[name,(await db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results]));
}
async function waitDue(id){const row=await db.prepare('SELECT next_due FROM monitors WHERE id=?').bind(id).first();const delay=row.next_due-Date.now()+20;if(delay>0)await new Promise(r=>setTimeout(r,delay))}
try{
 const tls=await certificate(directory);
 target=https.createServer(tls,(req,res)=>{requests.push({host:req.headers.host,sni:req.socket.servername,path:req.url});res.writeHead(req.url==='/canary'?200:mode,{'content-type':'text/plain'});res.end(mode===200?'operational':'unavailable')});
 const targetPort=await listen(target);
 const dispatch=envelope=>worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify(envelope)});
 control=https.createServer(tls,async(req,res)=>{
  try{
   let body='';for await(const chunk of req)body+=chunk;
   const envelope={url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{})};
   const intercept=req.url==='/api/runner/results'?resultHandler:undefined;
   if(intercept)resultHandler=undefined;
   const response=intercept?await intercept(envelope):await dispatch(envelope);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){bridgeError=error;res.writeHead(500);res.end('Emitted Worker request failed')}
 });
 origin=`https://localhost:${await listen(control)}`;
 const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-provider-not-contacted',UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,OWNER_EMAIL:'owner@example.test',UPTIME_RUNNER_KEY:key};
 worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers}});
 const runner=async()=>{child=runChild({origin,key,caPath:tls.caPath,targetPort});children.push(child.child.pid);try{await child.finish()}catch(error){throw bridgeError??error}child=undefined};
 const enrollBody={version:1},enrollPath='/api/runner/enroll';

 await check('signed enrolment rejects absent authority, tampering, stale timestamps and result-purpose signatures without product, auth or audit changes; only exact runner admissions persist',async()=>{
  const before=await snapshot(),start=Date.now();
  assert.equal((await api(enrollPath,enrollBody)).status,401);
  assert.equal((await api(enrollPath,enrollBody,{'x-runner-key':key})).status,403);
  const old=String(Date.now()-61000);
  assert.equal((await api(enrollPath,enrollBody,{'x-runner-key':key,'x-sent-at':old,'x-runner-signature':signature(enrollPath,enrollBody,old)})).status,403);
  assert.equal((await api(enrollPath,{version:2},signed(enrollPath,enrollBody))).status,403);
  assert.equal((await api(enrollPath,enrollBody,signed('/api/runner/results',enrollBody))).status,403);
  assertRunnerAdmissionOnly(before,await snapshot(),{secret:bindings.SESSION_SECRET,client:'192.0.2.1',requests:5,start});
 });
 let registration;
 await check('one signed self-runner registration is idempotent and refuses a caller-selected second identity',async()=>{
  const results=await Promise.all([api(enrollPath,enrollBody,signed(enrollPath,enrollBody)),api(enrollPath,enrollBody,signed(enrollPath,enrollBody))]);
  for(const result of results)assert.equal(result.status,200);
  registration=results[0].data;assert.deepEqual(results[1].data,registration);assert.match(registration.runnerId,/^self-/);assert.equal(registration.scope,'self-runner');
  const before=await snapshot(),start=Date.now(),second={version:1,runnerId:`self-${randomUUID()}`};
  assert.equal((await api(enrollPath,second,signed(enrollPath,second))).status,403);
  assert.equal((await api('/api/runner/claim',{}, {'x-runner-key':key,'x-runner-id':second.runnerId})).status,401);
  assertRunnerAdmissionOnly(before,await snapshot(),{secret:bindings.SESSION_SECRET,client:'192.0.2.1',requests:2,start});assert.equal((await db.prepare('SELECT COUNT(*) n FROM runners WHERE legacy_key=1').first()).n,1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM runner_contact').first()).n,0,'enrolment is not contact or health');
 });
 const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Runner acceptance owner'});assert.equal(boot.status,303);cookie=boot.headers['set-cookie'][0].split(';')[0];
 const created=await api('/api/monitors',{name:'Actual verified HTTPS',url:'https://runner-target.test/health',network:'public',canaryUrl:'https://canary.runner-target.test/canary',intervalMs:5000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1});assert.equal(created.status,201);
 const id=created.data.id;
 const history=async()=>{const r=await api(`/api/monitors/${id}/history`);assert.equal(r.status,200);return r.data};
 const monitor=async()=>(await api('/api/overview')).data.monitors.find(m=>m.id===id);
 await check('bad signature on an otherwise valid fresh assigned acceptance window preserves every non-counter D1 table and consumes one runner admission; the original signed result then commits exactly once',async()=>{
  resultHandler=async envelope=>{const proof=await proveFreshResultSignature({envelope,dispatch,db,snapshot,runnerId:registration.runnerId,secret:bindings.SESSION_SECRET});signatureReceipt=proof.receipt;return proof.response};
  await runner();assert.equal(resultHandler,undefined,'the real Node runner emitted its signed completion');assert.ok(signatureReceipt);
 });
 await check('real Node runner enrols and commits scheduled Healthy evidence from a verified HTTPS socket to the emitted production Worker',async()=>{
  const rows=await history();assert.equal(rows.length,1);assert.equal(rows[0].manual,0);assert.equal(rows[0].status,'complete');assert.equal(rows[0].observations[0].outcome,'pass');assert.equal(rows[0].observations[0].status,200);assert.equal(rows[0].lease_owner,'');assert.equal((await monitor()).state.state,'Healthy');
  assert.deepEqual(requests,[{host:'canary.runner-target.test',sni:'canary.runner-target.test',path:'/canary'},{host:'runner-target.test',sni:'runner-target.test',path:'/health'}]);
 });
 await check('a restarted Node runner retains one identity and earlier observations while committing actual scheduled down evidence',async()=>{
  const old=(await history())[0];mode=503;await waitDue(id);await runner();
  const rows=await history();assert.equal(rows.length,2);assert.deepEqual(rows.find(r=>r.id===old.id),old);assert.equal(rows[0].observations[0].status,503);assert.equal(rows[0].observations[0].outcome,'target_failure');assert.equal(rows[0].manual,0);assert.equal((await monitor()).state.state,'Failing');assert.equal((await api('/api/overview')).data.alerts.filter(a=>a.kind==='trigger').length,1);
  assert.equal(new Set(children).size,2);assert.deepEqual((await api(enrollPath,enrollBody,signed(enrollPath,enrollBody))).data,registration);
 });
 await check('Worker persistence restart retains registration and exact history; restarted runner records scheduled recovery without replay',async()=>{
  const before=await snapshot(),old=await history();await worker.dispose();worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');assert.deepEqual(await snapshot(),before);
  assert.deepEqual((await api(enrollPath,enrollBody,signed(enrollPath,enrollBody))).data,registration);mode=200;await waitDue(id);await runner();
  const rows=await history();for(const row of old)assert.deepEqual(rows.find(r=>r.id===row.id),row);assert.equal(rows.length,3);assert.equal((await monitor()).state.state,'Healthy');assert.equal((await api('/api/overview')).data.alerts.filter(a=>a.kind==='recovery').length,1);assert.equal(new Set(children).size,3);
 });
 await check('foreign runner identity is refused without durable changes; the assigned legacy key remains compatible',async()=>{
  assert.equal((await api(`/api/monitors/${id}/run`,{})).status,200);
  const claimed=await api('/api/runner/claim',{}, {'x-runner-key':key,'x-runner-id':registration.runnerId});assert.equal(claimed.status,200);const task=claimed.data.task;assert.ok(task.acceptUntil>Date.now());
  const now=Date.now(),canary={id:randomUUID(),probe:'local-a',attempt:0,startedAt:now,completedAt:now,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'pass',status:200,bytes:0,checks:[{assertion:'status',pass:true,reason:'HTTP 200'}]},body={slotId:task.id,attempts:[{id:randomUUID(),probe:'local-a',attempt:0,startedAt:now,completedAt:now,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'runner_error',canary,checks:[{assertion:'runner',pass:false,reason:'Acceptance identity rejection probe'}]}]};
  const before=await snapshot(),start=Date.now();assert.equal((await api('/api/runner/results',body,signed('/api/runner/results',body,{'x-runner-id':`self-${randomUUID()}`}))).status,401);assertRunnerAdmissionOnly(before,await snapshot(),{secret:bindings.SESSION_SECRET,client:'192.0.2.1',requests:1,start});
  assert.equal((await api('/api/runner/results',body,signed('/api/runner/results',body))).status,200);assert.equal((await monitor()).state.state,'Healthy','manual execution cannot change scheduled state');
 });
 await check('a single-vantage heartbeat receipt completes through the real runner with its HTTP canary',async()=>{
  const current=await monitor();
  assert.equal((await api(`/api/monitors/${id}`,{...current.definition,enabled:false},{},'PATCH')).status,200);
  const heartbeat=await api('/api/monitors',{name:'Nightly backup heartbeat',type:'heartbeat',heartbeat:{maxAgeMs:60000},canaryUrl:'https://canary.runner-target.test/canary',intervalMs:5000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1});
  assert.equal(heartbeat.status,201);
  const issued=await api(`/api/monitors/${heartbeat.data.id}/heartbeat-key`,{});assert.equal(issued.status,200);
  const receipt=await api(`/api/heartbeats/${heartbeat.data.id}`,{},{authorization:`Bearer ${issued.data.token}`,'x-heartbeat-sequence':'1'});assert.equal(receipt.status,200);assert.equal(receipt.data.received,true);
  await waitDue(heartbeat.data.id);await runner();
  const rows=(await api(`/api/monitors/${heartbeat.data.id}/history`)).data;
  assert.equal(rows[0].status,'complete');assert.equal(rows[0].manual,0);
  assert.equal(rows[0].observations[0].outcome,'pass');assert.equal(rows[0].observations[0].canary.outcome,'pass');
  assert.equal((await api('/api/overview')).data.monitors.find(m=>m.id===heartbeat.data.id).state.state,'Healthy');
 });
 console.log('SIGNED-RUNNER results '+JSON.stringify(signatureReceipt));
 console.log(`SIGNED-RUNNER passed ${passed} checks: emitted Worker + migrated persistent D1, real Node process restarts, local HTTPS with verified certificates; no real account or public network deployment.`);
}finally{await child?.stop();await close(control);await worker?.dispose();await close(target);await rm(directory,{recursive:true,force:true})}
