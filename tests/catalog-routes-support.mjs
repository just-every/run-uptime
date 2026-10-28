import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './resilience/support.mjs';
import {main as routingCommand} from '../scripts/routing.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {inviteDoorMember} from './access-door-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {emailSignIn} from './auth-test-support.mjs';

export async function proveCatalogRoutes(){
 const mail=[],f=await fixture({MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-1'},async request=>{assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');mail.push(await request.json());return new Response(null,{status:202})});
 try{
  const ok=async(path,body,options={})=>{const r=await f.request(path,{...options,...(body===undefined?{}:{body})});assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
  const all=async()=>{const tables=(await f.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;return Object.fromEntries(await Promise.all(tables.map(async({name})=>[name,(await f.DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results])))};
  const inputFile=async(label,input)=>{const path=join(f.directory,label+'.json');await writeFile(path,JSON.stringify(input),{mode:0o600});return path};
  const cli=async(command,input)=>routingCommand(['--origin',f.origin,command,...(input===undefined?[]:['--input',await inputFile(command,input)])],{UPTIME_ACCESS_COOKIE:f.cookie});
  const route=async(id,mode,destinationIds=[])=>{const current=await ok(`/api/monitors/${id}/alert-route`),body={scope:'monitor',mode,destinationIds,expectedRevision:current.policies[0].revision};const preview=await ok(`/api/monitors/${id}/alert-route/preview`,body);return ok(`/api/monitors/${id}/alert-route/apply`,{...body,digest:preview.digest})};
  const inbox=await ok('/api/notifications/destinations',{name:'Synthetic named route inbox',kind:'email',address:'synthetic-uptime-route@example.test'});
  const source=await f.monitor({name:'synthetic-uptime-route-source',runners:[f.first],canary:true,enabled:false});
  const selected=await f.monitor({name:'synthetic-uptime-route-selected',runners:[f.first],canary:true,enabled:false});
  const peer=await f.monitor({name:'synthetic-uptime-route-peer',runners:[f.first],canary:true,enabled:false});
  const unassigned=await f.monitor({name:'synthetic-uptime-route-unassigned',runners:[f.first],canary:true,enabled:false});
  const global=await ok(`/api/monitors/${source.id}/alert-route`),globalInput={scope:'installation',mode:'selected',destinationIds:[],expectedRevision:global.policies.find(p=>p.scope==='installation').revision};
  const globalPreview=await ok(`/api/monitors/${source.id}/alert-route/preview`,globalInput);await ok(`/api/monitors/${source.id}/alert-route/apply`,{...globalInput,digest:globalPreview.digest});
  await route(source.id,'selected',[inbox.id]);
  const rpc=async(_path,body)=>ok('/api/runner/notifications',body,{runner:f.first});
  await ok(`/api/notifications/destinations/${inbox.id}/drill`,{});await dispatchNotifications(rpc);
  const notice=mail.findLast(message=>message.subject.includes('Alert drill')),text=notice?.content.find(item=>item.type==='text/plain')?.value??'';
  const link=new URL(/Confirm you received it: (\S+)/.exec(text)?.[1]);
  assert.equal((await fetch(f.origin+'/alert-drill',{method:'POST',headers:{origin:f.origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:link.searchParams.get('token')})})).status,200);
  assert.equal((await ok('/api/notifications')).destinations.find(d=>d.id===inbox.id).proof.state,'proven');
  const named=await cli('name-route',{name:'Synthetic payments route',monitorId:source.id});assert.ok((await cli('named')).some(r=>r.id===named.id&&r.name===named.name));
  const admin=await inviteDoorMember(f.origin,f.cookie,'admin','uptime-route-admin');await completeSecondFactor(f.origin,admin.cookie);
  const batch={routeId:named.id,monitorIds:[selected.id,peer.id]};
  for(const path of ['/api/routing/named-routes','/api/catalog/routes/preview','/api/catalog/routes/apply','/api/catalog/routes/undo'])assert.equal((await f.request(path,{headers:{cookie:admin.cookie},...(path.includes('/catalog/')?{body:path.endsWith('/undo')?{batchId:'missing'}:batch}:{})})).status,403,'an enrolled admin cannot use owner route batches');
  const unproved=await emailSignIn(f.origin,{bindings:f.bindings,secondFactor:false});assert.equal((await f.request('/api/catalog/routes/preview',{body:batch,headers:{cookie:unproved}})).status,403,'a Base email session cannot replace second-factor authority');
  const beforePreview=await all(),preview=await cli('preview-batch',batch);assert.deepEqual(await all(),beforePreview,'preview writes no table, confirms no recipient and sends nothing');
  assert.deepEqual(preview.counts,{change:2,unchanged:0,refused:0});assert.match(preview.warning,/No confirmed recipient/);assert.ok(preview.entries.every(e=>e.after.namedRouteId===named.id&&e.before.namedRouteId===null));
  const refused=await cli('preview-batch',{routeId:named.id,monitorIds:[selected.id,'missing-monitor']});assert.equal(refused.counts.refused,1);assert.equal((await f.request('/api/catalog/routes/apply',{body:{routeId:named.id,monitorIds:[selected.id,'missing-monitor'],digest:refused.digest}})).status,400);assert.deepEqual(await all(),beforePreview,'a mixed refused batch changes nothing');
  await route(peer.id,'selected',[]);const afterEdit=await all();assert.equal((await f.request('/api/catalog/routes/apply',{body:{...batch,digest:preview.digest}})).status,409);assert.deepEqual(await all(),afterEdit,'stale review cannot partially assign the other monitor');
  const refreshed=await cli('preview-batch',batch),beforeApply=await all(),mailBefore=mail.length;
  const races=await Promise.all([f.request('/api/catalog/routes/apply',{body:{...batch,digest:refreshed.digest}}),f.request('/api/catalog/routes/apply',{body:{...batch,digest:refreshed.digest}})]);assert.deepEqual(races.map(r=>r.status).sort(),[201,409]);const applied=races.find(r=>r.status===201).data;
  const afterApply=await all();for(const table of ['notification_destinations','notification_credentials','notification_jobs','alert_recipient_consents','alert_drills'])assert.deepEqual(afterApply[table],beforeApply[table],table+' unchanged by assignment');assert.equal(mail.length,mailBefore);
  for(const id of batch.monitorIds)assert.equal((await ok(`/api/monitors/${id}/alert-route`)).policies[0].namedRouteId,named.id);
  assert.deepEqual((await cli('preview-batch',batch)).counts,{change:0,unchanged:2,refused:0});
  for(const monitor of [selected,unassigned])await ok(`/api/monitors/${monitor.id}`,{...monitor.definition,enabled:true},{method:'PATCH'});
  const claimed=[];for(let n=0;n<2;n++){const task=await f.claim(f.first);assert.ok(task);claimed.push(task.monitorId);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200)}assert.deepEqual(new Set(claimed),new Set([selected.id,unassigned.id]));
  await dispatchNotifications(rpc);
  const deliveries=(await ok('/api/notifications')).deliveries.filter(d=>d.event.kind==='trigger');assert.equal(deliveries.length,1);assert.equal(deliveries[0].event.monitorId,selected.id);assert.equal(deliveries[0].destinationId,inbox.id);assert.equal(deliveries[0].state,'accepted');
  const incidentMail=mail.slice(mailBefore);assert.equal(incidentMail.length,1);assert.equal(incidentMail[0].custom_args.rer_delivery_id,deliveries[0].id);assert.deepEqual(incidentMail[0].personalizations[0].to,[{email:'synthetic-uptime-route@example.test'}]);assert.equal((await f.state(unassigned.id)).targetState,'Failing');
  const historyBefore=await all();await cli('undo-batch',{batchId:applied.batchId});const historyAfter=await all();for(const table of ['monitors','revisions','slots','observations','outbox','notification_jobs','alert_recipient_consents','alert_drills'])assert.deepEqual(historyAfter[table],historyBefore[table],table+' retained exactly by undo');
  assert.equal((await ok(`/api/monitors/${selected.id}/alert-route`)).policies[0].revision,0,'undo restores absent override');assert.equal((await ok(`/api/monitors/${peer.id}/alert-route`)).policies[0].namedRouteId,null);assert.deepEqual((await ok(`/api/monitors/${peer.id}/alert-route`)).effective.destinationIds,[]);
  const single={routeId:named.id,monitorIds:[peer.id]},singlePreview=await cli('preview-batch',single),second=await cli('apply-batch',{...single,digest:singlePreview.digest});await route(peer.id,'selected',[]);const edited=await all();assert.equal((await f.request('/api/catalog/routes/undo',{body:{batchId:second.batchId}})).status,409);assert.deepEqual(await all(),edited,'manual edits cannot be overwritten by undo');
  const archive=await ok('/api/archive');for(const table of ['alert_named_routes','catalog_route_batches','catalog_route_batch_entries'])assert.equal(Object.hasOwn(archive.payload.productTables,table),false,'route assignment authority is installation-local');
  await ok(`/api/monitors/${peer.id}/erase`,{name:peer.definition.name});assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM catalog_route_batch_entries WHERE monitor_id=?').bind(peer.id).first()).n,0);assert.ok((await cli('named')).some(r=>r.id===named.id),'erasing a monitor retains independent named configuration');
  await f.pause(selected);await f.pause(unassigned);
  const add={format:'urls',text:`http://93.184.216.34:${f.port}/catalog`,defaults:{intervalMs:5000,locations:['local-a'],assignments:{'local-a':{runnerId:f.first.runnerId,canaryUrl:`http://93.184.216.35:${f.port}/canary`}},alertRoute:named.id},enableAfterCreate:true};
  const addBefore=await all(),addPreview=await ok('/api/catalog/add/preview',add);assert.deepEqual(await all(),addBefore,'route-default review writes nothing');
  assert.equal(addPreview.alertRoute.id,named.id);assert.equal(addPreview.entries[0].alertRoute.readyCount,1);
  for(const cookie of [admin.cookie,unproved])for(const action of ['preview','apply']){
   assert.equal((await f.request('/api/catalog/add/'+action,{body:{...add,...(action==='apply'?{digest:addPreview.digest}:{})},headers:{cookie}})).status,403);
   assert.deepEqual(await all(),addBefore,'unauthorized creation with a route writes no monitor or recipient state');
  }
  await ok(`/api/notifications/destinations/${inbox.id}`,{name:inbox.name,enabled:false},{method:'PATCH'});
  const disabled=await all();assert.equal((await f.request('/api/catalog/add/apply',{body:{...add,digest:addPreview.digest}})).status,409);assert.deepEqual(await all(),disabled,'changed recipient state refuses the whole create');
  await ok(`/api/notifications/destinations/${inbox.id}`,{name:inbox.name,enabled:true},{method:'PATCH'});
  const renamed=await cli('name-route',{name:'Synthetic alternate route',monitorId:source.id});
  const freshAdd=await ok('/api/catalog/add/preview',add),changedRoute={...add,defaults:{...add.defaults,alertRoute:renamed.id}};
  const routeBefore=await all();assert.equal((await f.request('/api/catalog/add/apply',{body:{...changedRoute,digest:freshAdd.digest}})).status,409);assert.deepEqual(await all(),routeBefore,'a changed route selection cannot reuse an approval');
  const addMail=mail.length,added=await ok('/api/catalog/add/apply',{...add,digest:freshAdd.digest});assert.equal(added.created.length,1);assert.equal(mail.length,addMail);
  const created=added.created[0],createdRoute=await ok(`/api/monitors/${created}/alert-route`);assert.equal(createdRoute.policies[0].namedRouteId,named.id);
  for(let slot=0;slot<added.preview.entries[0].target.confirmSlots;slot++){
   if(slot)await new Promise(resolve=>setTimeout(resolve,5100));
   const task=await f.claim(f.first);assert.equal(task.monitorId,created);const attempts=[];
   for(let attempt=0;attempt<=task.definition.retries;attempt++)attempts.push({...await f.evidence(task),attempt});
   assert.equal((await f.submit(f.first,task,attempts)).status,200);
  }
  assert.equal((await f.state(created)).targetState,'Failing');
  await dispatchNotifications(rpc);const createdDelivery=(await ok('/api/notifications')).deliveries.filter(d=>d.event.monitorId===created&&d.event.kind==='trigger');
  assert.equal(createdDelivery.length,1);assert.equal(createdDelivery[0].destinationId,inbox.id);assert.equal(createdDelivery[0].state,'accepted');assert.equal(mail.length,addMail+1);
  const createdHistory=await all();await ok(`/api/definitions/batches/${added.batchId}/undo`,{});const undoneAdd=await all();
  for(const table of ['slots','observations','outbox','notification_jobs','alert_routes','alert_route_changes','alert_recipient_consents','alert_drills'])assert.deepEqual(undoneAdd[table],createdHistory[table],table+' retained by create-batch undo');
  assert.equal(JSON.parse(undoneAdd.monitors.find(m=>m.id===created).definition).enabled,false);
  const revoked=await emailSignIn(f.origin,{bindings:f.bindings});await ok('/api/auth/sign-out',{}, {headers:{cookie:revoked}});const revokedBefore=await all();
  assert.equal((await f.request('/api/catalog/add/apply',{body:{...add,digest:freshAdd.digest},headers:{cookie:revoked}})).status,401);assert.deepEqual(await all(),revokedBefore,'a replayed revoked session cannot create monitors or routing authority');
  const inviting=await emailSignIn(f.origin,{bindings:f.bindings}),successor=await inviteDoorMember(f.origin,inviting,'owner','uptime-route-successor');await completeSecondFactor(f.origin,successor.cookie);
  const original=(await f.DB.prepare('SELECT id FROM oa_operators WHERE email=?').bind(f.bindings.OWNER_EMAIL).first()).id;await ok(`/api/operators/${original}/erase`,{},{headers:{cookie:successor.cookie}});assert.ok((await f.DB.prepare('SELECT actor_kind FROM catalog_route_batches').all()).results.every(r=>r.actor_kind==='anonymized'),'operator erasure anonymizes retained route batch ownership');
  assert.deepEqual((await f.DB.prepare('PRAGMA foreign_key_check').all()).results,[]);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM uptime_mfa_factors WHERE operator_id=?').bind(successor.id).first()).n,1,'surviving owner keeps its own enrolled factor');
  const survivingCookie=await emailSignIn(f.origin,{bindings:{...f.bindings,OWNER_EMAIL:'synthetic-uptime-route-successor@example.test'}});assert.equal((await f.request('/api/routing/named-routes',{headers:{cookie:survivingCookie}})).status,200,'surviving owner obtains a new session and genuine factor proof after issuer erasure');
  console.log('MONITOR-001 named route API/CLI: zero-write review, owner/fresh-factor refusal, atomic race/stale refusal, confirmed fake-mail recipient only for assigned monitor, history-preserving undo, edited-route refusal and erasure/local-only authority.');
 }finally{await f.close()}
}
