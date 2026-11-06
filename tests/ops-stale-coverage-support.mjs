import assert from 'node:assert/strict';
import https from 'node:https';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,certificate,runChild,listen,close,request} from './signed-runner-runtime.mjs';

// This installation has its own emitted-Worker envelope clock and migrated D1.
// The existing runner support changes only DNS and the certificate-checked wire
// edge; neither production health projection nor accepted evidence is replaced.
export async function proveStaleRunnerCoverage(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-ops-stale-coverage-'));
 const key='synthetic-uptime-145-runner';
 let worker,db,target,control,child,origin,cookie='',clock=Date.now();
 const traffic=[],results=[];
 try{
  const tls=await certificate(directory);
  target=https.createServer(tls,(req,res)=>{
   traffic.push({host:req.headers.host,path:req.url,method:req.method});
   res.writeHead(200,{'content-type':'text/plain'});res.end('synthetic-uptime-145');
  });
  const targetPort=await listen(target);
  control=https.createServer(tls,async(req,res)=>{
   try{
    let body='';for await(const chunk of req)body+=chunk;
    // A result's receipt happens after the actual probe. Only this isolate's
    // clock advances, leaving the Worker and the healthy target running.
    if(req.url==='/api/runner/results')clock+=1000;
    const response=await worker.dispatchFetch('http://localhost/',{
     method:'POST',redirect:'manual',headers:{'content-type':'application/json'},
     body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,clock,...(body?{body}:{})}),
    });
    const bytes=Buffer.from(await response.arrayBuffer());
    if(req.url==='/api/runner/results')results.push({status:response.status,answer:JSON.parse(bytes),receivedAt:clock});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);
   }catch{res.writeHead(500);res.end('Stale coverage transport failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-145-mail'};
  const start=async()=>{worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB')};
  await start();
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort()){
   for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  }
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.145',...headers}});
  const owner=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Stale coverage owner'});
  assert.equal(owner.status,303);cookie=owner.headers['set-cookie'][0].split(';')[0];
  await completeSecondFactor(origin,cookie,async(url,init)=>{
   const response=await api(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),init.headers,init.method);
   return new Response(JSON.stringify(response.data),{status:response.status});
  },clock);
  const read=async path=>{const response=await api(path);assert.equal(response.status,200);return response.data};
  const run=async()=>{child=runChild({origin,key,caPath:tls.caPath,targetPort,clock});await child.finish();child=undefined};

  // Enrol through the production runner before assigning the enabled monitor.
  await run();
  const enrolled=(await read('/api/runners')).filter(row=>!row.hosted);assert.equal(enrolled.length,1);
  const runnerId=enrolled[0].runnerId;
  assert.equal(enrolled[0].revokedAt,null);assert.equal(traffic.length,0);
  const created=await api('/api/monitors',{
   name:'synthetic-uptime-145-monitor',url:'https://runner-target.test/health',
   canaryUrl:'https://canary.runner-target.test/canary',probes:['local-a'],assignments:{'local-a':runnerId},
   enabled:true,intervalMs:5000,freshnessMs:180000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1,
  });
  assert.equal(created.status,201);
  const id=created.data.id,historyPath=`/api/monitors/${id}/history`;
  const monitor=view=>{assert.equal(view.now,clock);const found=view.monitors.find(row=>row.id===id);assert.ok(found);return found};
  const countTraffic=checks=>{
   assert.equal(traffic.filter(row=>row.host==='runner-target.test'&&row.path==='/health'&&row.method==='GET').length,checks,'independent target receiver counts genuine checks');
   assert.equal(traffic.filter(row=>row.host==='canary.runner-target.test'&&row.path==='/canary'&&row.method==='GET').length,checks);
   assert.equal(traffic.length,checks*2,'no other target traffic');
  };
  clock+=1000;await run();
  assert.equal(results.length,1);assert.equal(results[0].status,200);assert.equal(results[0].answer.accepted,true);
  countTraffic(1);
  const fresh=await read('/api/overview'),original=monitor(fresh),history=await read(historyPath);
  assert.equal(fresh.runner.contact.state,'Fresh contact');
  const contactAt=fresh.runner.contact.lastContactAt;
  assert.equal(contactAt,results[0].receivedAt);
  assert.equal(original.definition.enabled,true);assert.deepEqual(original.definition.probes,['local-a']);
  assert.equal(original.definition.assignments['local-a'].runnerId,runnerId);
  assert.equal(original.state.state,'Healthy');assert.equal(original.state.targetState,'Healthy');
  assert.equal(original.state.coverageState,'Complete');assert.equal(original.state.denominator,1);
  assert.equal(original.state.regions[0].state,'Healthy');assert.equal(original.activeVantages,1);
  assert.equal(history.length,1);assert.equal(history[0].manual,0);assert.equal(history[0].status,'complete');
  assert.equal(history[0].observations.length,1);
  const observation=history[0].observations[0];
  assert.equal(observation.outcome,'pass');assert.equal(observation.status,200);
  assert.equal(observation.canary.outcome,'pass');assert.equal(observation.canary.status,200);
  assert.equal(original.state.regions[0].observationId,observation.id);
  assert.equal(history[0].definition.assignments['local-a'].runnerId,runnerId);
  assert.deepEqual(fresh.alerts,[]);

  const stored=async()=>{
   const tables=['monitors','revisions','slots','observations','runner_assignments','runner_contact','outbox','notification_jobs','incident_work'];
   const rows=await db.batch(tables.map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`)));
   return {tables:Object.fromEntries(tables.map((table,index)=>[table,rows[index].results])),runners:(await db.prepare('SELECT runner_id,network_label,registered_at,last_contact_at,revoked_at FROM runners ORDER BY runner_id').all()).results};
  };
  const retained=await stored(),savedTraffic=structuredClone(traffic);
  const contactDeadline=contactAt+fresh.runner.contact.freshnessMs;
  const targetDeadline=Math.max(observation.completedAt,observation.canary.completedAt)+original.definition.freshnessMs;
  // No runner invocation, pause, reassignment or target outage: advance beyond
  // both saved freshness bounds and read the same installation's two facts.
  clock=Math.max(contactDeadline,targetDeadline)+1;
  assert.ok(clock>contactDeadline&&clock>targetDeadline);
  const readStale=async()=>{
   const view=await read('/api/overview'),current=monitor(view);
   assert.equal(view.runner.contact.state,'Stale contact');assert.equal(view.runner.contact.lastContactAt,contactAt);
   assert.equal(view.runner.runners.find(row=>row.runnerId===runnerId).lastContactAt,contactAt);
   assert.equal(current.definition.enabled,true);assert.deepEqual(current.definition,original.definition);
   assert.equal(current.state.state,'Unknown');assert.equal(current.state.targetState,'Unknown');
   assert.equal(current.state.coverageState,'Incomplete');assert.equal(current.state.denominator,original.state.denominator);
   assert.equal(current.state.unknown,1);assert.equal(current.state.fails,0);assert.equal(current.activeVantages,0);
   assert.equal(current.state.regions.length,1);assert.equal(current.state.regions[0].state,'Unknown');
   assert.equal(current.state.regions[0].observationId,observation.id);
   assert.equal(current.state.regions[0].observedAt,observation.completedAt);
   assert.equal(current.state.regions[0].networkLabel,original.state.regions[0].networkLabel);
   assert.deepEqual(view.alerts,[],'missing checks fabricate neither a trigger nor a recovery');
   assert.deepEqual(await read(historyPath),history,'expired passing evidence remains complete and unchanged in history');
   const runners=(await read('/api/runners')).filter(row=>!row.hosted);assert.equal(runners.length,1);
   assert.equal(runners[0].lastContactAt,contactAt);assert.equal(runners[0].revokedAt,null);
   assert.deepEqual(await stored(),retained,'owner reads preserve contact, scheduling, evidence and incident records');
   assert.deepEqual(traffic,savedTraffic,'owner reads cannot run a replacement target check');
  };
  await readStale();await readStale();
  console.log('PROBE OPS-001 stale-coverage: owner overview after assigned runner loss -> Stale contact and Unknown target, Incomplete coverage, original denominator and observation identity; zero new target requests');
  await worker.dispose();worker=undefined;await start();
  await readStale();
  console.log('PROBE OPS-001 persisted-restart: same D1 and clock, restarted Worker -> identical stale contact and signed history, no trigger, recovery or replacement traffic');

  // The next invocation is genuinely overdue, and only its new accepted signed
  // result can establish current Healthy coverage with Fresh contact again.
  assert.ok(clock>original.nextDue);
  await run();
  assert.equal(results.length,2);assert.equal(results[1].status,200);assert.equal(results[1].answer.accepted,true);
  countTraffic(2);
  const resumed=await read('/api/overview'),current=monitor(resumed),after=await read(historyPath);
  assert.equal(resumed.runner.contact.state,'Fresh contact');
  assert.equal(resumed.runner.contact.lastContactAt,results[1].receivedAt);
  assert.ok(resumed.runner.contact.lastContactAt>contactAt);
  assert.equal(current.state.state,'Healthy');assert.equal(current.state.targetState,'Healthy');
  assert.equal(current.state.coverageState,'Complete');assert.equal(current.state.denominator,original.state.denominator);
  assert.equal(current.state.regions[0].state,'Healthy');assert.equal(current.activeVantages,1);
  assert.deepEqual(current.definition,original.definition);assert.equal(after.length,2);
  assert.deepEqual(after.find(slot=>slot.id===history[0].id),history[0],'resuming preserves the original signed observation');
  const latest=after.find(slot=>slot.id!==history[0].id);
  assert.equal(latest.manual,0);assert.equal(latest.status,'complete');assert.ok(latest.due_at>=original.nextDue);
  assert.equal(latest.observations.length,1);assert.equal(latest.observations[0].outcome,'pass');
  assert.notEqual(latest.observations[0].id,observation.id);
  assert.equal(current.state.regions[0].observationId,latest.observations[0].id);
  assert.deepEqual(resumed.alerts,[],'coverage restoration is not a target recovery event');
  console.log('PROBE OPS-001 resumed-due-runner: production runner signed due result -> Fresh contact and Healthy Complete coverage, exactly one new check, retained original history, no alert events');
 }finally{await child?.stop();await close(control);await worker?.dispose();await close(target);await rm(directory,{recursive:true,force:true})}
}
