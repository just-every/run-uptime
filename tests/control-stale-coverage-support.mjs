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

// This journey owns its migrated D1, emitted-Worker clock and runner identities.
// Routing support controls only time and the certificate-checked HTTPS edge.
export async function proveExpiredPassingCoverage() {
 const directory=await mkdtemp(join(tmpdir(),'uptime-state-stale-'));
 const children=new Set(),traffic=[],completions=[];
 let worker,control,target,origin,cookie='',bridgeError,clock=1800000000000;
 try {
  const tls=await certificate(directory);
  target=https.createServer(tls,(req,res)=>{
   traffic.push({host:req.headers.host,path:req.url,method:req.method});
   res.writeHead(200,{'content-type':'text/plain'});res.end('synthetic-uptime-162');
  });
  const targetPort=await listen(target);
  control=https.createServer(tls,async(req,res)=>{
   try {
    let body='';for await(const chunk of req)body+=chunk;
    const response=await worker.dispatchFetch('http://localhost/',{
     method:'POST',redirect:'manual',headers:{'content-type':'application/json'},
     body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,clock,...(body?{body}:{})}),
    });
    const bytes=Buffer.from(await response.arrayBuffer());
    if(req.url==='/api/runner/results')completions.push({
     slotId:JSON.parse(body).slotId,runnerId:req.headers['x-runner-id'],status:response.status,
     signed:typeof req.headers['x-runner-signature']==='string',accepted:JSON.parse(bytes).accepted,
    });
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);
   } catch(error) {bridgeError=error;res.writeHead(500);res.end('Stale state transport failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-162-mail',
   UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:'synthetic-uptime-162-installation-runner'};
  const start=async()=>{worker=await staleCoverageWorker(directory,bindings)};
  await start();
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort()) {
   const response=await worker.dispatchFetch('http://localhost/',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({migration:splitSql(await readFile(join('migrations',file),'utf8'))})});
   assert.equal(response.status,200,`Migration ${file} completes against independent real D1`);
  }
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{
   method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.162',...headers},
  });
  const good=async(path,body,status=200)=>{
   const response=await api(path,body);assert.equal(response.status,status,`${path}: ${JSON.stringify(response.data)}`);return response.data;
  };
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Expired coverage owner'});
  assert.equal(boot.status,303);cookie=boot.headers['set-cookie'][0].split(';')[0];
  await completeApiSecondFactor(origin,cookie,api,clock);
  const locations=[];
  for(const networkLabel of ['synthetic-uptime-162-network-a','synthetic-uptime-162-network-b'])
   locations.push(await good('/api/runners',{networkLabel},201));
  assert.notEqual(locations[0].runnerId,locations[1].runnerId);
  const created=await good('/api/monitors',{
   name:'synthetic-uptime-162-monitor',url:'https://runner-target.test/health',network:'public',enabled:true,
   probes:['local-a','local-b'],assignments:{'local-a':locations[0].runnerId,'local-b':locations[1].runnerId},
   intervalMs:10000,timeoutMs:2000,retries:0,confirmSlots:2,recoverSlots:2,freshnessMs:60000,
  },201);
  const id=created.id,history=()=>good(`/api/monitors/${id}/history`);
  const overview=()=>good(`/api/overview?monitor=${id}`),incidents=()=>good(`/api/monitors/${id}/incidents`);
  const monitor=view=>{assert.equal(view.now,clock);assert.equal(view.monitors.length,1);return view.monitors[0]};
  const run=async(index,idle=false)=>{
   const before=traffic.length,location=locations[index];
   const child=spawn(process.execPath,['--import',resolve('tests/signed-runner-routing.mjs'),'--input-type=module','--eval',
    `import {runRunner} from './runners/src/private-runner.mjs';
     await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,
      runnerId:process.env.UPTIME_RUNNER_ID,grantPath:process.env.STATE_STALE_GRANT_PATH,once:true});`],{
    env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:location.key,UPTIME_RUNNER_ID:location.runnerId,
     STATE_STALE_GRANT_PATH:join(directory,'grant.json'),NODE_EXTRA_CA_CERTS:tls.caPath,
     SIGNED_RUNNER_TARGET_PORT:String(targetPort),SIGNED_RUNNER_CLOCK:String(clock)},stdio:['ignore','pipe','pipe'],
   });
   children.add(child);let diagnosticBytes=0;
   child.stdout.on('data',chunk=>diagnosticBytes+=chunk.length);child.stderr.on('data',chunk=>diagnosticBytes+=chunk.length);
   const timer=setTimeout(()=>child.kill('SIGKILL'),35000);
   try {const [code]=await once(child,'exit');if(bridgeError)throw bridgeError;
    assert.equal(code,0,`Signed stale-coverage runner failed (${diagnosticBytes} private diagnostic bytes)`);
   } finally {clearTimeout(timer);children.delete(child)}
   assert.deepEqual(traffic.slice(before),idle?[]:[{host:'runner-target.test',path:'/health',method:'GET'}],
    'an assigned runner makes exactly one genuinely due target request or stays idle');
  };
  const stored=async()=>{
   const {payload}=await good('/api/archive');
   // Export records its own access audit; compare every exported product table.
   const {uptime_audit,...tables}={...payload.tables,...payload.productTables};
   return tables;
  };
  const coverage=(view,state,coverageState,observations)=>{
   const current=monitor(view);
   assert.equal(current.id,id);assert.equal(current.revision,created.revision);
   assert.deepEqual(current.definition,created.definition,'no pause, edit or reassignment changes the saved enabled policy');
   assert.equal(current.definition.enabled,true);
   assert.equal(current.state.state,state);assert.equal(current.state.targetState,state);
   assert.equal(current.state.coverageState,coverageState);assert.equal(current.state.denominator,2);
   assert.equal(current.state.fails,0);assert.equal(current.state.unknown,state==='Unknown'?2:0);
   assert.equal(current.state.regions.length,2);
   for(const [index,probe] of ['local-a','local-b'].entries()) {
    const region=current.state.regions.find(row=>row.probe===probe),observation=observations.find(row=>row.probe===probe);
    assert.ok(region);assert.ok(observation);assert.equal(region.state,state);
    assert.equal(region.observationId,observation.id);assert.equal(region.observedAt,observation.completedAt);
    assert.equal(region.networkLabel,current.definition.assignments[probe].networkLabel);
    assert.equal(current.definition.assignments[probe].runnerId,locations[index].runnerId);
   }
   assert.notEqual(current.state.regions[0].networkLabel,current.state.regions[1].networkLabel);
   assert.notEqual(current.state.confirmedFailure,true);assert.equal(current.state.notificationOpen,false);
   assert.deepEqual(view.alerts,[],'coverage loss and return fabricate neither a trigger nor a recovery');
   return current;
  };

  // Both assigned production runners complete one real scheduled passing slot.
  await run(0);clock+=1000;await run(1);
  const originalHistory=await history();assert.equal(originalHistory.length,1);
  const old=originalHistory[0];assert.equal(old.manual,0);assert.equal(old.status,'complete');
  assert.equal(old.revision,created.revision);assert.deepEqual(old.definition,created.definition);
  assert.equal(old.observations.length,2);assert.equal(new Set(old.observations.map(row=>row.id)).size,2);
  assert.ok(old.observations.every(row=>row.outcome==='pass'&&row.status===200&&row.attempt===0));
  const original=coverage(await overview(),'Healthy','Complete',old.observations);
  assert.equal(original.activeVantages,2);assert.deepEqual(await incidents(),[]);
  assert.equal(traffic.length,2);assert.equal(completions.length,2);
  assert.ok(completions.every(row=>row.status===200&&row.accepted===true&&row.signed&&row.slotId===old.id));
  assert.deepEqual(completions.map(row=>row.runnerId).sort(),locations.map(row=>row.runnerId).sort());
  const retained=await stored(),savedTraffic=structuredClone(traffic),savedCompletions=structuredClone(completions);
  assert.equal(retained.monitors.length,1);assert.equal(retained.revisions.length,1);
  assert.equal(retained.slots.length,1);assert.equal(retained.observations.length,2);
  for(const table of ['outbox','notification_jobs','incident_work'])assert.deepEqual(retained[table],[]);

  // Each deadline comes from that probe's independently retained passing evidence
  // and the immutable slot policy. No runner is invoked while coverage ages.
  const deadlines=['local-a','local-b'].map(probe=>{
   const observation=old.observations.find(row=>row.probe===probe);
   return observation.completedAt+old.definition.freshnessMs;
  });
  assert.notEqual(deadlines[0],deadlines[1]);assert.ok(deadlines.every(deadline=>clock<=deadline));
  clock=Math.max(...deadlines)+1;assert.ok(deadlines.every(deadline=>clock>deadline));
  const readExpired=async()=>{
   const current=coverage(await overview(),'Unknown','Incomplete',old.observations);
   assert.equal(current.nextDue,original.nextDue);
   assert.deepEqual(await history(),originalHistory,'both expired passing observations remain unchanged in owner history');
   assert.deepEqual(await incidents(),[]);
   assert.deepEqual(await stored(),retained,'aging and repeated reads preserve definitions, revisions, slots, evidence and incident records');
   assert.deepEqual(traffic,savedTraffic,'reads and restart cannot fabricate replacement target traffic');
   assert.deepEqual(completions,savedCompletions,'both assigned runners remain stopped throughout aging');
  };
  await readExpired();await readExpired();
  console.log('PROBE STATE-001 expired-passing-coverage: two saved passing deadlines crossed with no runner invocation -> target and both regions Unknown, Incomplete coverage, denominator 2, original observation identities, exactly two target requests');
  await worker.dispose();worker=undefined;await start();
  await readExpired();await readExpired();
  console.log('PROBE STATE-001 stale-restart: restarted emitted Worker on the same D1 and isolated clock -> identical owner history and durable records, zero new target requests and no trigger or recovery');

  // Resume only genuinely due work. Early polls after it cannot replay checks.
  assert.ok(clock>original.nextDue);await run(0);clock+=1000;await run(1);
  const after=await history();assert.equal(after.length,2);
  assert.deepEqual(after.find(slot=>slot.id===old.id),old,'resuming cannot rewrite the expired slot');
  const latest=after.find(slot=>slot.id!==old.id);
  assert.equal(latest.manual,0);assert.equal(latest.status,'complete');assert.ok(latest.due_at>=original.nextDue);
  assert.equal(latest.revision,old.revision);assert.deepEqual(latest.definition,old.definition);
  assert.equal(latest.observations.length,2);
  assert.ok(latest.observations.every(row=>row.outcome==='pass'&&row.status===200&&row.startedAt>Math.max(...deadlines)));
  assert.ok(latest.observations.every(row=>!old.observations.some(previous=>previous.id===row.id)));
  const current=coverage(await overview(),'Healthy','Complete',latest.observations);
  assert.equal(current.activeVantages,2);assert.deepEqual(await incidents(),[]);
  assert.equal(traffic.length,4);assert.equal(completions.length,4);
  assert.ok(completions.every(row=>row.status===200&&row.accepted===true&&row.signed));
  assert.deepEqual(completions.filter(row=>row.slotId===latest.id).map(row=>row.runnerId).sort(),locations.map(row=>row.runnerId).sort());
  const resumed=await stored();
  assert.deepEqual(resumed.monitors.map(({id,revision,definition})=>({id,revision,definition})),
   retained.monitors.map(({id,revision,definition})=>({id,revision,definition})),'resumed checks leave the saved monitor definition and revision unchanged');
  for(const table of ['revisions','outbox','notification_jobs','incident_work'])
   assert.deepEqual(resumed[table],retained[table],'resumed checks preserve definitions, authority and incident records');
  assert.equal(resumed.slots.length,2);assert.equal(resumed.observations.length,4);
  assert.ok(clock<current.nextDue);await run(0,true);await run(1,true);
  assert.deepEqual(await history(),after);coverage(await overview(),'Healthy','Complete',latest.observations);
  assert.equal(traffic.length,4);assert.equal(completions.length,4);
  console.log('PROBE STATE-001 resumed-due-coverage: both signed production runners resumed -> Healthy Complete coverage, two new target checks, unchanged old history, no fabricated trigger or recovery; early polls execute no work');
 } finally {
  for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  await Promise.all([...children].map(child=>child.exitCode!==null||child.signalCode!==null?undefined:once(child,'exit')));
  await close(control);await close(target);await worker?.dispose();await rm(directory,{recursive:true,force:true});
 }
}

async function staleCoverageWorker(directory,bindings) {
 const emitted=resolve('dist/server'),config=JSON.parse(await readFile(join(emitted,'wrangler.json'),'utf8'));
 const wrapper=join(directory,'stale-coverage-emitted-envelope.mjs');
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
  cf:{},assets:{directory:resolve(emitted,config.assets.directory),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:true},
  d1Databases:{DB:'stale-coverage-emitted-runner'},resourcePersistencePath:join(directory,'state'),bindings,
  outboundService:async request=>{
   if(new URL(request.url).hostname==='api.sendgrid.com'&&(await request.json()).subject==='Uptime second-factor security change')
    return new Response(null,{status:202});
   throw Error('Unexpected network request in stale coverage journey');
  },unsafeLocalExplorer:false,unsafeObservability:false,
 }));
 try{await worker.ready;return worker}catch(error){await worker.dispose();throw error}
}
