import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {once} from 'node:events';
import {hostedRuntime} from '../hosted-auth-runtime.mjs';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {testAuthBindings} from '../auth-test-support.mjs';
import {splitSql} from '../migration-support.mjs';
import {deliveredMessages} from '../mail-provider-fixture.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {runRunner} from '../../runners/src/private-runner.mjs';
import {fixture,cleanup,closeServer} from './support.mjs';
import {startLocalWorker} from '../mail-provider-fixture.mjs';
import {startWatchClockWorker} from './watch-clock.mjs';
const wait=async(fn)=>{for(let i=0;i<200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('Expected watch event did not arrive')};
test('OPS-001 stopping the real Worker retries a rejected independent notice, repeats accepted notices and reports restored contact',async()=>{
 const f=await fixture(),controller=new AbortController(),notices=[];let resumed,runner,failure;
 const receiver=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const status=notices.length===0?503:204;notices.push({notice:JSON.parse(body),status,at:Date.now()});res.statusCode=status;res.end()})});
 const transport={async send(wire){const response=await fetch(`http://127.0.0.1:${receiver.address().port}/notice`,{method:wire.method,headers:wire.headers,body:wire.body});return {status:response.status,headers:{},body:await response.text()}}};
 const retryMs=20,repeatMs=800;
 try{
  await new Promise((resolve,reject)=>{receiver.once('error',reject);receiver.listen(0,'127.0.0.1',()=>{receiver.off('error',reject);resolve()})});
  runner=runRunner({origin:f.origin,key:f.first.key,runnerId:f.first.runnerId,localReview:true,signal:controller.signal,pollMs:20,watch:{url:'https://watch.example.test/',afterMs:60,repeatMs,retryMs,statePath:join(f.directory,'watch','journal.sqlite'),transport}});
  await wait(async()=>(await f.DB.prepare('SELECT last_contact_at FROM runners WHERE runner_id=?').bind(f.first.runnerId).first()).last_contact_at>f.migratedContact);
  console.info('Resilience watch: fresh authenticated contact confirmed; stopping Worker');
  await f.worker.dispose();console.info('Resilience watch: Worker stopped; waiting for independent notices');await wait(()=>{const failed=notices.filter(n=>n.notice.kind==='unreachable');return failed.length>=3&&failed.filter(n=>n.status>=200&&n.status<300).length>=2});
  const unreachable=notices.filter(n=>n.notice.kind==='unreachable');assert.equal(unreachable[0].status,503);assert.ok(unreachable[1].status>=200&&unreachable[1].status<300,'the rejected notice is retried before the accepted repeat interval');assert.ok(unreachable[1].at-unreachable[0].at<repeatMs);
  console.info('Resilience watch: accepted retry and repeat confirmed; restarting persisted Worker');
  resumed=await startLocalWorker({port:Number(new URL(f.origin).port),persist:f.directory,bindings:f.bindings});console.info('Resilience watch: persisted Worker ready; waiting for recovery notice');await wait(()=>notices.some(n=>n.notice.kind==='recovery'&&n.status>=200&&n.status<300));assert.ok(notices.every(n=>!JSON.stringify(n).includes(f.first.key)));
  console.info('Resilience watch: accepted recovery confirmed');
 }catch(error){failure=error}
 finally{
  controller.abort();console.info('Resilience watch: joining runner and disposing resumed Worker');
  await cleanup(
   ()=>{if(failure)throw failure},
   ()=>runner,
   ()=>{console.info('Resilience watch: runner settled; disposing resumed Worker');return resumed?.dispose()},
   [()=>{console.info('Resilience watch: closing fixture and notice receiver');return f.close()},()=>closeServer(receiver)],
  );
  console.info('Resilience watch: all owned resources closed');
 }
});
test('OPS-001 the Worker mails stale runner contact once per incident window and a healthy digest once per week window',async()=>{
 const f=await fixture({UPTIME_RUNNER_STALE_MS:'1000',UPTIME_WATCH_REPEAT_MS:'100000',UPTIME_DIGEST_INTERVAL_MS:'100000'});
 let clockWorker;
 try{
 // A digest needs an actual healthy scheduled monitor, not vacuous Array.every coverage.
 await f.run(f.first);await f.run(f.second);await (await f.worker.getWorker()).scheduled();
 assert.equal((await f.DB.prepare("SELECT COUNT(*) n FROM monitoring_watch WHERE id LIKE 'healthy-digest:%'").first()).n,0,'empty installation never sends all healthy');
 f.modes.target=200;const watched=await f.monitor({freshnessMs:300000});
 await f.run(f.first);await f.run(f.second);assert.equal((await f.state(watched.id)).targetState,'Healthy');

  await f.worker.dispose();clockWorker=await startWatchClockWorker({port:Number(new URL(f.origin).port),persist:f.directory,bindings:f.bindings});
  const DB=await clockWorker.getD1Database('DB'),runtime=await clockWorker.getWorker();
  const boundary=(Math.floor(Date.now()/100000)+1)*100000,tick=now=>runtime.scheduled({scheduledTime:now});
  await DB.prepare('UPDATE runners SET last_contact_at=?').bind(boundary-2002).run();
  await tick(boundary-2);await tick(boundary-2);await Promise.all([tick(boundary-2),tick(boundary-2)]);
  const notices=(await DB.prepare('SELECT id,outcome FROM monitoring_watch').all()).results;assert.equal(notices.filter(n=>n.id.startsWith('runner-stale:')).length,2);assert.ok(notices.every(n=>n.outcome==='accepted'));
  assert.equal((await f.request('/api/runner/claim',{runner:f.first,body:{}})).status,200);assert.equal((await f.request('/api/runner/claim',{runner:f.second,body:{}})).status,200);await tick(boundary-2);await tick(boundary-1);
  await Promise.all([tick(boundary-1),tick(boundary-1)]);
  const digests=async()=>(await DB.prepare("SELECT id,outcome FROM monitoring_watch WHERE id LIKE 'healthy-digest:%' ORDER BY id").all()).results;
  const envelopes=async()=>deliveredMessages(f.origin).map(({message})=>({deliveryId:message.custom_args.rer_delivery_id,to:message.personalizations.flatMap(p=>p.to.map(to=>to.email))}));
  const digestEnvelopes=async()=>(await envelopes()).filter(e=>e.deliveryId.startsWith('healthy-digest:'));
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM monitoring_watch WHERE id LIKE 'healthy-digest:%'").first()).n,1);
  assert.equal((await digestEnvelopes()).length,1,'repeated and concurrent ticks emit one digest in the same window');
  assert.equal((await envelopes()).filter(e=>e.deliveryId.startsWith('runner-stale:')).length,2,'repeated and concurrent ticks emit one stale notice per runner in the same window');
  assert.ok((await envelopes()).some(e=>e.to.includes(f.bindings.OWNER_EMAIL)));
  await Promise.all([tick(boundary),tick(boundary)]);await tick(boundary);await tick(boundary+1);
  assert.deepEqual(await digests(),[boundary/100000-1,boundary/100000].map(bucket=>({id:`healthy-digest:${bucket}`,outcome:'accepted'})));
  assert.deepEqual((await digestEnvelopes()).map(e=>e.deliveryId),(await digests()).map(row=>row.id),'one emitted envelope per distinct window, with no repeat after crossing');
  assert.ok((await DB.prepare('SELECT outcome FROM monitoring_watch').all()).results.every(n=>n.outcome==='accepted'));
  const retained=(await DB.prepare("SELECT * FROM auxiliary_attempts WHERE scope='watch'").all()).results;assert.equal(retained.length,4);assert.ok(retained.every(row=>row.outcome==='accepted'&&row.submitted_at!==null&&row.finished_at!==null));
  const observations=(await DB.prepare('SELECT * FROM observations ORDER BY id').all()).results;assert.ok(observations.length);
  await tick(boundary+400000);
  const stale=(await f.request('/api/overview')).data.monitors.find(m=>m.id===watched.id);
  assert.equal(stale.activeVantages,0,'OPS-001 lost runner contact is stale independently of target history');assert.equal(stale.state.targetState,'Unknown','expired target evidence cannot remain Healthy');assert.equal(stale.state.unknown,2);
  assert.deepEqual((await DB.prepare('SELECT * FROM observations ORDER BY id').all()).results,observations,'restart and lease expiry retain all scheduled observations');
 }finally{await cleanup(()=>clockWorker?.dispose(),()=>f.close())}
});
test('OPS-001 the Worker retries only a definite owner-watch rejection after its short backoff in the same bucket',async()=>{
 const statuses=[400,500,202],attempts=[];const f=await fixture();let retryWorker;
 try{
  await f.worker.dispose();retryWorker=await startLocalWorker({port:Number(new URL(f.origin).port),persist:f.directory,bindings:{...f.bindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-sendgrid-key',UPTIME_RUNNER_STALE_MS:'1000',UPTIME_WATCH_REPEAT_MS:'9999999999999'},outboundService:async request=>{assert.equal(new URL(request.url).hostname,'api.sendgrid.com');const status=statuses[attempts.length]??202;attempts.push(status);return new Response('',{status})}});
  const DB=await retryWorker.getD1Database('DB');await DB.prepare('UPDATE runners SET last_contact_at=? WHERE revoked_at IS NULL').bind(Date.now()-2000).run();
  const runtime=await retryWorker.getWorker();await runtime.scheduled();
  let rows=(await DB.prepare("SELECT id,outcome FROM monitoring_watch WHERE id LIKE 'runner-stale:%'").all()).results;
  assert.equal(rows.length,2);assert.deepEqual(new Set(rows.map(row=>row.outcome)),new Set(['rejected','uncertain']));assert.equal(attempts.length,2);
  await runtime.scheduled();assert.equal(attempts.length,2,'the rejected outcome waits for the short backoff');
  await new Promise(resolve=>setTimeout(resolve,10500));await Promise.all([runtime.scheduled(),runtime.scheduled()]);
  rows=(await DB.prepare("SELECT id,outcome FROM monitoring_watch WHERE id LIKE 'runner-stale:%'").all()).results;
  assert.equal(rows.length,2,'both sends remain in their original repeat bucket');assert.deepEqual(new Set(rows.map(row=>row.outcome)),new Set(['accepted','uncertain']));assert.equal(attempts.length,3,'concurrent ticks claim the rejected notice once and never replay the uncertain one');
  await runtime.scheduled();assert.equal(attempts.length,3,'an accepted notice remains once per bucket');
  const history=(await DB.prepare("SELECT outcome,submitted_at,finished_at FROM auxiliary_attempts WHERE scope='watch' ORDER BY rowid").all()).results;assert.deepEqual(history.map(row=>row.outcome),['rejected','uncertain','accepted']);assert.ok(history.every(row=>row.submitted_at!==null&&row.finished_at!==null));
 }finally{await cleanup(()=>retryWorker?.dispose(),()=>f.close())}
});
test('OPS-001 self-check-gated external heartbeat pings contain no product data and stopping pings lets an independent service alarm',async()=>{
 let last=null,alarm=false,alarmTimer,f;
 const fake=http.createServer((req,res)=>{assert.equal(req.method,'GET');assert.equal(req.url,'/ping');last=Date.now();alarm=false;clearTimeout(alarmTimer);alarmTimer=setTimeout(()=>{alarm=true},250);res.end('ok')});await new Promise(r=>fake.listen(0,'127.0.0.1',r));
 try{
  f=await fixture({UPTIME_HEARTBEAT_URL:'https://heartbeat.example.test/ping',UPTIME_HEARTBEAT_INTERVAL_MS:'20'},async request=>{assert.equal(request.method,'GET');assert.equal(await request.text(),'');return fetch(`http://127.0.0.1:${fake.address().port}/ping`)});
  await (await f.worker.getWorker()).scheduled();assert.notEqual(last,null);assert.equal(alarm,false);
  await f.worker.dispose();await wait(()=>alarm);assert.equal(alarm,true);
 }finally{await cleanup([()=>f?.close(),()=>closeServer(fake)],()=>clearTimeout(alarmTimer))}
});
test('setup-selected Base mail adapters send notification mail through only the chosen provider',async()=>{
 for(const provider of ['resend','sendgrid','cloudflare']){
  let calls=0;
  const f=await fixture({MAIL_PROVIDER:provider,...(provider==='sendgrid'?{SENDGRID_API_KEY:'test-only-sendgrid-key'}:provider==='resend'?{MAIL_PROVIDER_API_KEY:'test-only-provider-key'}:{CLOUDFLARE_MAIL_API_KEY:'test-only-cloudflare-mail-key',MAIL_ACCOUNT_ID:'a'.repeat(32)})},async request=>{
   const host=new URL(request.url).hostname;assert.equal(host,{resend:'api.resend.com',sendgrid:'api.sendgrid.com',cloudflare:'api.cloudflare.com'}[provider]);calls++;
   if(provider==='sendgrid')return new Response('',{status:202});
   if(provider==='resend')return Response.json({id:'test-provider-message'});
   const body=await request.json();return Response.json({success:true,errors:[],result:{message_id:'test-provider-message',delivered:[],queued:body.to,permanent_bounces:[],suppressed_recipients:[]}})
  });
  try{
   const destination=await f.request('/api/notifications/destinations',{body:{name:'Owner mail',kind:'email',address:'owner@example.test',enabled:true}});assert.equal(destination.status,201,JSON.stringify(destination.data));
   assert.equal((await f.request('/api/notifications/destinations/'+destination.data.id+'/test',{body:{}})).status,202);
   assert.equal((await f.request('/api/runner/notifications',{runner:f.first,body:{operation:'poll'}})).status,200);
   const jobs=(await f.request('/api/notifications')).data.deliveries;assert.equal(jobs.length,1);assert.equal(jobs[0].state,'accepted');assert.equal(calls,1);
   assert.equal((await f.request('/auth/magic-link',{body:{email:f.bindings.OWNER_EMAIL}})).status,202);assert.equal(calls,2,'operator mail uses the selected provider too');
   assert.equal((await f.DB.prepare("SELECT COUNT(*) n FROM uptime_audit WHERE action='notification_send' AND actor_ref='operator-auth-mail'").first()).n,1,'auth authority is audited before provider submission');
  }finally{await f.close()}
 }
});

// The child executes the public runner loop. Only its independent network edge
// forwards to the local receiver; SIGKILL leaves the real journal unfinished.
test('OPS-001 runner process crashes reconcile unreachable and recovery attempts without replay',async()=>{
 const f=await fixture(),notices=[];let resumed,child;
 const statePath=join(f.directory,'watch','journal.sqlite');
 const receiver=http.createServer((request,_response)=>{let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>notices.push(JSON.parse(body)))});
 const stop=async()=>{if(!child)return;if(child.exitCode!==null||child.signalCode!==null){child=null;return}const ended=once(child,'exit');child.kill('SIGKILL');await ended;child=null};
 const read=()=>{const db=new DatabaseSync(statePath,{readOnly:true});try{db.exec('PRAGMA busy_timeout=5000');return {attempts:db.prepare('SELECT kind,outcome,submitted_at,finished_at FROM attempts ORDER BY rowid').all(),progress:db.prepare('SELECT * FROM progress').get()}}finally{db.close()}};
 const start=offset=>{
  const source=`import {runRunner} from './runners/src/private-runner.mjs';const input=JSON.parse(process.env.UPTIME_TEST_WATCH_INPUT);const offset=input.offset;delete input.offset;const address=input.address;delete input.address;await runRunner({...input,watch:{...input.watch,now:()=>Date.now()+offset,transport:{async send(wire){const result=await fetch(address,{method:wire.method,headers:wire.headers,body:wire.body});return {status:result.status}}}}});`;
  const input={origin:f.origin,key:f.first.key,runnerId:f.first.runnerId,localReview:true,pollMs:20,offset,address:`http://127.0.0.1:${receiver.address().port}/`,watch:{url:'https://watch.example.test/',afterMs:40,repeatMs:3600000,statePath}};
  child=spawn(process.execPath,['--input-type=module','--eval',source],{cwd:process.cwd(),env:{...process.env,UPTIME_TEST_WATCH_INPUT:JSON.stringify(input)},stdio:['ignore','ignore','ignore']});
 };
 try{
  await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve));
  await f.worker.dispose();start(0);await wait(()=>notices.length===1);assert.equal(notices[0].kind,'unreachable');assert.equal(read().attempts[0].outcome,'sending');await stop();
  start(61000);await wait(()=>read().attempts[0].outcome==='uncertain');assert.equal(notices.length,1,'restart never repeats a possibly accepted unreachable notice');
  resumed=await startLocalWorker({port:Number(new URL(f.origin).port),persist:f.directory,bindings:f.bindings});await wait(()=>notices.length===2);assert.equal(notices[1].kind,'recovery');assert.equal(notices[1].since,notices[0].since,'original outage progress survives the process crash');await stop();
  start(122000);await wait(()=>read().attempts.length===2&&read().attempts[1].outcome==='uncertain');
  const resumedDB=await resumed.getD1Database('DB');
  const contact=(await resumedDB.prepare('SELECT last_contact_at FROM runners WHERE runner_id=?').bind(f.first.runnerId).first()).last_contact_at;
  await wait(async()=>(await resumedDB.prepare('SELECT last_contact_at FROM runners WHERE runner_id=?').bind(f.first.runnerId).first()).last_contact_at>contact);
  const retained=read();assert.equal(retained.progress.failed_since,null);assert.equal(retained.progress.announced,0);assert.equal(notices.length,2,'an uncertain recovery is terminal across restart');assert.ok(retained.attempts.every(row=>row.submitted_at!==null&&row.finished_at!==null));
  assert.ok(!JSON.stringify(retained).includes(f.first.key));
 }finally{await cleanup(()=>stop(),()=>resumed?.dispose(),[()=>f.close(),()=>closeServer(receiver)])}
});

test('OPS-001 interrupted hosted auth mail and external heartbeat retain uncertainty across Worker restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'uptime-ops-jobs-')),restored=await mkdtemp(join(tmpdir(),'uptime-ops-restored-')),origin='https://uptime.example.test';
 const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-ops-key',UPTIME_HEARTBEAT_URL:'https://heartbeat.example.test/ping',UPTIME_HEARTBEAT_INTERVAL_MS:'3600000'};
 let worker,mailStarted,heartbeatStarted,mailCalls=0,heartbeatCalls=0;const mailBoundary=new Promise(resolve=>mailStarted=resolve),heartbeatBoundary=new Promise(resolve=>heartbeatStarted=resolve);
 const outbound=async request=>{
  if(new URL(request.url).hostname==='api.sendgrid.com'){mailCalls++;mailStarted();return new Promise(()=>{})}
  assert.equal(new URL(request.url).hostname,'heartbeat.example.test');heartbeatCalls++;heartbeatStarted();return new Promise(()=>{});
 };
 const call=(path,body,cookie)=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method:body===undefined?'GET':'POST',headers:{host:'uptime.example.test',origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const schedule=()=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({scheduled:true})});
 try{
  worker=await hostedRuntime(directory,bindings,outbound);let DB=await worker.getD1Database('DB');
  for(const file of (await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const bootstrap=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'OPS owner'});assert.equal(bootstrap.status,303,await bootstrap.clone().text());const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
  const pendingMail=call('/auth/magic-link',{email:bindings.OWNER_EMAIL}).catch(()=>null);await mailBoundary;
  const pendingHeartbeat=schedule().catch(()=>null);await heartbeatBoundary;
  const before=(await DB.prepare('SELECT * FROM auxiliary_attempts ORDER BY rowid').all()).results;assert.deepEqual(before.map(row=>row.outcome),['sending','sending']);assert.ok(before.every(row=>row.submitted_at!==null&&row.finished_at===null));
  const exportResponse=await call('/api/archive',undefined,cookie);assert.equal(exportResponse.status,200);const exported=await exportResponse.json();assert.deepEqual(exported.payload.productTables.auxiliary_attempts,before,'archive retains each live auxiliary attempt without dispatch content');
  await worker.dispose();worker=null;await Promise.all([pendingMail,pendingHeartbeat]);
  const now=Date.now()+61000;
  worker=await hostedRuntime(directory,bindings,async request=>{if(new URL(request.url).hostname==='api.sendgrid.com'){mailCalls++;return new Response(null,{status:202})}heartbeatCalls++;return new Response(null,{status:204})},{now});DB=await worker.getD1Database('DB');
  assert.equal((await schedule()).status,204);assert.equal((await schedule()).status,204);
  const after=(await DB.prepare('SELECT * FROM auxiliary_attempts ORDER BY rowid').all()).results;assert.equal(after.length,2);assert.ok(after.every(row=>row.outcome==='uncertain'&&row.code==='lease_expired_submitted'&&row.finished_at===now));assert.deepEqual(after.map(row=>row.id),before.map(row=>row.id));assert.equal(mailCalls,1);assert.equal(heartbeatCalls,1,'restart does not replay a possibly accepted ping before the next interval');
  assert.equal((await DB.prepare("SELECT outcome FROM monitoring_watch WHERE id='external-heartbeat'").first()).outcome,'uncertain');
  assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL})).status,202,'a newly requested auth execution remains usable');assert.equal(mailCalls,2);const latest=await DB.prepare("SELECT * FROM auxiliary_attempts WHERE scope='auth-mail' ORDER BY rowid DESC LIMIT 1").first();assert.equal(latest.outcome,'accepted');assert.ok(latest.finished_at!==null);
  assert.ok(!JSON.stringify(after).includes(bindings.OWNER_EMAIL));assert.ok(!JSON.stringify(after).includes(bindings.SENDGRID_API_KEY));
  await worker.dispose();worker=null;
  // Restore the interrupted executions into a receiving installation whose
  // independent heartbeat is deliberately not configured.
  const receiving={...bindings};delete receiving.UPTIME_HEARTBEAT_URL;
  worker=await hostedRuntime(restored,receiving,async()=>{throw Error('Restored auxiliary execution must never replay')},{now});DB=await worker.getD1Database('DB');
  for(const file of (await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const receivedOwner=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Receiving owner'});assert.equal(receivedOwner.status,303);const receivedCookie=receivedOwner.headers.get('set-cookie').split(';')[0];
  const restoredResponse=await call('/api/restore',{archive:exported},receivedCookie);assert.equal(restoredResponse.status,200,await restoredResponse.clone().text());
  const imported=(await DB.prepare('SELECT * FROM auxiliary_attempts ORDER BY rowid').all()).results;assert.equal(imported.length,2);assert.ok(imported.every(row=>row.finished_at===now&&row.outcome==='uncertain'&&row.code==='restored_inactive'));assert.deepEqual(imported.map(row=>row.id),before.map(row=>row.id));
  assert.equal((await schedule()).status,204);assert.deepEqual((await DB.prepare('SELECT * FROM auxiliary_attempts ORDER BY rowid').all()).results,imported);
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true});await rm(restored,{recursive:true,force:true})}
});
