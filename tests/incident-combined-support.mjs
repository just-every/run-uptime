import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './resilience/support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {migratedWorker} from './notify-acceptance-runtime.mjs';
import {signInOwner} from './auth-test-support.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {main as incidentCommand} from '../scripts/incidents.mjs';

// One real correlated incident lifecycle, shared by the existing API and browser
// registrations. Only the destination network edge supplies artificial outcomes.
export async function proveCombinedIncident(inspect=async()=>{}){
 const f=await fixture();let restarted,restored;const archiveDirectory=await mkdtemp(join(tmpdir(),'uptime-combined-'));
 const ok=async(path,options={})=>{const r=await f.request(path,options);assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
 const restart=async()=>{await(restarted??f.worker).dispose();restarted=await startLocalWorker({persist:f.directory,port:Number(new URL(f.origin).port),bindings:f.bindings});await restarted.ready;f.DB=await restarted.getD1Database('DB')};
 try{
  const dependency=await f.monitor({name:'synthetic-uptime-401',enabled:false,runners:[f.first],canary:true});
  const primary=await ok('/api/notifications/destinations',{body:{name:'synthetic-uptime-402',kind:'slack',url:'https://hooks.slack.com/services/synthetic-uptime-402/synthetic-uptime-403/synthetic-uptime-404'}});
  const fallback=await ok('/api/notifications/destinations',{body:{name:'synthetic-uptime-403',kind:'webhook',url:'https://fallback.example.com/synthetic-uptime-403'}});
  const monitors=[];
  for(const n of [404,405]){
   const m=await f.monitor({name:`synthetic-uptime-${n}`,group:'synthetic-uptime-406',dependencies:[dependency.id],runners:[f.first],canary:true,enabled:false});monitors.push(m);
   const route={scope:'monitor',mode:'selected',destinationIds:[primary.id],fallback:{destinationIds:[fallback.id],deadlineSeconds:30},expectedRevision:0,contactSettings:{[primary.id]:{repeatMinutes:1,maxRepeats:2,stopOnAck:n===405}}};
   const preview=await ok(`/api/monitors/${m.id}/alert-route/preview`,{body:route});await ok(`/api/monitors/${m.id}/alert-route/apply`,{body:{...route,digest:preview.digest}});
   await ok('/api/monitors/'+m.id,{method:'PATCH',body:{...m.definition,enabled:true}});
  }
  for(const m of monitors){const task=await f.claim(f.first);assert.equal(task.monitorId,m.id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200)}
  const ids=await Promise.all(monitors.map(async m=>(await ok('/api/monitors/'+m.id+'/incidents'))[0].id)),path=i=>'/api/v1/incidents/'+encodeURIComponent(ids[i]);
  const receipts=[];let lost=false;
  const edge={async send(wire,beforeRequest){await beforeRequest();const body=wire.url.includes('fallback.example.com')?JSON.parse(wire.body):null;receipts.push({at:Date.now(),url:wire.url,event:body});
   if(!lost&&wire.url.includes('hooks.slack.com')){lost=true;throw Object.assign(Error('Synthetic response lost after acceptance'),{name:'TimeoutError'})}
   return {status:200,headers:{},body:wire.url.includes('hooks.slack.com')?'ok':''};
  }};
  const rpc=async(_path,body)=>{const r=await f.request('/api/runner/notifications',{runner:f.first,body});assert.equal(r.status,200);return r.data};
  await dispatchNotifications(rpc,edge);
  let first=await ok(path(0));assert.deepEqual(first.dependencies.group.map(row=>row.incidentId),[ids[1]]);
  const deliveries=async()=> (await ok('/api/notifications')).deliveries;
  const uncertain=(await deliveries()).find(row=>row.event.monitorId===monitors[0].id&&row.destinationId===primary.id&&row.event.kind==='trigger');assert.equal(uncertain.state,'uncertain');
  const deadline=uncertain.attemptHistory[0].started_at+30000;
  first=await ok(path(0));assert.equal(first.nextDueKind,'escalation');assert.equal(first.nextDue,deadline);
  const cli=await incidentCommand(['--origin',f.origin,'read','--id',ids[0]],{UPTIME_ACCESS_COOKIE:f.cookie});assert.equal(cli.nextDue,deadline);assert.equal(cli.nextDueKind,'escalation');
  await inspect({f,monitors,ids,phase:'escalation',detail:first});
  await ok('/api/incidents/'+encodeURIComponent(ids[0])+'/actions',{body:{kind:'acknowledge',version:first.version}});
  assert.equal((await ok(path(1))).status,'acknowledged');
  await restart();first=await ok(path(0));assert.equal(first.nextDue,deadline,'restart retains the owner-set fallback deadline');
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,deadline-Date.now()+100)));
  await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
  first=await ok(path(0));assert.ok(first.timeline.some(row=>row.kind==='escalation_attempt'));assert.ok(first.timeline.some(row=>row.kind==='escalation_outcome'&&row.data.outcome));
  const due=first.nextDue;assert.equal(first.nextDueKind,'reminder');assert.equal(due,first.startedAt+60000);
  await inspect({f,monitors,ids,phase:'reminder',detail:first});
  await restart();await new Promise(resolve=>setTimeout(resolve,Math.max(0,due-Date.now()+100)));
  await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
  let rows=await deliveries();const reminders=rows.filter(row=>row.event.monitorId===monitors[0].id&&row.event.kind==='reminder');
  assert.equal(new Set(reminders.map(row=>row.eventId)).size,1,'one event for the due reminder');assert.equal(reminders.length,1);assert.equal(reminders[0].attempts,1);
  assert.equal(rows.filter(row=>row.event.monitorId===monitors[1].id&&row.event.kind==='reminder').length,0,'group acknowledgement stops only the selected stop-on-ack route');
  assert.equal(rows.find(row=>row.id===uncertain.id).state,'uncertain');assert.equal(rows.find(row=>row.id===uncertain.id).attempts,1,'the lost response never causes replay');
  assert.equal(receipts.filter(row=>row.url.includes('fallback.example.com')).length,1,'fallback sends once across both restarts');
  for(const monitor of monitors)await f.pause(monitor);
  const recover=async(i)=>{f.modes.target=200;await ok('/api/monitors/'+monitors[i].id,{method:'PATCH',body:{...monitors[i].definition,enabled:true}});await f.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitors[i].id).run();const task=await f.claim(f.first);assert.equal(task.monitorId,monitors[i].id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);await f.pause(monitors[i])};
  await recover(0);assert.equal((await ok(path(0))).machineState,'recovered');assert.equal((await ok(path(1))).machineState,'open');
  await inspect({f,monitors,ids,phase:'one-recovered',detail:await ok(path(0))});
  await recover(1);assert.equal((await ok(path(1))).machineState,'recovered');
  await dispatchNotifications(rpc,edge);await restart();const before=receipts.length;await dispatchNotifications(rpc,edge);assert.equal(receipts.length,before,'resolution and resume add no duplicate send');
  first=await ok(path(0));const escalationEntries=first.timeline.filter(row=>row.kind.startsWith('escalation_'));
  assert.ok(escalationEntries.every(row=>row.at>0&&row.actor.displayName==='Router'));
  const archive=await ok('/api/archive');({worker:restored}=await migratedWorker({persist:archiveDirectory,bindings:f.bindings}));const origin=(await restored.ready).origin,cookie=await signInOwner(origin,{bindings:f.bindings});
  const response=await fetch(origin+'/api/restore',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({archive})});assert.equal(response.status,200);
  const restoredDetail=await(await fetch(origin+path(0),{headers:{cookie}})).json();assert.deepEqual(restoredDetail.timeline.filter(row=>row.kind.startsWith('escalation_')),escalationEntries,'inactive restore retains escalation attempts and outcomes without rewriting them');
  console.log('FOLLOWUP-001 combined PASS: correlated dependency/group, policy-selected acknowledgment, restart before deadline and due reminder, lost-response uncertainty without replay, exact next kinds/times, one-child recovery, resolution and inactive escalation restore.');
 }finally{await restored?.dispose();await restarted?.dispose();await f.close();await rm(archiveDirectory,{recursive:true,force:true})}
}
