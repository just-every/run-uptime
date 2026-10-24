import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fixture} from './resilience/support.mjs';
import {authRequest,deliveredLink,sessionCookie,signInOwner} from './auth-test-support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {migratedWorker} from './notify-acceptance-runtime.mjs';
import {proveOwnIncidentCorrelation} from './incident-correlation-support.mjs';
import {incidentMailEdge,proveIncidentMembers,proveMentionErasure} from './incident-members-support.mjs';

// One end-to-end incident collaboration journey: actual scheduled probes at a
// controlled HTTP network edge, native owner/member sessions and real Worker D1.
const mail=incidentMailEdge(),f=await fixture({MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-incident-mail'},mail.fetch);let resumed,fresh;const destination=await mkdtemp(join(tmpdir(),'uptime-incident-restore-'));
const ok=async(path,options={})=>{const result=await f.request(path,options);assert.ok(result.status>=200&&result.status<300,`${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};
try{
 const monitor=await f.monitor({service:'incident-service'});await f.run(f.first);await f.run(f.second);
 assert.equal((await f.state(monitor.id)).targetState,'Failing','scheduled evidence confirms a real incident');
 const list=await ok(`/api/monitors/${monitor.id}/incidents`);assert.equal(list.length,1);const id=list[0].id,path=`/api/incidents/${encodeURIComponent(id)}`;
 let detail=await ok(path);assert.equal(detail.machineState,'open');assert.equal(detail.timeline[0].kind,'confirmation');
 const snapshot=async()=>Object.fromEntries(await Promise.all(['monitors','revisions','slots','observations','outbox'].map(async table=>[table,(await f.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
 const machineBefore=await snapshot(),workSnapshot=async()=>Object.fromEntries(await Promise.all(['incident_work','incident_comments','incident_comment_history','incident_timeline','incident_settings','uptime_audit'].map(async table=>[table,(await f.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
 const call=authRequest(f.origin);
 // Prepare role fixtures, then obtain genuine native email-link sessions. Account
 // invitation/step-up is a separate Base journey, not incident authorization.
 const identitySession=async(email,role)=>{
  await f.DB.prepare('INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,?,?,?,?,1,?)').bind(randomUUID(),email,role==='owner'?'Incident colleague':'Read-only colleague',role,'active',Date.now()).run();
  return signInOwner(f.origin,{bindings:{...f.bindings,OWNER_EMAIL:email}});
 };
 const colleagueCookie=await identitySession('incident-colleague@example.test','owner'),memberCookie=await identitySession('incident-member@example.test','member');
 const members=await ok('/api/incident-settings'),colleague=members.members.find(member=>member.displayName==='Incident colleague');assert.ok(colleague);
 const comment=await ok(path+'/comments',{body:{text:'restarted php-fpm <script>private comment</script>'},headers:{cookie:colleagueCookie}});
 const beforeDenied=await workSnapshot();
 for(const cookie of ['',memberCookie])for(const [method,suffix,body]of [['POST','/comments',{text:'must not be written'}],['PATCH',`/comments/${comment.id}`,{text:'must not overwrite',version:1}],['DELETE',`/comments/${comment.id}?version=1`,undefined],['PATCH','/root-cause',{categoryId:'hosting-provider',text:'must not write',version:0}]]){
  const response=await f.request(path+suffix,{method,body,headers:{cookie}});assert.equal(response.status,401,'signed-out and member writes refused');
 }
 assert.deepEqual(await workSnapshot(),beforeDenied,'authorization denial writes no incident or audit rows');
 assert.equal((await f.request(path+'/comments',{body:{text:'x'.repeat(5001)}})).status,400);
 await ok(`${path}/comments/${comment.id}`,{method:'PATCH',body:{text:'Restarted php-fpm; confirmed locally',version:1}});
 assert.equal((await f.request(`${path}/comments/${comment.id}`,{method:'PATCH',body:{text:'stale lost update',version:1}})).status,409);
 detail=await ok(path);assert.equal(detail.comments[0].history[0].text,'restarted php-fpm <script>private comment</script>');assert.equal(detail.comments[0].author.id,colleague.id);
 await ok('/api/incident-settings',{method:'PATCH',body:{version:members.version,categories:[...members.categories,{id:'disk-storage',label:'Disk storage'}]}});
 assert.equal((await f.request('/api/incident-settings',{method:'PATCH',body:{version:members.version,categories:members.categories}})).status,409);
 await ok(path+'/root-cause',{method:'PATCH',body:{categoryId:'disk-storage',text:'Disk was full',version:0}});
 assert.equal((await f.request(path+'/root-cause',{method:'PATCH',body:{categoryId:'disk-storage',text:'stale',version:0}})).status,409);
 assert.equal((await f.request(path+'/root-cause',{method:'PATCH',body:{categoryId:'disk-storage',text:'x'.repeat(2001),version:1}})).status,400);
 await ok(path+'/actions',{body:{kind:'assign',ownerId:colleague.id,version:0}});
 await ok(path+'/actions',{body:{kind:'assign',ownerId:null,version:1}});
 await ok(path+'/actions',{body:{kind:'assign',ownerId:colleague.id,version:2}});
 await ok(path+'/actions',{body:{kind:'acknowledge',version:3}});
 await ok(path+'/actions',{body:{kind:'stop',version:4}});
 detail=await ok(path);assert.equal(detail.status,'acknowledged');assert.equal(detail.stopReason,'member_stop');assert.equal(detail.owner.id,colleague.id);
 await ok(path+'/actions',{body:{kind:'resolve',version:5}});
 detail=await ok(path);assert.equal(detail.status,'resolved');assert.equal(detail.machineState,'open','manual resolution cannot pretend machine recovery');
 assert.deepEqual(await snapshot(),machineBefore,'all human work leaves monitoring verdict, evidence and transitions exact');
 const filtered=await ok(`/api/v1/incidents?monitor=${encodeURIComponent(monitor.id)}&rootCause=disk-storage`);assert.ok(filtered.items.some(incident=>incident.id===id));
 const beforeRestart=await ok(path);await f.worker.dispose();resumed=await startLocalWorker({port:Number(new URL(f.origin).port),persist:f.directory,bindings:f.bindings,outboundService:mail.fetch});f.DB=await resumed.getD1Database('DB');
 detail=await ok('/api/v1/incidents/'+encodeURIComponent(id));assert.deepEqual(detail,beforeRestart,'restarted Worker retains complete incident account');
 f.modes.target=200;await f.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.id).run();await f.run(f.first);await f.run(f.second);
 detail=await ok(path);assert.equal(detail.machineState,'recovered');assert.equal(detail.stopReason,'recovery');assert.ok(detail.timeline.some(entry=>entry.kind==='manual_resolution'));assert.ok(detail.timeline.some(entry=>entry.kind==='recovery'));
 const recoveredComment=await ok(path+'/comments',{body:{text:'Recovered incident remains editable'}});
 await ok(path+'/root-cause',{method:'PATCH',body:{categoryId:'hosting-provider',text:'Provider disk full',version:1}});
 const collaboration=await proveIncidentMembers(f,monitor,id,mail);
 // Round-trip an edited comment and human root cause through owner archive routes.
 const beforeExport=await ok(path),archive=await ok('/api/archive');const restored=await migratedWorker({persist:destination,bindings:f.bindings,outboundService:mail.fetch});fresh=restored.worker;
 const freshOrigin=(await fresh.ready).origin,freshCookie=await signInOwner(freshOrigin,{bindings:f.bindings});
 const freshRequest=async(suffix,method='GET',body)=>{const response=await fetch(freshOrigin+suffix,{method,headers:{cookie:freshCookie,origin:freshOrigin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data};
 await freshRequest('/api/restore','POST',{archive});const roundtrip=await freshRequest(path);assert.deepEqual(roundtrip.comments,beforeExport.comments.map(comment=>({...comment,author:{id:null,displayName:'Former member'},mentions:comment.mentions.map(mention=>({...mention,recipient:{id:null,displayName:'Former member'}})),history:comment.history.map(history=>({...history,editor:{id:null,displayName:'Former member'}}))})));assert.equal(roundtrip.rootCause.text,'Provider disk full');assert.equal(mail.mentions.length,collaboration.sent,'archive restore never dispatches mentions');
 await proveMentionErasure(f,path,collaboration);
 await ok(`${path}/comments/${comment.id}?version=2`,{method:'DELETE'});detail=await ok(path);assert.equal(detail.comments.find(row=>row.id===comment.id).text,null);assert.deepEqual(detail.comments.find(row=>row.id===comment.id).history,[]);assert.ok(detail.timeline.some(entry=>entry.kind==='comment_deleted'));
 const erased=await ok(`/api/operators/${colleague.id}/erase`,{body:{}});assert.equal(erased.erased,true);detail=await ok(path);assert.equal(detail.comments.find(row=>row.id===comment.id).author.displayName,'Former member');
 const receipt=await ok(`/api/monitors/${monitor.id}/erase`,{body:{name:monitor.definition.name}});for(const table of ['incident_work','incident_comments','incident_timeline'])assert.ok(receipt.receipt.counts[table]>0,`${table} counted in erasure`);
 assert.equal((await f.request(path)).status,404);for(const table of ['incident_work','incident_comments','incident_comment_history','incident_timeline','incident_mentions','incident_mention_authority'])assert.equal((await f.DB.prepare(`SELECT COUNT(*) n FROM ${table} WHERE monitor_id=?`).bind(monitor.id).first()).n,0);
 const audits=(await f.DB.prepare("SELECT * FROM uptime_audit WHERE action LIKE 'incident_%'").all()).results;assert.ok(audits.length);assert.ok(!JSON.stringify(audits).includes('php-fpm'),'audit contains opaque references only');
 await proveOwnIncidentCorrelation(f);
 console.log('INCIDENT-001 / FOLLOWUP-001 / READAPI-001 PASS scoped responder/editor/admin collaboration, live member/key refusal, single-attempt mentions, optimistic edits, category filters, distinct human and machine resolution, restart, archive and erasure through real Worker routes.');
}finally{await fresh?.dispose();await resumed?.dispose();await f.close();await rm(destination,{recursive:true,force:true})}
