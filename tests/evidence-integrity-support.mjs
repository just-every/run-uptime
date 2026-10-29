import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import https from 'node:https';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,certificate,runChild,listen,close,request} from './signed-runner-runtime.mjs';
import {assertRunnerAdmissionOnly} from './signed-runner-result-proof.mjs';

// This installation owns its migrations and clock. Only DNS and sockets are
// routed by the existing certificate-checked production-runner transport.
export async function proveEvidenceIntegrity(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-evidence-'));
 const key=randomUUID()+randomUUID();
 let worker,db,control,target,child,origin,bindings,cookie='',clock,handler,bridgeError,mode=503;
 const targetRequests=[],receipts=[];
 const sign=(body,at)=>createHmac('sha256',key).update(`${at}.${body}`).digest('hex');
 const dispatch=envelope=>worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify(envelope)});
 async function snapshot(){
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_METADATA' ORDER BY name").all()).results;
  return Promise.all(tables.map(async({name})=>[name,(await db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results]));
 }
 const rows=(value,name)=>value.find(([table])=>table===name)[1];
 async function unchanged(envelope,check){
  const before=await snapshot(),response=await dispatch(envelope);
  await check(response.clone());
  const after=await snapshot();
  assertRunnerAdmissionOnly(before,after,{secret:bindings.SESSION_SECRET,client:'loopback',requests:1,start:envelope.clock,end:envelope.clock});
  return {response,tables:before.length};
 }
 try{
  const tls=await certificate(directory);
  target=https.createServer(tls,(req,res)=>{
   targetRequests.push({host:req.headers.host,sni:req.socket.servername,path:req.url,status:req.url==='/canary'?200:mode});
   res.writeHead(req.url==='/canary'?200:mode,{'content-type':'text/plain'});res.end(mode===200?'operational':'unavailable');
  });
  const targetPort=await listen(target);
  control=https.createServer(tls,async(req,res)=>{
   try{
    let body='';for await(const chunk of req)body+=chunk;
    const envelope={url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{}),...(clock===undefined?{}:{clock})};
    const intercept=req.url==='/api/runner/results'?handler:undefined;
    if(intercept)handler=undefined;
    const response=intercept?await intercept(envelope):await dispatch(envelope);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch(error){bridgeError=error;res.writeHead(500);res.end('Emitted Worker request failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  bindings={...testAuthBindings,UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-1'};
  worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{method,body,headers:{origin,cookie,...headers}});
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Synthetic evidence owner'});
  assert.equal(boot.status,303);cookie=boot.headers['set-cookie'][0].split(';')[0];
  await completeApiSecondFactor(origin,cookie,api);
  const enrollment=JSON.stringify({version:1}),at=String(Date.now());
  const enrolled=await api('/api/runner/enroll',JSON.parse(enrollment),{'x-runner-key':key,'x-sent-at':at,'x-runner-signature':createHmac('sha256',key).update(`${at}.runner-enrolment.${enrollment}`).digest('hex')});
  assert.equal(enrolled.status,200);
  const destination=await api('/api/notifications/destinations',{name:'synthetic-uptime-1',kind:'email',address:['synthetic-uptime-1','example.test'].join('@')});
  assert.equal(destination.status,201);
  const created=await api('/api/monitors',{name:'synthetic-uptime-2',url:'https://runner-target.test/health',assignments:{'local-a':enrolled.data.runnerId},canaryUrl:'https://canary.runner-target.test/canary',intervalMs:5000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1});
  assert.equal(created.status,201);
  const id=created.data.id;
  async function visible(){
   const history=await api(`/api/monitors/${id}/history`),overview=await api(`/api/overview?monitor=${id}`);
   assert.equal(history.status,200);assert.equal(overview.status,200);
   return {history:history.data,monitor:overview.data.monitors.find(m=>m.id===id),alerts:overview.data.alerts};
  }
  async function runner(refused=false){
   child=runChild({origin,key,caPath:tls.caPath,targetPort,clock});
   try{if(refused)await assert.rejects(child.finish(),/Node runner failed/);else await child.finish()}catch(error){throw bridgeError??error}
   assert.equal(bridgeError,undefined);assert.equal(handler,undefined,'the actual runner submitted its completion');
   if(refused)assert.notEqual(child.child.exitCode,0,'the real runner observes the late refusal');
   child=undefined;
  }
  clock=Date.now()+1000;
  let original;
  handler=async envelope=>{
   const body=JSON.parse(envelope.body),slot=await db.prepare('SELECT * FROM slots WHERE id=?').bind(body.slotId).first();
   assert.equal(slot.status,'running');assert.equal(slot.manual,0);assert.ok(envelope.clock<slot.lease_until);
   assert.equal(envelope.headers['x-runner-id'],enrolled.data.runnerId);
   assert.equal(envelope.headers['x-runner-signature'],sign(envelope.body,envelope.headers['x-sent-at']));
   assert.equal(body.attempts.length,1);
   const first=body.attempts[0];assert.equal(first.outcome,'target_failure');assert.equal(first.status,503);assert.equal(first.canary.outcome,'pass');
   const accepted=await dispatch(envelope),answer=await accepted.clone().json();
   assert.equal(accepted.status,200);assert.equal(answer.accepted,true);assert.equal(answer.state.state,'Failing');
   const beforeVisible=await visible(),durable=await snapshot();
   assert.deepEqual(beforeVisible.history[0].observations,body.attempts);
   assert.deepEqual(beforeVisible.history[0].definition,created.data.definition);
   assert.equal(rows(durable,'outbox').filter(row=>row.monitor_id===id&&row.kind==='trigger').length,1);
   assert.equal(rows(durable,'notification_jobs').filter(row=>row.destination_id===destination.data.id).length,1,'preservation covers a real pending notification');
   const contradictory=structuredClone(body),copy=contradictory.attempts[0];
   copy.outcome='pass';copy.status=200;copy.checks=copy.checks.map(check=>({...check,pass:true,reason:'HTTP 200'}));delete copy.failureSnapshot;
   assert.deepEqual([copy.id,copy.probe,copy.attempt],[first.id,first.probe,first.attempt]);
   assert.notDeepEqual(copy,first,'the second copy contradicts the accepted failure');
   clock++;
   const text=JSON.stringify(contradictory),stamp=String(clock),headers={...envelope.headers,'x-sent-at':stamp,'x-runner-signature':sign(text,stamp)};
   assert.notEqual(headers['x-runner-signature'],envelope.headers['x-runner-signature']);
   const proof=await unchanged({...envelope,body:text,headers,clock},async response=>{
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{accepted:true,duplicate:true});
   });
   const afterVisible=await visible();
   assert.deepEqual(afterVisible.history,beforeVisible.history,'the first copy remains the complete public history');
   assert.equal(afterVisible.monitor.state.state,'Failing');assert.deepEqual(afterVisible.monitor.storedState,beforeVisible.monitor.storedState);
   assert.deepEqual(afterVisible.alerts,beforeVisible.alerts,'contradictory success cannot recover the original incident');
   original=beforeVisible.history[0];receipts.push({outcome:'contradictory copy',status:proof.response.status,tables:proof.tables});
   return accepted;
  };
  await runner();
  const next=await db.prepare('SELECT next_due FROM monitors WHERE id=?').bind(id).first();
  clock=Math.max(clock+1,next.next_due+1);mode=200;
  handler=async envelope=>{
   const body=JSON.parse(envelope.body),slot=await db.prepare('SELECT * FROM slots WHERE id=?').bind(body.slotId).first();
   assert.notEqual(slot.id,original.id);assert.equal(slot.status,'running');assert.equal(slot.manual,0);
   assert.equal((await db.prepare('SELECT COUNT(*) n FROM observations WHERE slot_id=?').bind(slot.id).first()).n,0);
   assert.ok(envelope.clock<slot.lease_until,'the real runner completed before its deadline');
   for(const attempt of body.attempts){assert.equal(attempt.status,200);assert.equal(attempt.outcome,'pass');assert.ok(attempt.completedAt<=slot.lease_until)}
   clock=slot.lease_until+1;
   const beforeVisible=await visible();
   assert.equal(beforeVisible.monitor.state.state,'Unknown','expired coverage is not a recovery');
   assert.equal(beforeVisible.monitor.storedState.state,'Failing','the original committed failure remains stored');
   assert.ok(clock-Number(envelope.headers['x-sent-at'])<=60000,'the original real signature remains fresh after the acceptance deadline');
   assert.equal(envelope.headers['x-runner-signature'],sign(envelope.body,envelope.headers['x-sent-at']));
   const late={...envelope,clock},staleAt=String(clock-61001);
   const stale=await unchanged({...late,headers:{...late.headers,'x-sent-at':staleAt,'x-runner-signature':sign(late.body,staleAt)}},async response=>{
    assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Invalid signed result'});
   });
   const proof=await unchanged(late,async response=>{
    assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'Invalid or expired acceptance window'});
   });
   const afterVisible=await visible();
   assert.deepEqual(afterVisible.history,beforeVisible.history,'late signed evidence cannot populate or rewrite history');
   assert.deepEqual(afterVisible.history.find(row=>row.id===original.id),original);
   assert.deepEqual(afterVisible.monitor.state,beforeVisible.monitor.state);assert.deepEqual(afterVisible.monitor.storedState,beforeVisible.monitor.storedState);
   assert.deepEqual(afterVisible.alerts,beforeVisible.alerts,'a late passing observation cannot recover the incident');
   receipts.push({outcome:'late real completion',status:proof.response.status,staleSignatureStatus:stale.response.status,tables:proof.tables});
   return proof.response;
  };
  await runner(true);
  assert.deepEqual(targetRequests.map(row=>[row.path,row.status]),[['/canary',200],['/health',503],['/canary',200],['/health',200]],'both envelopes came from actual verified HTTPS checks');
  assert.ok(targetRequests.every(row=>row.host===row.sni));
  console.log('EVIDENCE-001 integrity PASS '+JSON.stringify(receipts));
 }finally{
  await child?.stop();await close(control);await worker?.dispose();await close(target);await rm(directory,{recursive:true,force:true});
 }
}
