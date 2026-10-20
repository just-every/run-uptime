import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fixture as retryFixture} from './resilience/support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {notificationRetryTime} from '../src/domain/notification-retry.ts';
import {availablePorts,migratedWorker,ownerAPI} from './notify-acceptance-runtime.mjs';
// Public owner/runner doors with fakes only at the receiver edge.
export async function proveNotificationRetry(){
 const f=await retryFixture();let restarted,restored;
 try{
  const ok=async(path,body,method)=>{const result=await f.request(path,{body,...(method?{method}:{})});assert.ok(result.status>=200&&result.status<300,`${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};
  assert.deepEqual((await ok('/api/notifications')).preferences.retryPolicy,{maxAttempts:6,windowMs:600000});
  const shape={attempts:1,max_attempts:6,created_at:0,window_ms:600000};
  assert.equal(notificationRetryTime(shape,{kind:'uncertain'},1000,()=>0).nextAt,1800);
  assert.equal(notificationRetryTime(shape,{kind:'uncertain'},1000,()=>1).nextAt,2200);
  assert.equal(notificationRetryTime(shape,{kind:'retryable',retryAfterMs:3000},1000,()=>0).nextAt,4000);
  const contact=await ok('/api/notifications/destinations',{name:'Deduplicating receiver',kind:'webhook',url:'https://retry.example.com/incident'});
  const confirm=async()=>{
   const monitor=await f.monitor({runners:[f.first],canary:true});
   const input={scope:'monitor',mode:'selected',destinationIds:[contact.id],expectedRevision:0};
   const route=`/api/monitors/${monitor.id}/alert-route`,plan=await ok(route+'/preview',input);await ok(route+'/apply',{...input,digest:plan.digest});
   const task=await f.claim(f.first);assert.equal(task.monitorId,monitor.id);
   assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
   await f.pause(monitor);
   return monitor;
  };
  const rpc=async(_path,body)=>{const result=await f.request('/api/runner/notifications',{body,runner:f.first});assert.equal(result.status,200);return result.data};
  const receipts=[],incidents=new Set();let responses=[{status:500,headers:{}},{status:429,headers:{'retry-after':'3'}},{status:202,headers:{}}];
  const edge={async send(wire){const response=responses.shift();assert.ok(response,'unexpected extra send');receipts.push({at:Date.now(),id:wire.headers['webhook-id'],body:wire.body});if(response.status===202)incidents.add(wire.headers['webhook-id']);return {...response,body:''}}};
  const monitor=await confirm();await dispatchNotifications(rpc,edge);
  let delivery=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===monitor.id);
  assert.equal(delivery.state,'queued');assert.equal(delivery.attempts,1);assert.equal(delivery.attemptHistory.length,2);
  let scheduled=delivery.attemptHistory[1].scheduled_at;assert.ok(scheduled-receipts[0].at>=790&&scheduled-receipts[0].at<=1400);
  await f.worker.dispose();restarted=await startLocalWorker({persist:f.directory,port:Number(new URL(f.origin).port),bindings:f.bindings});await restarted.ready;
  if(Date.now()<scheduled){await dispatchNotifications(rpc,edge);assert.equal(receipts.length,1)}
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,scheduled-Date.now()+20)));await dispatchNotifications(rpc,edge);
  delivery=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===monitor.id);
  scheduled=delivery.attemptHistory[2].scheduled_at;assert.equal(delivery.attempts,2);assert.equal(delivery.attemptHistory[1].retry_after_seconds,3);
  await dispatchNotifications(rpc,edge);assert.equal(receipts.length,2,'Retry-After forbids an immediate retry');
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,scheduled-Date.now()+20)));await dispatchNotifications(rpc,edge);
  delivery=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===monitor.id);
  assert.equal(delivery.state,'accepted');assert.equal(delivery.attempts,3);assert.equal(incidents.size,1);assert.equal(new Set(receipts.map(r=>r.id)).size,1);assert.equal(new Set(receipts.map(r=>r.body)).size,1);assert.ok(receipts[2].at-receipts[1].at>=3000);
  for(const a of delivery.attemptHistory){assert.equal(a.key_reference,delivery.eventId);assert.equal(a.phase,'retry');assert.ok(a.started_at>=a.scheduled_at);assert.ok(a.finished_at>=a.started_at)}
  await ok('/api/notifications/preferences',{retryPolicy:{maxAttempts:1,windowMs:600000}},'PATCH');
  responses=[{status:500,headers:{}}];const capped=await confirm();await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
  const capRow=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===capped.id);assert.equal(capRow.state,'rejected');assert.equal(capRow.code,'retry_attempts_exhausted');assert.equal(capRow.attempts,1);
  await ok('/api/notifications/preferences',{retryPolicy:{maxAttempts:6,windowMs:600000}},'PATCH');
  for(const status of [400,408]){
   responses=[{status,headers:{}}];const rejected=await confirm();await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
   const row=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===rejected.id);assert.equal(row.state,'rejected');assert.equal(row.status,status);assert.equal(row.attempts,1);
  }
  await ok('/api/notifications/preferences',{retryPolicy:{maxAttempts:6,windowMs:1000}},'PATCH');
  responses=[{status:429,headers:{'retry-after':'5'}}];const exhausted=await confirm();await dispatchNotifications(rpc,edge);
  const row=(await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===exhausted.id);assert.equal(row.state,'rejected');assert.equal(row.code,'retry_window_exhausted');assert.equal(row.status,429);assert.equal(row.attempts,1);
  // A delivery that wakes after its window must not submit a stale retry.
  await ok('/api/notifications/preferences',{retryPolicy:{maxAttempts:6,windowMs:2000}},'PATCH');responses=[{status:500,headers:{}}];const overdue=await confirm();await dispatchNotifications(rpc,edge);
  const count=receipts.length;await new Promise(resolve=>setTimeout(resolve,2100));await dispatchNotifications(rpc,edge);assert.equal(receipts.length,count);
  assert.equal((await ok('/api/notifications')).deliveries.find(d=>d.event.monitorId===overdue.id).code,'retry_window_exhausted');
  const archive=await ok('/api/archive'),stored=archive.payload.productTables.notification_delivery_attempts;
  assert.ok(stored.length>=8);assert.ok(!JSON.stringify(stored).includes(contact.signingSecret));assert.ok(!JSON.stringify(stored).includes(receipts[0].body));
  const restoredPort=(await availablePorts(1)).find(port=>port!==Number(new URL(f.origin).port));assert.ok(restoredPort);
  const restoredOrigin=`http://127.0.0.1:${restoredPort}`,restoreAPI=ownerAPI(restoredOrigin);
  ({worker:restored}=await migratedWorker({port:restoredPort,persist:join(f.directory,'restore'),bindings:f.bindings}));await restoreAPI.signIn(f.bindings);
  assert.equal((await restoreAPI.api('/api/restore','POST',archive)).status,200);
  const after=(await restoreAPI.api('/api/archive')).data;assert.deepEqual(after.payload.productTables.notification_delivery_attempts,stored);
  await restored.dispose();restored=null;
  const legacy=structuredClone(archive);legacy.payload.extensionVersion=9;delete legacy.payload.productTables.notification_delivery_attempts;legacy.sha256=createHash('sha256').update(JSON.stringify(legacy.payload)).digest('hex');
  ({worker:restored}=await migratedWorker({port:restoredPort,persist:join(f.directory,'legacy-restore'),bindings:f.bindings}));await restoreAPI.signIn(f.bindings);
  assert.equal((await restoreAPI.api('/api/restore','POST',legacy)).status,200);
  const legacyAfter=(await restoreAPI.api('/api/archive')).data;
  assert.deepEqual(legacyAfter.payload.productTables.integration_attempts,archive.payload.productTables.integration_attempts,'pre-migration archives preserve every historical attempt');
  assert.deepEqual(legacyAfter.payload.productTables.notification_delivery_attempts,[],'restore never invents dispatch schedules');
  const erased=await ok(`/api/notifications/destinations/${contact.id}`,undefined,'DELETE');assert.equal(erased.receipt.counts.notification_delivery_attempts,stored.length);
  assert.deepEqual((await ok('/api/archive')).payload.productTables.notification_delivery_attempts,[]);
 }finally{await restored?.dispose();await restarted?.dispose();await f.close()}
}
