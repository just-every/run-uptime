import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import https from 'node:https';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve,relative,dirname,parse} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';
import {certificate,runChild,listen,close,request} from './signed-runner-runtime.mjs';

// The production assets are mounted as well, so /health exercises successful
// installation readiness. This private envelope clock never changes the shared runtime.
async function contactWorker(directory,bindings){
 const emitted=resolve('./dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
 const wrapper=join(directory,'contact-envelope.mjs');
 await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};
 const wallNow=Date.now;let clock;Date.now=()=>clock??wallNow();
 export default {async fetch(request,env,ctx){const input=await request.json();clock=input.clock;return app.fetch(new Request(input.url,{method:input.method,headers:input.headers,...(input.body===undefined?{}:{body:input.body})}),env,ctx)}};`);
 const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))];
 const worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,host:'127.0.0.1',port:0,assets:{directory:resolve('./dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true},d1Databases:{DB:'runner-contact'},resourcePersistencePath:join(directory,'state'),bindings,outboundService:async request=>{if(new URL(request.url).hostname==='api.sendgrid.com'&&(await request.json()).subject==='Uptime second-factor security change')return new Response(null,{status:202});throw Error('Unexpected network request in runner contact journey')},unsafeLocalExplorer:false,unsafeObservability:false}));
 try{await worker.ready;return worker}catch(error){await worker.dispose();throw error}
}

// An independent migrated installation and envelope clock keep this journey out
// of the live heartbeat journey. Only the authorized HTTPS and DNS edges are local.
export async function proveRunnerContact(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-runner-contact-'));
 const key='synthetic-uptime-35-runner-contact';
 let worker,db,control,target,child,origin,cookie='',clock=Date.now(),resultReceipt;
 const advance=milliseconds=>{clock+=milliseconds};
 const dispatch=envelope=>worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify(envelope)});
 const stored=async()=>({
  contact:(await db.prepare('SELECT * FROM runner_contact ORDER BY id').all()).results,
  runners:(await db.prepare('SELECT runner_id,last_contact_at FROM runners ORDER BY runner_id').all()).results,
 });
 try{
  const tls=await certificate(directory);
  target=https.createServer(tls,(req,res)=>{res.writeHead(req.url==='/canary'?200:503,{'content-type':'text/plain'});res.end('synthetic-uptime-35')});
  const targetPort=await listen(target);
  control=https.createServer(tls,async(req,res)=>{
   try{
    let body='';for await(const chunk of req)body+=chunk;
    const envelope={url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{}),clock};
    const completion=req.url==='/api/runner/results'&&child;
    let before;
    if(completion){before=await stored();advance(1000);envelope.clock=clock}
    const response=await dispatch(envelope);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(completion)resultReceipt={before,after:await stored(),at:clock,status:response.status,data:JSON.parse(bytes)};
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);
   }catch{res.writeHead(500);res.end('Runner contact transport failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-35',UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key};
  worker=await contactWorker(directory,bindings);db=await worker.getD1Database('DB');
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.35',...headers}});
  const verifyOwner=()=>completeSecondFactor(origin,cookie,async(url,init)=>{
   const response=await api(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),init.headers,init.method);
   return new Response(JSON.stringify(response.data),{status:response.status});
  },clock);
  const signed=(path,body,extra={})=>{const stamp=String(clock);return {'x-runner-key':key,'x-sent-at':stamp,'x-runner-signature':createHmac('sha256',key).update(`${stamp}.${path==='/api/runner/enroll'?'runner-enrolment.':''}${JSON.stringify(body)}`).digest('hex'),...extra}};
  const overview=async()=>{const response=await api('/api/overview');assert.equal(response.status,200);assert.equal(response.data.now,clock);return response.data};
  const runners=async()=>{const response=await api('/api/runners');assert.equal(response.status,200);return response.data};
  const history=async id=>{const response=await api(`/api/monitors/${id}/history`);assert.equal(response.status,200);return response.data};
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Contact journey owner'});
  assert.equal(boot.status,303);cookie=boot.headers['set-cookie'][0].split(';')[0];
  await verifyOwner();
  const enrollment={version:1},enrolled=await api('/api/runner/enroll',enrollment,signed('/api/runner/enroll',enrollment));
  assert.equal(enrolled.status,200);const runnerId=enrolled.data.runnerId;
  const runnerHeaders={'x-runner-key':key,'x-runner-id':runnerId};

  // Never seen survives owner reads and enrollment; neither establishes health.
  let view=await overview();
  assert.equal(view.runner.contact.state,'Never seen');assert.equal(view.runner.contact.lastContactAt,null);
  assert.equal((await runners()).find(row=>row.runnerId===runnerId).lastContactAt,null);
  assert.deepEqual((await stored()).contact,[]);

  // An accepted idle claim records the server receipt clock without a probe.
  advance(1000);
  const idle=await api('/api/runner/claim',{},runnerHeaders);
  assert.equal(idle.status,200);assert.equal(idle.data.task,null);assert.equal(idle.data.now,clock);
  const idleAt=clock;
  view=await overview();assert.equal(view.runner.contact.state,'Fresh contact');assert.equal(view.runner.contact.lastContactAt,idleAt);
  assert.deepEqual((await stored()).contact,[{id:1,last_contact_at:idleAt}]);
  assert.equal((await runners()).find(row=>row.runnerId===runnerId).lastContactAt,idleAt);
  advance(500);
  const stillIdle=await api('/api/runner/claim',{},runnerHeaders);
  assert.equal(stillIdle.status,200);assert.equal(stillIdle.data.task,null);assert.equal(stillIdle.data.now,clock);
  assert.deepEqual((await stored()).contact,[{id:1,last_contact_at:idleAt+500}],'another idle receipt refreshes an existing contact');
  assert.equal((await runners()).find(row=>row.runnerId===runnerId).lastContactAt,idleAt+500);

  const remote=await api('/api/runners',{networkLabel:'synthetic-uptime-35-uncontacted'});assert.equal(remote.status,201);
  const definition={url:'https://runner-target.test/health',network:'public',canaryUrl:'https://canary.runner-target.test/canary',intervalMs:5000,freshnessMs:180000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1};
  const failed=await api('/api/monitors',{...definition,name:'synthetic-uptime-35-failing',assignments:{'local-a':runnerId}});
  const unseen=await api('/api/monitors',{...definition,name:'synthetic-uptime-35-unknown',assignments:{'local-a':remote.data.runnerId}});
  assert.equal(failed.status,201);assert.equal(unseen.status,201);

  // The real production runner signs a failing target result with a passing
  // canary. Its receipt advances independently of the earlier claim clock.
  advance(1000);
  child=runChild({origin,key,caPath:tls.caPath,targetPort,clock});await child.finish();child=undefined;
  assert.ok(resultReceipt,'real Node runner reached the result door');
  assert.equal(resultReceipt.status,200);assert.equal(resultReceipt.data.accepted,true);
  assert.equal(resultReceipt.before.contact[0].last_contact_at,resultReceipt.at-1000);
  assert.deepEqual(resultReceipt.after.contact,[{id:1,last_contact_at:resultReceipt.at}]);
  assert.equal(resultReceipt.after.runners.find(row=>row.runner_id===runnerId).last_contact_at,resultReceipt.at);
  const resultAt=resultReceipt.at;
  const evidence=await history(failed.data.id),missing=await history(unseen.data.id);
  assert.equal(evidence.length,1);assert.equal(evidence[0].manual,0);assert.equal(evidence[0].status,'complete');
  assert.equal(evidence[0].observations.length,1);assert.equal(evidence[0].observations[0].status,503);
  assert.equal(evidence[0].observations[0].outcome,'target_failure');assert.equal(evidence[0].observations[0].canary.outcome,'pass');
  assert.equal(missing.length,0);
  const checkTargets=async expectedFailure=>{
   const current=await overview(),failure=current.monitors.find(row=>row.id===failed.data.id),unknown=current.monitors.find(row=>row.id===unseen.data.id);
   assert.equal(failure.state.targetState,expectedFailure);assert.equal(failure.state.denominator,1);assert.equal(failure.state.regions.length,1);
   assert.equal(unknown.state.targetState,'Unknown');assert.equal(unknown.state.coverageState,'Incomplete');assert.equal(unknown.state.denominator,1);assert.equal(unknown.state.unknown,1);
   assert.equal(unknown.state.regions[0].state,'Unknown');
   assert.equal(current.runner.contact.lastContactAt,resultAt);
   assert.deepEqual(await history(failed.data.id),evidence);assert.deepEqual(await history(unseen.data.id),missing);
   return current;
  };
  view=await checkTargets('Failing');assert.equal(view.runner.contact.state,'Fresh contact');
  assert.equal(view.alerts.filter(row=>row.monitor_id===failed.data.id&&row.kind==='trigger').length,1);
  assert.equal(view.alerts.filter(row=>row.kind==='recovery').length,0);

  // Owner reads, public health, foreign identities, invalid signatures and
  // revoked authority preserve both contact rows and target evidence.
  const revoked=await api('/api/runners',{networkLabel:'synthetic-uptime-35-revoked'});assert.equal(revoked.status,201);
  assert.equal((await api(`/api/runners/${revoked.data.runnerId}`,undefined,{},'DELETE')).status,200);
  const beforeRefusals=await stored();advance(1000);
  assert.equal((await api('/api/runner/claim',{}, {...runnerHeaders,'x-runner-id':`self-${randomUUID()}`})).status,401);
  assert.equal((await api('/api/runner/claim',{}, {...runnerHeaders,'x-runner-key':'synthetic-uptime-35-invalid'})).status,401);
  assert.equal((await api('/api/runner/claim',{}, {'x-runner-id':revoked.data.runnerId,'x-runner-key':revoked.data.key})).status,401);
  assert.equal((await api('/api/runner/results',{}, {...signed('/api/runner/results',{}),'x-runner-signature':'0'.repeat(64)})).status,403);
  await runners();await checkTargets('Failing');
  const health=await api('/health',undefined,{cookie:''});
  assert.equal(health.status,200,'real emitted assets and migrated storage establish installation readiness');
  assert.equal(health.data.status,'ok');
  assert.ok(!Object.hasOwn(health.data,'runner')&&!Object.hasOwn(health.data,'monitors'));
  assert.deepEqual(await stored(),beforeRefusals,'reads and rejected requests cannot refresh contact');

  // No waiting on a wall clock: read both sides and the exact inclusive bound.
  advance(resultAt+119999-clock);view=await checkTargets('Failing');assert.equal(view.runner.contact.state,'Fresh contact');
  advance(1);view=await checkTargets('Failing');assert.equal(view.runner.contact.state,'Fresh contact');
  advance(1);view=await checkTargets('Failing');assert.equal(view.runner.contact.state,'Stale contact');
  assert.deepEqual(await stored(),beforeRefusals);

  // Same durable storage, new Worker, same contact and immutable failing history.
  await worker.dispose();worker=await contactWorker(directory,bindings);db=await worker.getD1Database('DB');
  assert.deepEqual(await stored(),beforeRefusals);
  view=await checkTargets('Failing');assert.equal(view.runner.contact.state,'Stale contact');
  assert.equal((await runners()).find(row=>row.runnerId===runnerId).lastContactAt,resultAt);

  // A real unavailable contact table makes the overview fail. The error carries
  // no invented contact or healthy monitor; restoring storage restores the facts.
  await db.prepare('ALTER TABLE runner_contact RENAME TO synthetic_contact_unavailable').run();
  try{
   const unavailable=await api('/api/overview');assert.equal(unavailable.status,503);
   assert.equal(unavailable.data.code,'storage_unavailable');
   assert.ok(!Object.hasOwn(unavailable.data,'runner')&&!Object.hasOwn(unavailable.data,'monitors'));
   assert.ok(!JSON.stringify(unavailable.data).includes('Healthy'));
  }finally{await db.prepare('ALTER TABLE synthetic_contact_unavailable RENAME TO runner_contact').run()}
  assert.deepEqual(await stored(),beforeRefusals);
  await checkTargets('Failing');
  // A new accepted claim can be Fresh while unchanged old target evidence
  // has expired. The configured denominator and genuine failure remain retained.
  advance(60000);
  const refreshed=await api('/api/runner/claim',{}, {'x-runner-key':remote.data.key,'x-runner-id':remote.data.runnerId});
  assert.equal(refreshed.status,200);
  view=await overview();assert.equal(view.runner.contact.state,'Fresh contact');assert.equal(view.runner.contact.lastContactAt,clock);
  const aged=view.monitors.find(row=>row.id===failed.data.id);
  assert.equal(aged.state.targetState,'Unknown');assert.equal(aged.state.coverageState,'Incomplete');assert.equal(aged.state.denominator,1);
  assert.equal(aged.state.regions[0].observationId,evidence[0].observations[0].id);
  assert.deepEqual(await history(failed.data.id),evidence);
  assert.equal(view.alerts.filter(row=>row.kind==='recovery').length,0);

  // The real export omits local contact and runner authority. A separately
  // migrated receiving installation restores historical evidence inactive;
  // neither the imported failure nor source authority establishes current health.
  const exported=await api('/api/archive');assert.equal(exported.status,200);
  assert.ok(!Object.hasOwn(exported.data.payload.tables,'runner_contact'));
  assert.ok(!Object.hasOwn(exported.data.payload.productTables,'runner_contact'));
  const receivingDirectory=join(directory,'receiving');await mkdir(receivingDirectory);
  await worker.dispose();
  const receivingBindings={...bindings,UPTIME_RUNNER_KEY:'synthetic-uptime-35-receiving-runner'};
  worker=await contactWorker(receivingDirectory,receivingBindings);db=await worker.getD1Database('DB');cookie='';
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const receivingOwner=await api('/auth/bootstrap',{token:receivingBindings.SETUP_TOKEN,displayName:'Receiving contact owner'});
  assert.equal(receivingOwner.status,303);cookie=receivingOwner.headers['set-cookie'][0].split(';')[0];
  await verifyOwner();
  const restored=await api('/api/restore',exported.data);assert.equal(restored.status,200);
  view=await overview();assert.equal(view.runner.contact.state,'Never seen');assert.equal(view.runner.contact.lastContactAt,null);
  assert.equal(view.monitors.length,2);
  for(const monitor of view.monitors){assert.equal(monitor.definition.enabled,false);assert.equal(monitor.state.state,'Paused');assert.equal(monitor.state.targetState,'Unknown');assert.equal(monitor.state.denominator,1)}
  assert.deepEqual((await stored()).contact,[]);
  const restoredHistory=await history(failed.data.id);
  assert.ok(restoredHistory.some(slot=>slot.observations.some(observation=>observation.id===evidence[0].observations[0].id&&observation.status===503&&observation.outcome==='target_failure')));
  assert.ok(view.alerts.length>0);assert.ok(view.alerts.every(alert=>alert.status==='imported-inactive'));
  const beforeSourceRequest=await stored();
  assert.equal((await api('/api/runner/claim',{},runnerHeaders)).status,401);
  assert.deepEqual(await stored(),beforeSourceRequest,'source runner authority cannot revive restored contact');
  console.log('PRESENCE-001 runner contact: idle and signed-result server receipts, 120-second boundary, refusal and read invariance, persistent restart, unavailable read, independent failing or Unknown targets and inactive restore passed');
 }finally{await child?.stop();await close(control);await worker?.dispose();await close(target);await rm(directory,{recursive:true,force:true})}
}
