import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deliveredLink,sessionCookie} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {autonomousPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';

// A single continuation of the registered native-door journey. Each subject is
// invited independently, before any monitor, alert, runner or delivery exists.
// The oracle models observable role permissions and the resource cross-product;
// it never imports the classifier, its role ranks or its scope comparison.
function authority(person) {
 const actions={
  'read-only':['read','receive'],
  responder:['read','receive','respond','maintenance'],
  editor:['read','receive','respond','maintenance','edit','route'],
 }[person.role];
 assert.ok(actions,'fixture has a native member role');
 const grants=new Set();
 for(const service of ['synthetic-service-a','synthetic-service-b','unrelated','']) {
  for(const team of ['synthetic-team-a','synthetic-team-b','unrelated','']) {
   const allowed=person.scopes.every(scope=>person.scopes
    .filter(other=>other.kind===scope.kind)
    .some(other=>other.value===(scope.kind==='service'?service:team)));
   if(allowed)for(const action of actions)grants.add(JSON.stringify([service,team,action]));
  }
 }
 if(!person.scopes.length)grants.add('workspace');
 return grants;
}
const scope=(kind,value)=>({kind,value});
const serviceA=scope('service','synthetic-service-a'),serviceB=scope('service','synthetic-service-b');
const teamA=scope('team','synthetic-team-a'),teamB=scope('team','synthetic-team-b');
const ordered=scopes=>scopes.map(s=>[s.kind,s.value]).sort();

export async function proveAccessFacts({c,native,call,origin,cookie}) {
 const tool='uptime.access.update';
 await completeSecondFactor(origin,cookie);
 const owner=await native('/api/access/self');
 const roster=()=>native('/api/access/members');
 let fixture=0;
 async function invite(role,scopes) {
  const label='synthetic-uptime-'+(++fixture),email=label+'@'+'example.test';
  const invitation=await call('/api/access/invitations',{email,displayName:label,role,scopes},{cookie});
  assert.equal(invitation.status,202,'native invitation accepts the independent assignment');
  const link=await deliveredLink(call,{email,kind:'invite'});
  const memberCookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
  await completeSecondFactor(origin,memberCookie);
  const self=async()=>{
   const response=await call('/api/access/self',undefined,{cookie:memberCookie});
   assert.equal(response.status,200,'active native member reads its current authority');
   return response.json();
  };
  const person=await self();
  assert.equal(person.role,role);assert.deepEqual(ordered(person.scopes),ordered(scopes));
  return {id:person.id,cookie:memberCookie,self};
 }
 async function read(member) {
  const self=await member.self(),record=(await roster()).find(row=>row.id===member.id);
  assert.ok(record?.assignmentCurrent,'native member assignment is current');
  assert.equal(record.status,'active');assert.equal(record.role,'member');
  assert.equal(record.productRole,self.role);assert.deepEqual(ordered(record.scopes),ordered(self.scopes));
  return self;
 }
 const proof=async args=>({proofReference:(await native('/agents/native-proof',{
  agent_id:c.agentId,tool,arguments:args,
 })).reference});
 const invoke=(args,options)=>c.tool(tool,{...args,expected_revision:args.version,idempotency_key:randomUUID()},options);
 const facts=(answer,direction)=>{
  assert.deepEqual(answer.decision?.classes.map(({class:cls,facts})=>({class:cls,facts})),[
   {class:'access',facts:{measure:1,direction}},
  ],'MCP computes exactly one affected person and the independently observed direction');
 };
 async function audit(answer,member,outcome) {
  const {rows,differs}=await auditRows(c);assert.equal(differs,0);
  const row=rows.find(row=>row.id===answer.decision.id);
  assert.ok(row);assert.deepEqual(row.resource,{kind:'operator',id:member.id});
  assert.equal(row.agent.id,c.agentId);assert.equal(row.sponsor.id,owner.id);
  assert.equal(row.outcome,outcome);
  assert.deepEqual(row.classes,answer.decision.classes.map(({class:cls,facts})=>({class:cls,facts})));
  return rows;
 }
 async function onlyTargetChanged(before,member,next) {
  const after=await roster();
  assert.deepEqual(after.filter(row=>row.id!==member.id),before.filter(row=>row.id!==member.id),
   'only the intended native assignment changes');
  assert.deepEqual(await native('/api/access/self'),owner,'sponsor authority remains unchanged');
  const current=await read(member);
  assert.equal(current.role,next.role);assert.deepEqual(ordered(current.scopes),ordered(next.scopes));
  return current;
 }
 function observedDirection(before,after) {
  const old=authority(before),current=authority(after);
  assert.notDeepEqual(current,old,'the native change has an observable authority effect');
  return [...current].some(grant=>!old.has(grant))?'widens':'narrows';
 }
 await c.adopt(autonomousPolicy());
 const cases=[
  ['role-widen','read-only',[serviceA,teamA],'editor',[serviceA,teamA]],
  ['role-narrow','editor',[serviceA,teamA],'responder',[serviceA,teamA]],
  ['service-broaden','responder',[serviceA,teamA],'responder',[serviceA,serviceB,teamA]],
  ['service-narrow','responder',[serviceA,serviceB,teamA],'responder',[serviceA,teamA]],
  ['team-broaden','responder',[serviceA,teamA],'responder',[serviceA,teamA,teamB]],
  ['team-narrow','responder',[serviceA,teamA,teamB],'responder',[serviceA,teamA]],
  ['workspace-broaden','responder',[serviceA,teamA],'responder',[]],
  ['workspace-narrow','responder',[],'responder',[serviceA,teamA]],
 ];
 for(const [label,role,scopes,nextRole,nextScopes] of cases) {
  const member=await invite(role,scopes),before=await read(member),all=await roster();
  const args={id:member.id,version:before.revision,role:nextRole,scopes:nextScopes};
  if(label==='role-widen') {
   const refused=await invoke(args);
   assert.equal(errorCode(refused),'native_proof_required');
   assert.deepEqual(await roster(),all,'missing human proof leaves member authority unchanged');
  }
  const answer=await invoke(args,await proof(args));
  assert.equal(answer.result?.isError,false,label+': '+errorCode(answer));
  assert.equal(answer.decision.disposition,'autonomous');
  assert.deepEqual(answer.result.structuredContent,{id:member.id,role:nextRole,scopes:nextScopes});
  const after=await onlyTargetChanged(all,member,{role:nextRole,scopes:nextScopes});
  assert.equal(after.revision,before.revision+1);
  const direction=observedDirection(before,after);facts(answer,direction);
  await audit(answer,member,'done');
  if(label==='role-widen') {
   const unchanged=await roster(),stale=await invoke(args,await proof(args));
   assert.equal(errorCode(stale),'revision_conflict');
   assert.deepEqual(await roster(),unchanged,'old assignment version cannot overwrite the current member');
  }
  console.log('PROBE SURFACE-004 '+label+': MCP native member update -> access measure=1 direction='+direction+'; operator audit correlated');
 }
 // Only widening needs this specific native person. The other member cannot
 // approve it; narrowing remains autonomous under the same company policy.
 const heldMember=await invite('responder',[serviceA,teamA]);
 const narrowingMember=await invite('editor',[]);
 const selective=autonomousPolicy();
 selective.rules.push({id:'access-default',class:'access',do:'autonomous'},
  {id:'access-widen',class:'access',direction:'widens',do:'approval',approver:['person:'+c.person.sub],wait:'PT1H'});
 await c.adopt(selective);
 const before=await read(heldMember),all=await roster();
 const args={id:heldMember.id,version:before.revision,role:before.role,scopes:[]};
 const pending=await invoke(args,await proof(args));facts(pending,'widens');
 assert.equal(pending.decision.disposition,'approval');assert.equal(pending.result.resultType,'input_required');
 assert.equal(pending.result.structuredContent,undefined);
 await audit(pending,heldMember,'pending');
 assert.deepEqual(await roster(),all,'held widening changes no member authority');
 const handle=pending.result._meta['com.runeditrun/approval'];
 const path='/agents/api/approvals/'+encodeURIComponent(handle.id);
 const view=(await c.personJson(path)).approval;
 assert.deepEqual(view.summary.nativeTarget,{kind:'operator',id:heldMember.id});
 const decision={revision:view.revision,summary_sha256:view.summary_sha256};
 assert.equal((await call(path+'/approve',decision,{cookie:narrowingMember.cookie})).status,403,
  'an unnamed native person cannot approve widening');
 assert.deepEqual(await roster(),all,'wrong approver changes no assignment');
 const narrowBefore=await read(narrowingMember),narrowAll=await roster();
 const narrowArgs={id:narrowingMember.id,version:narrowBefore.revision,role:'responder',scopes:[]};
 const narrowed=await invoke(narrowArgs,await proof(narrowArgs));
 assert.equal(narrowed.result?.isError,false);assert.equal(narrowed.decision.disposition,'autonomous');
 const narrowAfter=await onlyTargetChanged(narrowAll,narrowingMember,narrowArgs);
 facts(narrowed,observedDirection(narrowBefore,narrowAfter));await audit(narrowed,narrowingMember,'done');
 assert.deepEqual(await read(heldMember),before,'permitted narrowing cannot release another member’s pending widening');
 const approvalBefore=await roster();
 const approved=await c.decideApproval(pending);
 assert.equal(approved.ok,true);assert.equal(approved.body.approval.state,'executed');
 const heldAfter=await onlyTargetChanged(approvalBefore,heldMember,args);
 facts(pending,observedDirection(before,heldAfter));
 const {rows}=await auditRows(c),execution=rows.findLast(row=>row.decision_id===pending.decision.id);
 assert.ok(execution);assert.equal(execution.outcome,'done');
 assert.deepEqual(execution.resource,{kind:'operator',id:heldMember.id});
 assert.deepEqual(execution.approval.by,[owner.id]);
 assert.deepEqual(execution.classes,[{class:'access',facts:{measure:1,direction:'widens'}}]);
 console.log('PROBE SURFACE-004 direction-policy: MCP widening held without writes; unnamed approval refused; narrowing autonomous; named native approval executes once');

 const heldArgs={id:heldMember.id,version:heldAfter.revision,role:'editor',scopes:[]};
 const stalePending=await invoke(heldArgs,await proof(heldArgs));
 assert.equal(stalePending.decision.disposition,'approval');
 await native('/api/access/members/'+heldMember.id,{role:'read-only',scopes:[serviceA]});
 const changed=await roster(),staleApproval=await c.decideApproval(stalePending);
 assert.equal(staleApproval.ok,true);assert.equal(staleApproval.body.approval.state,'refused');
 assert.equal(staleApproval.body.approval.code,'revision_conflict');
 assert.deepEqual(await roster(),changed,'approval cannot overwrite a newer native assignment');
 console.log('PROBE SURFACE-004 current-version: native assignment changed during held MCP widening -> revision_conflict and no overwrite');
 await c.adopt(autonomousPolicy());
 console.log('PASS SURFACE-004 native member role and service and team scope facts, current versions, native proof and direction-selective policy');
}
