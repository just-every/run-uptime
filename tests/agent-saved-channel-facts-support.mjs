import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// The registered journey supplies its real owner, signed agent, emitted Worker
// and migrated D1. These cells stop at queue admission, before any dispatcher.
export async function proveSavedChannelDestinationFacts({c,native,db,sponsorId,providerRequests}){
 const facts=[{class:'external',facts:{measure:1,counterparty:'known'}}];
 const classFacts=classes=>classes.map(({class:kind,facts})=>({class:kind,facts}));
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results;
  const results=await db.batch(tables.map(({name})=>db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}" ORDER BY rowid`)));
  return Object.fromEntries(tables.map(({name},i)=>[name,results[i].results]));
 };
 const unchanged=(before,after,allowed=[])=>{
  assert.deepEqual(Object.keys(after),Object.keys(before),'the complete durable table inventory is retained');
  for(const name of Object.keys(before))if(!allowed.includes(name))assert.deepEqual(after[name],before[name],`${name}: no unrelated durable change`);
 };
 const appended=(before,after,key,count)=>{
  for(const old of before)assert.deepEqual(after.find(row=>row[key]===old[key]),old,'existing durable rows remain byte-for-byte intact');
  const added=after.filter(row=>!before.some(old=>row[key]===old[key]));
  assert.equal(added.length,count);assert.equal(after.length,before.length+count);return added;
 };
 const admission=(before,after)=>{
  assert.equal(after.length,before.length);
  for(const old of before){
   const current=after.find(row=>row.id===old.id);
   if(old.id!==c.agentId){assert.deepEqual(current,old);continue}
   assert.equal(current.sponsor,sponsorId);assert.equal(current.revoked,0);
   assert.ok(current.window>=old.window);
   assert.equal(current.requests,current.window===old.window?old.requests+1:1,'one MCP admission is counted');
   assert.deepEqual({...current,window:old.window,requests:old.requests},old,'only the exact admitted agent capacity fields change');
  }
 };
 const checkDecision=(answer,held)=>{
  assert.equal(answer.status,200);assert.ok(answer.decision);
  assert.deepEqual(classFacts(answer.decision.classes),facts);
  assert.equal(answer.decision.disposition,held?'approval':'autonomous');
  assert.deepEqual(answer.decision.classes.map(({class:kind,rule,do:action})=>({class:kind,rule,do:action})),[
   {class:'external',rule:'all',do:held?'approval':'autonomous'},
  ]);
 };
 const checkPending=(answer,version)=>{
  assert.equal(answer.result.structuredContent,undefined);
  let handle;
  if(version==='2025-11-25'){
   assert.equal(answer.result.resultType,'complete');assert.equal(answer.result.isError,true);
   assert.equal(errorCode(answer),'approval_required','the legacy protocol carries the same pending approval as an explicit refusal');
   handle=answer.result._meta['com.runeditrun/error'].approval;
  }else{
   assert.equal(answer.result.resultType,'input_required');assert.ok(answer.result.requestState);
   handle=answer.result._meta['com.runeditrun/approval'];
  }
  assert.ok(handle.id);assert.equal(new URL(handle.url).origin,c.origin);return handle;
 };
 const checkAudit=async(answer,tool,id,held,outcome)=>{
  const {rows,differs}=await auditRows(c);assert.equal(differs,0);
  const row=rows.find(row=>row.id===answer.decision.id);assert.ok(row);
  assert.deepEqual(row.classes,facts);assert.equal(row.tool,tool);assert.equal(row.door,'mcp');
  assert.equal(row.decision,held?'approval':'autonomous');assert.equal(row.outcome,outcome);
  assert.deepEqual(row.resource,{kind:'destination',id});
  assert.equal(row.sponsor.id,sponsorId);assert.equal(row.agent.id,c.agentId);
  assert.deepEqual(row.rules,[{class:'external',rule:'all',do:held?'approval':'autonomous'}]);
  return rows;
 };
 const traffic=structuredClone(providerRequests),mail=allDeliveredMessages().length;
 const noTraffic=()=>{
  assert.deepEqual(providerRequests,traffic,'queue admission causes zero notification-provider traffic');
  assert.equal(allDeliveredMessages().length,mail,'no intercepted mail is submitted either');
 };
 const owner=await native('/api/access/self');assert.equal(owner.id,sponsorId);
 const agent=await db.prepare('SELECT * FROM agent_door_agents WHERE id=?').bind(c.agentId).first();
 assert.equal(agent.sponsor,sponsorId);assert.equal(agent.revoked,0);
 const channels=[];
 for(const kind of ['slack','webhook']){
  // Synthetic Slack path components deliberately have no provider token shape.
  const url=kind==='slack'?'https://hooks.slack.com/services/synthetic-uptime-1/synthetic-uptime-2/synthetic-uptime-3':'https://saved-channel.example.com/alerts';
  const created=await native('/api/notifications/destinations',{name:'Synthetic uptime saved '+kind,kind,url});
  const saved=(await native('/api/notifications/destinations')).find(row=>row.id===created.id);
  assert.ok(saved);assert.equal(saved.kind,kind);assert.equal(saved.enabled,true);assert.equal(saved.credentialsAvailable,true);
  const destination=await db.prepare('SELECT * FROM notification_destinations WHERE id=?').bind(saved.id).first();
  const credential=await db.prepare('SELECT * FROM notification_credentials WHERE id=?').bind(destination.credential_id).first();
  assert.equal(destination.kind,kind);assert.equal(destination.deleted_at,null);
  assert.equal(credential.destination_id,saved.id);assert.equal(credential.retired_at,null);assert.equal(credential.unavailable_at,null);
  assert.equal(credential.endpoint,null);assert.equal(credential.signing_secret,null);assert.ok(credential.ciphertext);
  assert.ok(!credential.ciphertext.includes(url),'endpoint authority remains encrypted in local custody');
  if(kind==='webhook'){
   assert.equal(saved.webhookTemplate,null,'ordinary default JSON, without a custom template');
   assert.equal(saved.webhookSigning,true);assert.equal(destination.webhook_template,null);
   assert.ok(created.signingSecret);assert.ok(!credential.ciphertext.includes(created.signingSecret));
  }
  channels.push({id:saved.id,kind,credentialId:credential.id});
 }
 try{
  for(const held of [false,true]){
   await c.adopt(held?heldPolicy():autonomousPolicy());
   for(const version of ['2026-07-28','2025-11-25'])for(const channel of channels)for(const verb of ['test','drill']){
    const {id,kind,credentialId}=channel,tool='uptime.destinations.'+verb,args={id,idempotency_key:randomUUID()};
    const before=await snapshot(),answer=await c.tool(tool,args,{version});
    checkDecision(answer,held);noTraffic();
    let completed=answer;
    if(held){
     const handle=checkPending(answer,version),pending=await snapshot();
     unchanged(before,pending,['agent_door_agents','agent_door_audit','agent_door_calls','agent_door_approvals','agent_door_events']);
     admission(before.agent_door_agents,pending.agent_door_agents);
     const [audit]=appended(before.agent_door_audit,pending.agent_door_audit,'id',1);
     assert.equal(audit.id,answer.decision.id);
     const [call]=appended(before.agent_door_calls,pending.agent_door_calls,'key',1);
     assert.equal(call.agent,c.agentId);assert.equal(call.key,args.idempotency_key);assert.equal(call.decision_id,answer.decision.id);assert.equal(call.state,'pending');
     const outcome=JSON.parse(call.outcome);assert.equal(outcome.outcome,'pending');assert.equal(outcome.approval.id,handle.id);
     const [approval]=appended(before.agent_door_approvals,pending.agent_door_approvals,'id',1),saved=JSON.parse(approval.saved);
     assert.equal(approval.id,handle.id);assert.equal(approval.state,'pending');assert.equal(approval.result,null);assert.equal(approval.version,0);assert.deepEqual(JSON.parse(approval.approvals),[]);
     assert.equal(saved.decision_id,answer.decision.id);assert.equal(saved.tool,tool);assert.deepEqual(saved.args,{id});assert.equal(saved.key,args.idempotency_key);
     assert.equal(saved.principal.person.id,sponsorId);assert.equal(saved.principal.agent.id,c.agentId);assert.deepEqual(saved.classes,facts);
     assert.deepEqual(saved.summary.nativeTarget,{kind:'destination',id});assert.equal(saved.summary.target.id,id);
     const [event]=appended(before.agent_door_events,pending.agent_door_events,'id',1),pendingEvent=JSON.parse(event.event);
     assert.equal(event.uri,handle.url);assert.equal(pendingEvent.type,'approval.pending');assert.equal(pendingEvent.decision_id,answer.decision.id);assert.deepEqual(pendingEvent.classes,facts);
     // In particular, usage, all monitoring and scheduling rows, every local
     // credential, jobs, drills and notification custody were compared above.
     await checkAudit(answer,tool,id,true,'pending');
     const waiting=await c.tool(tool,args,{version});checkDecision(waiting,true);
     assert.deepEqual(checkPending(waiting,version),handle);
     const repeated=await snapshot();unchanged(pending,repeated,['agent_door_agents','agent_door_audit']);
     admission(pending.agent_door_agents,repeated.agent_door_agents);appended(pending.agent_door_audit,repeated.agent_door_audit,'id',1);
     await checkAudit(waiting,tool,id,true,'replayed');
     const path='/agents/api/approvals/'+encodeURIComponent(handle.id),{approval:review}=await c.personJson(path);
     assert.equal(review.id,handle.id);assert.equal(review.decision_id,answer.decision.id);assert.equal(review.revision,answer.decision.revision);
     assert.match(review.summary_sha256,/^[a-f0-9]{64}$/);assert.deepEqual(review.summary.nativeTarget,{kind:'destination',id});
     const approved=await c.personRequest(path+'/approve',{method:'POST',body:JSON.stringify({revision:review.revision,summary_sha256:review.summary_sha256})});
     assert.equal(approved.status,200);const {approval:executedApproval}=await approved.json();assert.equal(executedApproval.state,'executed');
     assert.deepEqual(executedApproval.approvals.map(mark=>mark.person),[sponsorId]);assert.deepEqual(executedApproval.classes,facts);
     completed=await c.tool(tool,args,{version});checkDecision(completed,true);
    }
    assert.equal(completed.result?.isError,false);assert.equal(completed.result.structuredContent.queued,true);
    assert.equal(completed.result.resultType,'complete');
    if(!held)assert.equal(completed.result._meta['com.runeditrun/approval'],undefined,'autonomous admission needs no approval');
    const output=completed.result.structuredContent,after=await snapshot();
    unchanged(before,after,['agent_door_agents','agent_door_audit','agent_door_calls','agent_door_approvals','agent_door_events','agent_door_usage','notification_jobs','uptime_agent_notifications','alert_drills']);
    const [job]=appended(before.notification_jobs,after.notification_jobs,'id',1);
    assert.equal(job.id,output.deliveryId);assert.equal(job.event_id,output.eventId);
    assert.equal(job.destination_id,id);assert.equal(job.credential_id,credentialId);assert.equal(job.kind,kind);
    assert.equal(job.state,'queued');assert.equal(job.attempts,0);assert.equal(job.claim,null);assert.equal(job.claim_until,null);assert.equal(job.finished_at,null);
    const event=JSON.parse(job.event);assert.equal(event.id,output.eventId);assert.equal(event.kind,'test');
    const [custody]=appended(before.uptime_agent_notifications,after.uptime_agent_notifications,'delivery_id',1),principal=JSON.parse(custody.principal);
    assert.equal(custody.delivery_id,job.id);assert.equal(principal.person.id,sponsorId);assert.equal(principal.agent.id,c.agentId);
    assert.equal(principal.idempotencyKey,args.idempotency_key);assert.equal(principal.operationId,answer.decision.id);
    assert.deepEqual(principal.approvers.map(person=>person.id),held?[sponsorId]:[]);
    const [usage]=appended(before.agent_door_usage,after.agent_door_usage,'decision_id',1);
    assert.equal(usage.agent,c.agentId);assert.deepEqual(JSON.parse(usage.classes),facts);
    const approvals=appended(before.agent_door_approvals,after.agent_door_approvals,'id',held?1:0);
    if(held)assert.equal(approvals[0].state,'executed');
    const drills=appended(before.alert_drills,after.alert_drills,'id',verb==='drill'?1:0);
    if(verb==='drill'){
     const [drill]=drills;assert.equal(drill.id,output.drillId);assert.equal(drill.delivery_id,job.id);
     assert.equal(drill.destination_id,id);assert.equal(drill.credential_id,credentialId);assert.equal(drill.started_by,sponsorId);
     assert.equal(drill.submitted_at,null);assert.equal(drill.confirmed_at,null);
    }else assert.equal(output.drillId,undefined);
    const audits=await checkAudit(completed,tool,id,held,held?'replayed':'done');
    if(held){
     const execution=audits.find(row=>row.decision_id===answer.decision.id&&row.outcome==='done');assert.ok(execution);
     assert.deepEqual(execution.classes,facts);assert.deepEqual(execution.resource,{kind:'destination',id});assert.deepEqual(execution.approval.by,[sponsorId]);
     assert.equal(usage.decision_id,execution.id);
    }else assert.equal(usage.decision_id,answer.decision.id);
    // Read the owner-facing delivery facts as well as durable custody. A queued
    // drill is neither provider acceptance nor a recipient confirmation.
    const visible=await native('/api/notifications');
    const delivery=visible.deliveries.find(row=>row.id===job.id);assert.ok(delivery);
    assert.equal(delivery.eventId,output.eventId);assert.equal(delivery.kind,kind);assert.equal(delivery.state,'queued');
    assert.equal(delivery.attempts,0);assert.deepEqual(delivery.attemptHistory,[]);assert.equal(delivery.handoff,undefined);
    assert.equal(delivery.status,undefined);assert.equal(delivery.responseExcerpt,undefined,'queue admission has no provider response');
    const destination=visible.destinations.find(row=>row.id===id);assert.deepEqual(destination.proof,{state:'never',lastProvenAt:null});
    if(verb==='drill'){
     assert.equal(destination.latestDrill.id,output.drillId);assert.equal(destination.latestDrill.currentCredential,true);
     assert.equal(destination.latestDrill.submittedAt,null);assert.equal(destination.latestDrill.confirmedAt,null);assert.equal(destination.latestDrill.confirmation,'pending');
    }
    const replay=await c.tool(tool,args,{version});checkDecision(replay,held);
    assert.deepEqual(replay.result.structuredContent,output);
    const replayed=await snapshot();unchanged(after,replayed,['agent_door_agents','agent_door_audit']);
    admission(after.agent_door_agents,replayed.agent_door_agents);appended(after.agent_door_audit,replayed.agent_door_audit,'id',1);
    await checkAudit(replay,tool,id,held,'replayed');noTraffic();
    console.log(`PROBE SURFACE-003 acceptance-1-${kind}-${verb}-${held?'held':'autonomous'}-${version}: owner-saved current credential and signed MCP -> external measure=1 counterparty=known; ${held?'complete durable state unchanged before signed-in sponsor approval; ':''}one queued native job, exact-key replay adds no job or drill; no provider traffic, attempts, submission, receipt or confirmation`);
   }
  }
 }finally{await c.adopt(autonomousPolicy())}
 noTraffic();console.log('PASS SURFACE-003 saved Slack and default signed-JSON webhook facts under both policies and protocol versions (queue admission only)');
}
