import {relaySnapshotGuard} from './agent-relay-state-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prepareIncident} from './agent-conformance/incident.mjs';
import {nativeHttp} from './agent-conformance/http.mjs';
import {autonomousPolicy,heldPolicy,accessToken} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';

// Exact permitted door bookkeeping. All other tables, including authentication,
// credential custody, monitoring, scheduling and notification rows, are compared.
const bookkeeping=new Set(['agent_door_state','agent_door_agents','agent_door_audit',
 'agent_door_calls','agent_door_approvals','agent_door_reviews','agent_door_events',
 'agent_door_usage','public_rate_limits']);
const nativeEffects=new Set(['incident_comments','incident_comment_history','incident_timeline','uptime_audit']);
const classes=[{class:'standard',facts:{measure:1}},{class:'destructive',facts:{measure:1}}];
const facts=answer=>answer.decision?.classes.map(({class:cls,facts})=>({class:cls,facts}));

export async function proveCommentDeletion({c,native,db,proof,providerRequests,reviewer}) {
 const wire=providerRequests.length;
 const tool='uptime.incidents.note',owner=await native('/api/access/self');
 const http=nativeHttp({request:fetch,origin:c.origin,cookie:c.person.cookie});
 const {incident}=await prepareIncident(http),other=await prepareIncident(http);
 const path='/api/incidents/'+encodeURIComponent(incident.id);
 const detail=()=>native('/api/v1/incidents/'+encodeURIComponent(incident.id));
 const checkRelay=relaySnapshotGuard(c.business);
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results,state={};
  for(const {name} of tables)state[name]=(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  checkRelay(state);
  return Object.fromEntries(Object.entries(state).filter(([name])=>!bookkeeping.has(name)&&name!=='agent_door_relay'));
 };
 const unchangedExcept=(before,after,allowed)=>{
  assert.deepEqual(Object.keys(after),Object.keys(before));
  for(const table of Object.keys(before))if(!allowed.has(table))assert.deepEqual(after[table],before[table],table+' remains unchanged');
 };
 const create=async()=>{
  const original='synthetic-uptime-original-'+randomUUID(),text='synthetic-uptime-edited-'+randomUUID();
  const comment=await native(path+'/comments',{text:original,mentions:[]});
  const edit=await native(path+'/comments/'+comment.id,{text,version:comment.version,mentions:[]},'PATCH');
  const saved=(await detail()).comments.find(row=>row.id===comment.id);
  assert.equal(saved.text,text);assert.equal(saved.version,edit.version);
  assert.deepEqual(saved.history.map(row=>({version:row.version,text:row.text})),[{version:1,text:original}]);
  assert.deepEqual(saved.mentions,[]);
  return {id:comment.id,version:edit.version,original,text};
 };
 const argsFor=comment=>({id:incident.id,action:'delete',comment_id:comment.id,version:comment.version,expected_revision:comment.version,idempotency_key:randomUUID()});
 async function refused(args,code,options) {
  const before=await snapshot(),wire=providerRequests.length,answer=await c.tool(tool,args,options);
  assert.equal(errorCode(answer),code);assert.equal(answer.result?.structuredContent,undefined);
  assert.deepEqual(await snapshot(),before,'refused deletion changes no native record');
  assert.equal(providerRequests.length,wire);return answer;
 }
 async function deleted(comment,before,approvers) {
  const after=await snapshot();unchangedExcept(before,after,nativeEffects);
  const old=before.incident_comments.find(row=>row.id===comment.id),tombstone=after.incident_comments.find(row=>row.id===comment.id);
  assert.ok(tombstone.deleted_at);assert.deepEqual(tombstone,{...old,text:null,version:old.version+1,updated_at:tombstone.deleted_at,deleted_at:tombstone.deleted_at});
  assert.deepEqual(after.incident_comments.filter(row=>row.id!==comment.id),before.incident_comments.filter(row=>row.id!==comment.id));
  assert.deepEqual(after.incident_comment_history,before.incident_comment_history.filter(row=>row.comment_id!==comment.id));
  const additions=after.incident_timeline.filter(row=>!before.incident_timeline.some(old=>old.id===row.id));
  assert.equal(additions.length,1);const [entry]=additions;
  assert.equal(entry.kind,'comment_deleted');assert.equal(entry.incident_id,incident.id);assert.equal(entry.actor_id,owner.id);assert.equal(entry.occurred_at,tombstone.deleted_at);
  const attribution=JSON.parse(entry.data);assert.equal(attribution.commentId,comment.id);assert.equal(attribution.version,comment.version+1);
  assert.equal(attribution.preparedBy.agent.id,c.agentId);assert.equal(attribution.preparedBy.for.id,owner.id);
  assert.deepEqual(attribution.approvers.map(person=>person.id),approvers);
  assert.deepEqual(after.incident_timeline.filter(row=>row.id!==entry.id),before.incident_timeline);
  const audits=after.uptime_audit.filter(row=>!before.uptime_audit.some(old=>old.id===row.id));
  assert.deepEqual(audits.map(row=>row.action).sort(),['access_respond','incident_comment_delete']);
  assert.ok(audits.every(row=>row.actor_kind==='operator'&&row.actor_ref===owner.id));
  assert.deepEqual(after.uptime_audit.filter(row=>!audits.some(added=>added.id===row.id)),before.uptime_audit);
  const read=await detail(),visible=read.comments.find(row=>row.id===comment.id);
  assert.equal(visible.text,null);assert.equal(visible.version,comment.version+1);assert.deepEqual(visible.history,[]);
  assert.ok(!JSON.stringify(read).includes(comment.original));assert.ok(!JSON.stringify(read).includes(comment.text));
  const agent=await c.tool('uptime.incidents.read',{id:incident.id});assert.equal(agent.result?.isError,false);
  assert.ok(!JSON.stringify(agent.result.structuredContent).includes(comment.original));assert.ok(!JSON.stringify(agent.result.structuredContent).includes(comment.text));
  return after;
 }
 const listed=await c.mcp('tools/list');
 assert.equal(listed.result.tools.find(row=>row.name===tool).annotations.destructiveHint,true,'discovery truthfully warns that the note tool can destroy comment text and history');
 assert.equal(providerRequests.length,wire,'native incident preparation uses no provider traffic');
 for(const version of ['2026-07-28','2025-11-25'])for(const held of [false,true]) {
  const policy=held?heldPolicy():autonomousPolicy();
  if(held)policy.rules[0].approver=['person:'+reviewer.sub];
  await c.adopt(policy);
  // The retained add request stays standard under both policies and eras.
  const added=await c.tool(tool,{id:incident.id,text:'synthetic-uptime-add-'+randomUUID()},{version});
  assert.equal(added.result?.isError,false);assert.deepEqual(facts(added),[{class:'standard',facts:{measure:1}}]);
  assert.equal(added.decision.disposition,held?'review':'autonomous');
  const comment=await create(),args=argsFor(comment),before=await snapshot();
  await refused({...args,version:comment.version-1,idempotency_key:randomUUID()},'revision_conflict',{version});
  await refused({...args,id:other.incident.id,idempotency_key:randomUUID()},'not_found',{version});
  await refused({...args,text:'synthetic-uptime-conflicting-add',idempotency_key:randomUUID()},'invalid_arguments',{version});
  // Neither these ignored claims nor comment text supplies the count or consent.
  const invoke=()=>c.tool(tool,{...args,comment_count:0,confirmed:true,destructive:false},{version});
  const answer=await invoke();assert.deepEqual(facts(answer),classes);
  assert.equal(answer.decision.disposition,held?'approval':'autonomous');
  const audited=(await auditRows(c)).rows.find(row=>row.id===answer.decision.id);
  assert.deepEqual(audited.resource,{kind:'incident',id:incident.id});
  if(held) {
   if(version==='2026-07-28')assert.equal(answer.result.resultType,'input_required');
   else assert.equal(errorCode(answer),'approval_required','the earlier MCP era returns its explicit approval refusal');
   assert.equal(answer.result.structuredContent,undefined);
   assert.deepEqual(await snapshot(),before,'approval wait preserves text, edit history and every native table');
   const handle=answer.result._meta['com.runeditrun/approval']??answer.result._meta['com.runeditrun/error'].approval;
   const approvalPath='/agents/api/approvals/'+encodeURIComponent(handle.id),{approval}=await c.personJson(approvalPath);
   assert.deepEqual(approval.summary.nativeTarget,{kind:'incident',id:incident.id});
   assert.ok(approval.summary.items.includes('Comment: '+comment.id));assert.ok(approval.summary.items.includes('Expected comment version: '+comment.version));
   const decision={revision:approval.revision,summary_sha256:approval.summary_sha256};
   const wrong=await c.personRequest(approvalPath+'/approve',{method:'POST',body:JSON.stringify(decision)});
   assert.equal(wrong.status,403,'the sponsor cannot substitute for the actual named approver');await wrong.body?.cancel();
   const tampered=await c.personRequest(approvalPath+'/approve',{method:'POST',headers:{Cookie:reviewer.cookie},body:JSON.stringify({...decision,summary_sha256:'0'.repeat(64)})});
   assert.equal(tampered.status,409);await tampered.body?.cancel();assert.deepEqual(await snapshot(),before);
   if(version==='2026-07-28')await proof.capture('comment-delete-approval',new URL(handle.url).pathname);
   const approved=await c.personRequest(approvalPath+'/approve',{method:'POST',headers:{Cookie:reviewer.cookie},body:JSON.stringify(decision)});
   assert.equal(approved.status,200);assert.equal((await approved.json()).approval.state,'executed');
   const saved=await deleted(comment,before,[reviewer.id]);
   const again=await c.personRequest(approvalPath+'/approve',{method:'POST',headers:{Cookie:reviewer.cookie},body:JSON.stringify(decision)});
   assert.equal((await again.json()).approval.state,'executed');assert.deepEqual(await snapshot(),saved);
  } else {assert.equal(answer.result?.isError,false);await deleted(comment,before,[])}
  const after=await snapshot(),replay=await invoke();assert.equal(replay.result?.isError,false);
  assert.deepEqual(replay.result.structuredContent,{incidentId:incident.id,id:comment.id,version:comment.version+1,deleted:true});
  assert.deepEqual(facts(replay),classes);assert.deepEqual(await snapshot(),after,'exact-key replay has no second native deletion effect');
  await refused({...args,idempotency_key:randomUUID()},'not_found',{version});
  const deniedPolicy=autonomousPolicy();deniedPolicy.rules.push({id:'destruction-blocked',class:'destructive',do:'blocked'});await c.adopt(deniedPolicy);
  await refused({...args,comment_count:0,confirmed:true,destructive:false},'policy_blocked',{version});
  await c.adopt(autonomousPolicy());
  // Current native authority is required even for the retained exact-key result.
  const noScope=await accessToken(c,{scope:'uptime:read'});
  await refused(args,'insufficient_scope',{version,token:noScope});
  console.log('PROBE SURFACE-004 comment-delete-'+version+'-'+(held?'held':'autonomous')+': MCP explicit saved comment and version -> standard + destructive measure 1, incident target, one tombstone, no text or edit history, replay unchanged; stale and mismatched references refuse');
 }
 // A queued approval must not consume an edit made through the native owner door.
 const held=heldPolicy();held.rules[0].approver=['person:'+reviewer.sub];await c.adopt(held);
 const comment=await create(),args=argsFor(comment),pending=await c.tool(tool,args);
 await native(path+'/comments/'+comment.id,{text:'synthetic-uptime-newer',version:comment.version,mentions:[]},'PATCH');
 const before=await snapshot(),handle=pending.result._meta['com.runeditrun/approval'],approvalPath='/agents/api/approvals/'+handle.id;
 const {approval}=await c.personJson(approvalPath);
 const approved=await c.personRequest(approvalPath+'/approve',{method:'POST',headers:{Cookie:reviewer.cookie},body:JSON.stringify({revision:approval.revision,summary_sha256:approval.summary_sha256})});
 const stale=await approved.json();assert.equal(stale.approval.state,'refused');assert.equal(stale.approval.code,'revision_conflict');
 assert.deepEqual(await snapshot(),before,'native editing after preparation invalidates the saved deletion');
 // Exercise native author and responder restrictions with an independently
 // mapped person. Changing that person's role or scope also fences replay.
 await c.adopt(autonomousPolicy());
 const memberHttp=nativeHttp({request:fetch,origin:c.origin,cookie:reviewer.cookie});
 const owned=await memberHttp.json(path+'/comments',{text:'synthetic-uptime-responder',mentions:[]});
 await completeSecondFactor(c.origin,c.person.cookie);
 await native('/api/access/members/'+reviewer.id,{role:'responder',scopes:[]});
 const memberRecord=(await native('/api/access/members')).find(person=>person.id===reviewer.id);
 assert.ok(memberRecord);
 const memberToken=await accessToken(c,{sub:reviewer.sub,email:memberRecord.email,act:{sub:'synthetic-uptime-'+randomUUID(),name:'Synthetic responder',specialist:'monitoring-operator'}});
 const options={token:memberToken,track:false};
 await refused(argsFor(comment),'native_permission_required',options);
 const ownArgs=argsFor(owned),ownBefore=await snapshot(),ownDelete=await c.tool(tool,ownArgs,options);
 assert.equal(ownDelete.result?.isError,false,'a scoped responder can delete their own comment');
 assert.equal(ownDelete.result.structuredContent.deleted,true);
 assert.equal((await detail()).comments.find(row=>row.id===owned.id).text,null);
 unchangedExcept(ownBefore,await snapshot(),nativeEffects);
 const deletedState=await snapshot();
 assert.deepEqual((await c.tool(tool,ownArgs,options)).result.structuredContent,ownDelete.result.structuredContent);
 assert.deepEqual(await snapshot(),deletedState);
 await completeSecondFactor(c.origin,c.person.cookie);
 await native('/api/access/members/'+reviewer.id,{role:'responder',scopes:[{kind:'service',value:'synthetic-uptime-outside'}]});
 await refused(ownArgs,'not_found',options);
 await completeSecondFactor(c.origin,c.person.cookie);
 await native('/api/access/members/'+reviewer.id,{role:'read-only',scopes:[]});
 await refused(ownArgs,'native_permission_required',options);
 await completeSecondFactor(c.origin,c.person.cookie);
 await native('/api/access/members/'+reviewer.id,{role:'admin',scopes:[]});
 const asAdmin=await create(),admin=await c.tool(tool,argsFor(asAdmin),options);
 assert.equal(admin.result?.isError,false,'a current native administrator can delete another author’s comment');
 assert.equal(admin.result.structuredContent.deleted,true);
 const adminDeleted=(await detail()).comments.find(row=>row.id===asAdmin.id);
 assert.equal(adminDeleted.text,null);assert.deepEqual(adminDeleted.history,[]);
 console.log('PROBE SURFACE-004 native-authority: responder own deletion -> allowed; foreign author, out-of-scope replay and read-only replay -> refused unchanged; administrator deletion -> allowed');
 assert.equal(providerRequests.length,wire,'the entire comment journey makes zero provider requests');
 await c.adopt(autonomousPolicy());
 console.log('PROBE SURFACE-004 approval-version: named native approval after owner edit -> revision_conflict, newer text and history unchanged');
}
