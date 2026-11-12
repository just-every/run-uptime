import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {relaySnapshotGuard} from './agent-relay-state-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {prepareIncident} from './agent-conformance/incident.mjs';
import {nativeHttp} from './agent-conformance/http.mjs';
import {autonomousPolicy,heldPolicy,accessToken} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';

const bookkeeping=new Set(['agent_door_state','agent_door_agents','agent_door_audit',
 'agent_door_calls','agent_door_approvals','agent_door_reviews','agent_door_events',
 'agent_door_usage','public_rate_limits']);
const nativeEffects=new Set(['incident_comments','incident_comment_history','incident_timeline','uptime_audit']);
const standard=[{class:'standard',facts:{measure:1}}];
const facts=answer=>answer.decision?.classes.map(({class:cls,facts})=>({class:cls,facts}));

// One continuation of the registered native journey. All comments are mention-free;
// native mention reconciliation remains authoritative outside this fixture.
export async function proveCommentEditing({c,native,db,providerRequests,reviewer}) {
 const wire=providerRequests.length,tool='uptime.incidents.note',owner=await native('/api/access/self');
 const http=nativeHttp({request:fetch,origin:c.origin,cookie:c.person.cookie});
 const {incident}=await prepareIncident(http),other=await prepareIncident(http);
 const path='/api/incidents/'+incident.id;
 const detail=()=>native('/api/v1/incidents/'+incident.id);
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
  const text='synthetic-uptime-original-'+randomUUID();
  return {...await native(path+'/comments',{text,mentions:[]}),text};
 };
 const argsFor=comment=>({id:incident.id,action:'edit',comment_id:comment.id,text:'synthetic-uptime-edited-'+randomUUID(),version:comment.version,expected_revision:comment.version,idempotency_key:randomUUID()});
 async function refused(args,code,options) {
  const before=await snapshot(),answer=await c.tool(tool,args,options);
  assert.equal(errorCode(answer),code);assert.equal(answer.result?.structuredContent,undefined);
  assert.deepEqual(await snapshot(),before,'refused edit preserves every native record');
  assert.equal(providerRequests.length,wire);return answer;
 }
 async function edited(comment,args,before,actorId,agentId,approvers=[]) {
  const after=await snapshot();unchangedExcept(before,after,nativeEffects);
  const old=before.incident_comments.find(row=>row.id===comment.id),saved=after.incident_comments.find(row=>row.id===comment.id);
  assert.deepEqual(saved,{...old,text:args.text,version:old.version+1,updated_at:saved.updated_at});
  assert.deepEqual(after.incident_comments.filter(row=>row.id!==comment.id),before.incident_comments.filter(row=>row.id!==comment.id));
  const histories=after.incident_comment_history.filter(row=>!before.incident_comment_history.some(old=>old.id===row.id));
  assert.equal(histories.length,1);const [history]=histories;
  assert.equal(history.comment_id,comment.id);assert.equal(history.incident_id,incident.id);assert.equal(history.monitor_id,old.monitor_id);
  assert.equal(history.text,comment.text);assert.equal(history.version,comment.version);assert.equal(history.editor_id,actorId);assert.equal(history.edited_at,saved.updated_at);
  assert.deepEqual(after.incident_comment_history.filter(row=>row.id!==history.id),before.incident_comment_history);
  const entries=after.incident_timeline.filter(row=>!before.incident_timeline.some(old=>old.id===row.id));
  assert.equal(entries.length,1);const [entry]=entries;
  assert.equal(entry.kind,'comment_edited');assert.equal(entry.incident_id,incident.id);assert.equal(entry.actor_id,actorId);assert.equal(entry.occurred_at,saved.updated_at);
  const attribution=JSON.parse(entry.data);assert.equal(attribution.commentId,comment.id);assert.equal(attribution.version,comment.version+1);
  assert.equal(attribution.preparedBy.agent.id,agentId);assert.equal(attribution.preparedBy.for.id,actorId);
  assert.deepEqual(attribution.approvers.map(person=>person.id),approvers);
  assert.deepEqual(after.incident_timeline.filter(row=>row.id!==entry.id),before.incident_timeline);
  const audits=after.uptime_audit.filter(row=>!before.uptime_audit.some(old=>old.id===row.id));
  assert.deepEqual(audits.map(row=>row.action).sort(),['access_respond','incident_comment_edit']);
  assert.ok(audits.every(row=>row.actor_kind==='operator'&&row.actor_ref===actorId));
  assert.deepEqual(after.uptime_audit.filter(row=>!audits.some(added=>added.id===row.id)),before.uptime_audit);
  const nativeDetail=await detail(),visible=nativeDetail.comments.find(row=>row.id===comment.id);
  const nativeEntry=nativeDetail.timeline.find(row=>row.id===entry.id);
  assert.equal(nativeEntry.actor.kind,'agent');assert.equal(nativeEntry.actor.agent.id,agentId);assert.equal(nativeEntry.actor.sponsor.id,actorId);
  assert.deepEqual(nativeEntry.actor.approvers.map(person=>person.id),approvers);
  assert.equal(visible.text,args.text);assert.equal(visible.version,comment.version+1);assert.deepEqual(visible.mentions,[]);
  assert.deepEqual(visible.history.map(row=>({version:row.version,text:row.text})),[{version:comment.version,text:comment.text}]);
  const read=await c.tool('uptime.incidents.read',{id:incident.id});assert.equal(read.result?.isError,false);
  const remote=read.result.structuredContent.comments.find(row=>row.id===comment.id);
  assert.equal(remote.text,visible.text);assert.equal(remote.version,visible.version);
  assert.deepEqual(read.result.structuredContent.timeline.find(row=>row.id===entry.id).actor,nativeEntry.actor);
  assert.deepEqual(read.result.structuredContent.timeline.find(row=>row.id===entry.id).data.preparedBy,attribution.preparedBy);
  return after;
 }
 for(const version of ['2026-07-28','2025-11-25'])for(const held of [false,true]) {
  const policy=held?heldPolicy():autonomousPolicy();policy.rules.push({id:'destruction-blocked',class:'destructive',do:'blocked'});await c.adopt(policy);
  const comment=await create(),args=argsFor(comment),before=await snapshot();
  const answer=await c.tool(tool,{...args,preparedBy:{agent:{id:'synthetic-uptime-forged'}},approvers:[{id:'synthetic-uptime-forged'}],classes:['destructive']},{version});assert.equal(answer.result?.isError,false);assert.deepEqual(facts(answer),standard);
  assert.equal(answer.decision.disposition,held?'review':'autonomous');
  assert.deepEqual(answer.result.structuredContent,{incidentId:incident.id,id:comment.id,version:comment.version+1,deleted:false});
  await edited(comment,args,before,owner.id,c.agentId);
  const audited=(await auditRows(c)).rows.find(row=>row.id===answer.decision.id);
  assert.deepEqual(audited.resource,{kind:'incident',id:incident.id});assert.equal(audited.outcome,'done');
  for(const field of ['preparedBy','approvers','classes'])assert.ok(audited.ignored_arguments.includes(field));
  const reviews=(await c.personJson('/agents/api/reviews')).reviews;
  assert.equal(reviews.filter(row=>row.decision_id===answer.decision.id).length,held?1:0);
  const after=await snapshot(),replay=await c.tool(tool,args,{version});assert.equal(replay.result?.isError,false);
  assert.deepEqual(replay.result.structuredContent,answer.result.structuredContent);assert.deepEqual(facts(replay),standard);
  assert.deepEqual(await snapshot(),after,'exact-key replay creates no second edit or history revision');
  await refused({...args,idempotency_key:randomUUID()},'revision_conflict',{version});
  await refused({...args,id:other.incident.id,idempotency_key:randomUUID()},'not_found',{version});
  for(const malformed of [{...args,action:undefined},{...args,text:undefined},{...args,comment_id:undefined},{...args,action:'delete'}])await refused({...malformed,idempotency_key:randomUUID()},'invalid_arguments',{version});
  const current={...args,version:comment.version+1,expected_revision:comment.version+1,idempotency_key:randomUUID()};
  await refused({...current,action:'delete',text:undefined},'policy_blocked',{version});
  const noScope=await accessToken(c,{scope:'uptime:read'});await refused(args,'insufficient_scope',{version,token:noScope});
  await native(path+'/comments/'+comment.id,{version:comment.version+1},'DELETE');
  await refused({...current,idempotency_key:randomUUID()},'not_found',{version});
  await refused(args,'not_found',{version});
  console.log('PROBE SURFACE-004 comment-edit-'+version+'-'+(held?'held':'autonomous')+': standard edit with destructive blocked -> one native edit and history revision, attributable timeline, effect-free replay; stale, foreign, deleted and malformed targets refused with unrelated durable state preserved');
 }
 // An ordinary standard approval rule still binds the saved edit to the genuine
 // named person and invalidates it after a native edit changes the version.
 const approvalPolicy=autonomousPolicy();approvalPolicy.rules.push({id:'standard-approval',class:'standard',do:'approval',approver:['person:'+reviewer.sub],wait:'PT1H'},{id:'destruction-blocked',class:'destructive',do:'blocked'});
 await c.adopt(approvalPolicy);
 const comment=await create(),args=argsFor(comment),before=await snapshot(),pending=await c.tool(tool,args);
 assert.deepEqual(facts(pending),standard);assert.equal(pending.decision.disposition,'approval');assert.deepEqual(await snapshot(),before);
 const approvalPath='/agents/api/approvals/'+pending.result._meta['com.runeditrun/approval'].id;
 const {approval}=await c.personJson(approvalPath),decision={revision:approval.revision,summary_sha256:approval.summary_sha256};
 assert.ok(approval.summary.items.includes('Text: '+args.text));assert.ok(approval.summary.items.includes('Expected comment version: '+comment.version));
 const wrong=await c.personRequest(approvalPath+'/approve',{method:'POST',body:JSON.stringify(decision)});
 assert.equal(wrong.status,403);await wrong.body?.cancel();assert.deepEqual(await snapshot(),before);
 const approved=await c.personRequest(approvalPath+'/approve',{method:'POST',headers:{Cookie:reviewer.cookie},body:JSON.stringify(decision)});
 assert.equal(approved.status,200);assert.equal((await approved.json()).approval.state,'executed');
 const after=await edited(comment,args,before,owner.id,c.agentId,[reviewer.id]);
 assert.deepEqual((await c.tool(tool,args)).result.structuredContent,{incidentId:incident.id,id:comment.id,version:comment.version+1,deleted:false});assert.deepEqual(await snapshot(),after);
 const staleComment=await create(),staleArgs=argsFor(staleComment),stalePending=await c.tool(tool,staleArgs);
 await native(path+'/comments/'+staleComment.id,{text:'synthetic-uptime-newer',version:staleComment.version,mentions:[]},'PATCH');
 const newer=await snapshot(),stalePath='/agents/api/approvals/'+stalePending.result._meta['com.runeditrun/approval'].id,{approval:staleApproval}=await c.personJson(stalePath);
 const stale=await c.personRequest(stalePath+'/approve',{method:'POST',headers:{Cookie:reviewer.cookie},body:JSON.stringify({revision:staleApproval.revision,summary_sha256:staleApproval.summary_sha256})});
 const refusal=(await stale.json()).approval;assert.equal(refusal.state,'refused');assert.equal(refusal.code,'revision_conflict');assert.deepEqual(await snapshot(),newer);
 await c.adopt(autonomousPolicy());
 // Sponsor authority is native, including author restrictions and current scope
 // on replay. An agent cannot borrow a human reviewer's permissions.
 await completeSecondFactor(c.origin,c.person.cookie);await native('/api/access/members/'+reviewer.id,{role:'responder',scopes:[]});
 const memberRecord=(await native('/api/access/members')).find(person=>person.id===reviewer.id),memberAgent='synthetic-uptime-'+randomUUID();
 const token=await accessToken(c,{sub:reviewer.sub,email:memberRecord.email,act:{sub:memberAgent,name:'Synthetic responder',specialist:'monitoring-operator'}}),options={token,track:false};
 await refused(argsFor(staleComment),'native_permission_required',options);
 const memberHttp=nativeHttp({request:fetch,origin:c.origin,cookie:reviewer.cookie}),owned=await memberHttp.json(path+'/comments',{text:'synthetic-uptime-responder',mentions:[]});
 const ownArgs=argsFor({...owned,text:'synthetic-uptime-responder'}),ownBefore=await snapshot(),ownEdit=await c.tool(tool,ownArgs,options);assert.equal(ownEdit.result?.isError,false);
 await edited({...owned,text:'synthetic-uptime-responder'},ownArgs,ownBefore,reviewer.id,memberAgent);
 await completeSecondFactor(c.origin,c.person.cookie);await native('/api/access/members/'+reviewer.id,{role:'responder',scopes:[{kind:'service',value:'synthetic-uptime-outside'}]});
 await refused(ownArgs,'not_found',options);
 await completeSecondFactor(c.origin,c.person.cookie);await native('/api/access/members/'+reviewer.id,{role:'read-only',scopes:[]});
 await refused(ownArgs,'native_permission_required',options);
 await completeSecondFactor(c.origin,c.person.cookie);await native('/api/access/members/'+reviewer.id,{role:'admin',scopes:[]});
 const adminComment=await create(),adminArgs=argsFor(adminComment),adminBefore=await snapshot(),adminEdit=await c.tool(tool,adminArgs,options);assert.equal(adminEdit.result?.isError,false);
 await edited(adminComment,adminArgs,adminBefore,reviewer.id,memberAgent);
 assert.equal(providerRequests.length,wire,'the complete mention-free edit journey uses zero provider traffic');
 await c.adopt(autonomousPolicy());
 console.log('PROBE SURFACE-004 comment-edit-authority: genuine named approval -> one edit; newer native edit -> stale approval refused; responder own edit and administrator foreign edit -> allowed; foreign author and narrowed replay -> refused unchanged; zero provider traffic');
}
