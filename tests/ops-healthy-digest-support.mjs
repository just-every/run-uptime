import assert from 'node:assert/strict';
import https from 'node:https';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve,relative,dirname,parse} from 'node:path';
import {tmpdir} from 'node:os';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';
import {certificate,runChild,listen,close,request} from './signed-runner-runtime.mjs';

const week=604800000;
const protectedTables=['monitors','revisions','slots','observations','runner_assignments','runner_contact','outbox','notification_jobs','incident_work'];

// An independent installation drives the emitted scheduled entry. Only its
// clock envelope and certificate-checked network and mail edges are controlled.
async function installation(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-ops-digest-'));
 let worker,db,target,control,child,origin,cookie='',pending,observed,bridgeError;
 // Place the isolated clock safely inside a future window, so SQLite
 // wall-clock authority guards remain valid without replacing database time.
 let clock=Math.ceil(Date.now()/week)*week+86400000;
 let targetStatus=200,interrupt=false;
 const traffic=[],results=[],mail=[];
 const key='synthetic-uptime-174-runner';
 async function dispose(){
  await child?.stop();await close(control);await worker?.dispose();await pending;
  await close(target);await rm(directory,{recursive:true,force:true});
 }
 try{
  const tls=await certificate(directory);
  target=https.createServer(tls,(req,res)=>{
   traffic.push({host:req.headers.host,path:req.url,method:req.method});
   res.writeHead(req.url==='/canary'?200:targetStatus,{'content-type':'text/plain'});
   res.end('synthetic-uptime-174');
  });
  const targetPort=await listen(target);
  control=https.createServer(tls,async(req,res)=>{
   try{
    let body='';for await(const chunk of req)body+=chunk;
    if(req.url==='/api/runner/results')clock+=1000;
    const response=await envelope({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{})});
    const bytes=Buffer.from(await response.arrayBuffer());
    if(req.url==='/api/runner/results')results.push({status:response.status,answer:JSON.parse(bytes)});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);
   }catch(error){bridgeError=error;res.writeHead(500);res.end('Digest proof transport failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key,
   MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-174-mail'};
  assert.equal(bindings.UPTIME_HEARTBEAT_URL,undefined,'the optional independent heartbeat is unconfigured');
  const emitted=resolve('dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
  const wrapper=join(directory,'digest-envelope.mjs');
  await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};
   const wallNow=Date.now;let clock;Date.now=()=>clock??wallNow();
   export default {async fetch(request,env,ctx){const input=await request.json();clock=input.clock;
    if(input.scheduled){await app.scheduled({scheduledTime:clock},env,ctx);return new Response(null,{status:204})}
    return app.fetch(new Request(input.url,{method:input.method,headers:input.headers,...(input.body===undefined?{}:{body:input.body})}),env,ctx)
   }};`);
  const outboundService=async request=>{
   assert.equal(new URL(request.url).origin,'https://api.sendgrid.com','no external heartbeat or Worker target request');
   assert.equal(new URL(request.url).pathname,'/v3/mail/send');assert.equal(request.method,'POST');
   const message=await request.json();
   // MFA's genuine enrollment has a separate security notice, never a digest.
   if(message.subject==='Uptime second-factor security change')return new Response(null,{status:202});
   const jobId=message.custom_args.rer_delivery_id;
   const attempts=(await db.prepare("SELECT * FROM auxiliary_attempts WHERE scope='watch' AND job_id=? ORDER BY rowid").bind(jobId).all()).results;
   assert.equal(attempts.length,1,'provider observes one durable attempt before responding');
   const attempt=attempts[0];
   assert.equal(attempt.outcome,'sending');assert.equal(attempt.submitted_at,clock);assert.equal(attempt.finished_at,null);
   const edge={jobId,subject:message.subject,attempt:structuredClone(attempt),accepted:!interrupt};mail.push(edge);
   if(interrupt){observed?.();return new Promise(()=>{})}
   return new Response(null,{status:202,headers:{'x-message-id':'synthetic-uptime-174-accepted'}});
  };
  const start=async()=>{
   worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,
    modules:[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))],
    modulesRoot:parse(emitted).root,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
    host:'127.0.0.1',port:0,assets:{directory:resolve(emitted,config.assets.directory),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true},
    d1Databases:{DB:'ops-healthy-digest'},resourcePersistencePath:join(directory,'state'),bindings,outboundService,
    unsafeLocalExplorer:false,unsafeObservability:false,
   }));
   await worker.ready;db=await worker.getD1Database('DB');
  };
  const envelope=input=>worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({...input,clock})});
  await start();
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort()){
   for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  }
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.174',...headers}});
  const owner=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Digest custody owner'});
  assert.equal(owner.status,303,bridgeError?.stack??JSON.stringify(owner.data));cookie=owner.headers['set-cookie'][0].split(';')[0];
  await completeApiSecondFactor(origin,cookie,api,clock);
  const read=async path=>{const response=await api(path);assert.equal(response.status,200);return response.data};
  const run=async()=>{child=runChild({origin,key,caPath:tls.caPath,targetPort,clock});await child.finish();child=undefined};
  // Idle enrollment and authenticated claim are native, not planted contact.
  await run();
  const runners=(await read('/api/runners')).filter(row=>!row.hosted);assert.equal(runners.length,1);
  const runnerId=runners[0].runnerId;assert.equal(runners[0].revokedAt,null);assert.equal(traffic.length,0);
  let id;
  const create=async(enabled=true)=>{
   const response=await api('/api/monitors',{name:'synthetic-uptime-174-monitor',url:'https://runner-target.test/health',
    canaryUrl:'https://canary.runner-target.test/canary',probes:['local-a'],assignments:{'local-a':runnerId},
    enabled,intervalMs:600000,freshnessMs:300000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1});
   assert.equal(response.status,201);id=response.data.id;return id;
  };
  const view=()=>read('/api/overview');
  const history=()=>read(`/api/monitors/${id}/history`);
  const rows=async()=>Object.fromEntries(await Promise.all(protectedTables.map(async table=>[table,(await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
  const custody=async()=>({attempts:(await db.prepare("SELECT * FROM auxiliary_attempts WHERE scope='watch' ORDER BY rowid").all()).results,
   progress:(await db.prepare("SELECT * FROM monitoring_watch WHERE id LIKE 'healthy-digest:%' OR id LIKE 'runner-stale:%' OR id='external-heartbeat' ORDER BY id").all()).results});
  const schedule=async()=>{const response=await envelope({scheduled:true});assert.equal(response.status,204,await response.text())};
  const restart=async()=>{await worker.dispose();worker=undefined;await pending;pending=undefined;interrupt=false;await start()};
  const countTraffic=checks=>{
   assert.equal(traffic.filter(row=>row.host==='runner-target.test'&&row.path==='/health'&&row.method==='GET').length,checks);
   assert.equal(traffic.filter(row=>row.host==='canary.runner-target.test'&&row.path==='/canary'&&row.method==='GET').length,checks);
   assert.equal(traffic.length,checks*2,'only genuine signed-runner checks touch the target and canary');
  };
  const establish=async({enabled=true,passing=true}={})=>{
   await create(enabled);
   if(enabled){targetStatus=passing?200:503;clock+=1000;await run();assert.equal(results.length,1);assert.equal(results[0].status,200);assert.equal(results[0].answer.accepted,true);countTraffic(1)}
   const overview=await view(),monitor=overview.monitors.find(row=>row.id===id),savedHistory=await history();
   if(enabled){
    assert.equal(overview.runner.contact.state,'Fresh contact');
    assert.equal(monitor.state.state,passing?'Healthy':'Failing');assert.equal(monitor.state.coverageState,'Complete');
    assert.equal(savedHistory.length,1);assert.equal(savedHistory[0].manual,0);assert.equal(savedHistory[0].status,'complete');
    assert.equal(savedHistory[0].observations[0].outcome,passing?'pass':'target_failure');
    assert.equal(savedHistory[0].observations[0].canary.outcome,'pass');
    assert.equal(monitor.state.regions[0].observationId,savedHistory[0].observations[0].id);
   }
   return {overview,monitor,history:savedHistory};
  };
  const preserve=async operation=>{
   const before={rows:await rows(),history:id?await history():null,alerts:(await view()).alerts,traffic:structuredClone(traffic)};
   await operation();
   assert.deepEqual(await rows(),before.rows,'digest schedules and restart preserve evidence, scheduling and incident records');
   if(id)assert.deepEqual(await history(),before.history,'watch work cannot create or rewrite signed target evidence');
   assert.deepEqual((await view()).alerts,before.alerts,'watch work neither opens nor resolves an incident');
   assert.deepEqual(traffic,before.traffic,'watch work never performs a replacement target check');
  };
  return {create,establish,view,history,custody,schedule,restart,preserve,countTraffic,mail,
   get clock(){return clock},set clock(value){clock=value},
   async interruptSchedule(){
    interrupt=true;
    const boundary=new Promise(resolve=>observed=resolve);
    pending=schedule().catch(()=>null);
    let timer;try{await Promise.race([boundary,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Digest provider boundary not reached')),10000))])}finally{clearTimeout(timer)}
   },
   close:dispose};
 }catch(error){await dispose();throw error}
}

export async function proveHealthyDigestCustody(){
 // Acceptance and repeated schedules in the same window survive persistence.
 {
  const f=await installation();
  try{
   const original=await f.establish();assert.deepEqual(original.overview.alerts,[]);
   await f.preserve(async()=>{
    await f.schedule();assert.equal(f.mail.length,1);
    const edge=f.mail[0],retained=await f.custody();
    assert.equal(edge.subject,'Uptime: all healthy');assert.equal(edge.accepted,true);
    assert.equal(edge.jobId,`healthy-digest:${Math.floor(f.clock/week)}`);
    assert.equal(retained.attempts.length,1);assert.equal(retained.attempts[0].id,edge.attempt.id);
    assert.equal(retained.attempts[0].job_id,edge.jobId);assert.equal(retained.attempts[0].outcome,'accepted');
    assert.ok(retained.attempts[0].submitted_at!==null&&retained.attempts[0].finished_at!==null);
    assert.deepEqual(retained.progress,[{id:edge.jobId,at:edge.attempt.started_at,outcome:'accepted'}]);
    await f.schedule();await f.schedule();
    f.clock=retained.attempts[0].lease_until+1;
    assert.equal(Math.floor(f.clock/week),Math.floor(edge.attempt.started_at/week));
    await f.restart();
    const current=await f.view();assert.equal(current.runner.contact.state,'Fresh contact');
    assert.equal(current.monitors[0].state.state,'Healthy');
    await f.schedule();await f.schedule();
    assert.equal(f.mail.length,1,'accepted digest never repeats in the same window after restart');
    assert.deepEqual(await f.custody(),retained,'accepted window and original attempt identity survive');
   });
   f.countTraffic(1);
   console.log('PROBE OPS-001 healthy-digest-accepted: signed scheduled Healthy evidence and Fresh contact -> one accepted provider digest with durable window and attempt, no duplicate across repeated schedules and persistent restart; unchanged history, incidents and target traffic');
  }finally{await f.close()}
 }
 // The independent lease, contact deadline and evidence deadline are saved
 // before interruption; recovery crosses only the lease, within this window.
 {
  const f=await installation();
  try{
   const original=await f.establish();
   const contactDeadline=original.overview.runner.contact.lastContactAt+original.overview.runner.contact.freshnessMs;
   const observation=original.history[0].observations[0];
   const healthDeadline=Math.min(observation.completedAt,observation.canary.completedAt)+original.monitor.definition.freshnessMs;
   await f.preserve(async()=>{
    await f.interruptSchedule();assert.equal(f.mail.length,1);
    const before=await f.custody(),attempt=before.attempts[0],edge=f.mail[0];
    assert.equal(attempt.id,edge.attempt.id);assert.equal(edge.accepted,false);
    assert.equal(edge.subject,'Uptime: all healthy');assert.equal(attempt.outcome,'sending');
    assert.equal(attempt.finished_at,null);assert.ok(attempt.submitted_at!==null);
    const resumedAt=attempt.lease_until+1;
    assert.ok(resumedAt<contactDeadline&&resumedAt<healthDeadline,'lease recovery precedes both independently saved freshness deadlines');
    assert.equal(Math.floor(resumedAt/week),Math.floor(attempt.started_at/week));
    f.clock=resumedAt;await f.restart();
    const current=await f.view();assert.equal(current.runner.contact.state,'Fresh contact');
    assert.equal(current.monitors[0].state.state,'Healthy');assert.equal(current.monitors[0].state.coverageState,'Complete');
    await f.schedule();await f.schedule();
    const retained=await f.custody();assert.equal(retained.attempts.length,1);
    assert.deepEqual(retained.attempts[0],{...attempt,finished_at:resumedAt,outcome:'uncertain',code:'lease_expired_submitted'});
    assert.deepEqual(retained.progress,[{id:attempt.job_id,at:attempt.started_at,outcome:'uncertain'}]);
    await f.restart();await f.schedule();assert.deepEqual(await f.custody(),retained);
    assert.equal(f.mail.length,1,'uncertain submitted digest never replays while it would otherwise be eligible');
   });
   f.countTraffic(1);
   console.log('PROBE OPS-001 healthy-digest-interrupted: stop Worker after provider observation before acceptance, restart past saved lease within same window and fresh contact and health -> original attempt uncertain without replay, unchanged target evidence and incidents');
  }finally{await f.close()}
 }
 // Each refusal starts with its own migrated installation and untouched window.
 for(const kind of ['empty','paused','stale-contact','unknown','nonpassing']){
  const f=await installation();
  try{
   if(kind==='paused')await f.establish({enabled:false});
   if(kind==='unknown')await f.create();
   if(kind==='stale-contact'){
    const original=await f.establish();
    f.clock=original.overview.runner.contact.lastContactAt+original.overview.runner.contact.freshnessMs+1;
    const current=await f.view();assert.equal(current.runner.contact.state,'Stale contact');assert.equal(current.monitors[0].state.state,'Healthy');
   }
   if(kind==='nonpassing')await f.establish({passing:false});
   const current=await f.view();
   if(kind==='empty')assert.equal(current.monitors.length,0);
   if(kind==='paused')assert.equal(current.monitors[0].definition.enabled,false);
   if(kind==='unknown'){
    assert.equal(current.runner.contact.state,'Fresh contact');assert.equal(current.monitors[0].state.state,'Unknown');
    assert.equal(current.monitors[0].state.coverageState,'Incomplete');assert.deepEqual(await f.history(),[]);
   }
   if(kind==='nonpassing')assert.ok(current.alerts.length>0,'the failing installation starts with a real incident');
   assert.deepEqual(await f.custody(),{attempts:[],progress:[]},'no digest or prior attempt can suppress this negative case');
   await f.preserve(async()=>{
    await f.schedule();await f.schedule();await f.restart();await f.schedule();
    assert.equal(f.mail.filter(edge=>edge.jobId.startsWith('healthy-digest:')).length,0,`${kind} cannot emit a healthy digest`);
    const retained=await f.custody();assert.equal(retained.attempts.filter(row=>row.job_id.startsWith('healthy-digest:')).length,0);
    if(kind==='stale-contact'){
     assert.equal(f.mail.length,1,'a legitimate stale-contact notice remains distinct from a healthy digest');
     assert.equal(f.mail[0].subject,'Uptime runner contact is stale');assert.match(f.mail[0].jobId,/^runner-stale:/);
     assert.equal(retained.attempts.length,1);assert.equal(retained.attempts[0].outcome,'accepted');
    }else{assert.deepEqual(f.mail,[]);assert.deepEqual(retained,{attempts:[],progress:[]})}
   });
   f.countTraffic(['stale-contact','nonpassing'].includes(kind)?1:0);
   console.log(`PROBE OPS-001 healthy-digest-${kind}: independent untouched installation and window -> no healthy digest or digest attempt across schedules and restart; ${kind==='stale-contact'?'one legitimate stale-contact notice; ':''}unchanged history, incidents and target traffic`);
  }finally{await f.close()}
 }
}
