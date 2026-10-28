import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './resilience/support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {inviteDoorMember} from './access-door-support.mjs';
import {main as routingCommand} from '../scripts/routing.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';

// R1: the ordinary route API/CLI, native team consent and production dispatch.
// Only the SendGrid and signed-webhook receiving edges are substituted.
export async function proveRouteDrills(){
 const mail=[],sent=[],outbound=async request=>{assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');mail.push(await request.json());return new Response(null,{status:202})};
 const f=await fixture({MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-28'},outbound);let replacement;
 try{
  const ok=async(path,body,options={})=>{const r=await f.request(path,{...options,...(body===undefined?{}:{body})});assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
  const cli=async(command,input,monitor)=>{const path=join(f.directory,'route-input.json');if(input!==undefined)await writeFile(path,JSON.stringify(input),{mode:0o600});return routingCommand([command,'--origin',f.origin,...(monitor?['--monitor',monitor]:[]),...(input===undefined?[]:['--input',path])],{UPTIME_ACCESS_COOKIE:f.cookie})};
  const member=await inviteDoorMember(f.origin,f.cookie,'read-only','uptime-28',[{kind:'service',value:'Routing drills'}]);
  const inbox=await ok('/api/notifications/destinations',{name:'Synthetic team inbox',kind:'email',address:'synthetic-uptime-28@example.test'});
  const hook=await ok('/api/notifications/destinations',{name:'Synthetic route webhook',kind:'webhook',url:'https://route-drill.example.com/receive'});
  const disabled=await ok('/api/notifications/destinations',{name:'Synthetic disabled contact',kind:'webhook',enabled:false,url:'https://route-drill.example.com/disabled'});
  const owner=await ok('/api/access/self');
  const production=await ok('/api/routing/teams',{name:'Synthetic production drill team',enabled:true,memberIds:[member.id],expectedRevision:0});
  const staging=await ok('/api/routing/teams',{name:'Synthetic staging drill team',enabled:true,memberIds:[owner.id],expectedRevision:0});
  assert.equal((await f.request('/api/routing/recipient',{body:{destinationId:inbox.id,enabled:true},headers:{cookie:member.cookie}})).status,200);
  const m=await f.monitor({name:'Synthetic route drill target',enabled:false,runners:[f.first],canary:true,service:'Routing drills',environment:'production'}),path=`/api/monitors/${m.id}/alert-route`;
  const save=async(name,quietHours=null,filters={environments:['production'],severities:['critical'],origins:['monitor'],regions:['local-a']})=>{
   const current=await ok(path),input={scope:'monitor',mode:'selected',destinationIds:[hook.id,disabled.id],teamIds:[production.id,staging.id],filters,quietHours,expectedRevision:current.policies[0].revision};
   const preview=await ok(path+'/preview',input);await ok(path+'/apply',{...input,digest:preview.digest});
   const named=await cli('name-route',{name,monitorId:m.id}),batch={routeId:named.id,monitorIds:[m.id]},planned=await cli('preview-batch',batch);await cli('apply-batch',{...batch,digest:planned.digest});
   return named;
  };
  const transport={async send(wire,beforeRequest){assert.equal(wire.url,'https://route-drill.example.com/receive');await beforeRequest();sent.push(JSON.parse(wire.body));return {status:202,headers:{},body:''}}},rpc=async(_path,body)=>ok('/api/runner/notifications',body,{runner:f.first});
  const dispatch=()=>dispatchNotifications(rpc,transport),history=async id=>(await ok(path)).drills.find(d=>d.id===id);
  const evidence=async()=>Object.fromEntries(await Promise.all(['monitors','revisions','slots','observations','outbox'].map(async table=>[table,(await f.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
  const start=async(named,kind='trigger')=>cli('drill',{routeId:named.id,kind,regions:['local-a'],expectedRevision:(await ok(path)).effective.revision},m.id);
  let named=await save('Synthetic production route drill'),before=await evidence();
  assert.equal((await f.request(path+'/apply',{body:{action:'drill',routeId:named.id,kind:'trigger',regions:['local-a'],expectedRevision:0}})).status,409);
  const first=await start(named);await dispatch();let result=await history(first.routeDrillId);
  for(const id of [hook.id,inbox.id])assert.equal(result.recipients.find(r=>r.id===id).state,'accepted');
  assert.deepEqual([result.recipients.find(r=>r.id===disabled.id).outcome,result.recipients.find(r=>r.id===disabled.id).reason],['excluded','disabled']);
  assert.equal(sent.length,1);assert.ok(mail.some(message=>message.personalizations.some(group=>group.to.some(to=>to.email==='synthetic-uptime-28@example.test'))));
  assert.deepEqual([sent[0].kind,sent[0].incidentKey,sent[0].monitorId],['test',null,null]);
  assert.deepEqual(await evidence(),before,'route drills add no incident, monitor change, observation or real alert');
  const link=new URL(sent[0].drill.confirmUrl);
  assert.equal((await fetch(f.origin+'/alert-drill',{method:'POST',headers:{origin:f.origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:link.searchParams.get('token')})})).status,200);
  assert.ok((await history(first.routeDrillId)).recipients.find(r=>r.id===hook.id).confirmedAt);
  assert.equal((await ok('/api/notifications')).destinations.find(d=>d.id===hook.id).latestDrill.routeDrillId,first.routeDrillId,'ordinary drill read API retains route provenance');

  const endAt=Math.ceil((Date.now()+3600000)/60000)*60000,clock=at=>new Date(at).toISOString().slice(11,16);
  named=await save('Synthetic quiet route drill',{timeZone:'UTC',start:clock(endAt-7200000),end:clock(endAt)});
  const held=await start(named),sentBefore=sent.length;await dispatch();result=await history(held.routeDrillId);
  for(const id of [hook.id,inbox.id])assert.deepEqual([result.recipients.find(r=>r.id===id).state,result.recipients.find(r=>r.id===id).quietUntil],['queued',endAt]);
  await f.worker.dispose();
  replacement=await startLocalWorker({persist:f.directory,port:Number(new URL(f.origin).port),bindings:f.bindings,outboundService:outbound});f.DB=await replacement.getD1Database('DB');
  assert.deepEqual(await history(held.routeDrillId),result,'route outcomes and the quiet snapshot survive a Worker restart');
  await dispatch();assert.equal(sent.length,sentBefore,'restart cannot send through the quiet hold');

  const paused=await start(named);await ok('/api/notifications/destinations/'+hook.id,{name:hook.name,enabled:false},{method:'PATCH'});
  assert.equal((await f.request('/api/routing/recipient',{body:{destinationId:inbox.id,enabled:false},headers:{cookie:member.cookie}})).status,200);await dispatch();
  const stopped=await history(paused.routeDrillId);for(const id of [hook.id,inbox.id])assert.deepEqual([stopped.recipients.find(r=>r.id===id).state,stopped.recipients.find(r=>r.id===id).code],['rejected','route_recipient_ineligible']);
  await ok('/api/notifications/destinations/'+hook.id,{name:hook.name,enabled:true},{method:'PATCH'});
  assert.equal((await f.request('/api/routing/recipient',{body:{destinationId:inbox.id,enabled:true},headers:{cookie:member.cookie}})).status,200);
  // Consent binds the credential, including an address rotated away and back.
  await ok('/api/notifications/destinations/'+inbox.id,{name:inbox.name,enabled:true,address:'synthetic-uptime-29@example.test'},{method:'PATCH'});
  await ok('/api/notifications/destinations/'+inbox.id,{name:inbox.name,enabled:true,address:'synthetic-uptime-28@example.test'},{method:'PATCH'});
  named=await save('Synthetic rotated route drill');
  const rotated=await start(named);result=await history(rotated.routeDrillId);
  assert.deepEqual([result.recipients.find(r=>r.id===inbox.id).outcome,result.recipients.find(r=>r.id===inbox.id).reason],['excluded','team_recipient_ineligible']);
  await dispatch();
  const reserved=await start(named),reservedRecipient=(await history(reserved.routeDrillId)).recipients.find(r=>r.id===hook.id),reservation=crypto.randomUUID();
  assert.ok((await rpc('',{operation:'poll'})).jobs.some(j=>j.id===reservedRecipient.deliveryId),'poll prepares the real integration delivery before a claim');
  const claim=await rpc('',{operation:'claim',id:reservedRecipient.deliveryId,reservation,runnerNow:Date.now()});assert.ok(claim);
  await ok('/api/notifications/destinations/'+hook.id+'/rotate',{});
  assert.equal(await rpc('',{operation:'start',id:reservedRecipient.deliveryId,claim,reservation}),false,'rotation after reservation cannot start the stale route credential');
  assert.deepEqual([(await history(reserved.routeDrillId)).recipients.find(r=>r.id===hook.id).state,(await history(reserved.routeDrillId)).recipients.find(r=>r.id===hook.id).code],['rejected','credential_rotated'],'the unstarted stale reservation retains its exact refusal');
  assert.deepEqual(await evidence(),before);
  await ok('/api/notifications/destinations/'+inbox.id,undefined,{method:'DELETE'});
  assert.deepEqual([(await history(first.routeDrillId)).recipients.find(r=>r.id===inbox.id).state,(await history(first.routeDrillId)).recipients.find(r=>r.id===inbox.id).reason],['erased','destination_missing']);
  const portable=await ok('/api/archive');
  for(const table of ['alert_routes','alert_route_changes','alert_drills'])assert.equal(Object.hasOwn(portable.payload.productTables,table),false);
  assert.equal((await ok(path)).portability.reason,'route_policy_installation_local');
  assert.ok(!JSON.stringify(portable).includes(hook.signingSecret));
  assert.ok((await f.DB.prepare("SELECT 1 FROM uptime_audit WHERE action='alert_route_drill'").first()));
  await ok(`/api/monitors/${m.id}/erase`,{name:m.definition.name});
  assert.equal((await f.DB.prepare("SELECT COUNT(*) n FROM alert_drills WHERE json_extract(route_context,'$.monitorId')=?").bind(m.id).first()).n,0);
  assert.equal((await f.DB.prepare("SELECT COUNT(*) n FROM alert_route_changes WHERE scope_kind='monitor' AND scope_value=?").bind(m.id).first()).n,0);
  console.log('ROUTING-001 R1 passed: named route API/CLI drills, consent, selected and disabled contacts, live pause/rotation refusals, selected recipient outcomes and confirmation, quiet hold across restart, one initial send and no real incident/evidence changes; local-only archive authority and erasure.');
 }finally{await replacement?.dispose();await f.close()}
}
