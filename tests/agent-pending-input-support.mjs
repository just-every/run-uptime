import {includeRelayExpectation} from './agent-relay-state-support.mjs';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {accessToken,autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// Changed input must obtain its own saved approval, never alter a pending call.
// All records enter native owner doors; the enrolled private runner is never polled.
export async function provePendingInput({c,native,db,origin,sponsorId,providerRequests}) {
 const tool='uptime.monitors.update',runner=await native('/api/runners',{networkLabel:'synthetic-uptime-pending-input'});
 const body=JSON.stringify({version:1}),stamp=String(Date.now());
 const enrolled=await fetch(origin+'/api/runner/enroll',{method:'POST',headers:{origin,'content-type':'application/json',
  'x-runner-id':runner.runnerId,'x-runner-key':runner.key,'x-sent-at':stamp,
  'x-runner-signature':createHmac('sha256',runner.key).update(stamp+'.runner-enrolment.'+body).digest('hex')},body});
 assert.equal(enrolled.status,200);assert.equal((await enrolled.json()).runnerId,runner.runnerId);
 const owner=await native('/api/access/self');assert.equal(owner.id,sponsorId);assert.equal(owner.role,'owner');
 assert.equal((await db.prepare('SELECT status FROM oa_operators WHERE id=?').bind(sponsorId).first()).status,'active');
 const definition={name:'synthetic-uptime-pending-control',type:'http',network:'public',url:'https://pending.example.test/health',method:'GET',assertions:{status:200},
  intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],assignments:{'local-a':runner.runnerId},failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:true,service:'synthetic-uptime-pending-service'};
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM oa_operators WHERE status='active'").first()).n,1,'one active native sponsor');
 const networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
 const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const snapshot=async()=>{
  // Retain the sequence ledger too. Only engine metadata is outside the product.
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') AND name NOT GLOB '_cf_*' ORDER BY name").all()).results.map(row=>row.name);
  const rows=await db.batch(tables.map(name=>db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`)));
  return Object.fromEntries(tables.map((name,index)=>[name,ordered(rows[index].results)]));
 };
 const noTraffic=()=>{
  assert.deepEqual(providerRequests,networkBefore,'pending name edits never dispatch to a provider');
  assert.equal(allDeliveredMessages().length,mailBefore,'pending name edits send no mail');
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
  const conflict=phase==='conflict';
  if(!conflict)assert.equal(audit.id,phase==='approve'?JSON.parse(after.agent_door_approvals.find(row=>row.id===handle.id).result).execution_id:decision.id);
  assert.equal(audit.tool,tool);assert.equal(audit.agent.id,c.agentId);assert.equal(audit.sponsor.id,sponsorId);
  assert.equal(audit.door,'mcp');assert.equal(audit.consent,c.consent);
  assert.deepEqual(audit.resource,conflict?null:{kind:'monitor',id:record.id});
  assert.deepEqual(audit.classes,conflict?[]:classes);
  assert.equal(audit.revision,c.revision);assert.equal(audit.idempotency_key,args.idempotency_key);
  assert.deepEqual(audit.ignored_arguments,[]);
  assert.equal(audit.decision,conflict?'none':decision.disposition);
  assert.deepEqual(audit.rules,conflict?[]:decision.classes.map(({class:kind,rule,do:action})=>({class:kind,rule,do:action})));
  assert.equal(audit.outcome,conflict?'refused':phase==='pending'?'pending':phase==='replay'?'replayed':'done');
  assert.equal(audit.code,conflict?'idempotency_conflict':null);assert.equal(audit.review,null);
  assert.deepEqual(JSON.parse(auditRecord.classes),conflict?[]:['live']);
  if(conflict) {
   assert.equal(auditRecord.evidence,null);assert.equal(audit.approval,null);assert.equal(audit.decision_id,null);
  } else {
   const evidence=JSON.parse(auditRecord.evidence);assert.deepEqual(evidence.classes,classes);assert.deepEqual(evidence.document,c.document);
   assert.equal(evidence.result,decision.disposition);assert.deepEqual(evidence.rules,audit.rules);
  }
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
   assert.equal(marks[0].person,sponsorId);assert.equal(marks[0].ref,'person:'+c.person.sub);at(Date.parse(marks[0].at));
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
   const editedDefinition={...record.definition,name:args.definition.name};
   const old=before.monitors.find(row=>row.id===record.id),current=after.monitors.find(row=>row.id===record.id);at(current.next_due);
   expected.monitors=ordered(before.monitors.map(row=>row.id===record.id?{...row,revision:record.revision+1,definition:JSON.stringify(editedDefinition),next_due:current.next_due,
    state:JSON.stringify({state:'Unknown',confirmedFailure:false,notificationOpen:false,incidentKey:null,incidentRevision:null})}:row));
   assert.equal(old.revision,record.revision);
   const [revision]=additions(before,after,'revisions',1);at(revision.created_at);
   assert.deepEqual(revision,{monitor_id:record.id,revision:record.revision+1,definition:JSON.stringify(editedDefinition),created_at:revision.created_at});
   expected.revisions=ordered([...before.revisions,revision]);
   const [custody]=additions(before,after,'uptime_agent_revisions',1),principal=JSON.parse(custody.principal);
   assert.equal(custody.monitor_id,record.id);assert.equal(custody.revision,record.revision+1);
   assert.deepEqual(principal.person,{id:sponsorId});assert.equal(principal.agent.id,c.agentId);
   assert.equal(principal.operationId,phase==='approve'?saved.decision_id:decision.id);assert.equal(principal.idempotencyKey,args.idempotency_key);
   assert.deepEqual(principal.approvers.map(person=>person.id),phase==='approve'?[sponsorId]:[]);
   assert.equal(principal.consent,c.consent);assert.equal(principal.agent.id,c.agentId);
   expected.uptime_agent_revisions=ordered([...before.uptime_agent_revisions,custody]);
  }
  expected.sqlite_sequence=ordered(expected.sqlite_sequence);
  assert.deepEqual(Object.keys(after),Object.keys(expected));
  includeRelayExpectation(expected,before,after,c.business);
  for(const table of Object.keys(expected))assert.deepEqual(after[table],expected[table],table+': only enumerated target and bookkeeping rows may change');
  noTraffic();
 }
 const recordFor=async name=>{
  const record=await native('/api/monitors',{...definition,name});
  const stored=await native('/api/v1/monitors/'+record.id);
  assert.equal(stored.enabled,true);assert.equal(record.definition.enabled,true);
  assert.equal(record.definition.assignments['local-a'].runnerId,runner.runnerId);
  assert.equal((await native('/api/monitors/'+record.id+'/revisions')).length,1);
  return {record,stored};
 };
 const readApproval=async handle=>(await c.personJson('/agents/api/approvals/'+encodeURIComponent(handle.id))).approval;
 const rowFor=(state,handle)=>state.agent_door_approvals.find(row=>row.id===handle.id);
 const pendingWire=(answer,version)=>{
  assert.equal(answer.status,200);assert.equal(answer.decision.disposition,'approval');
  assert.equal(answer.decision.revision,c.revision);
  assert.deepEqual(answer.decision.classes.map(({class:kind,rule,do:action})=>({class:kind,rule,do:action})),[{class:'live',rule:'all',do:'approval'}]);
  assert.equal(answer.result._meta['com.runeditrun/receipt'],undefined,'no execution receipt while pending');
  const handle=pendingHandle(answer,version);
  assert.equal(handle.url,origin+'/agents/approvals/'+encodeURIComponent(handle.id));
  assert.equal(typeof handle.id,'string');assert.ok(handle.id);
  return handle;
 };
 const savedApproval=async(answer,handle,args,record,started,finished)=>{
  const view=await readApproval(handle),state=await snapshot(),row=rowFor(state,handle),saved=JSON.parse(row.saved);
  assert.deepEqual(row,{id:handle.id,state:'pending',saved:row.saved,approvals:'[]',result:null,version:0});
  assert.equal(view.state,'pending');assert.deepEqual(view.approvals,[]);
  assert.deepEqual(view.approvers,['person:'+c.person.sub]);
  assert.equal(view.revision,c.revision);assert.equal(view.decision_id,answer.decision.id);
  assert.equal(view.expires_at,handle.expires_at);
  const expiry=Date.parse(view.expires_at);assert.ok(expiry>=started+3600000&&expiry<=finished+3600000);
  assert.deepEqual(saved.args,{id:record.id,version:record.revision,definition:args.definition});
  assert.equal(saved.expected_revision,record.revision);assert.equal(saved.key,args.idempotency_key);
  assert.equal(saved.principal.person.id,sponsorId);assert.equal(saved.principal.agent.id,c.agentId);
  assert.equal(saved.revision,view.revision);assert.deepEqual(saved.approvers,view.approvers);
  assert.deepEqual(saved.summary,view.summary);assert.equal(saved.summary_sha256,view.summary_sha256);
  assert.match(view.summary_sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(view.summary.nativeTarget,{kind:'monitor',id:record.id});
  assert.deepEqual(view.summary.target,{id:record.id,name:record.definition.name});
  assert.ok(view.summary.items.includes('Current monitor revision: '+record.revision));
  assert.ok(view.summary.items.some(item=>item.endsWith(': '+args.definition.name)),'server summary contains the exact requested name');
  return {state,row,saved,view};
 };
 const readRevision=async(record,name)=>{
  const current=await native('/api/v1/monitors/'+record.id),revisions=await native('/api/monitors/'+record.id+'/revisions');
  assert.equal(current.id,record.id);assert.equal(current.name,name);assert.equal(current.enabled,true);
  assert.equal(current.revision,record.revision+1);assert.equal(revisions.length,2);
  assert.deepEqual(revisions.find(row=>row.revision===record.revision).definition,record.definition);
  assert.deepEqual(revisions.find(row=>row.revision===record.revision+1).definition,{...record.definition,name});
  return current;
 };
 for(const version of ['2026-07-28','2025-11-25']) {
  // An independent control reaches the ordinary supported name-edit path.
  await c.adopt(autonomousPolicy());
  const {record:control}=await recordFor('synthetic-uptime-autonomous-'+version);
  const controlArgs={id:control.id,version:control.revision,expected_revision:control.revision,definition:{name:'synthetic-uptime-autonomous-renamed-'+version},idempotency_key:randomUUID()};
  await c.renewPolicy();const token=await accessToken(c);
  let before=await snapshot(),started=Date.now();
  const allowed=await c.tool(tool,controlArgs,{version,token});let finished=Date.now();
  assert.equal(allowed.result?.isError,false);assert.equal(allowed.decision.disposition,'autonomous');
  assert.equal(allowed.result._meta['com.runeditrun/approval'],undefined);
  assert.deepEqual(allowed.decision.classes.map(({class:kind,facts})=>({class:kind,facts})),[{class:'live',facts:{measure:1,service:definition.service}}]);
  transition(before,await snapshot(),{record:control,args:controlArgs,classes:[{class:'live',facts:{measure:1,service:definition.service}}],decision:allowed.decision,phase:'autonomous',started,finished});
  const controlCurrent=await readRevision(control,controlArgs.definition.name);
  assert.equal(allowed.result.structuredContent.revision,controlCurrent.revision);
  assert.equal(allowed.result.structuredContent.name,controlCurrent.name);

  const policy=heldPolicy();policy.rules[0].approver=['person:'+c.person.sub];
  await c.adopt(policy);
  const {record,stored}=await recordFor('synthetic-uptime-pending-original-'+version);
  const args={id:record.id,version:record.revision,expected_revision:record.revision,definition:{name:'synthetic-uptime-first-request-'+version},idempotency_key:randomUUID()};
  await c.renewPolicy();const heldToken=await accessToken(c),invoke=input=>c.tool(tool,input,{version,token:heldToken});
  before=await snapshot();started=Date.now();
  const first=await invoke(args);finished=Date.now();
  const firstHandle=pendingWire(first,version),firstSaved=await savedApproval(first,firstHandle,args,record,started,finished);
  const classes=[{class:'live',facts:{measure:1,service:definition.service}}];
  assert.deepEqual(first.decision.classes.map(({class:kind,facts})=>({class:kind,facts})),classes);
  transition(before,firstSaved.state,{record,args,classes,decision:first.decision,phase:'pending',started,finished,handle:firstHandle,saved:firstSaved.saved});
  assert.deepEqual(await native('/api/v1/monitors/'+record.id),stored);

  // Reusing the original key with different arguments cannot replace custody.
  const changed={...args,definition:{name:'synthetic-uptime-second-request-'+version}};
  started=Date.now();const conflict=await invoke(changed);finished=Date.now();
  assert.equal(conflict.status,200);assert.equal(errorCode(conflict),'idempotency_conflict');
  assert.equal(conflict.result.structuredContent,undefined);assert.equal(conflict.result.inputRequests,undefined);
  assert.equal(conflict.result._meta['com.runeditrun/approval'],undefined);
  assert.equal(conflict.result._meta['com.runeditrun/error'].approval,undefined);
  assert.equal(conflict.result._meta['com.runeditrun/receipt'],undefined);
  const conflicted=await snapshot();
  transition(firstSaved.state,conflicted,{record,args:changed,classes,phase:'conflict',started,finished});
  assert.deepEqual(rowFor(conflicted,firstHandle),firstSaved.row,'conflict preserves every byte of the original saved approval');
  assert.deepEqual(await readApproval(firstHandle),firstSaved.view);
  assert.deepEqual(await native('/api/v1/monitors/'+record.id),stored);

  // A fresh key obtains separate server-computed evidence for the changed name.
  const fresh={...changed,idempotency_key:randomUUID()};
  started=Date.now();const second=await invoke(fresh);finished=Date.now();
  const secondHandle=pendingWire(second,version),secondSaved=await savedApproval(second,secondHandle,fresh,record,started,finished);
  assert.notEqual(secondHandle.id,firstHandle.id);assert.notEqual(secondHandle.url,firstHandle.url);
  assert.notEqual(secondSaved.saved.digest,firstSaved.saved.digest);
  assert.notEqual(secondSaved.view.summary_sha256,firstSaved.view.summary_sha256);
  assert.notDeepEqual(secondSaved.view.summary,firstSaved.view.summary);
  assert.ok(!secondSaved.view.summary.items.some(item=>item.endsWith(': '+args.definition.name)));
  assert.notEqual(second.decision.id,first.decision.id);
  transition(conflicted,secondSaved.state,{record,args:fresh,classes,decision:second.decision,phase:'pending',started,finished,handle:secondHandle,saved:secondSaved.saved});
  assert.deepEqual(rowFor(secondSaved.state,firstHandle),firstSaved.row);
  assert.deepEqual(await native('/api/v1/monitors/'+record.id),stored);

  const path='/agents/api/approvals/'+encodeURIComponent(secondHandle.id);
  started=Date.now();
  const approved=await native(path+'/approve',{revision:secondSaved.view.revision,summary_sha256:secondSaved.view.summary_sha256});
  finished=Date.now();assert.equal(approved.approval.state,'executed');
  assert.deepEqual(approved.approval.summary,secondSaved.view.summary);
  assert.equal(approved.approval.summary_sha256,secondSaved.view.summary_sha256);
  assert.equal(approved.approval.revision,secondSaved.view.revision);
  const executed=await snapshot();
  transition(secondSaved.state,executed,{record,args:fresh,classes,decision:second.decision,phase:'approve',started,finished,handle:secondHandle,saved:secondSaved.saved});
  assert.deepEqual(rowFor(executed,firstHandle),firstSaved.row,'approving the second action never approves or replaces the first');
  assert.deepEqual(await readApproval(firstHandle),firstSaved.view);
  const current=await readRevision(record,fresh.definition.name);
  const completion=JSON.parse(rowFor(executed,secondHandle).result),receipt=completion.receipt;
  assert.equal(completion.result.name,fresh.definition.name);assert.equal(completion.result.revision,current.revision);
  assert.equal(receipt.approval_id,secondHandle.id);assert.equal(receipt.decision_id,second.decision.id);
  assert.deepEqual(receipt.approved_by,[sponsorId]);assert.equal(receipt.prepared_by.for.id,sponsorId);
  assert.equal(receipt.prepared_by.agent.id,c.agentId);

  started=Date.now();const replay=await invoke(fresh);finished=Date.now();
  assert.equal(replay.result?.isError,false);assert.deepEqual(replay.result.structuredContent,completion.result);
  assert.deepEqual(replay.result._meta['com.runeditrun/receipt'],{...receipt,decision:second.decision},'wire replay retains the saved receipt and its original decision');
  const replayed=await snapshot();
  transition(executed,replayed,{record,args:fresh,classes,decision:replay.decision,phase:'replay',started,finished});
  assert.deepEqual(rowFor(replayed,firstHandle),firstSaved.row);
  assert.deepEqual(rowFor(replayed,secondHandle),rowFor(executed,secondHandle));
  assert.deepEqual(await readApproval(firstHandle),firstSaved.view);
  assert.deepEqual(await native('/api/v1/monitors/'+record.id),current);
  await readRevision(record,fresh.definition.name);
  const {rows,differs}=await auditRows(c);assert.equal(differs,0);
  assert.equal(rows.filter(row=>row.decision_id===second.decision.id&&row.outcome==='done').length,1);
  assert.equal(rows.filter(row=>row.decision_id===first.decision.id).length,0);
  noTraffic();
  console.log(`PROBE BASE-AGENT-007 acceptance-5-pending-input-${version}: real MCP pending name edit -> changed original key idempotency_conflict, fresh key distinct saved approval and summary, named-person approval changes only the second name once, original custody unchanged and second-key replay effect-free; all durable tables checked, zero runner or provider traffic`);
 }
 await c.adopt(autonomousPolicy());
 console.log('PASS BASE-AGENT-007 pending synchronous name-edit input isolation; broader approval and policy qualification remains unclaimed');
}
