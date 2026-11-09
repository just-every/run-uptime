// AGENT-004: with the company's consent, scheduled drills run inside the drill window and the per-day bound, an expired
// credential is found, an unconfirmed drill chases the route owner once per reminder policy, and the unresolved gaps become
// route proposals that change nothing until a person decides. Real Worker/D1, the production runner and the Worker's own
// scheduled handler; fakes only at the SendGrid edge.
import {testAuthBindings} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {runRunner} from '../runners/src/private-runner.mjs';
import {acceptanceReceiver} from './notify-acceptance-receivers.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory,ownerAPI,waitFor} from './notify-acceptance-runtime.mjs';

const key='route-accountability-runner-local-only-20261108';
const directory=await runtimeDirectory(),[controlPort,mailPort]=await availablePorts(2);
const origin=`http://127.0.0.1:${controlPort}`,grantPath=join(directory,'grant.json');
const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:key,MAIL_PROVIDER:'sendgrid',MAIL_FROM:'qa-sender@example.com',SENDGRID_API_KEY:'synthetic-uptime-route-accountability'};
const {api,signIn}=ownerAPI(origin);let worker,DB,mail;
const ok=async(path,method='GET',body)=>{const result=await api(path,method,body);assert.ok(result.status>=200&&result.status<300,`${method} ${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};
const runOnce=()=>runRunner({origin,key,grantPath,localReview:true,once:true});
const scheduled=async()=>assert.equal((await(await worker.getWorker()).scheduled()).outcome,'ok');
const report=()=>ok('/api/route-accountability');
const sentTo=address=>mail.records.filter(r=>r.body.personalizations[0].to[0].email===address);
const text=record=>record.body.content.find(item=>item.type==='text/plain').value;
const count=async(sql,...values)=>(await DB.prepare(sql).bind(...values).first()).n;
const policy=(revision,window,extra={})=>({enabled:true,windowDays:[0,1,2,3,4,5,6],windowStartHour:window[0],windowEndHour:window[1],intervalDays:1,maxDrillsPerDay:1,reminder:{afterHours:0,repeatHours:1,max:2},expectedRevision:revision,...extra});
const ownerMail=bindings.OWNER_EMAIL;
try{
 mail=await acceptanceReceiver(mailPort,record=>{assert.equal(record.path,'/v3/mail/send')});
 ({worker,DB}=await migratedWorker({port:controlPort,persist:join(directory,'worker'),bindings,outboundService:async request=>{
  assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');
  const headers=new Headers(request.headers);for(const name of ['host','connection','transfer-encoding','content-length'])headers.delete(name);
  return fetch(`http://127.0.0.1:${mailPort}/v3/mail/send`,{method:request.method,headers,body:await request.arrayBuffer(),redirect:'error'})}}));
 await signIn(bindings);
 const destination=async(name,address)=>ok('/api/notifications/destinations','POST',{name,kind:'email',address});
 const primary=await destination('Primary inbox','qa-primary@example.test'),extra=await destination('Extra inbox','qa-extra@example.test'),standby=await destination('Standby inbox','qa-standby@example.test'),expiring=await destination('Expiring inbox','qa-expiring@example.test');
 const installation=async(destinationIds)=>{const current=await ok('/api/alert-route'),body={mode:'selected',destinationIds,contactSettings:Object.fromEntries(destinationIds.map(id=>[id,{delayMinutes:5}])),expectedRevision:current.revision},p=await ok('/api/alert-route/preview','POST',body);return ok('/api/alert-route/apply','POST',{...body,digest:p.digest})};
 await installation([primary.id,expiring.id]);
 // The standby inbox is proven by the owner's own drill, so it is a verified recipient outside the route.
 await ok(`/api/notifications/destinations/${standby.id}/drill`,'POST',{});await runOnce();await waitFor(async()=>sentTo('qa-standby@example.test').length===1,'standby drill delivered');
 const link=/Confirm you received it: (\S+)/.exec(text(sentTo('qa-standby@example.test')[0]))[1];
 assert.equal((await fetch(origin+'/alert-drill',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',origin},body:new URLSearchParams({token:new URL(link).searchParams.get('token')})})).status,200);
 const drills=()=>count('SELECT COUNT(*) n FROM alert_drills'),jobs=()=>count('SELECT COUNT(*) n FROM notification_jobs');
 assert.equal(await drills(),1);

 // signed-out callers cannot read or change the consent, and there is no consent yet: the schedule does nothing
 {
  assert.equal((await fetch(origin+'/api/route-accountability')).status,401);
  assert.equal((await fetch(origin+'/api/route-accountability',{method:'POST',headers:{'content-type':'application/json',origin},body:'{}'})).status,401);
  assert.equal((await report()).policy,null);await scheduled();assert.equal(await drills(),1,'no consent, no drill');
 }
 // consent for a window that excludes this hour starts no drill; an invalid window is refused
 {
  const hour=new Date().getUTCHours(),away=(hour+12)%24;
  assert.equal((await api('/api/route-accountability','POST',policy(0,[away,away+1],{windowStartHour:5,windowEndHour:5}))).status,400);
  const saved=await ok('/api/route-accountability','POST',policy(0,[away,away+1]));assert.equal(saved.enabled,true);assert.equal(saved.revision,1);
  await scheduled();assert.equal(await drills(),1,'outside the drill window no drill starts');
  assert.equal((await api('/api/route-accountability','POST',policy(0,[0,24]))).status,409,'a stale revision is refused');
 }
 // inside the window with one drill a day: one bounded drill, never to the expired destination or the proven one
 const expiredAt=Date.now()-60_000;
 await ok(`/api/route-accountability/destinations/${expiring.id}`,'POST',{credentialExpiresAt:expiredAt,ownerId:null});
 await ok('/api/route-accountability','POST',policy(1,[0,24]));
 await scheduled();await scheduled();
 const started=(await DB.prepare('SELECT t.drill_id,t.destination_id FROM route_accountability_drills t').all()).results;
 assert.deepEqual(started.map(r=>r.destination_id),[primary.id],'one scheduled drill, to the oldest destination due; the daily bound holds on a second pass');
 assert.equal(await count('SELECT COUNT(*) n FROM alert_drills WHERE destination_id=?',expiring.id),0,'the expired destination is never drilled');
 assert.equal(await count('SELECT COUNT(*) n FROM alert_drills WHERE destination_id=?',standby.id),1,'the destination proven within the interval is not drilled again');
 await runOnce();await waitFor(async()=>sentTo('qa-primary@example.test').length===1,'scheduled drill delivered');
 const drillMessage=text(sentTo('qa-primary@example.test')[0]);assert.match(drillMessage,/This is an alert drill, not an incident\./);
 {
  const row=(await report()).destinations.find(d=>d.id===primary.id);
  assert.equal(row.latestDrill.scheduled,true);assert.equal(row.latestDrill.providerAcknowledgment,'accepted');assert.equal(row.latestDrill.recipientConfirmation,'pending');assert.equal(row.proof.state,'never');
  assert.equal((await report()).destinations.find(d=>d.id===expiring.id).credential.state,'expired');
 }
 // the recipient never confirms: the drill expires, the owner is chased once now and not again before the repeat interval
 await DB.prepare('UPDATE alert_drills SET expires_at=? WHERE id=?').bind(Date.now()-1000,started[0].drill_id).run();
 await scheduled();await scheduled();
 const reminders=sentTo(ownerMail).filter(r=>r.body.subject==='Uptime alert route needs attention');assert.equal(reminders.length,1,'one due reminder to the route owner, never replayed');
 assert.equal(reminders[0].body.subject,'Uptime alert route needs attention');assert.match(text(reminders[0]),/"Primary inbox" did not confirm its scheduled alert drill\. This is reminder 1 of at most 2\./);
 assert.ok(!text(reminders[0]).includes('/alert-drill?token='),'the reminder carries no drill capability');
 assert.equal(sentTo('qa-primary@example.test').length,1,'the unconfirmed drill is never resent');
 const gap=await report(),primaryRow=gap.destinations.find(d=>d.id===primary.id);
 assert.equal(primaryRow.latestDrill.providerAcknowledgment,'accepted','the provider accepted the message');assert.equal(primaryRow.latestDrill.recipientConfirmation,'expired','the recipient never confirmed');
 assert.deepEqual(primaryRow.reminders.map(r=>[r.number,r.outcome]),[[1,'accepted']]);assert.equal(primaryRow.owner.id,(await DB.prepare('SELECT id FROM oa_operators WHERE email=?').bind(ownerMail).first()).id);
 // proposals carry the failed-channel evidence and the exact change, and nothing was applied or sent for them
 const proposals=gap.proposals;assert.equal(proposals.length,2);
 const missed=proposals.find(p=>p.destinationId===primary.id),lapsed=proposals.find(p=>p.destinationId===expiring.id);
 assert.deepEqual(Object.keys(missed.change.contactSettings),[expiring.id],'settings of the removed contact leave with it');assert.deepEqual(Object.keys(lapsed.change.contactSettings),[primary.id]);
 assert.equal(missed.reason,'drill_unconfirmed');assert.equal(missed.evidence.drill.confirmed,false);assert.equal(missed.evidence.drill.remindersSent,1);assert.equal(missed.change.add,standby.id);assert.deepEqual(missed.change.destinationIds.sort(),[expiring.id,standby.id].sort());
 assert.equal(lapsed.reason,'credential_expired');assert.equal(lapsed.evidence.credentialExpiresAt,expiredAt);assert.equal(lapsed.evidence.drill,null);assert.equal(lapsed.change.add,standby.id);assert.deepEqual(lapsed.change.destinationIds.sort(),[primary.id,standby.id].sort());
 const route=await ok('/api/alert-route');assert.deepEqual(route.destinationIds.sort(),[primary.id,expiring.id].sort(),'proposing changes no route');

 // a person declines: the route stays, nobody new is messaged, no job of any kind is added, and it is not proposed again
 {
  const before={route:route.revision,drills:await drills(),jobs:await jobs(),standby:sentTo('qa-standby@example.test').length,all:mail.records.length};
  assert.equal((await ok(`/api/route-accountability/proposals/${missed.id}/decision`,'POST',{decision:'decline'})).state,'declined');
  assert.equal((await api(`/api/route-accountability/proposals/${missed.id}/decision`,'POST',{decision:'approve'})).status,409,'a decided proposal cannot be decided again');
  await scheduled();await scheduled();
  assert.equal((await ok('/api/alert-route')).revision,before.route);assert.equal(await drills(),before.drills);assert.equal(await jobs(),before.jobs);
  assert.equal(sentTo('qa-standby@example.test').length,before.standby,'the standby recipient is not messaged');assert.equal(mail.records.length,before.all,'no message of any kind follows a decline');
  const after=await report();assert.equal(after.proposals.filter(p=>p.destinationId===primary.id).length,1,'the declined gap is not proposed again');assert.equal(after.phone.available,false);
  assert.equal(await count("SELECT COUNT(*) n FROM notification_jobs WHERE kind NOT IN('email','webhook','slack')"),0,'no phone work exists');
 }
 // a person approves the other: the route changes through the reviewed route door and only the one added recipient is drilled
 {
  const done=await ok(`/api/route-accountability/proposals/${lapsed.id}/decision`,'POST',{decision:'approve'});
  assert.equal(done.state,'approved');assert.equal(done.drill.started,true);
  const applied=await ok('/api/alert-route');assert.deepEqual(applied.destinationIds.sort(),[primary.id,standby.id].sort());assert.equal(applied.contactSettings[primary.id].delayMinutes,5,'the kept contact keeps its delay');
  await runOnce();await waitFor(async()=>sentTo('qa-standby@example.test').length===2,'the added recipient is drilled');
  assert.equal(sentTo('qa-expiring@example.test').length,0,'the expired destination received nothing');
 }
 // withdrawing consent stops the schedule; erasing a destination removes its accountability records
 {
  await ok('/api/route-accountability','POST',policy(2,[0,24],{enabled:false}));
  const before=await drills();await scheduled();assert.equal(await drills(),before,'withdrawn consent starts no drill');
  await ok(`/api/notifications/destinations/${primary.id}`,'DELETE');
  for(const table of ['route_accountability_drills','route_accountability_reminders','route_accountability_proposals','route_accountability_destinations'])assert.equal(await count(`SELECT COUNT(*) n FROM ${table} WHERE destination_id=?`,primary.id),0,`${table} rows erased with the destination`);
 }
 console.log('Route accountability passed: consent, window, daily bound, expiry, owner reminder, proposals, decline and approval.');
}finally{
 if(worker)await worker.dispose();if(mail)await mail.close();await cleanupDirectory(directory);
}
