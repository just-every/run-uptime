// ROUTING-002: real scheduled confirmation, wall-clock delay and reminders.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {fixture} from './resilience/support.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {contactSlackEdge,assertSlackConfirmation} from './contact-schedules-support.mjs';

test('contact schedules send Slack at confirmation, survive restart, stop on recovery and acknowledgment, and never replay uncertain attempts',{timeout:190000},async()=>{
 const f=await fixture();let restarted,slack;
 try{
  slack=await contactSlackEdge();
  const ok=async(path,body,options={})=>{const r=await f.request(path,{...options,...(body===undefined?{}:{body})});assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
  const contacts=[];
  for(const name of ['Operations now','Escalation delayed','No recovery','Stop on acknowledgement'])contacts.push(await ok('/api/notifications/destinations',{name,kind:contacts.length===0?'slack':'webhook',url:contacts.length===0?slack.url:`https://alerts.example.com/${contacts.length}`}));
  const monitor=await f.monitor({name:'Checkout API',runners:[f.first],canary:true}),fast=await f.monitor({name:'Short outage',runners:[f.first],canary:true});
  const route=id=>`/api/monitors/${id}/alert-route`;
  const settings=Object.fromEntries(contacts.map((c,i)=>[c.id,{delayMinutes:i===1||i===3?1:0,repeatMinutes:i===1||i===3?1:0,maxRepeats:1,recovery:i!==2,stopOnAck:i===3}]));
  for(const m of [monitor,fast]){
   const input={scope:'monitor',mode:'selected',destinationIds:contacts.map(c=>c.id),contactSettings:settings,expectedRevision:0};
   const plan=await ok(route(m.id)+'/preview',input);assert.deepEqual(plan.recipients.find(d=>d.id===contacts[1].id).contactSettings,settings[contacts[1].id]);
   assert.equal(plan.recipients.find(d=>d.id===contacts[0].id).kind,'slack');assert.deepEqual(plan.recipients.find(d=>d.id===contacts[0].id).contactSettings,settings[contacts[0].id]);
   await ok(route(m.id)+'/apply',{...input,digest:plan.digest});
  }
  const bad={scope:'monitor',mode:'selected',destinationIds:[contacts[0].id],expectedRevision:1,contactSettings:{[contacts[0].id]:{delayMinutes:-1}}};
  assert.equal((await f.request(route(monitor.id)+'/preview',{body:bad})).status,400);
  for(const source of ['uptimerobot','pingdom']){
   const document=JSON.stringify(source==='uptimerobot'?{assignedAlertContacts:[{alertContactId:123,threshold:10,recurrence:30}]}:{check:{integrationids:[123],resolution:1,sendnotificationwhendown:10,notifyagainevery:30,notifywhenbackup:true}});
   const plan=await ok(route(monitor.id)+'/import-preview',{source,document,contactMap:{123:contacts[1].id},scope:'monitor',expectedRevision:1});
   assert.equal(plan.input.contactSettings[contacts[1].id].delayMinutes,10);assert.equal(plan.input.contactSettings[contacts[1].id].repeatMinutes,30);
  }
  for(let i=0;i<2;i++){const task=await f.claim(f.first);assert.ok(task);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200)}
  const received=[],transport={async send(wire,beforeRequest){if(wire.url===slack.url)return slack.transport.send(wire,beforeRequest);await beforeRequest();const event=JSON.parse(wire.body);received.push({url:wire.url,event});return {status:wire.url.endsWith('/1')&&event.kind==='reminder'?500:200,headers:{},body:''}}};
  const rpc=async(_path,body)=>ok('/api/runner/notifications',body,{runner:f.first});
  await dispatchNotifications(rpc,transport);
  assert.equal(received.filter(r=>r.url.endsWith('/1')).length,0,'delay sends nothing at confirmation');
  const initial=await ok('/api/notifications'),trigger=initial.deliveries.find(j=>j.event.monitorId===monitor.id&&j.event.kind==='trigger').event;
  const immediate=initial.deliveries.find(j=>j.destinationId===contacts[0].id&&j.event.id===trigger.id);
  const delayed=initial.deliveries.find(j=>j.destinationId===contacts[1].id&&j.event.id===trigger.id);
  assert.equal((await f.state(monitor.id)).state,'Failing');
  assertSlackConfirmation(slack.receiver,immediate,await ok(`/api/monitors/${monitor.id}/history`),trigger.observedAt+60000);
  assert.equal(delayed.state,'queued');assert.equal(delayed.attempts,0);assert.equal(delayed.code,'waiting_for_contact_delay');
  const immediateCount=slack.receiver.records.length;assert.equal(immediateCount,2,'each scheduled outage sends its own immediate Slack notice');
  await dispatchNotifications(rpc,transport);
  assert.equal(slack.receiver.records.length,immediateCount,'an immediate second poll cannot duplicate Slack');
  assert.equal(received.filter(r=>r.url.endsWith('/1')).length,0,'the second poll cannot dispatch the delayed contact early');
  const repolled=(await ok('/api/notifications')).deliveries;
  assert.deepEqual(repolled.find(j=>j.id===immediate.id),immediate,'accepted Slack delivery and attempt remain durable');
  assert.deepEqual(repolled.find(j=>j.id===delayed.id),delayed,'the delayed contact remains unsent');
  assert.ok(Date.now()<trigger.observedAt+60000,'both immediate polls precede the delayed deadline');
  const followup=await ok(`/api/v1/incidents/${encodeURIComponent(trigger.id)}`);
  assert.equal(followup.nextDue,trigger.observedAt+60000,'next-due follows the exact confirmation-anchored delay');
  assert.equal(followup.nextDueKind,'notification');
  // Recover the short outage inside the one-minute delay through real scheduled work.
  f.modes.target=200;await new Promise(r=>setTimeout(r,5200));
  for(let i=0;i<2;i++){const task=await f.claim(f.first);if(!task)break;if(task.monitorId===fast.id)await f.submit(f.first,task,[await f.evidence(task)]);else{f.modes.target=503;await f.submit(f.first,task,[await f.evidence(task)]);f.modes.target=200}}
  await dispatchNotifications(rpc,transport);
  assert.ok(!received.some(r=>r.event.monitorId===fast.id&&r.url.endsWith('/1')));
  await ok(`/api/incidents/${encodeURIComponent(trigger.id)}/actions`,{kind:'acknowledge',version:0});
  // Recreate the Worker isolate while keeping its real durable D1 and sessions.
  await f.worker.dispose();restarted=await startLocalWorker({persist:f.directory,port:Number(new URL(f.origin).port),bindings:f.bindings});await restarted.ready;
  assert.deepEqual((await ok('/api/notifications')).deliveries.find(j=>j.id===immediate.id),immediate,'Slack acceptance survives Worker restart');
  const due=trigger.observedAt+60500;await new Promise(r=>setTimeout(r,Math.max(0,due-Date.now())));
  await dispatchNotifications(rpc,transport);
  assert.equal(received.filter(r=>r.event.monitorId===monitor.id&&r.url.endsWith('/1')&&r.event.kind==='trigger').length,1);
  assert.equal(received.filter(r=>r.event.monitorId===monitor.id&&r.url.endsWith('/3')&&r.event.kind==='trigger').length,1,'acknowledgement stops repeats while preserving a delayed initial notice for an open incident');
  assert.equal(received.filter(r=>r.event.monitorId===monitor.id&&r.url.endsWith('/3')&&r.event.kind==='reminder').length,0,'selected acknowledgement policy stops reminders');
  await new Promise(r=>setTimeout(r,Math.max(0,trigger.observedAt+120500-Date.now())));
  await dispatchNotifications(rpc,transport);await dispatchNotifications(rpc,transport);
  const reminders=received.filter(r=>r.event.monitorId===monitor.id&&r.url.endsWith('/1')&&r.event.kind==='reminder');assert.equal(reminders.length,1);assert.equal(reminders[0].event.incidentKey,trigger.incidentKey);
  const rows=(await ok('/api/notifications')).deliveries;assert.equal(rows.find(j=>j.event.id===reminders[0].event.id).state,'queued','signed reminders reuse their stable key on bounded transport retries');
  const archived=await f.request('/api/archive');assert.equal(archived.status,200,JSON.stringify(archived.data));
  assert.ok(!received.some(r=>r.event.monitorId===fast.id&&r.url.endsWith('/1')),'early recovery suppresses delayed trigger and recovery');
 }finally{await restarted?.dispose();await f.close();await slack?.receiver.close()}
});
