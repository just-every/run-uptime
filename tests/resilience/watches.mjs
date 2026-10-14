import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {runRunner} from '../../runners/src/private-runner.mjs';
import {fixture,cleanup,closeServer} from './support.mjs';
import {startLocalWorker} from '../../scripts/local-worker.mjs';
const wait=async(fn)=>{for(let i=0;i<200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('Expected watch event did not arrive')};
test('stopping the real Worker retries a rejected independent notice, repeats accepted notices and reports restored contact',async()=>{
 const f=await fixture(),controller=new AbortController(),notices=[];let resumed,runner,failure;
 const receiver=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const status=notices.length===0?503:204;notices.push({notice:JSON.parse(body),status,at:Date.now()});res.statusCode=status;res.end()})});
 const transport={async send(wire){const response=await fetch(`http://127.0.0.1:${receiver.address().port}/notice`,{method:wire.method,headers:wire.headers,body:wire.body});return {status:response.status,headers:{},body:await response.text()}}};
 const retryMs=20,repeatMs=800;
 try{
  await new Promise((resolve,reject)=>{receiver.once('error',reject);receiver.listen(0,'127.0.0.1',()=>{receiver.off('error',reject);resolve()})});
  runner=runRunner({origin:f.origin,key:f.first.key,runnerId:f.first.runnerId,localReview:true,signal:controller.signal,pollMs:20,watch:{url:'https://watch.example.test/',afterMs:60,repeatMs,retryMs,transport}});
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
test('the Worker mails stale runner contact once per incident window and a healthy digest once per week window',async()=>{
 const f=await fixture({UPTIME_RUNNER_STALE_MS:'1000',UPTIME_WATCH_REPEAT_MS:'100000',UPTIME_DIGEST_INTERVAL_MS:'100000'});
 try{
  await f.DB.prepare('UPDATE runners SET last_contact_at=?').bind(Date.now()-2000).run();
  const runtime=await f.worker.getWorker();await runtime.scheduled();await runtime.scheduled();
  const notices=(await f.DB.prepare('SELECT id,outcome FROM monitoring_watch').all()).results;assert.equal(notices.filter(n=>n.id.startsWith('runner-stale:')).length,2);assert.ok(notices.every(n=>n.outcome==='development'));
  assert.equal((await f.request('/api/runner/claim',{runner:f.first,body:{}})).status,200);assert.equal((await f.request('/api/runner/claim',{runner:f.second,body:{}})).status,200);await runtime.scheduled();await runtime.scheduled();
  assert.equal((await f.DB.prepare("SELECT COUNT(*) n FROM monitoring_watch WHERE id LIKE 'healthy-digest:%'").first()).n,1);
  const envelopes=(await f.DB.prepare('SELECT message FROM rer_mail_development_outbox').all()).results.map(r=>JSON.parse(r.message));assert.ok(envelopes.some(e=>e.to.includes(f.bindings.OWNER_EMAIL)));
 }finally{await f.close()}
});
test('the Worker retries only a definite owner-watch rejection after its short backoff in the same bucket',async()=>{
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
 }finally{await cleanup(()=>retryWorker?.dispose(),()=>f.close())}
});
test('self-check-gated external heartbeat pings contain no product data and stopping pings lets an independent service alarm',async()=>{
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
