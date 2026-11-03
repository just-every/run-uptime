import {includeRelayExpectation} from './agent-relay-state-support.mjs';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {accessToken,autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// A stored name is untrusted record text, even after an ordinary MCP read.
// All targets are independently owner-created; the enrolled runner is never polled.
export async function proveRecordClassClaims({c,native,db,origin,sponsorId,providerRequests}) {
 const tool='uptime.monitors.pause',runner=await native('/api/runners',{networkLabel:'synthetic-uptime-record-claims'});
 const body=JSON.stringify({version:1}),stamp=String(Date.now());
 const enrolled=await fetch(origin+'/api/runner/enroll',{method:'POST',headers:{origin,'content-type':'application/json',
  'x-runner-id':runner.runnerId,'x-runner-key':runner.key,'x-sent-at':stamp,
  'x-runner-signature':createHmac('sha256',runner.key).update(stamp+'.runner-enrolment.'+body).digest('hex')},body});
 assert.equal(enrolled.status,200);assert.equal((await enrolled.json()).runnerId,runner.runnerId);
 const owner=await native('/api/access/self');assert.equal(owner.id,sponsorId);assert.equal(owner.role,'owner');
 assert.equal((await db.prepare('SELECT status FROM oa_operators WHERE id=?').bind(sponsorId).first()).status,'active');
 const definition={name:'synthetic-uptime-record-control',type:'http',network:'public',url:'https://records.example.test/health',method:'GET',assertions:{status:200},
  intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],assignments:{'local-a':runner.runnerId},failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:true,service:'synthetic-uptime-record-service'};
 const ownerControl=await native('/api/monitors',definition);
 const ownerPaused=await native('/api/monitors/'+ownerControl.id,{...ownerControl.definition,enabled:false},'PATCH');
 assert.equal(ownerPaused.definition.enabled,false);
 const networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
 const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const snapshot=async()=>{
  // Retain the sequence ledger too. Only engine metadata is outside the product.
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') AND name NOT GLOB '_cf_*' ORDER BY name").all()).results.map(row=>row.name);
  const rows=await db.batch(tables.map(name=>db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`)));
  return Object.fromEntries(tables.map((name,index)=>[name,ordered(rows[index].results)]));
 };
 const noTraffic=()=>{
  assert.deepEqual(providerRequests,networkBefore,'record claims never dispatch to a provider');
  assert.equal(allDeliveredMessages().length,mailBefore,'record claims send no mail');
 };
 function additions(before,after,table,count) {
  for(const row of before[table])assert.ok(after[table].some(next=>JSON.stringify(next)===JSON.stringify(row)),table+': every previous row survives exactly');
  const extra=after[table].filter(row=>!before[table].some(old=>JSON.stringify(old)===JSON.stringify(row)));
  assert.equal(extra.length,count,table+': exact number of appended records');return extra;
 }
 function pendingHandle(answer,version) {
  assert.equal(answer.result.structuredContent,undefined);
  if(version==='2025-11-25') {
   assert.equal(answer.result.resultType,'complete');assert.equal(answer.result.isError,true);
   assert.equal(errorCode(answer),'approval_required');assert.equal(answer.result.inputRequests,undefined);
   return answer.result._meta['com.runeditrun/error'].approval;
  }
  assert.equal(answer.result.resultType,'input_required');
  const handle=answer.result._meta['com.runeditrun/approval'];
  assert.equal(answer.result.inputRequests.approval.params.mode,'url');
  assert.equal(answer.result.inputRequests.approval.params.url,handle.url);return handle;
 }
 // Build an exact expected database from individually checked row deltas.
 // No audit, approval, usage, credential or scheduling table family is excluded.
 function transition(before,after,{record,args,classes,decision,phase,started,finished,handle,saved}) {
  const expected=structuredClone(before),executing=['autonomous','approve'].includes(phase),admitting=phase!=='approve';
  const at=value=>assert.ok(value>=started&&value<=finished,'bookkeeping time belongs to this operation');
  if(admitting) {
   const prior=before.agent_door_agents.find(row=>row.id===c.agentId),now=after.agent_door_agents.find(row=>row.id===c.agentId);
   assert.ok(prior);assert.equal(prior.sponsor,sponsorId);assert.equal(prior.revoked,0);
   assert.ok(now.window>=Math.floor(started/60000)&&now.window<=Math.floor(finished/60000));
   expected.agent_door_agents=ordered(before.agent_door_agents.map(row=>row.id===c.agentId?{...row,window:now.window,requests:prior.window===now.window?prior.requests+1:1}:row));
  }
  const [auditRecord]=additions(before,after,'agent_door_audit',1),audit=JSON.parse(auditRecord.row);
  at(Date.parse(auditRecord.at));assert.equal(auditRecord.agent,c.agentId);assert.equal(auditRecord.id,audit.id);
  assert.equal(audit.id,phase==='approve'?JSON.parse(after.agent_door_approvals.find(row=>row.id===handle.id).result).execution_id:decision.id);
  assert.equal(audit.tool,tool);assert.equal(audit.agent.id,c.agentId);assert.equal(audit.sponsor.id,sponsorId);
  assert.deepEqual(audit.resource,{kind:'monitor',id:record.id});assert.deepEqual(audit.classes,classes);
  assert.equal(audit.revision,c.revision);assert.equal(audit.idempotency_key,args.idempotency_key);
  assert.deepEqual(audit.ignored_arguments,[],'claims came only from the stored name, never call arguments');
  assert.equal(audit.decision,decision.disposition);assert.deepEqual(audit.rules,decision.classes.map(({class:kind,rule,do:action})=>({class:kind,rule,do:action})));
  assert.equal(audit.outcome,phase==='pending'?'pending':phase==='retry'||phase==='replay'?'replayed':'done');
  assert.equal(audit.code,null);assert.equal(audit.review,null);
  assert.deepEqual(JSON.parse(auditRecord.classes),['live']);
  const evidence=JSON.parse(auditRecord.evidence);assert.deepEqual(evidence.classes,classes);assert.deepEqual(evidence.document,c.document);
  assert.equal(evidence.result,decision.disposition);assert.deepEqual(evidence.rules,audit.rules);
  expected.agent_door_audit=ordered([...before.agent_door_audit,auditRecord]);
  const auditSequence=before.sqlite_sequence.find(row=>row.name==='agent_door_audit').seq;
  assert.equal(auditRecord.sequence,auditSequence+1);
  // A fresh execution or pending admission inserts then finalizes its audit;
  // SQLite's attempted upsert consumes the second AUTOINCREMENT value.
  const sequenceAdvance=['autonomous','pending','approve'].includes(phase)?2:1;
  expected.sqlite_sequence=before.sqlite_sequence.map(row=>row.name==='agent_door_audit'?{...row,seq:row.seq+sequenceAdvance}:row);
  if(phase==='pending'||phase==='autonomous') {
   const [call]=additions(before,after,'agent_door_calls',1);
   assert.equal(call.agent,c.agentId);assert.equal(call.key,args.idempotency_key);assert.equal(call.decision_id,decision.id);
   assert.match(call.digest,/^[a-f0-9]{64}$/);at(call.created_at);
   assert.equal(call.state,phase==='pending'?'pending':'done');
   if(phase==='pending')assert.equal(call.expires_at,null,'pending work has no completed replay horizon');
   else at(call.expires_at-30*24*60*60*1000);
   const outcome=JSON.parse(call.outcome);assert.equal(outcome.outcome,call.state);assert.equal(outcome.decision.id,decision.id);
   expected.agent_door_calls=ordered([...before.agent_door_calls,call]);
  }
  if(phase==='pending') {
   const [approval]=additions(before,after,'agent_door_approvals',1);
   assert.deepEqual(approval,{id:handle.id,state:'pending',saved:JSON.stringify(saved),approvals:'[]',result:null,version:0});
   expected.agent_door_approvals=ordered([...before.agent_door_approvals,approval]);
  }
  if(phase==='approve') {
   const prior=before.agent_door_approvals.find(row=>row.id===handle.id),approval=after.agent_door_approvals.find(row=>row.id===handle.id);
   assert.equal(approval.saved,prior.saved);assert.equal(approval.state,'executed');assert.equal(approval.version,prior.version+1);
   const marks=JSON.parse(approval.approvals);assert.equal(marks.length,1);
   assert.equal(marks[0].person,sponsorId);assert.equal(marks[0].ref,'sponsor');at(Date.parse(marks[0].at));
   const result=JSON.parse(approval.result);assert.equal(result.outcome,'done');
   assert.deepEqual(result.receipt.approved_by,[sponsorId]);assert.equal(result.receipt.approval_id,handle.id);
   expected.agent_door_approvals=ordered(before.agent_door_approvals.map(row=>row.id===handle.id?{...row,state:'executed',version:row.version+1,approvals:approval.approvals,result:approval.result}:row));
   const completed=after.agent_door_calls.find(row=>row.agent===c.agentId&&row.key===args.idempotency_key);
   at(completed.expires_at-30*24*60*60*1000);
   expected.agent_door_calls=ordered(before.agent_door_calls.map(row=>row.agent===c.agentId&&row.key===args.idempotency_key?{...row,state:'done',outcome:approval.result,expires_at:completed.expires_at}:row));
   assert.deepEqual(audit.approval,{id:handle.id,by:[sponsorId]});assert.equal(audit.decision_id,saved.decision_id);
  }
  const eventSpecs=phase==='pending'?[['approval.pending',handle.url]]:executing?[
   ['monitor.updated','uptime://monitors/'+record.id],...(phase==='approve'?[['approval.decided',handle.url]]:[]),
  ]:[];
  if(eventSpecs.length) {
   const events=additions(before,after,'agent_door_events',eventSpecs.length).sort((a,b)=>a.sequence-b.sequence);
   const sequence=before.sqlite_sequence.find(row=>row.name==='agent_door_events').seq;
   events.forEach((row,index)=>{
    const event=JSON.parse(row.event),[type,uri]=eventSpecs[index];
    assert.equal(row.sequence,sequence+index+1);assert.equal(row.uri,uri);assert.equal(event.id,row.id);
    assert.equal(event.type,type);assert.equal(event.uri,uri);at(Date.parse(event.at));
    if(type==='monitor.updated'){assert.equal(event.revision,record.revision+1);assert.equal(event.actor.agent.id,c.agentId);assert.equal(event.actor.for.id,sponsorId)}
    else {assert.equal(event.decision_id,phase==='approve'?saved.decision_id:decision.id);assert.deepEqual(event.classes,classes)}
   });
   expected.agent_door_events=ordered([...before.agent_door_events,...events]);
   expected.sqlite_sequence=expected.sqlite_sequence.map(row=>row.name==='agent_door_events'?{...row,seq:row.seq+events.length}:row);
  }
  if(executing) {
   const [access]=additions(before,after,'uptime_audit',1);at(access.occurred_at);
   assert.deepEqual(access,{id:access.id,actor_kind:'operator',actor_ref:sponsorId,occurred_at:access.occurred_at,
    action:'access_check_write',subject_kind:'operator',subject_ref:access.id});
   expected.uptime_audit=ordered([...before.uptime_audit,access]);
   const [usage]=additions(before,after,'agent_door_usage',1);
   assert.deepEqual(usage,{decision_id:audit.id,at:usage.at,seed:'uptime',specialist:c.surface.specialist,agent:c.agentId,classes:JSON.stringify(classes)});at(usage.at);
   expected.agent_door_usage=ordered([...before.agent_door_usage,usage]);
   const pausedDefinition={...ownerPaused.definition,name:record.definition.name};
   const old=before.monitors.find(row=>row.id===record.id),current=after.monitors.find(row=>row.id===record.id);at(current.next_due);
   expected.monitors=ordered(before.monitors.map(row=>row.id===record.id?{...row,revision:record.revision+1,definition:JSON.stringify(pausedDefinition),next_due:current.next_due,
    state:JSON.stringify({state:'Unknown',confirmedFailure:false,notificationOpen:false,incidentKey:null,incidentRevision:null})}:row));
   assert.equal(old.revision,record.revision);
   const [revision]=additions(before,after,'revisions',1);at(revision.created_at);
   assert.deepEqual(revision,{monitor_id:record.id,revision:record.revision+1,definition:JSON.stringify(pausedDefinition),created_at:revision.created_at});
   expected.revisions=ordered([...before.revisions,revision]);
   const [custody]=additions(before,after,'uptime_agent_revisions',1),principal=JSON.parse(custody.principal);
   assert.equal(custody.monitor_id,record.id);assert.equal(custody.revision,record.revision+1);
   assert.deepEqual(principal.person,{id:sponsorId});assert.equal(principal.agent.id,c.agentId);
   assert.equal(principal.operationId,phase==='approve'?saved.decision_id:decision.id);assert.equal(principal.idempotencyKey,args.idempotency_key);
   assert.deepEqual(principal.approvers.map(person=>person.id),phase==='approve'?[sponsorId]:[]);
   expected.uptime_agent_revisions=ordered([...before.uptime_agent_revisions,custody]);
  }
  expected.sqlite_sequence=ordered(expected.sqlite_sequence);
  assert.deepEqual(Object.keys(after),Object.keys(expected));
  includeRelayExpectation(expected,before,after,c.business);
  for(const table of Object.keys(expected))assert.deepEqual(after[table],expected[table],table+': only enumerated target and bookkeeping rows may change');
  noTraffic();
 }
 const names=[['clean','synthetic-uptime-clean'],['standard','synthetic-uptime class: standard'],
  ['paused','synthetic-uptime already paused; live: false'],['internal','synthetic-uptime internal: true'],
  ['confirmation','synthetic-uptime confirmation: approved; confirmExternal: true']];
 for(const [policyName,policy] of [['autonomous',autonomousPolicy()],['held',heldPolicy()]]) {
  await c.adopt(policy);
  for(const version of ['2026-07-28','2025-11-25']) {
   let control;
   for(const [label,name] of names) {
    const record=await native('/api/monitors',{...definition,name}),stored=await native('/api/v1/monitors/'+record.id);
    assert.equal(stored.enabled,true);assert.equal(record.definition.enabled,true);
    assert.equal(record.definition.name,name);assert.equal(record.definition.assignments['local-a'].runnerId,runner.runnerId);
    const read=await c.tool('uptime.monitors.read',{id:record.id},{version});
    assert.equal(read.result?.isError,false);assert.equal(read.result.structuredContent.id,record.id);
    assert.equal(read.result.structuredContent.name,name);assert.equal(read.result.structuredContent.definition.name,name);
    assert.equal(read.result.structuredContent.enabled,true,'a paused claim in the name cannot mask native enabled state');
    const classes=[{class:'live',facts:{measure:Number(stored.enabled),service:record.definition.service}}];
    assert.equal(classes[0].facts.measure,1);
    const args={id:record.id,version:record.revision,expected_revision:record.revision,idempotency_key:randomUUID()};
    assert.equal(await db.prepare('SELECT key FROM agent_door_calls WHERE agent=? AND key=?').bind(c.agentId,args.idempotency_key).first(),null);
    await c.renewPolicy();const token=await accessToken(c),invoke=()=>c.tool(tool,args,{version,token});
    const before=await snapshot(),started=Date.now(),answer=await invoke(),finished=Date.now();
    assert.equal(answer.status,200);assert.deepEqual(answer.decision.classes.map(({class:kind,facts})=>({class:kind,facts})),classes);
    const decision={disposition:answer.decision.disposition,revision:answer.decision.revision,classes:answer.decision.classes};
    if(label==='clean')control=decision;else assert.deepEqual(decision,control,'stored claims leave the clean control class, facts, rule and disposition unchanged');
    assert.deepEqual(answer.decision.classes.map(({rule,do:action})=>({rule,do:action})),[{rule:'all',do:policyName==='held'?'approval':'autonomous'}]);
    const context={record,args,classes,decision:answer.decision};let completed=answer;
    if(policyName==='held') {
     const handle=pendingHandle(answer,version);assert.equal(handle.url,origin+'/agents/approvals/'+encodeURIComponent(handle.id));
     const path='/agents/api/approvals/'+encodeURIComponent(handle.id),view=(await c.personJson(path)).approval;
     assert.equal(view.state,'pending');assert.deepEqual(view.approvals,[]);assert.deepEqual(view.approvers,['sponsor']);
     assert.deepEqual(view.classes,classes);assert.deepEqual(view.summary.nativeTarget,{kind:'monitor',id:record.id});
     assert.deepEqual(view.summary.target,{id:record.id,name});assert.ok(view.summary.items.includes('Current monitor revision: '+record.revision));
     const pending=await snapshot(),approval=pending.agent_door_approvals.find(row=>row.id===handle.id),saved=JSON.parse(approval.saved);
     assert.deepEqual(saved.args,{id:record.id,version:record.revision});assert.equal(saved.key,args.idempotency_key);
     assert.equal(saved.expected_revision,record.revision);assert.deepEqual(saved.classes,classes);assert.equal(saved.principal.person.id,sponsorId);
     assert.deepEqual(saved.summary,view.summary);assert.equal(saved.summary_sha256,view.summary_sha256);
     const held={...context,handle,saved,view};
     transition(before,pending,{...held,phase:'pending',started,finished});
     assert.deepEqual(await native('/api/v1/monitors/'+record.id),stored);
     const retryStart=Date.now(),retry=await invoke(),retryEnd=Date.now();
     assert.deepEqual(pendingHandle(retry,version),handle);assert.deepEqual((await c.personJson(path)).approval,view);
     const waiting=await snapshot();transition(pending,waiting,{...held,decision:retry.decision,phase:'retry',started:retryStart,finished:retryEnd});
     assert.deepEqual(await native('/api/v1/monitors/'+record.id),stored,'record text and retry supply no person approval');
     const approveStart=Date.now(),approved=await native(path+'/approve',{revision:view.revision,summary_sha256:view.summary_sha256}),approveEnd=Date.now();
     assert.equal(approved.approval.state,'executed');assert.deepEqual(approved.approval.summary,view.summary);
     const executed=await snapshot();transition(waiting,executed,{...held,phase:'approve',started:approveStart,finished:approveEnd});
     const completeStart=Date.now();completed=await invoke();const completeEnd=Date.now();assert.equal(completed.result?.isError,false);
     assert.deepEqual(completed.result._meta['com.runeditrun/receipt'].approved_by,[sponsorId]);
     transition(executed,await snapshot(),{...held,decision:completed.decision,phase:'replay',started:completeStart,finished:completeEnd});
    } else {
     assert.equal(answer.result?.isError,false);assert.equal(answer.result.resultType,'complete');assert.equal(answer.decision.disposition,'autonomous');
     assert.equal(answer.result._meta['com.runeditrun/approval'],undefined);
     transition(before,await snapshot(),{...context,phase:'autonomous',started,finished});
    }
    const paused=await native('/api/v1/monitors/'+record.id),revisions=await native('/api/monitors/'+record.id+'/revisions');
    assert.equal(paused.enabled,false);assert.equal(paused.name,name);assert.equal(paused.revision,record.revision+1);
    assert.equal(completed.result.structuredContent.id,record.id);assert.equal(completed.result.structuredContent.enabled,false);
    assert.equal(revisions.length,2);assert.deepEqual(revisions.find(row=>row.revision===record.revision).definition,record.definition);
    assert.deepEqual(revisions.find(row=>row.revision===record.revision+1).definition,{...ownerPaused.definition,name});
    const after=await snapshot(),replayStart=Date.now(),replay=await invoke(),replayEnd=Date.now();
    assert.equal(replay.result?.isError,false);assert.deepEqual(replay.result.structuredContent,completed.result.structuredContent);
    assert.deepEqual(replay.result._meta['com.runeditrun/receipt'],completed.result._meta['com.runeditrun/receipt']);
    transition(after,await snapshot(),{...context,decision:replay.decision,phase:'replay',started:replayStart,finished:replayEnd});
    assert.equal((await native('/api/monitors/'+record.id+'/revisions')).length,2,'exact-key replay makes no second revision');
    const {differs}=await auditRows(c);assert.equal(differs,0);noTraffic();
   }
   console.log(`PROBE BASE-AGENT-006 acceptance-3-record-name-${policyName}-${version}: MCP reads exact clean and standard, paused, internal and confirmation names, then fresh ordinary pause -> live measure 1 and native service, unchanged rule and target; ${policyName==='held'?'canonical pending approval and saved arguments and summary unchanged until actual sponsor approval; ':''}one target revision, effect-free exact-key replay, every unrelated durable record preserved and zero runner or provider traffic`);
  }
 }
 await c.adopt(autonomousPolicy());
 console.log('PASS BASE-AGENT-006 saved monitor-name record claims; other record-text cells and tools remain unqualified');
}
