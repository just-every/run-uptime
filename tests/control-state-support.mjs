import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve,relative,dirname,parse} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';
import {certificate,listen,close,request} from './signed-runner-runtime.mjs';

// Keep this journey's clocks, D1 and runner identities separate from the cadence journey.
// Only the controlled HTTPS edge and the test envelope supply network and time.
export async function proveStateHysteresis() {
 const directory=await mkdtemp(join(tmpdir(),'uptime-state-'));
 const children=new Set(),requests=[],completions=[];
 let worker,control,target,origin,cookie='',clock,bridgeError,mode=200;
 try {
  const tls=await certificate(directory);
  target=https.createServer(tls,(req,res)=>{
   requests.push({path:req.url,status:mode});
   res.writeHead(mode,{'content-type':'text/plain'});res.end('synthetic-uptime-1');
  });
  const targetPort=await listen(target);
  control=https.createServer(tls,async(req,res)=>{
   try {
    let body='';for await(const chunk of req)body+=chunk;
    const response=await worker.dispatchFetch('http://localhost/',{
     method:'POST',redirect:'manual',headers:{'content-type':'application/json'},
     body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,
      ...(body?{body}:{}),...(clock===undefined?{}:{clock})}),
    });
    if(req.url==='/api/runner/results')completions.push({
     slotId:JSON.parse(body).slotId,runnerId:req.headers['x-runner-id'],status:response.status,
     signed:typeof req.headers['x-runner-signature']==='string',
    });
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
   } catch(error) {bridgeError=error;res.writeHead(500);res.end('Emitted Worker request failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-2',
   UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:'synthetic-uptime-3-installation-runner-key'};
  worker=await stateWorker(directory,bindings);
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort()) {
   const response=await worker.dispatchFetch('http://localhost/',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({migration:splitSql(await readFile(join('migrations',file),'utf8'))})});
   assert.equal(response.status,200,`Migration ${file} completes against real D1`);
  }
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{
   method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers},
  });
  const good=async(path,body,status=200,method)=>{
   const response=await api(path,body,{},method);
   assert.equal(response.status,status,`${path}: ${JSON.stringify(response.data)}`);return response.data;
  };
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'State journey owner'});
  assert.equal(boot.status,303);cookie=boot.headers['set-cookie'][0].split(';')[0];
  await completeApiSecondFactor(origin,cookie,api);
  clock=Date.now();
  const locations=[];
  for(const networkLabel of ['synthetic-uptime-4','synthetic-uptime-5'])
   locations.push(await good('/api/runners',{networkLabel},201));
  assert.notEqual(locations[0].runnerId,locations[1].runnerId);
  const created=await good('/api/monitors',{
   name:'synthetic-uptime-6',url:'https://runner-target.test/health',network:'public',
   probes:['local-a','local-b'],assignments:{'local-a':locations[0].runnerId,'local-b':locations[1].runnerId},
   intervalMs:10000,timeoutMs:2000,retries:0,confirmSlots:2,recoverSlots:2,freshnessMs:60000,
  },201);
  const id=created.id,history=()=>good(`/api/monitors/${id}/history`);
  const overview=()=>good(`/api/overview?monitor=${id}`);
  const monitor=async()=>(await overview()).monitors[0];
  const incidents=()=>good(`/api/monitors/${id}/incidents`);
  const run=async(index,status,idle=false)=>{
   mode=status;
   const before=requests.length,location=locations[index];
   const child=spawn(process.execPath,['--import',resolve('tests/signed-runner-routing.mjs'),'--input-type=module','--eval',
    `import {runRunner} from './runners/src/private-runner.mjs';
     await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,
      runnerId:process.env.UPTIME_RUNNER_ID,grantPath:process.env.STATE_GRANT_PATH,once:true});`],{
    env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:location.key,UPTIME_RUNNER_ID:location.runnerId,
     STATE_GRANT_PATH:join(directory,'grant.json'),NODE_EXTRA_CA_CERTS:tls.caPath,
     SIGNED_RUNNER_TARGET_PORT:String(targetPort),SIGNED_RUNNER_CLOCK:String(clock)},
    stdio:['ignore','pipe','pipe'],
   });
   children.add(child);let diagnosticBytes=0;
   child.stdout.on('data',chunk=>diagnosticBytes+=chunk.length);
   child.stderr.on('data',chunk=>diagnosticBytes+=chunk.length);
   const timer=setTimeout(()=>child.kill('SIGKILL'),35000);
   try {const [code]=await once(child,'exit');if(bridgeError)throw bridgeError;
    assert.equal(code,0,`Signed state runner failed (${diagnosticBytes} private diagnostic bytes)`);
   } finally {clearTimeout(timer);children.delete(child)}
   assert.deepEqual(requests.slice(before),idle?[]:[{path:'/health',status}], 'the assigned runner executes only a genuinely due target request');
  };
  const next=async()=>{clock=Math.max(clock+1,(await monitor()).nextDue)};
  const both=async status=>{await run(0,status);await run(1,status)};
  const coverage=async(state,regions)=>{
   const current=await monitor();
   assert.equal(current.state.state,state);
   assert.equal(current.state.targetState,state);
   assert.equal(current.state.denominator,2);
   assert.deepEqual(current.definition,created.definition,'the saved policy and fixed assignments remain unchanged');
   assert.deepEqual(current.state.regions.map(({probe,state})=>({probe,state})),[
    {probe:'local-a',state:regions[0]},{probe:'local-b',state:regions[1]},
   ]);
   return current;
  };

  // No selected probe has run yet; an empty history cannot establish target health.
  const unseen=await coverage('Unknown',['Unknown','Unknown']);
  assert.equal(unseen.state.coverageState,'Incomplete');
  assert.deepEqual(await history(),[]);assert.deepEqual(await incidents(),[]);

  // One failing network with the other missing stays visible without independent agreement.
  await run(0,503);
  const partial=await coverage('Degraded',['Failing','Unknown']);
  assert.equal(partial.state.coverageState,'Incomplete');assert.equal(partial.state.failingVantages,1);
  assert.deepEqual((await overview()).alerts,[]);
  const partialSlot=(await history())[0];
  assert.equal(partialSlot.status,'running');assert.equal(partialSlot.observations.length,1);

  // Complete the same slot with a passing peer, retaining the original failure.
  clock+=25;await run(1,200);
  const mixed=await coverage('Degraded',['Failing','Healthy']);
  assert.equal(mixed.state.coverageState,'Complete');assert.equal(mixed.state.failingVantages,1);
  assert.deepEqual((await overview()).alerts,[]);
  const mixedSlot=(await history())[0];
  assert.equal(mixedSlot.status,'complete');assert.equal(mixedSlot.manual,0);
  assert.deepEqual(mixedSlot.observations.map(({probe,outcome,status})=>({probe,outcome,status})).sort((a,b)=>a.probe.localeCompare(b.probe)),[
   {probe:'local-a',outcome:'target_failure',status:503},{probe:'local-b',outcome:'pass',status:200},
  ]);
  assert.deepEqual(mixedSlot.observations.find(observation=>observation.probe==='local-a'),partialSlot.observations[0]);

  // Reads age each real observation independently, without consuming scheduled work.
  clock=partialSlot.observations[0].completedAt+created.definition.freshnessMs;
  await coverage('Degraded',['Failing','Healthy']);
  clock+=1;
  const partlyStale=await coverage('Unknown',['Unknown','Healthy']);
  assert.equal(partlyStale.state.coverageState,'Incomplete');
  clock=Math.max(...mixedSlot.observations.map(observation=>observation.completedAt))+created.definition.freshnessMs+1;
  const staleMixed=await coverage('Unknown',['Unknown','Unknown']);
  assert.equal(staleMixed.state.coverageState,'Incomplete');
  assert.deepEqual(await history(),[mixedSlot],'freshness reads retain actual observations and create no replacement checks');
  assert.deepEqual((await overview()).alerts,[]);assert.deepEqual(await incidents(),[]);

  await next();await both(503);
  const firstFailure=await coverage('Degraded',['Failing','Failing']);
  assert.equal(firstFailure.state.failureStreak,1);assert.deepEqual((await overview()).alerts,[]);
  await next();await both(503);
  const failing=await coverage('Failing',['Failing','Failing']);
  assert.equal(failing.state.failureStreak,2);assert.equal(failing.state.confirmedFailure,true);
  const trigger=(await overview()).alerts;
  assert.equal(trigger.length,1);assert.equal(trigger[0].kind,'trigger');
  const incidentKey=trigger[0].event.incidentKey;
  assert.equal(failing.state.incidentKey,incidentKey);
  const failedHistory=await history(),failingSlot=failedHistory[0];
  assert.equal(failingSlot.status,'complete');
  assert.ok(failingSlot.observations.every(observation=>observation.outcome==='target_failure'&&observation.status===503));
  const openIncidents=await incidents();assert.equal(openIncidents.length,1);
  assert.equal(openIncidents[0].key,incidentKey);assert.equal(openIncidents[0].endedAt,null);
  const assertOpen=async()=>{
   const current=await monitor();assert.equal(current.state.denominator,2);
   assert.equal(current.state.incidentKey,incidentKey);assert.equal(current.state.notificationOpen,true);
   assert.equal(current.state.confirmedFailure,true);
   assert.deepEqual((await overview()).alerts,trigger,'an unqualified pass cannot add or rewrite an incident event');
   assert.deepEqual(await incidents(),openIncidents.map(incident=>({...incident,durationMs:clock-incident.startedAt})),
    'the same incident remains open while its elapsed duration advances');
   const retained=await history();
   for(const old of failedHistory)assert.deepEqual(retained.find(slot=>slot.id===old.id),old,'original scheduled observations remain immutable');
  };

  // Real manual evidence during the outage cannot consume scheduled recovery or move cadence.
  const nextDue=failing.nextDue;
  await good(`/api/monitors/${id}/run`,{});await both(200);
  const manual=(await history()).find(slot=>slot.manual);
  assert.equal(manual.status,'complete');assert.equal(manual.observations.length,2);
  assert.ok(manual.observations.every(observation=>observation.outcome==='pass'&&observation.status===200));
  const afterManual=await coverage('Failing',['Failing','Failing']);
  assert.equal(afterManual.nextDue,nextDue);assert.equal(afterManual.state.recoveryStreak,0);
  await assertOpen();

  // Expiring both failing witnesses cannot resolve the open incident or consume recovery.
  clock=Math.max(...failingSlot.observations.map(observation=>observation.completedAt))+created.definition.freshnessMs+1;
  const staleFailure=await coverage('Unknown',['Unknown','Unknown']);
  assert.equal(staleFailure.state.coverageState,'Incomplete');assert.equal(staleFailure.state.recoveryStreak,0);
  assert.equal(staleFailure.nextDue,nextDue);await assertOpen();
  assert.deepEqual((await history()).find(slot=>slot.id===manual.id),manual);

  // The other selected probe is absent: one actual scheduled pass is never complete coverage.
  await next();await run(0,200);
  const absentSlot=(await history()).find(slot=>!slot.manual&&slot.id!==failingSlot.id&&slot.due_at===nextDue);
  assert.ok(absentSlot);assert.equal(absentSlot.status,'running');
  assert.deepEqual(absentSlot.observations.map(observation=>observation.probe),['local-a']);
  const absent=await coverage('Unknown',['Healthy','Unknown']);
  assert.equal(absent.state.coverageState,'Incomplete');assert.equal(absent.state.recoveryStreak,0);
  await assertOpen();

  // Completing this first scheduled passing slot only starts the saved two-slot recovery threshold.
  await run(1,200);
  const recovering=await coverage('Recovering',['Healthy','Healthy']);
  assert.equal(recovering.state.coverageState,'Complete');assert.equal(recovering.state.recoveryStreak,1);
  await assertOpen();
  const firstPassing=(await history()).find(slot=>slot.id===absentSlot.id);
  assert.equal(firstPassing.status,'complete');assert.equal(firstPassing.observations.length,2);
  assert.ok(firstPassing.observations.every(observation=>observation.outcome==='pass'));

  // Passing coverage is fresh through its saved deadline, then becomes Unknown without recovery.
  clock=Math.max(...firstPassing.observations.map(observation=>observation.completedAt))+created.definition.freshnessMs;
  await coverage('Recovering',['Healthy','Healthy']);await assertOpen();
  clock+=1;
  const staleRecovery=await coverage('Unknown',['Unknown','Unknown']);
  assert.equal(staleRecovery.state.coverageState,'Incomplete');
  assert.equal(staleRecovery.state.recoveryStreak,1);await assertOpen();
  assert.deepEqual((await history()).find(slot=>slot.id===firstPassing.id),firstPassing);

  // At the next due time, absence still cannot finish recovery; the second complete pass can.
  await next();await run(0,200);
  const secondPartial=await coverage('Unknown',['Healthy','Unknown']);
  assert.equal(secondPartial.state.coverageState,'Incomplete');await assertOpen();
  await run(1,200);
  const healthy=await coverage('Healthy',['Healthy','Healthy']);
  assert.equal(healthy.state.recoveryStreak,2);assert.equal(healthy.state.notificationOpen,false);
  const closed=(await overview()).alerts;
  assert.equal(closed.length,2);assert.equal(closed.filter(event=>event.kind==='trigger').length,1);
  const recovery=closed.filter(event=>event.kind==='recovery');assert.equal(recovery.length,1);
  assert.equal(recovery[0].event.incidentKey,incidentKey);
  assert.deepEqual(closed.find(event=>event.kind==='trigger'),trigger[0]);
  const recoveredIncidents=await incidents();assert.equal(recoveredIncidents.length,1);
  assert.equal(recoveredIncidents[0].key,incidentKey);
  assert.equal(recoveredIncidents[0].startedAt,openIncidents[0].startedAt);
  assert.equal(recoveredIncidents[0].endedAt,recovery[0].event.observedAt);
  const finalHistory=await history();
  for(const old of [...failedHistory,manual,firstPassing])assert.deepEqual(finalHistory.find(slot=>slot.id===old.id),old);
  assert.equal(finalHistory.filter(slot=>!slot.manual&&slot.observations.length===2&&slot.observations.every(observation=>observation.outcome==='pass')).length,2);
  assert.ok(finalHistory.every(slot=>slot.revision===created.revision&&JSON.stringify(slot.definition)===JSON.stringify(created.definition)));
  assert.equal(completions.length,12);assert.ok(completions.every(result=>result.status===200&&result.signed));
  assert.deepEqual([...new Set(completions.map(result=>result.runnerId))].sort(),locations.map(location=>location.runnerId).sort());
  for(const slot of finalHistory) {
   assert.deepEqual(completions.filter(result=>result.slotId===slot.id).map(result=>result.runnerId).sort(),
    slot.definition.probes.map(probe=>slot.definition.assignments[probe].runnerId).sort(),
    'every manual and scheduled slot retains accepted signed completions from exactly its assigned runners');
  }
  await run(0,200,true);await run(1,200,true);
  assert.deepEqual((await overview()).alerts,closed,'idle polls after recovery cannot replay the recovery event');
  clock=Math.max(...finalHistory[0].observations.map(observation=>observation.completedAt))+created.definition.freshnessMs+1;
  const staleHealthy=await coverage('Unknown',['Unknown','Unknown']);
  assert.equal(staleHealthy.state.coverageState,'Incomplete');assert.equal(staleHealthy.state.notificationOpen,false);
  assert.deepEqual((await overview()).alerts,closed,'aging recovered evidence creates no incident event');
  assert.deepEqual(await incidents(),recoveredIncidents);assert.deepEqual(await history(),finalHistory);
  console.log('STATE-001 passed: two signed assigned runners, missing and partial coverage, mixed-vantage Degraded, exact freshness aging, confirmed failure, manual-pass isolation, absent-probe Unknown, first complete scheduled Recovering and one recovery after the second complete scheduled pass with immutable evidence.');
 } finally {
  for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  await Promise.all([...children].map(child=>child.exitCode!==null||child.signalCode!==null?undefined:once(child,'exit')));
  await close(control);await close(target);await worker?.dispose();await rm(directory,{recursive:true,force:true});
 }
}

// Migrate inside the isolated Worker: no test-owned D1 RPC proxy or product-row seeding.
async function stateWorker(directory,bindings) {
 const emitted=resolve('dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
 const wrapper=join(directory,'state-emitted-envelope.mjs');
 await writeFile(wrapper,`import app from ${JSON.stringify(relative(dirname(wrapper),join(emitted,config.main)))};
 const wallNow=Date.now;let clock;Date.now=()=>clock??wallNow();
 export default {async fetch(request,env,ctx){const input=await request.json();
  if(input.migration){await env.DB.batch(input.migration.map(sql=>env.DB.prepare(sql)));return Response.json({migrated:true})}
  clock=input.clock;return app.fetch(new Request(input.url,{method:input.method,headers:input.headers,
   ...(input.body===undefined?{}:{body:input.body})}),env,ctx)}};`);
 const modules=[{type:'ESModule',path:wrapper},{type:'ESModule',path:join(emitted,config.main)},
  ...(await readdir(join(emitted,'assets'))).filter(name=>name.endsWith('.js')).map(name=>({type:'ESModule',path:join(emitted,'assets',name)}))];
 const worker=new Miniflare(convertV4MiniflareOptions({scriptPath:wrapper,modules,modulesRoot:parse(emitted).root,
  compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,host:'127.0.0.1',port:0,
  cf:{},d1Databases:{DB:'state-emitted-runner'},resourcePersistencePath:join(directory,'state'),bindings,
  outboundService:async request=>{
   if(new URL(request.url).hostname==='api.sendgrid.com'&&(await request.json()).subject==='Uptime second-factor security change')
    return new Response(null,{status:202});
   throw Error('Unexpected network request in state journey');
  },unsafeLocalExplorer:false,unsafeObservability:false,
 }));
 try{await worker.ready;return worker}catch(error){await worker.dispose();throw error}
}
