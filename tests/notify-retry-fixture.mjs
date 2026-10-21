import {proveEchoCustody} from './notify-echo-fixture.mjs';
import assert from 'node:assert/strict';
import {proveQuietFallback} from './notify-quiet-fixture.mjs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fixture as retryFixture} from './resilience/support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {notificationRetryTime} from '../src/domain/notification-retry.ts';
import {availablePorts,migratedWorker,ownerAPI} from './notify-acceptance-runtime.mjs';
import {mailEdge,proveFallbackChains,sleep} from './notify-fallback-fixture.mjs';
// A PagerDuty Events v2-compatible signed receiver: dedup_key is the incident, webhook-id the delivery's stable event ID.
const pagerDutyTemplate={version:1,method:'POST',mode:'json',template:'{"event_action":"trigger","dedup_key":"{{incident.key}}","payload":{"summary":"{{alert.name}}: {{monitor.name}}","source":"{{monitor.url}}","severity":"critical"} }'};
// Strings anywhere in a value, including JSON nested inside string columns.
const strings=value=>typeof value==='string'?[value,...(()=>{try{const parsed=JSON.parse(value);return typeof parsed==='object'&&parsed?strings(parsed):[]}catch{return []}})()]:value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
// Public owner/runner doors with fakes only at the receiver edge.
export async function proveNotificationRetry(inspect,inspectQuiet=undefined,inspectEcho=undefined){
 const mail=mailEdge();
 const f=await retryFixture({MAIL_PROVIDER:'sendgrid',MAIL_FROM:'qa-sender@example.com',SENDGRID_API_KEY:'synthetic-fallback-provider-key-local-only'},mail.outbound);let restarted,restored;
 const restart=async()=>{await (restarted??f.worker).dispose();restarted=await startLocalWorker({persist:f.directory,port:Number(new URL(f.origin).port),bindings:f.bindings,outboundService:mail.outbound});await restarted.ready};
 try{
  const ok=async(path,body,method)=>{const result=await f.request(path,{body,...(method?{method}:{})});assert.ok(result.status>=200&&result.status<300,`${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};
  assert.deepEqual((await ok('/api/notifications')).preferences.retryPolicy,{maxAttempts:6,windowMs:600000});
  const shape={attempts:1,max_attempts:6,created_at:0,window_ms:600000};
  assert.equal(notificationRetryTime(shape,{kind:'uncertain'},1000,()=>0).nextAt,1800);
  assert.equal(notificationRetryTime(shape,{kind:'uncertain'},1000,()=>1).nextAt,2200);
  assert.equal(notificationRetryTime(shape,{kind:'retryable',retryAfterMs:3000},1000,()=>0).nextAt,4000);
  const contact=await ok('/api/notifications/destinations',{name:'Deduplicating receiver',kind:'webhook',url:'https://retry.example.com/incident',webhookTemplate:pagerDutyTemplate,webhookSigning:true});
  const email=await ok('/api/notifications/destinations',{name:'On-call email',kind:'email',address:'oncall@example.test'});
  const slack=await ok('/api/notifications/destinations',{name:'Dead Slack',kind:'slack',url:'https://hooks.slack.com/services/TDEAD0000/BDEAD0000/deadwebhookdeadwebhook'});
  const hook=await ok('/api/notifications/destinations',{name:'Escalation webhook',kind:'webhook',url:'https://escalation.example.com/hook'});
  const secrets=[contact.signingSecret,hook.signingSecret];assert.ok(secrets.every(Boolean));
  const confirm=async({destinationIds=[contact.id],fallback,contactSettings}={})=>{
   const monitor=await f.monitor({runners:[f.first],canary:true});
   const input={scope:'monitor',mode:'selected',destinationIds,expectedRevision:0,...(fallback?{fallback}:{}),...(contactSettings?{contactSettings}:{})};
   const route=`/api/monitors/${monitor.id}/alert-route`,plan=await ok(route+'/preview',input);await ok(route+'/apply',{...input,digest:plan.digest});
   if(fallback)assert.deepEqual(plan.fallback.map(c=>c.id),fallback.destinationIds,'the reviewed preview names the ordered fallback chain');
   const task=await f.claim(f.first);assert.equal(task.monitorId,monitor.id);
   assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
   await f.pause(monitor);
   return monitor;
  };
  const rpc=async(_path,body)=>{const result=await f.request('/api/runner/notifications',{body,runner:f.first});assert.equal(result.status,200);return result.data};
  const receipts=[],incidents=new Set();let responses=[{status:500,headers:{}},{status:429,headers:{'retry-after':'3'}},{status:202,headers:{}}];
  const edge={sent:[],slack:'dead',hookResponses:[],async send(wire,beforeRequest){await beforeRequest();
   edge.sent.push({url:wire.url,id:wire.headers['webhook-id'],body:wire.body});
   if(wire.url.startsWith('https://hooks.slack.com/')){if(edge.slack==='timeout'){await sleep(200);throw Object.assign(Error('The operation timed out'),{name:'TimeoutError'})}return {status:404,headers:{},body:'no_team'}}
   if(wire.url.startsWith('https://escalation.example.com/'))return {...(edge.hookResponses.shift()??{status:202,headers:{}}),body:''};
   const response=responses.shift();assert.ok(response,'unexpected extra send');receipts.push({at:Date.now(),id:wire.headers['webhook-id'],body:wire.body});if(response.status>=500||response.status===202)incidents.add(JSON.parse(wire.body).dedup_key);return {...response,body:''};
  }};
  // The retried primary also names a fallback contact: past its 5-second deadline the email goes out, then the primary is accepted late.
  const monitor=await confirm({fallback:{destinationIds:[email.id],deadlineSeconds:5}});await dispatchNotifications(rpc,edge);
  let delivery=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===monitor.id);
  assert.equal(delivery.state,'queued');assert.equal(delivery.attempts,1);assert.equal(delivery.attemptHistory.length,2);assert.equal(incidents.size,1,'the receiver stored the incident before its uncertain 500 response');
  const firstStart=delivery.attemptHistory[0].started_at;
  let scheduled=delivery.attemptHistory[1].scheduled_at;assert.ok(scheduled-delivery.attemptHistory[0].finished_at>=800&&scheduled-delivery.attemptHistory[0].finished_at<=1200,'stored jitter is bounded independently of RPC latency');
  await restart();
  if(Date.now()<scheduled){await dispatchNotifications(rpc,edge);assert.equal(receipts.length,1)}
  await sleep(scheduled-Date.now()+20);await dispatchNotifications(rpc,edge);
  delivery=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===monitor.id&&d.destinationId===contact.id);
  scheduled=delivery.attemptHistory[2].scheduled_at;assert.equal(delivery.attempts,2);assert.equal(delivery.attemptHistory[1].retry_after_seconds,3);
  await dispatchNotifications(rpc,edge);assert.equal(receipts.length,2,'Retry-After forbids an immediate retry');
  await sleep(Math.max(scheduled,firstStart+5000)-Date.now()+20);await dispatchNotifications(rpc,edge);
  const rows=(await ok('/api/notifications')).deliveries.filter(d=>d.event.monitorId===monitor.id);
  delivery=rows.find(d=>d.destinationId===contact.id);const late=rows.find(d=>d.destinationId===email.id);
  assert.equal(delivery.state,'accepted');assert.equal(delivery.attempts,3);assert.equal(incidents.size,1);assert.equal(new Set(receipts.map(r=>r.id)).size,1);assert.equal(new Set(receipts.map(r=>r.body)).size,1);assert.ok(receipts[2].at-receipts[1].at>=3000);
  for(const a of delivery.attemptHistory){assert.equal(a.key_reference,delivery.eventId);assert.equal(a.phase,'retry');assert.ok(a.started_at>=a.scheduled_at);assert.ok(a.finished_at>=a.started_at)}
  assert.equal(late.state,'accepted');assert.equal(mail.records.filter(r=>r.deliveryId===late.id).length,1);assert.ok(late.attemptHistory[0].started_at>=firstStart+5000);
  assert.equal(late.chain.after[0].outcome,'uncertain');assert.equal(late.chain.after[0].stateNow,'accepted','a late primary acceptance is shown, and does not recall the fallback');
  assert.deepEqual(delivery.chain.fallbacks,[{id:late.id,destinationName:'On-call email',state:'accepted'}]);
  await ok('/api/notifications/preferences',{retryPolicy:{maxAttempts:1,windowMs:600000}},'PATCH');
  responses=[{status:500,headers:{}}];const capped=await confirm();await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
  const capRow=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===capped.id);assert.equal(capRow.state,'rejected');assert.equal(capRow.code,'retry_attempts_exhausted');assert.equal(capRow.attempts,1);
  await ok('/api/notifications/preferences',{retryPolicy:{maxAttempts:6,windowMs:600000}},'PATCH');
  console.log('RETRY_PROOF stored retry, stable ID, Retry-After, restart and late primary acceptance passed');
  for(const status of [400,408]){
   responses=[{status,headers:{}}];const rejected=await confirm();await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
   const row=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===rejected.id);assert.equal(row.state,'rejected');assert.equal(row.status,status);assert.equal(row.attempts,1);
  }
  await ok('/api/notifications/preferences',{retryPolicy:{maxAttempts:6,windowMs:1000}},'PATCH');
  responses=[{status:429,headers:{'retry-after':'86401'}}];const exhausted=await confirm({fallback:{destinationIds:[email.id],deadlineSeconds:120},contactSettings:{[email.id]:{delayMinutes:1}}});await dispatchNotifications(rpc,edge);
  const row=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===exhausted.id);assert.equal(row.state,'rejected');assert.equal(row.code,'retry_window_exhausted');assert.equal(row.status,429);assert.equal(row.attempts,1);assert.equal(row.attemptHistory[0].retry_after_seconds,86401,'long Retry-After remains audited');
  await dispatchNotifications(rpc,edge);
  const started=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===exhausted.id&&d.destinationId===email.id);
  assert.deepEqual(started.event.fallbackContext.previous.map(p=>[p.outcome,p.code]),[['failed','retry_window_exhausted']],'an exhausted retry window starts the fallback');
  // The fallback contact's own ROUTING-002 delay still applies: created now, held until confirmation + 1 minute.
  await dispatchNotifications(rpc,edge);const held=(await ok('/api/notifications')).deliveries.find(d=>d.id===started.id);
  assert.equal(held.state,'queued');assert.equal(held.code,'waiting_for_contact_delay');assert.equal(mail.records.filter(r=>r.deliveryId===started.id).length,0);
  // A delivery that wakes after its window must not submit a stale retry.
  await ok('/api/notifications/preferences',{retryPolicy:{maxAttempts:6,windowMs:2000}},'PATCH');responses=[{status:500,headers:{}}];const overdue=await confirm();await dispatchNotifications(rpc,edge);
  const count=receipts.length;await sleep(2100);await dispatchNotifications(rpc,edge);assert.equal(receipts.length,count);
  assert.equal((await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===overdue.id).code,'retry_window_exhausted');
  await ok('/api/notifications/preferences',{retryPolicy:{maxAttempts:6,windowMs:600000}},'PATCH');
  console.log('RETRY_PROOF client stop, owner cap and absolute window passed');
  const chain=await proveFallbackChains({f,ok,rpc,edge,mail,confirm,restart,destinations:{slack,email,hook}});
  // The stored fallback delay completes once after restart, using the original confirmation clock.
  await restart();await sleep(held.event.observedAt+60000-Date.now()+50);
  await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
  const delayed=(await ok('/api/notifications')).deliveries.find(d=>d.id===held.id);
  assert.equal(delayed.state,'accepted');assert.equal(mail.records.filter(r=>r.deliveryId===held.id).length,1);
  assert.ok(delayed.attemptHistory[0].started_at>=held.event.observedAt+60000);
  await proveQuietFallback({ok,rpc,edge,mail,confirm,restart,destinations:{slack,email,hook},inspect:inspectQuiet?state=>inspectQuiet({origin:f.origin,bindings:f.bindings,...state}):undefined});
  if(typeof inspect==='function')await inspect({origin:f.origin,bindings:f.bindings,acceptedId:delivery.id,failedId:row.id,...chain});
  const echo=await proveEchoCustody({f,ok,rpc,inspectEcho,database:await (restarted??f.worker).getD1Database('DB')});
  // Body-free custody: attempts, console and archive carry neither a signing credential nor the signed request body.
  const archive=await ok('/api/archive'),stored=archive.payload.productTables.notification_delivery_attempts,overview=await ok('/api/notifications');
  const bodies=[...new Set([...receipts.map(r=>r.body),...echo.bodies])];secrets.push(...echo.secrets);
  for(const value of [archive,overview,stored,overview.deliveries.flatMap(d=>d.attemptHistory)]){const found=strings(value);for(const forbidden of [...secrets,...bodies])assert.ok(!found.some(text=>text.includes(forbidden)),'no signing credential or webhook body')}
  assert.ok(archive.payload.productTables.integration_deliveries.every(d=>{const envelope=JSON.parse(d.envelope);return envelope.protocol==='webhook'?!Object.hasOwn(envelope,'body'):typeof envelope.body==='string'}),'webhook envelopes are body-free; Slack retains its historical message');
  assert.ok(stored.length>=12);assert.ok(stored.some(a=>a.phase==='fallback')&&stored.some(a=>a.delivery_id===late.id),'email and fallback attempts are durable records');
  const restoredPort=(await availablePorts(1)).find(port=>port!==Number(new URL(f.origin).port));assert.ok(restoredPort);
  const restoredOrigin=`http://127.0.0.1:${restoredPort}`,restoreAPI=ownerAPI(restoredOrigin);
  ({worker:restored}=await migratedWorker({port:restoredPort,persist:join(f.directory,'restore'),bindings:f.bindings}));await restoreAPI.signIn(f.bindings);
  assert.equal((await restoreAPI.api('/api/restore','POST',archive)).status,200);
  const after=(await restoreAPI.api('/api/archive')).data;echo.assertArchive(after);assert.deepEqual(after.payload.productTables.notification_delivery_attempts,stored);
  assert.deepEqual(after.payload.productTables.integration_deliveries.map(d=>d.envelope),archive.payload.productTables.integration_deliveries.map(d=>d.envelope));
  assert.ok((await restoreAPI.api('/api/notifications')).data.deliveries.every(d=>d.state==='imported-inactive'),'restored fallback history never replays');
  console.log('RETRY_PROOF inactive attempt archive restore passed; durable attempts='+stored.length);
  await restored.dispose();restored=null;
  // A genuine pre-migration archive carries each envelope's body and no attempt table.
  const legacy=structuredClone(archive),sentEnvelopes=new Map((await (await (restarted??f.worker).getD1Database('DB')).prepare("SELECT id,envelope FROM integration_deliveries").all()).results.map(r=>[r.id,JSON.parse(r.envelope).body]));
  legacy.payload.extensionVersion=9;delete legacy.payload.productTables.notification_delivery_attempts;
  for(const d of legacy.payload.productTables.integration_deliveries){const e=JSON.parse(d.envelope);d.envelope=JSON.stringify({...e,body:sentEnvelopes.get(d.id)})}
  legacy.sha256=createHash('sha256').update(JSON.stringify(legacy.payload)).digest('hex');
  ({worker:restored}=await migratedWorker({port:restoredPort,persist:join(f.directory,'legacy-restore'),bindings:f.bindings}));await restoreAPI.signIn(f.bindings);
  assert.equal((await restoreAPI.api('/api/restore','POST',legacy)).status,200);
  const legacyAfter=(await restoreAPI.api('/api/archive')).data;
  assert.deepEqual(legacyAfter.payload.productTables.integration_attempts,archive.payload.productTables.integration_attempts,'pre-migration archives preserve every historical attempt');
  assert.deepEqual(legacyAfter.payload.productTables.integration_deliveries.map(d=>d.envelope),archive.payload.productTables.integration_deliveries.map(d=>d.envelope),'a pre-migration body re-exports as the same body-free delivery');
  assert.deepEqual(legacyAfter.payload.productTables.notification_delivery_attempts,[],'restore never invents dispatch schedules');
  // Erasing a destination removes its attempts and every fallback alert that names it.
  const jobs=archive.payload.productTables.notification_jobs,names=(job,id)=>JSON.parse(job.event).fallbackContext?.previous.some(p=>p.destinationId===id);
  for(const erased of [contact,slack,echo.contact]){
   const dependent=new Set(jobs.filter(j=>j.destination_id===erased.id||names(j,erased.id)).map(j=>j.id));
   const receipt=(await ok(`/api/notifications/destinations/${erased.id}`,undefined,'DELETE')).receipt;
   const left=(await ok('/api/archive')).payload.productTables;
   assert.ok(dependent.size>1);assert.ok(!left.notification_jobs.some(j=>dependent.has(j.id)),'fallback alerts naming an erased contact go with it');
   assert.ok(!left.notification_delivery_attempts.some(a=>dependent.has(a.delivery_id)));assert.ok(receipt.counts.notification_delivery_attempts>=dependent.size);
  }
  assert.ok(!(await ok('/api/archive')).payload.productTables.notification_delivery_attempts.some(a=>a.destination_id===contact.id||a.destination_id===slack.id));
 }finally{await restored?.dispose();await restarted?.dispose();await f.close()}
}
