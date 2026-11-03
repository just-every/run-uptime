import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {availablePorts} from './notify-acceptance-runtime.mjs';
import {acceptanceReceiver,loopbackWireTransport} from './notify-acceptance-receivers.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {fixture} from './resilience/support.mjs';
import {inviteDoorMember} from './access-door-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {emailSignIn} from './auth-test-support.mjs';

const tables=archive=>({...archive.payload.tables,...archive.payload.productTables});
const hash=payload=>createHash('sha256').update(JSON.stringify(payload)).digest('hex');

/** A bounded move of selected, genuinely checked monitors, through owner doors. */
export async function proveArchiveSelection(installation){
 const mail=[],f=await fixture({MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-90'},async request=>{assert.equal(new URL(request.url).hostname,'api.sendgrid.com');mail.push(await request.json());return new Response(null,{status:202})});
 let receiver;
 try{
  const ok=async(path,body,options={})=>{const result=await f.request(path,{...options,...(body===undefined?{}:{body})});assert.ok(result.status>=200&&result.status<300,`${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};
  const snapshot=async(db=f.DB)=>{
   const names=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;
   return Object.fromEntries(await Promise.all(names.map(async({name})=>[name,(await db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results])));
  };
  const [receiverPort]=await availablePorts(1);receiver=await acceptanceReceiver(receiverPort,record=>assert.equal(record.path,'/receiver'));
  const endpoint='https://archive.example.com/receiver';
  const transport=loopbackWireTransport(new Map([[endpoint,{port:receiverPort,path:'/receiver'}]]));
  const dispatch=()=>dispatchNotifications((_path,body)=>ok('/api/runner/notifications',body,{runner:f.first}),transport);
  const webhook=await ok('/api/notifications/destinations',{name:'Synthetic archive webhook',kind:'webhook',url:endpoint}),signingSecret=webhook.signingSecret;
  const destination=await ok('/api/notifications/destinations',{name:'Synthetic archive inbox',kind:'email',address:f.bindings.OWNER_EMAIL});
  const monitors=[];
  for(let n=0;n<3;n++)monitors.push(await f.monitor({name:`synthetic-uptime-${n+1}`,runners:[f.first],canary:true,service:'Synthetic archive service'}));
  // Production runner probe execution and signed completion create real history.
  for(let n=0;n<3;n++){const task=await f.claim(f.first);assert.ok(monitors.some(m=>m.id===task.monitorId));assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200)}
  await dispatch();receiver.assertValid();assert.equal(receiver.records.length,3);
  for(const monitor of monitors)assert.equal((await f.state(monitor.id)).targetState,'Failing');
  const trigger=(await ok('/api/overview')).alerts.find(a=>a.monitor_id===monitors[0].id&&a.kind==='trigger');
  await ok(`/api/incidents/${trigger.id}/comments`,{text:'Synthetic retained incident note',mentions:[]});
  const current=await ok(`/api/monitors/${monitors[0].id}`,{...monitors[0].definition,name:'synthetic-uptime-revised'},{method:'PATCH'});
  f.modes.target=200;
  const due=(await f.DB.prepare('SELECT max(next_due) due FROM monitors').first()).due;
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,due-Date.now()+20)));
  for(let n=0;n<3;n++){const task=await f.claim(f.first);assert.ok(task);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200)}
  await dispatch();receiver.assertValid();assert.equal(receiver.records.length,6);
  for(const monitor of monitors){assert.equal((await f.state(monitor.id)).targetState,'Healthy');await f.pause(monitor)}
  // Replay history has no creation API: retain real sent envelopes at its storage boundary.
  for(const delivery of (await f.DB.prepare('SELECT * FROM integration_deliveries ORDER BY rowid LIMIT 3').all()).results){const id=crypto.randomUUID(),envelope={...JSON.parse(delivery.envelope),id};await f.DB.prepare('INSERT INTO integration_replays VALUES(?,?,?,?,?)').bind(delivery.namespace,id,delivery.fingerprint,JSON.stringify(envelope),Date.now()).run()}
  // A removed monitor leaves permanent journals which must survive the subset.
  const erased=await f.monitor({name:'synthetic-uptime-erased',runners:[f.first],enabled:false});
  await ok(`/api/monitors/${erased.id}/erase`,{name:erased.definition.name});
  const selected=[monitors[0].id,monitors[2].id],ids=new Set(selected),path='/api/archive?'+selected.map(id=>'monitor='+encodeURIComponent(id)).join('&');
  const fullArchive=await ok('/api/archive'),full=tables(fullArchive),archive=await ok(path),projected=tables(archive);
  assert.deepEqual(archive.payload.erasureFence,fullArchive.payload.erasureFence);assert.ok(archive.payload.erasureFence.journal.length>0,'complete erasure journal survives the selection');
  assert.deepEqual(archive.payload.selection,{kind:'monitors',monitorIds:[...selected].sort(),sharedRecords:'installation-history-v1'});
  assert.equal(hash(archive.payload),archive.sha256,'selection metadata is inside the integrity envelope');
  assert.deepEqual(new Set(projected.monitors.map(m=>m.id)),ids,'exactly the independently requested monitors travel');
  const slots=new Set(full.slots.filter(s=>ids.has(s.monitor_id)).map(s=>s.id));
  const jobs=new Set(full.notification_jobs.filter(j=>{const event=JSON.parse(j.event);return event.monitorId===null||ids.has(event.monitorId)}).map(j=>j.id));
  for(const [name,rows] of Object.entries(full)){
   let expected=rows;
   if(name==='monitors')expected=rows.filter(r=>ids.has(r.id));
   else if(rows.some(r=>Object.hasOwn(r,'monitor_id')))expected=rows.filter(r=>ids.has(r.monitor_id)||name==='discovery_decisions'&&r.monitor_id===null);
   else if(name==='integration_replays')expected=rows.filter(r=>ids.has(JSON.parse(JSON.parse(r.envelope).body).monitorId));
   else if(name==='observations')expected=rows.filter(r=>slots.has(r.slot_id));
   else if(['notification_jobs','integration_deliveries'].includes(name))expected=rows.filter(r=>jobs.has(r.id));
   else if(['notification_delivery_attempts','integration_attempts','integration_resolutions'].includes(name))expected=rows.filter(r=>jobs.has(r.delivery_id));
   // An export records its authorization after the snapshot, without altering history.
   if(name==='uptime_audit'){assert.ok(projected[name].length>=rows.length);for(const row of rows)assert.deepEqual(projected[name].find(r=>r.id===row.id),row);continue}
   assert.deepEqual(projected[name],expected,name+' has complete selected history and explicit shared records');
  }
  assert.ok(projected.revisions.filter(r=>r.monitor_id===monitors[0].id).length>=3,'all edited and paused revisions travel');
  assert.equal(projected.slots.length,4);assert.ok(projected.slots.every(s=>s.manual===0&&s.status==='complete'));assert.equal(projected.observations.length,4);assert.ok(projected.outbox.some(r=>r.kind==='trigger')&&projected.outbox.some(r=>r.kind==='recovery'));
  assert.equal(projected.integration_deliveries.length,4);assert.equal(projected.integration_attempts.length,4);
  assert.equal(projected.incident_comments.length,1);assert.ok(projected.notification_jobs.length>0);assert.ok(projected.uptime_erasure_receipts.length>0);
  const text=JSON.stringify(archive);for(const secret of [f.bindings.SESSION_SECRET,f.bindings.SETUP_TOKEN,f.first.key,f.second.key,'synthetic-uptime-90',endpoint,signingSecret])assert.ok(!text.includes(secret),'no local authority in selected archives');
  const receiving=await installation('subset-receiving-owner');
  const corrupt=structuredClone(archive);corrupt.payload.selection.monitorIds=[monitors[1].id];
  assert.equal((await receiving.owner.api('/api/restore','POST',corrupt)).status,400,'changed selection breaks integrity');
  corrupt.sha256=hash(corrupt.payload);
  assert.equal((await receiving.owner.api('/api/restore','POST',corrupt)).status,400,'a recomputed digest cannot hide selection mismatch');
  assert.equal((await receiving.ok('/api/overview')).monitors.length,0);
  await receiving.ok('/api/restore','POST',archive);
  const restored=tables(await receiving.ok('/api/archive'));
  assert.deepEqual(new Set(restored.monitors.map(m=>m.id)),ids);
  for(const name of ['observations','integration_attempts','integration_resolutions','integration_replays','revisions','incident_comments','incident_timeline','uptime_erasure_receipts']){
   if(name==='revisions'){for(const row of projected[name])assert.deepEqual(restored[name].find(r=>r.monitor_id===row.monitor_id&&r.revision===row.revision),row)}
   else assert.deepEqual(restored[name],projected[name],name+' survives receiving-owner restore');
  }
  for(const slot of projected.slots)assert.deepEqual(restored.slots.find(r=>r.id===slot.id),slot,'complete scheduled history remains exact');
  assert.ok(restored.monitors.every(m=>!JSON.parse(m.definition).enabled));assert.ok(restored.notification_destinations.every(d=>!d.enabled));assert.ok(restored.notification_jobs.every(j=>j.state==='imported-inactive'));assert.ok(restored.outbox.every(e=>e.status==='imported-inactive'));
  const notices=mail.length;assert.equal((await receiving.owner.api('/api/runner/claim','POST',{}, {'x-runner-key':receiving.bindings.UPTIME_RUNNER_KEY})).data.task,null);assert.equal(mail.length,notices);
  // A second selected move exercises original-history projection after restore.
  const one=await receiving.ok('/api/archive?monitor='+encodeURIComponent(monitors[0].id));
  assert.deepEqual(tables(one).monitors.map(m=>m.id),[monitors[0].id]);assert.ok(tables(one).archive_history.every(h=>{const r=JSON.parse(h.record);return !['monitors','slots','outbox'].includes(h.table_name)||(r.monitor_id??r.id)===monitors[0].id}));
  const repeated=await installation('subset-third-owner');await repeated.ok('/api/restore','POST',one);assert.deepEqual(tables(await repeated.ok('/api/archive')).observations,projected.observations.filter(o=>projected.slots.some(s=>s.id===o.slot_id&&s.monitor_id===monitors[0].id)));

  const refuse=async(query,options={},status=400)=>{const before=await snapshot();const result=await f.request(query,options);assert.equal(result.status,status,JSON.stringify(result.data));assert.ok(!result.data.payload,'no partial archive');assert.deepEqual(await snapshot(),before,'refusal changes no durable state');return result};
  for(const query of ['/api/archive?monitor=','/api/archive?monitor=missing',path+'&monitor='+selected[0],'/api/archive?from=0', '/api/archive?'+Array.from({length:101},(_,n)=>'monitor=synthetic-uptime-'+n).join('&')])await refuse(query);
  await refuse(path,{headers:{cookie:''}},401);
  const admin=await inviteDoorMember(f.origin,f.cookie,'read-only','uptime-archive-reader');await completeSecondFactor(f.origin,admin.cookie);
  await refuse(path,{headers:{cookie:admin.cookie}},403);
  const scoped=await inviteDoorMember(f.origin,f.cookie,'admin','uptime-archive-scoped',[{kind:'service',value:'synthetic-uptime-service'}]);await completeSecondFactor(f.origin,scoped.cookie);await refuse(path,{headers:{cookie:scoped.cookie}},403);
  const revoked=await inviteDoorMember(f.origin,f.cookie,'admin','uptime-archive-revoked');await completeSecondFactor(f.origin,revoked.cookie);await ok(path,undefined,{headers:{cookie:revoked.cookie}});await ok('/api/auth/sign-out',{}, {headers:{cookie:revoked.cookie}});await refuse(path,{headers:{cookie:revoked.cookie}},401);
  const staleFactor=await emailSignIn(f.origin,{bindings:f.bindings,secondFactor:false});await refuse(path,{headers:{cookie:staleFactor}},403);
  // Cross-selection references are refused with no implicit expansion or lost history.
  await ok(`/api/monitors/${monitors[0].id}`,{...current.definition,enabled:false,dependencies:[monitors[1].id]},{method:'PATCH'});
  assert.match((await refuse(path)).data.error,/dependency/);
  const together=await ok('/api/archive?'+monitors.map(m=>'monitor='+m.id).join('&'));assert.equal(tables(together).monitors.length,3);
  await ok(`/api/monitors/${monitors[2].id}/report-schedules`,{destinationId:destination.id,dueAt:Date.now()+3600000,service:'Synthetic archive service',period:{period:'24h',timeZone:'UTC'}});
  assert.match((await refuse('/api/archive?monitor='+monitors[2].id)).data.error,/service report/);
  const serviceArchive=await ok('/api/archive?'+monitors.map(m=>'monitor='+m.id).join('&'));const serviceReceiving=await installation('subset-service-owner');await serviceReceiving.ok('/api/restore','POST',serviceArchive);assert.equal(tables(await serviceReceiving.ok('/api/archive')).scheduled_reports.length,1);
  const replay=await f.DB.prepare('SELECT * FROM integration_replays LIMIT 1').first(),opaque={...JSON.parse(replay.envelope),body:'synthetic-uptime-opaque'};await f.DB.prepare('UPDATE integration_replays SET envelope=? WHERE id=?').bind(JSON.stringify(opaque),replay.id).run();
  assert.match((await refuse('/api/archive?'+monitors.map(m=>'monitor='+m.id).join('&'))).data.error,/opaque replay/);await f.DB.prepare('UPDATE integration_replays SET envelope=? WHERE id=?').bind(replay.envelope,replay.id).run();
  // Physical row and byte bounds remain enforced, even for selected exports.
  // Boundary-only population is local storage setup, never fabricated probe proof.
  const beforeBounds=await snapshot(),revision=beforeBounds.revisions.find(r=>r.monitor_id===monitors[2].id),base=1000;
  await f.DB.prepare(`INSERT INTO revisions(monitor_id,revision,definition,created_at) WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x<10000) SELECT ?,?+x,?,? FROM n`).bind(monitors[2].id,base,revision.definition,revision.created_at).run();
  const single='/api/archive?'+monitors.map(m=>'monitor='+m.id).join('&');
  assert.match((await refuse(single)).data.error,/row bound/);
  await f.DB.prepare('DELETE FROM revisions WHERE monitor_id=? AND revision>=?').bind(monitors[2].id,base).run();
  await f.DB.prepare(`INSERT INTO revisions(monitor_id,revision,definition,created_at) WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x<3999) SELECT ?,?+x,?,? FROM n`).bind(monitors[2].id,base,revision.definition,revision.created_at).run();
  assert.match((await refuse(single)).data.error,/2 MiB/);
  await f.DB.prepare('DELETE FROM revisions WHERE monitor_id=? AND revision>=?').bind(monitors[2].id,base).run();
  assert.equal((await ok('/api/archive')).payload.selection,undefined,'ordinary whole-installation export remains available');
  await ok(`/api/monitors/${monitors[0].id}/erase`,{name:current.definition.name});
  const laterJournal=await ok('/api/erasure-journal'),fenced=await installation('subset-fenced-owner');await fenced.ok('/api/erasure-journal');const beforeFence=await snapshot(fenced.DB);
  const fencedResult=await fenced.owner.api('/api/restore','POST',{archive,laterJournal});assert.equal(fencedResult.status,400);assert.match(fencedResult.data.error,/erased/);assert.deepEqual(await snapshot(fenced.DB),beforeFence,'later journal refuses the selected old capture without any restored rows');
  assert.equal(destination.kind,'email');
  console.log('PASS selected archive: exact requested graph from signed scheduled checks, complete revisions and history, shared journals, inactive repeated restore, integrity, owner and fresh-factor authority, zero-write invalid and bound refusals');
 }finally{await receiver?.close();await f.close()}
}
