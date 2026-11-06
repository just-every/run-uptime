import {relaySnapshotGuard} from './agent-relay-state-support.mjs';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';

// These are the only permitted non-product changes during an agent call:
// policy decision lock, agent request count, audit, exact-key result, approval,
// review, event and usage records, plus the HTTP admission rate counter.
// In particular, no authentication, runner, custody or scheduling table is
// exempted by a prefix or by being empty in this installation.
const bookkeeping=new Set(['agent_door_state','agent_door_agents','agent_door_audit',
 'agent_door_calls','agent_door_approvals','agent_door_reviews','agent_door_events',
 'agent_door_usage','public_rate_limits']);
const creations={monitors:'id',revisions:'monitor_id',evidence_generation:'monitor_id',uptime_agent_revisions:'monitor_id'};
const standard=[{class:'standard',facts:{measure:1}}];
const live=[{class:'live',facts:{measure:1,service:'synthetic-uptime-create'}},
 {class:'external',facts:{measure:1,counterparty:'public'}}];
const classes=answer=>answer.decision.classes.map(({class:cls,facts})=>({class:cls,facts}));

export async function provePausedCreation({c,native,db,providerRequests,proof}) {
 const owner=await native('/api/access/self');
 // Enroll independent authority through the native owner and signed runner
 // doors, then never poll it. No existing journey's runner can claim this work.
 const networkLabel='synthetic-uptime-create-'+randomUUID();
 const runner=await native('/api/runners',{networkLabel});
 const assignment={runnerId:runner.runnerId,networkLabel,canaryUrl:'https://synthetic-uptime-canary.example.test/'};
 const at=String(Date.now()),raw=JSON.stringify({version:1});
 const signature=createHmac('sha256',runner.key).update(at+'.runner-enrolment.'+raw).digest('hex');
 const enrolled=await fetch(c.origin+'/api/runner/enroll',{method:'POST',
  headers:{origin:c.origin,'content-type':'application/json','x-runner-key':runner.key,
   'x-runner-id':runner.runnerId,'x-sent-at':at,'x-runner-signature':signature},body:raw});
 assert.equal(enrolled.status,200);await enrolled.body?.cancel();
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results.map(row=>row.name);
 const checkRelay=relaySnapshotGuard(c.business);
 const snapshot=async()=>{
  const rows=await db.batch(tables.map(name=>db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"')));
  const state=Object.fromEntries(tables.map((name,index)=>[name,
   rows[index].results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
  checkRelay(state);
  return Object.fromEntries(Object.entries(state).filter(([name])=>!bookkeeping.has(name)&&name!=='agent_door_relay'));
 };
 const inventory=()=>native('/api/v1/monitors?limit=100');
 async function oneCreation(before,answer,input,enabled) {
  assert.equal(answer.result?.isError,false);
  const record=answer.result.structuredContent,id=record.id,after=await snapshot();
  for(const [table,rows] of Object.entries(before)){
   if(table==='uptime_audit'){
    const prior=new Set(rows.map(row=>row.id)),added=after[table].filter(row=>!prior.has(row.id));
    assert.deepEqual(after[table].filter(row=>prior.has(row.id)),rows,'all prior native audit records remain immutable');
    assert.equal(added.length,1,'creation appends exactly its native authority receipt');
    assert.equal(added[0].action,'access_check_write');assert.equal(added[0].actor_kind,'operator');
    assert.equal(added[0].actor_ref,owner.id);assert.equal(added[0].subject_kind,'operator');
    continue;
   }
   const key=creations[table];
   if(!key){assert.deepEqual(after[table],rows,table+' is outside the selected creation effects');continue}
   assert.deepEqual(after[table].filter(row=>row[key]!==id),rows,table+' retains every prior record');
   assert.equal(after[table].filter(row=>row[key]===id).length,1,table+' appends one first-revision record');
  }
  const monitor=after.monitors.find(row=>row.id===id),revision=after.revisions.find(row=>row.monitor_id===id);
  assert.equal(monitor.revision,1);assert.equal(revision.revision,1);
  assert.equal(monitor.definition,revision.definition,'the immutable first revision is the saved native definition');
  const saved=JSON.parse(revision.definition);
  for(const [key,value] of Object.entries(input))assert.deepEqual(saved[key],value,'native validation retains reviewed '+key);
  assert.equal(saved.enabled,enabled,'omission retains native enabled-by-default semantics');
  assert.deepEqual(saved.assignments,{'local-a':assignment});
  const visible=await native('/api/v1/monitors/'+id);
  assert.equal(visible.name,input.name);assert.equal(visible.enabled,enabled);assert.equal(visible.revision,1);
  assert.equal(visible.current.state,enabled?'Unknown':'Paused');assert.equal(visible.current.lastCheckAt,null);
  const matches=(await inventory()).items.filter(row=>row.name===input.name);
  assert.deepEqual(matches.map(row=>row.id),[id],'the ordinary owner inventory sees exactly one created monitor');
  // Agent revision reads do not kick the console's hosted worker.
  const read=await c.tool('uptime.monitors.revisions',{id});
  assert.equal(read.result?.isError,false);
  const items=read.result.structuredContent.items;
  assert.equal(items.length,1);assert.equal(items[0].revision,1);
  assert.equal(items[0].definition.name,input.name);assert.equal(items[0].definition.enabled,enabled);
  const principal=JSON.parse(after.uptime_agent_revisions.find(row=>row.monitor_id===id).principal);
  assert.equal(principal.person.id,owner.id);assert.equal(principal.agent.id,c.agentId);
  return {id,state:after,principal};
 }
 const traffic=providerRequests.length;
 for(const version of ['2026-07-28','2025-11-25']){
  const invoke=args=>c.tool('uptime.monitors.create',args,{version});
  const definition=()=>({name:'synthetic-uptime-create-'+randomUUID(),type:'http',network:'public',
   url:'https://agent-native.example.test/health',method:'GET',assertions:{status:200},
   intervalMs:60000,timeoutMs:2000,retries:0,probes:['local-a'],
   assignments:{'local-a':assignment},failureQuorum:1,confirmSlots:1,
   recoverSlots:1,freshnessMs:120000,service:'synthetic-uptime-create'});
  for(const held of [false,true]){
   await c.adopt(held?heldPolicy():autonomousPolicy());
   for(const enabled of [false,true,undefined]){
    const input={...definition(),...(enabled===undefined?{}:{enabled})},args={definition:input,idempotency_key:randomUUID()};
    const before=await snapshot(),answer=await invoke(args),expected=enabled===false?standard:live;
    assert.deepEqual(classes(answer),expected,'expected effects come from the independently reviewed plain HTTP input');
    assert.equal(answer.decision.disposition,held?(enabled===false?'review':'approval'):'autonomous');
    let completed=answer,approvers=[];
    if(held&&enabled!==false){
     if(version==='2025-11-25'){
      assert.equal(answer.result.resultType,'complete');assert.equal(answer.result.isError,true);
      assert.equal(errorCode(answer),'approval_required');
     }else assert.equal(answer.result.resultType,'input_required');
     assert.equal(answer.result.structuredContent,undefined);
     const handle=version==='2025-11-25'?answer.result._meta['com.runeditrun/error'].approval:answer.result._meta['com.runeditrun/approval'];
     assert.ok(handle?.id,'both protocol eras expose the native person approval');
     assert.deepEqual(await snapshot(),before,'held enabled creation writes no product record before person approval');
     const path='/agents/api/approvals/'+encodeURIComponent(handle.id);
     const {approval}=await c.personJson(path);
     assert.equal(approval.decision_id,answer.decision.id);assert.equal(approval.revision,answer.decision.revision);
     assert.equal(approval.summary.target.name,input.name);
     assert.ok(approval.summary.items.some(item=>item.includes(input.name)),'the person sees the reviewed creation name');
     assert.ok(approval.summary.items.some(item=>item.includes(input.url)),'the person sees the reviewed HTTP target');
     const approved=await c.personRequest(path+'/approve',{method:'POST',body:JSON.stringify({revision:approval.revision,summary_sha256:approval.summary_sha256})});
     assert.equal(approved.status,200);assert.equal((await approved.json()).approval.state,'executed');
     approvers=[owner.id];
     completed=await invoke(args);
     assert.deepEqual(completed.result._meta['com.runeditrun/receipt'].approved_by,approvers);
     assert.equal(completed.result._meta['com.runeditrun/receipt'].prepared_by.for.id,owner.id);
     assert.equal(completed.result._meta['com.runeditrun/receipt'].prepared_by.agent.id,c.agentId);
    }
    const created=await oneCreation(before,completed,input,enabled!==false);
    assert.deepEqual(created.principal.approvers.map(person=>person.id),approvers);
    const original=await snapshot(),repeated=await invoke(args);
    assert.equal(repeated.result?.isError,false);
    assert.deepEqual(repeated.result.structuredContent,completed.result.structuredContent);
    assert.deepEqual(await snapshot(),original,'exact-key replay cannot create a second monitor, revision or other native record');
    const {rows,differs}=await auditRows(c);assert.equal(differs,0);
    const audit=rows.find(row=>row.id===answer.decision.id);
    assert.equal(audit.sponsor.id,owner.id);assert.equal(audit.agent.id,c.agentId);
    assert.equal(audit.tool,'uptime.monitors.create');assert.deepEqual(audit.classes,expected);
    if(held&&enabled===false){
     assert.ok(audit.review?.id);assert.equal(audit.review.by,null);assert.equal(audit.approval,null);
     const reviews=(await c.personJson('/agents/api/reviews')).reviews;
     const review=reviews.find(row=>row.id===audit.review.id);
     assert.ok(review);assert.equal(review.state,'open');assert.equal(review.decision_id,answer.decision.id);
     assert.deepEqual(review.classes,standard);
     assert.equal(review.prepared_by.for,audit.sponsor.name);assert.equal(review.prepared_by.agent,audit.agent.name);
     assert.equal(review.summary.target.name,input.name);assert.equal(review.marked_by,null);
     if(version==='2026-07-28')await proof.capture('paused-creation-review','/agents');
     const marked=await c.personRequest('/agents/api/reviews/'+review.id+'/reviewed',{method:'POST',body:'{}'});
     assert.equal(marked.status,200);
     const markedReview=(await marked.json()).review;
     assert.equal(markedReview.state,'reviewed');assert.equal(markedReview.marked_by,owner.id);
     assert.deepEqual(await snapshot(),original,'marking the review changes no product record');
    }
    if(held&&enabled!==false){
     const execution=rows.find(row=>row.decision_id===answer.decision.id&&row.outcome==='done');
     assert.ok(execution);assert.deepEqual(execution.approval.by,[owner.id]);
    }
    assert.equal(providerRequests.length,traffic,'creation, approval, replay and readback produce zero provider traffic');
    console.log('PROBE SURFACE-002 create-'+(enabled===false?'paused':enabled===true?'enabled':'default')+' '+version+' '+(held?'held':'autonomous')+': MCP -> '+expected.map(row=>row.class).join(', ')+', exactly one immutable native first revision, attributed admission, replay unchanged, zero runner or provider work');
   }
  }
  const blocked=autonomousPolicy();blocked.rules.push({id:'live-blocked',class:'live',do:'blocked'});
  await c.adopt(blocked);
  const input={...definition(),enabled:false},before=await snapshot();
  const paused=await invoke({definition:input,idempotency_key:randomUUID()});
  assert.deepEqual(classes(paused),standard);assert.equal(paused.decision.disposition,'autonomous');
  await oneCreation(before,paused,input,false);
  for(const enabled of [true,undefined]){
   const candidate={...input,...(enabled===undefined?{}:{enabled:true})};if(enabled===undefined)delete candidate.enabled;
   const state=await snapshot(),refused=await invoke({definition:candidate,idempotency_key:randomUUID()});
   assert.equal(errorCode(refused),'policy_blocked');assert.deepEqual(classes(refused),live);
   assert.equal(refused.result.structuredContent,undefined);
   assert.deepEqual(await snapshot(),state,'the equivalent live-blocked creation has no product writes');
  }
  // Native validation remains the final fence even for a standard decision.
  const invalidBefore=await snapshot();
  const invalid=await invoke({definition:{...definition(),enabled:false,intervalMs:0},idempotency_key:randomUUID()});
  assert.equal(errorCode(invalid),'native_operation_refused');
  assert.deepEqual(await snapshot(),invalidBefore,'invalid paused input cannot create a native record');
  assert.equal(providerRequests.length,traffic);
  console.log('PROBE SURFACE-002 create-live-blocked '+version+': paused succeeds; enabled and omitted-enabled refuse with live and external; native invalid input refuses; all other durable records unchanged');
 }
 await c.adopt(autonomousPolicy());
 console.log('PASS SURFACE-002 ordinary paused creation through both MCP versions and policies; no runner polled, exact native effects and zero provider traffic');
}
