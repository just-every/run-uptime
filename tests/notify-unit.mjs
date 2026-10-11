import {readCredential} from '../src/domain/notification-credentials.server.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {notificationTestDB} from './notify-unit-database.mjs';
import {createDestination,destinations,updateDestination,deleteDestination,rotateDestination} from '../src/domain/notification-destinations.server.ts';
import {testDestination,notificationOverview,openIncidentKey} from '../src/domain/notifications.server.ts';
import {notificationRpc,notificationRepository} from '../src/domain/notification-rpc.server.ts';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {incidentEvent,mailContent,slackContent,notificationText,testEvent} from '../src/domain/notification-content.ts';
import {save as saveMonitor,claim as claimAttempt,complete as completeAttempts,archive,restore,grants} from '../src/domain/control.server.ts';
import {verifyWebhook} from '../src/base/modules/integrations/core/webhook.ts';
import {validateSlackMessage,escapeSlackText} from '../src/base/modules/integrations/slack/message.ts';
import {createActionFeedback} from '../public/action-feedback.mjs';
import {ensureFirstRunner} from '../src/domain/runner-registration.server.ts';
async function save(env,input){return saveMonitor(env,{canaryUrl:'https://canary.example.com/health',...input})}
async function claim(env){return claimAttempt(env,(await ensureFirstRunner(env)).runner_id)}
async function complete(env,input){for(const o of input.attempts)o.canary??={id:crypto.randomUUID(),probe:o.probe,attempt:0,startedAt:o.startedAt,completedAt:o.completedAt,durationMs:o.durationMs,runnerVersion:o.runnerVersion,outcome:'pass',status:200,bytes:0,checks:[{assertion:'status',pass:true,reason:'Network-edge canary fixture'}]};return completeAttempts(env,input,(await ensureFirstRunner(env)).runner_id)}
function setup(){return {DB:notificationTestDB(),SESSION_SECRET:randomBytes(32).toString('hex'),UPTIME_ORIGIN:'https://uptime.example.com'}}
const webhook={name:'Operations',kind:'webhook',url:'https://receiver.example.com/events'};
function apiFor(env){return async(_path,input)=>notificationRpc(env,input)}
function guardSecrets(value,secrets){const text=JSON.stringify(value);assert.ok(secrets.every(s=>!text.includes(s)),'secret excluded from the inspected structure')}
// Only transaction scheduling is controlled. The domain functions and every
// statement still execute against native SQLite using the real migrations.
function holdCompletionBatches(DB){
 const batch=DB.batch.bind(DB),pending=[];
 DB.batch=statements=>new Promise((resolve,reject)=>pending.push({statements,resolve,reject,released:false}));
 return {
  async ready(count){const deadline=Date.now()+5000;while(pending.length<count&&Date.now()<deadline)await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,count,'each completion read the assigned acceptance window before its batch');DB.batch=batch},
  async commit(index){const item=pending[index];item.released=true;try{item.resolve(await batch(item.statements))}catch(error){item.reject(error)}},
  close(){DB.batch=batch;for(const item of pending)if(!item.released)item.reject(Error('Test transaction schedule closed'))}
 };
}
test('destination validation, once-only secrets, independent rotation and safe metadata',async()=>{const env=setup();try{
 const one=await createDestination(env,webhook),two=await createDestination(env,{...webhook,name:'Other'}),slack=await createDestination(env,{name:'Slack',kind:'slack',url:'https://hooks.slack.com/services/TONE/BONE/secretcapability'});
 assert.ok(one.signingSecret.length>=64);assert.ok(one.signingSecret!==two.signingSecret);assert.equal('signingSecret' in slack,false);await assert.rejects(rotateDestination(env,slack.id));
 for(const url of ['http://receiver.example.com','https://user:password@receiver.example.com','https://127.0.0.1','https://10.0.0.1','https://169.254.169.254','https://[::1]','https://[fe80::1]'])await assert.rejects(createDestination(env,{...webhook,url}));
 await assert.rejects(createDestination(env,{name:'Email',kind:'email',address:'one@example.com,two@example.com'}));
 await assert.rejects(createDestination(env,{name:'Slack',kind:'slack',url:'https://receiver.example.com/services/a/b/c'}));
 const rotated=await rotateDestination(env,one.id);assert.ok(rotated.signingSecret!==one.signingSecret);
 await updateDestination(env,one.id,{name:'New name',enabled:false});const list=await destinations(env);assert.equal(list.find(d=>d.id===one.id).enabled,false);guardSecrets(list,[one.signingSecret,two.signingSecret,rotated.signingSecret,webhook.url]);
 await deleteDestination(env,one.id);assert.equal((await destinations(env)).length,2);
 }finally{env.DB.close()}});
test('marked tests, durable duplicate dispatch and unknown response never resend',async()=>{const env=setup();try{
 const destination=await createDestination(env,webhook),test=await testDestination(env,destination.id);let sent=0;
 const transport={async send(wire){sent++;const event=JSON.parse(wire.body);assert.equal(event.eventType,'uptime.notification.test');assert.equal(event.incidentKey,null);const stamp=wire.headers['x-lamp-timestamp'];assert.ok(stamp);assert.equal(wire.headers['x-lamp-signature'],createHmac('sha256',destination.signingSecret).update(stamp+'.'+wire.body).digest('base64url'));const verified=await verifyWebhook({body:wire.body,headers:wire.headers,key:new TextEncoder().encode(destination.signingSecret),tenant:'uptime-notifications',destinationId:wire.headers['webhook-destination']});assert.equal(verified.envelope.id,test.deliveryId);return {status:202,headers:{},body:''}}};
 await Promise.all([dispatchNotifications(apiFor(env),transport),dispatchNotifications(apiFor(env),transport)]);await dispatchNotifications(apiFor(env),transport);assert.equal(sent,1);
 const one=(await notificationOverview(env)).deliveries.find(d=>d.id===test.deliveryId);assert.equal(one.state,'accepted');assert.equal(one.attempts,1);
 await testDestination(env,destination.id);await dispatchNotifications(apiFor(env),{async send(){sent++;throw Error('lost response')}});await dispatchNotifications(apiFor(env),transport);assert.equal(sent,2);assert.equal((await notificationOverview(env)).deliveries.filter(d=>d.state==='uncertain').length,1);
 for(const table of ['monitors','slots','outbox'])assert.equal((await env.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
 guardSecrets(await notificationOverview(env),[destination.signingSecret,webhook.url]);
 }finally{env.DB.close()}});
test('email without provider visibly rejects and expired committed claims stay uncertain',async()=>{const env=setup();try{
 const d=await createDestination(env,{kind:'email',name:'Email',address:'owner@example.com'}),job=await testDestination(env,d.id);await notificationRpc(env,{operation:'poll'});let rows=(await notificationOverview(env)).deliveries;assert.equal(rows[0].state,'rejected');assert.equal(rows[0].code,'mail_not_configured');
 const second=await testDestination(env,d.id);await env.DB.prepare("UPDATE notification_jobs SET state='sending',claim='test-claim',claim_until=0 WHERE id=?").bind(second.deliveryId).run();await notificationRpc(env,{operation:'poll'});rows=(await notificationOverview(env)).deliveries;assert.equal(rows.find(d=>d.id===second.deliveryId).state,'uncertain');await notificationRpc(env,{operation:'poll'});assert.equal(rows.find(d=>d.id===job.deliveryId).state,'rejected');
 }finally{env.DB.close()}});
test('event content escapes email HTML and Slack markup while preserving UTF8 and incident identity',()=>{const event=incidentEvent({id:'event',kind:'trigger',monitor:{id:'monitor',revision:1,definition:{name:'日本語 <!channel> <script>x</script>',url:'https://monitor.example.com'}},slotId:'slot',now:1,state:{reason:'status < expected'},observations:[{probe:'local-a',outcome:'target_failure',checks:[{pass:false,reason:'HTTP 500'}]}],origin:'https://uptime.example.com',incidentKey:'incident'});const mail=mailContent(event),slack=JSON.parse(slackContent(event));assert.match(mail.subject,/^Down: 日本語/);assert.match(mail.html,/&lt;script&gt;/);assert.ok(!mail.html.includes('<script>'));assert.match(mail.text,/Probe local-a: target_failure — HTTP 500/);assert.match(mail.text,/Incident: incident/);assert.match(slack.text,/&lt;!channel&gt;/);assert.equal(slack.mrkdwn,false)});
test('signed completion atomically snapshots enabled destinations; recovery keeps incident identity; archive never replays',async()=>{const env=setup();let receiving;try{
 const d=await createDestination(env,webhook),monitor=await save(env,{name:'Atomic monitor',url:'https://monitor.example.com',intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1});
 async function finish(status){await env.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.id).run();const task=await claim(env),now=Date.now(),pass=status===200;const attempts=[{id:crypto.randomUUID(),probe:'local-a',attempt:0,startedAt:now,completedAt:now,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:pass?'pass':'target_failure',status,bytes:0,checks:[{assertion:'status',pass,reason:`HTTP ${status}`}]}];await complete(env,{slotId:task.id,attempts});assert.equal((await complete(env,{slotId:task.id,attempts})).duplicate,true);}
 await finish(500);const first=(await notificationOverview(env)).deliveries[0];assert.equal(first.event.kind,'trigger');await rotateDestination(env,d.id);await updateDestination(env,d.id,{name:'Renamed',enabled:false});const old=(await env.DB.prepare('SELECT credential_id FROM notification_jobs WHERE id=?').bind(first.id).first()).credential_id;const current=(await env.DB.prepare('SELECT credential_id FROM notification_destinations WHERE id=?').bind(d.id).first()).credential_id;assert.notEqual(old,current);assert.equal(first.destinationName,'Operations');
 await updateDestination(env,d.id,{name:'Renamed',enabled:true});await finish(200);const rows=(await notificationOverview(env)).deliveries;assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.event.incidentKey)).size,1);assert.deepEqual(rows.map(r=>r.event.kind).sort(),['recovery','trigger']);
 const exported=await archive(env);guardSecrets(exported,[d.signingSecret,webhook.url]);assert.ok(!('notification_jobs' in exported.payload.tables));receiving=setup();await restore(receiving,exported);const restoredRows=(await notificationOverview(receiving)).deliveries;
 assert.deepEqual(restoredRows,rows.map(row=>({...row,state:'imported-inactive',code:'imported_inactive'})));
 assert.deepEqual((await notificationRpc(receiving,{operation:'poll'})).jobs,[]);
 for(const row of restoredRows)assert.equal(await notificationRpc(receiving,{operation:'claim',id:row.id}),null);
 assert.deepEqual((await notificationRpc(receiving,{operation:'poll'})).jobs,[]);
 assert.deepEqual((await notificationOverview(receiving)).deliveries,restoredRows);assert.equal((await receiving.DB.prepare("SELECT COUNT(*) n FROM outbox WHERE status='imported-inactive'").first()).n,2);
 }finally{env.DB.close();receiving?.DB.close()}});
for(const initiallyEnabled of [false,true])test(`overlapping completion rejects the loser without late fanout (${initiallyEnabled?'existing destination':'no initial destination'})`,async()=>{
 const env=setup();let schedule;
 try{
  const original=initiallyEnabled?await createDestination(env,webhook):null;
  const monitor=await save(env,{name:'Concurrent automatic incident',url:'https://monitor.example.com',intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1});
  const task=await claim(env),now=Date.now();
  const attempt={id:crypto.randomUUID(),probe:'local-a',attempt:0,startedAt:now,completedAt:now,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'target_failure',status:500,bytes:0,checks:[{assertion:'status',pass:false,reason:'HTTP 500'}]};
  const input={slotId:task.id,attempts:[attempt]};
  schedule=holdCompletionBatches(env.DB);
  const winner=complete(env,input),duplicate=complete(env,input),settled=Promise.allSettled([winner,duplicate]);
  await schedule.ready(2);await schedule.commit(0);
  const accepted=await winner;
  assert.equal(accepted.accepted,true);assert.equal(accepted.state.state,'Failing');assert.equal(accepted.state.notificationOpen,true);
  assert.equal(accepted.state.incidentKey,`incident:${task.id}`);
  const snapshot=async()=>Object.fromEntries(await Promise.all(['monitors','slots','observations','outbox','notification_jobs','runner_contact'].map(async table=>[table,(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
  const first=await snapshot(),event=JSON.parse(first.outbox[0].event);
  assert.equal(first.slots.length,1);assert.equal(first.slots[0].status,'complete');assert.equal(first.slots[0].manual,0);
  assert.equal(first.observations.length,1);assert.deepEqual(JSON.parse(first.observations[0].evidence),attempt);
  assert.deepEqual(JSON.parse(first.monitors[0].state),accepted.state);
  assert.equal(first.outbox.length,1);assert.equal(event.kind,'trigger');assert.equal(event.monitorId,monitor.id);assert.equal(event.incidentKey,accepted.state.incidentKey);
  assert.equal(first.runner_contact.length,1);assert.equal(first.runner_contact[0].last_contact_at,event.observedAt);
  assert.equal(first.notification_jobs.length,initiallyEnabled?1:0);
  if(original){const job=first.notification_jobs[0],destination=await env.DB.prepare('SELECT credential_id FROM notification_destinations WHERE id=?').bind(original.id).first();assert.equal(job.destination_id,original.id);assert.equal(job.destination_name,original.name);assert.equal(job.credential_id,destination.credential_id);assert.equal(job.event_id,event.id);assert.deepEqual(JSON.parse(job.event),event);assert.equal(job.state,'queued')}
  const late=await createDestination(env,{name:'Created after committed incident',kind:'email',address:'later@example.com'});
  await schedule.commit(1);
  const results=await settled;
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'fulfilled');assert.equal(results[1].value.duplicate,true,'first accepted copy wins');
  assert.deepEqual(await snapshot(),first,'duplicate preserves original evidence, state, outbox, jobs and accepted contact');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM notification_jobs WHERE destination_id=?').bind(late.id).first()).n,0,'a destination created after the event cannot join its fanout');
 }finally{schedule?.close();env.DB.close()}
});
test('completion rejects when its assigned acceptance window expires before the guarded transaction',async()=>{
 const env=setup();let schedule;
 try{
  await createDestination(env,webhook);
  const monitor=await save(env,{name:'Expired transaction lease',url:'https://monitor.example.com',intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1});
  const task=await claim(env),now=Date.now(),before=(await env.DB.prepare('SELECT state FROM monitors WHERE id=?').bind(monitor.id).first()).state;
  schedule=holdCompletionBatches(env.DB);
  const completion=complete(env,{slotId:task.id,attempts:[{id:crypto.randomUUID(),probe:'local-a',attempt:0,startedAt:now,completedAt:now,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'target_failure',status:500,bytes:0,checks:[{assertion:'status',pass:false,reason:'HTTP 500'}]}]});
  const settled=Promise.allSettled([completion]);await schedule.ready(1);
  await env.DB.prepare('UPDATE slots SET lease_until=0 WHERE id=?').bind(task.id).run();await schedule.commit(0);
  const [result]=await settled;assert.equal(result.status,'rejected');assert.match(result.reason.message,/Acceptance authority expired/);
  for(const table of ['observations','outbox','notification_jobs','runner_contact'])assert.equal((await env.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
  assert.equal((await env.DB.prepare('SELECT state FROM monitors WHERE id=?').bind(monitor.id).first()).state,before);
  assert.equal((await env.DB.prepare('SELECT status FROM slots WHERE id=?').bind(task.id).first()).status,'running');
 }finally{schedule?.close();env.DB.close()}
});
test('first authenticated load has no recovery banner; actual failed reads recover visibly',async()=>{let failure=Object.assign(Error('Owner session required'),{status:401}),last;const controller=createActionFeedback({load:async()=>{if(failure)throw failure;return {now:1}},render(){},publish:s=>last=s});await controller.refresh();failure=null;await controller.refresh();assert.equal(last.read.state,'ready');assert.equal(last.read.message,'');failure=Error('Offline');await controller.refresh();failure=null;await controller.refresh();assert.equal(last.read.state,'recovered');assert.match(last.read.message,/Refresh recovered/)});

test('Slack preserves long escaped evidence without splitting Unicode or permitting mentions',()=>{
 const event={...testEvent('https://uptime.example.com'),explanation:'<&😀>'.repeat(1000)};
 const message=JSON.parse(slackContent(event));validateSlackMessage(message);
 assert.equal(message.blocks.map(b=>b.text.text).join(''),escapeSlackText(notificationText(event)));
 assert.ok(message.blocks.length>1);assert.ok(message.blocks.every(b=>b.text.text.length<=3000));
});
test('actual Base mail facade classifies one submission and never resends uncertain HTTP 500',async()=>{
 const env={...setup(),MAIL_FROM:'sender@example.com',SENDGRID_API_KEY:'test-only-provider-key'},originalFetch=globalThis.fetch;let requests=0;
 try{
  const destination=await createDestination(env,{kind:'email',name:'Email',address:'owner@example.com'});
  globalThis.fetch=async(url,request)=>{requests++;assert.equal(url,'https://api.sendgrid.com/v3/mail/send');const body=JSON.parse(request.body);assert.match(body.subject,/^Test notification/);assert.ok(body.content.some(c=>c.type==='text/html'));return new Response(null,{status:202})};
  await testDestination(env,destination.id);await Promise.all([notificationRpc(env,{operation:'poll'}),notificationRpc(env,{operation:'poll'})]);await notificationRpc(env,{operation:'poll'});
  assert.equal(requests,1);assert.equal((await notificationOverview(env)).deliveries[0].state,'accepted');
  globalThis.fetch=async()=>{requests++;return new Response(null,{status:500})};
  const uncertain=await testDestination(env,destination.id);await notificationRpc(env,{operation:'poll'});await notificationRpc(env,{operation:'poll'});
  const history=(await notificationOverview(env)).deliveries.find(d=>d.id===uncertain.deliveryId);assert.equal(requests,2);assert.equal(history.state,'uncertain');assert.equal(history.code,'provider_uncertain');
  await assert.rejects(createDestination(env,{kind:'email',name:'Invalid',address:'invalid..mail@example.com'}));
 }finally{globalThis.fetch=originalFetch;env.DB.close()}
});

test('expired webhook claims and provider rate limits each remain terminal after one attempt',async()=>{
 const env=setup();try{
  const d=await createDestination(env,webhook),expired=await testDestination(env,d.id);
  await notificationRpc(env,{operation:'poll'});const repository=notificationRepository(env);
  const held=await repository.claim(expired.deliveryId,Date.now(),60000);assert.ok(held);
  await env.DB.prepare('UPDATE integration_deliveries SET claim_until=0 WHERE id=?').bind(expired.deliveryId).run();
  let requests=0;const transport={async send(){requests++;return {status:429,headers:{'retry-after':'1'},body:''}}};
  await dispatchNotifications(apiFor(env),transport);assert.equal(requests,0);
  assert.equal((await notificationOverview(env)).deliveries.find(j=>j.id===expired.deliveryId).state,'uncertain');
  const limited=await testDestination(env,d.id);await dispatchNotifications(apiFor(env),transport);await dispatchNotifications(apiFor(env),transport);
  assert.equal(requests,1);const row=(await notificationOverview(env)).deliveries.find(j=>j.id===limited.deliveryId);assert.equal(row.state,'rejected');assert.equal(row.attempts,1);assert.equal(row.code,'webhook_rate_limited');
 }finally{env.DB.close()}
});
test('concurrent rotations expose only a secret actually selected by their guarded update',async()=>{
 const env=setup();try{
  const d=await createDestination(env,webhook);const results=await Promise.allSettled([rotateDestination(env,d.id),rotateDestination(env,d.id)]);
  const successful=results.filter(r=>r.status==='fulfilled');assert.equal(successful.length,1);
  const selected=await env.DB.prepare('SELECT c.* FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=?').bind(d.id).first();
  assert.ok((await readCredential(env,selected)).signing_secret===successful[0].value.signingSecret,'Selected credential matches the successful rotation');
 }finally{env.DB.close()}
});

test('disable cancels queued delivery and erasure removes delivery records while disabled tests remain deliberate',async()=>{
 const env=setup();try{
  const d=await createDestination(env,webhook),mail=await createDestination(env,{kind:'email',name:'Mail',address:'owner@example.com'});
  const monitor=await save(env,{name:'Queued failure',url:'https://monitor.example.com',intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1});
  const task=await claim(env),now=Date.now();
  await complete(env,{slotId:task.id,attempts:[{id:crypto.randomUUID(),probe:'local-a',attempt:0,startedAt:now,completedAt:now,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'target_failure',status:500,bytes:0,checks:[{assertion:'status',pass:false,reason:'HTTP 500'}]}]});
  // Prepare the webhook without dispatching any request; no-provider mail is terminal.
  await notificationRpc(env,{operation:'poll'});
  await updateDestination(env,d.id,{name:d.name,enabled:false});
  let rows=(await notificationOverview(env)).deliveries;const automatic=rows.find(r=>r.destinationId===d.id);
  assert.equal(automatic.event.monitorId,monitor.id);assert.equal(automatic.state,'rejected');assert.equal(automatic.code,'destination_disabled');assert.equal(automatic.attempts,0);
  assert.equal(await notificationRpc(env,{operation:'claim',id:automatic.id}),null);
  const deliberate=await testDestination(env,d.id);let sends=0;await dispatchNotifications(apiFor(env),{async send(){sends++;return {status:202,headers:{},body:''}}});assert.equal(sends,1);
  assert.equal((await notificationOverview(env)).deliveries.find(j=>j.id===deliberate.deliveryId).state,'accepted');
  const pending=await testDestination(env,d.id);await notificationRpc(env,{operation:'poll'});await deleteDestination(env,d.id);
  await dispatchNotifications(apiFor(env),{async send(){sends++;throw Error('deleted destination must not send')}});assert.equal(sends,1);
  rows=(await notificationOverview(env)).deliveries;assert.ok(!rows.some(j=>j.destinationId===d.id),'erasure removes every copied destination and delivery');assert.equal(await env.DB.prepare('SELECT * FROM integration_deliveries WHERE id=?').bind(pending.deliveryId).first(),null);
  // Deletion before mail claim must prevent even a configured provider call.
  const pendingMail=await testDestination(env,mail.id);await deleteDestination(env,mail.id);await notificationRpc(env,{operation:'poll'});
  assert.ok(!(await notificationOverview(env)).deliveries.some(j=>j.id===pendingMail.deliveryId));assert.equal(await env.DB.prepare('SELECT * FROM notification_credentials WHERE destination_id=?').bind(mail.id).first(),null);
 }finally{env.DB.close()}
});
test('plain notification text contains actual separate lines',()=>{
 const event=testEvent('https://uptime.example.com'),lines=notificationText(event).split('\n');
 assert.equal(lines[0],event.title);assert.ok(lines.includes('State: test'));assert.ok(lines.includes('Console: https://uptime.example.com'));assert.ok(!notificationText(event).includes('\\n'));
});

test('legacy open incidents derive identity without rewriting or replaying historical events',async()=>{
 const env=setup();try{
  const m=await save(env,{name:'Legacy incident',url:'https://monitor.example.com'}),task=await claim(env);
  const event=JSON.stringify({schemaVersion:1,id:task.id+':trigger',kind:'trigger',monitorId:m.id,slotId:task.id,visibility:'private'});
  await env.DB.prepare('INSERT INTO outbox(id,monitor_id,slot_id,kind,event) VALUES(?,?,?,?,?)').bind(task.id+':trigger',m.id,task.id,'trigger',event).run();
  assert.equal(await openIncidentKey(env,m.id,{notificationOpen:true}),`incident:${task.id}`);
  assert.equal(await openIncidentKey(env,m.id,{notificationOpen:false}),null);
  assert.equal((await env.DB.prepare('SELECT event FROM outbox WHERE id=?').bind(task.id+':trigger').first()).event,event);
  assert.deepEqual((await notificationOverview(env)).deliveries,[]);
 }finally{env.DB.close()}
});

test('HTML mail links to the trusted console origin and keeps hostile event content inert',()=>{
 const event={...testEvent('https://uptime.example.com'),title:'Down: <img src=x onerror=alert(1)>',url:'https://target.example.com/?q="<script>',explanation:'<script>alert(1)</script>'};
 const mail=mailContent(event);assert.match(mail.html,/<a href="https:\/\/uptime\.example\.com\/app">Open Uptime console<\/a>/);
 assert.ok(mail.text.split('\n').includes('Console: https://uptime.example.com'));assert.ok(mail.html.includes('&lt;script&gt;'));assert.ok(!mail.html.includes('<script>'));assert.ok(!mail.html.includes('<img'));
 assert.throws(()=>mailContent({...event,consoleUrl:'javascript:alert(1)'}),/Invalid console origin/);
 assert.throws(()=>mailContent({...event,consoleUrl:'https://user:password@uptime.example.com'}),/Invalid console origin/);
});

test('control-port exclusion includes implicit standard protocol ports',()=>{
 for(const [origin,port] of [['http://127.0.0.1',80],['http://127.0.0.1:80',80],['https://uptime.example.com',443],['https://uptime.example.com:443',443]])assert.throws(()=>grants({UPTIME_ORIGIN:origin,UPTIME_SYNTHETIC_PORT:String(port)}),/Invalid local endpoint grant/);
 for(const port of [1,79,81,442,444,65535])assert.deepEqual(grants({UPTIME_ORIGIN:'https://uptime.example.com',UPTIME_SYNTHETIC_PORT:String(port)}),[port]);
});
