import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {accessToken,autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';
import {includeRelayExpectation} from './agent-relay-state-support.mjs';

// Extend the existing emitted-Worker journey. All person decisions use the
// signed-in native owner; the enrolled private runner is deliberately unpolled.
export async function proveApprovalRejection({c,native,db,origin,sponsorId,providerRequests}) {
 const tool='uptime.monitors.pause',owner=await native('/api/access/self');
 assert.equal(owner.id,sponsorId);assert.equal(owner.role,'owner');
 const sponsor=await db.prepare('SELECT * FROM oa_operators WHERE id=?').bind(sponsorId).first();
 assert.equal(sponsor.status,'active');
 assert.deepEqual((await db.prepare("SELECT id FROM oa_operators WHERE status='active'").all()).results,[{id:sponsorId}],
  'only the genuine native sponsor is active');
 const runner=await native('/api/runners',{networkLabel:'synthetic-uptime-rejection'});
 const body=JSON.stringify({version:1}),stamp=String(Date.now());
 const enrolled=await fetch(origin+'/api/runner/enroll',{method:'POST',headers:{origin,'content-type':['application','json'].join('/'),
  'x-runner-id':runner.runnerId,'x-runner-key':runner.key,'x-sent-at':stamp,
  'x-runner-signature':createHmac('sha256',runner.key).update(stamp+'.runner-enrolment.'+body).digest('hex')},body});
 assert.equal(enrolled.status,200);assert.equal((await enrolled.json()).runnerId,runner.runnerId);
 const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;
  const rows=await db.batch(tables.map(({name})=>db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`)));
  return Object.fromEntries(tables.map(({name},index)=>[name,ordered(rows[index].results)]));
 };
 const traffic=structuredClone(providerRequests),mailCount=allDeliveredMessages().length;
 function noTraffic() {
  assert.deepEqual(providerRequests,traffic,'pending, rejected and successful control pauses make no provider requests');
  assert.equal(allDeliveredMessages().length,mailCount,'no mail submissions');
 }
 function unchanged(expected,after) {
  assert.deepEqual(Object.keys(after),Object.keys(expected),'complete durable table inventory');
  for(const table of Object.keys(expected))assert.deepEqual(after[table],expected[table],table+': only the enumerated admission, audit or person decision may change');
  noTraffic();
 }
 function sequence(expected,table,amount) {
  const old=expected.sqlite_sequence.find(row=>row.name===table);
  if(old)old.seq+=amount;else expected.sqlite_sequence.push({name:table,seq:amount});
  expected.sqlite_sequence=ordered(expected.sqlite_sequence);
 }
 function relay(expected,before,after,amount) {
  includeRelayExpectation(expected,before,after,c.business);
  const seq=state=>state.sqlite_sequence.find(row=>row.name==='agent_door_relay')?.seq??0;
  assert.equal(seq(after),seq(before)+amount,'exact relay sequence delta for the changed decision');
 }
 function admission(expected,before,after,started,finished) {
  const old=before.agent_door_agents.find(row=>row.id===c.agentId),current=after.agent_door_agents.find(row=>row.id===c.agentId);
  assert.ok(old);assert.equal(old.sponsor,sponsorId);assert.equal(old.revoked,0);
  assert.ok(current.window>=Math.floor(started/60000)&&current.window<=Math.floor(finished/60000));
  expected.agent_door_agents=ordered(before.agent_door_agents.map(row=>row.id===c.agentId?{...row,
   name:'Agent door conformance',specialist:c.surface.specialist,sponsor_name:sponsor.display_name,
   window:current.window,requests:old.window===current.window?old.requests+1:1,
  }:row));
 }
 const facts=[{class:'live',facts:{measure:1,service:'synthetic-uptime-rejection'}}];
 const rules=[{class:'live',rule:'all',do:'approval'}];
 function evidence(record,before,started,finished) {
  const actual=JSON.parse(record.evidence);
  const classes=[...new Set([...c.surface.tools,...c.invokeTools??[]].flatMap(item=>item.classes))];
  const candidates=[started,finished].map(now=>{
   const day=Math.floor(now/86400000)*86400000;
   const usage=before.agent_door_usage.filter(row=>row.at>=day&&row.at<day+86400000).flatMap(row=>JSON.parse(row.classes));
   return {document:c.document,usage:Object.fromEntries(c.document.rules.flatMap(rule=>classes.map(cls=>[
    rule.id+':'+cls,usage.filter(item=>item.class===cls).reduce((sum,item)=>sum+item.facts.measure,0),
   ]))),classes:facts,result:'approval',rules};
  });
  assert.ok(candidates.some(value=>isDeepStrictEqual(actual,value)),'exact policy evidence and independently totalled usage at admission');
 }
 function addAudit(expected,before,after,answer,args,started,finished,original) {
  const extra=after.agent_door_audit.filter(row=>!before.agent_door_audit.some(old=>old.id===row.id));
  assert.equal(extra.length,1,'exactly one new admission audit');
  const [record]=extra,at=Date.parse(record.at),id=answer.decision.id;
  assert.equal(record.id,id);assert.ok(at>=started&&at<=finished);
  const row=JSON.parse(record.row),initial=original&&JSON.parse(original.row);
  assert.deepEqual(row,initial?{...initial,id,at:record.at,code:'approval_rejected',outcome:'replayed',replay_of:initial.id}:{
   id,role:'owner',operation_id:id,scopes:[...new Set([...c.surface.tools.map(item=>item.scope),'events:read'])],client_id:'rer-agent-conformance',
   at:record.at,door:'mcp',agent:{id:c.agentId,name:'Agent door conformance',specialist:c.surface.specialist},
   sponsor:{id:sponsorId,name:sponsor.display_name},label:'Agent door conformance for '+sponsor.display_name,
   consent:c.consent,tool,resource:{kind:'monitor',id:args.id},decision_id:null,classes:facts,revision:c.revision,rules,
   decision:'approval',outcome:'pending',code:null,approval:{id:answer.handle.id,by:[]},review:null,
   idempotency_key:args.idempotency_key,trace:null,ignored_arguments:[],replay_of:null,
  },'audit retains exact native authority, target, policy, key and original operation');
  evidence(record,before,started,finished);
  const next=(before.sqlite_sequence.find(row=>row.name==='agent_door_audit')?.seq??0)+1;
  assert.deepEqual(record,{sequence:next,id,at:record.at,agent:c.agentId,classes:JSON.stringify(['live']),row:record.row,evidence:record.evidence});
  expected.agent_door_audit=ordered([...before.agent_door_audit,record]);
  // Initial admission inserts its running audit, then UPSERTs the pending
  // outcome; SQLite advances the AUTOINCREMENT ledger on that conflict too.
  sequence(expected,'agent_door_audit',original?1:2);
  return record;
 }
 function addEvent(expected,before,after,type,handle,decisionId,started,finished,person=false) {
  const extra=after.agent_door_events.filter(row=>!before.agent_door_events.some(old=>old.id===row.id));
  assert.equal(extra.length,1,'one internal approval event');
  const [row]=extra,event=JSON.parse(row.event),uri=handle.url,at=Date.parse(event.at);
  assert.ok(event.id);assert.ok(at>=started&&at<=finished);
  assert.deepEqual(event,{decision_id:decisionId,classes:facts,...(person?{decision:'approval',state:'rejected'}:{}),
   id:row.id,type,uri,actor:person?{kind:'person',person:{id:sponsorId,name:sponsor.display_name}}:{
    kind:'agent',agent:{id:c.agentId,name:'Agent door conformance'},for:{id:sponsorId,name:sponsor.display_name},label:'Agent door conformance for '+sponsor.display_name,
   },at:event.at});
  assert.deepEqual(row,{sequence:(before.sqlite_sequence.find(item=>item.name==='agent_door_events')?.seq??0)+1,id:row.id,uri,event:row.event});
  expected.agent_door_events=ordered([...before.agent_door_events,row]);sequence(expected,'agent_door_events',1);
 }
 function pendingWire(answer,version) {
  assert.equal(answer.status,200);assert.equal(answer.decision.disposition,'approval');assert.equal(answer.decision.revision,c.revision);
  assert.deepEqual(answer.decision.classes.map(({class:kind,facts})=>({class:kind,facts})),facts);
  assert.equal(answer.result.structuredContent,undefined);assert.equal(answer.result._meta['com.runeditrun/receipt'],undefined);
  let handle;
  if(version==='2025-11-25') {
   assert.equal(answer.result.resultType,'complete');assert.equal(answer.result.isError,true);assert.equal(errorCode(answer),'approval_required');
   assert.equal(answer.result.inputRequests,undefined);handle=answer.result._meta['com.runeditrun/error'].approval;
  } else {
   assert.equal(answer.result.resultType,'input_required');assert.equal(errorCode(answer),null);assert.ok(answer.result.requestState);
   handle=answer.result._meta['com.runeditrun/approval'];
   assert.equal(answer.result.inputRequests.approval.method,['elicitation','create'].join('/'));
   assert.equal(answer.result.inputRequests.approval.params.mode,'url');assert.equal(answer.result.inputRequests.approval.params.url,handle.url);
  }
  assert.ok(handle.id);assert.equal(handle.url,origin+'/agents/approvals/'+encodeURIComponent(handle.id));
  return handle;
 }
 async function newMonitor() {
  const record=await native('/api/monitors',{name:'synthetic-uptime-rejection',type:'http',network:'public',url:'https://rejection.example.test/health',
   method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],assignments:{'local-a':runner.runnerId},
   failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:true,service:'synthetic-uptime-rejection'});
  assert.equal(record.definition.enabled,true);assert.equal(record.definition.assignments['local-a'].runnerId,runner.runnerId);
  return record;
 }
 const argsFor=record=>({id:record.id,version:record.revision,expected_revision:record.revision,idempotency_key:randomUUID()});
 async function pausedOnce(record) {
  const current=await native('/api/v1/monitors/'+record.id),revisions=await native('/api/monitors/'+record.id+'/revisions');
  assert.equal(current.enabled,false);assert.equal(current.revision,record.revision+1);assert.equal(revisions.length,2);
  assert.deepEqual(revisions.find(row=>row.revision===record.revision).definition,record.definition);
  assert.equal(revisions.find(row=>row.revision===record.revision+1).definition.enabled,false);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM slots WHERE monitor_id=?').bind(record.id).first()).n,0);
 }
 const held=heldPolicy();held.rules[0].approver=['person:'+c.person.sub];
 for(const version of ['2026-07-28','2025-11-25']) {
  await c.adopt(held);
  const record=await newMonitor(),visible=await native('/api/v1/monitors/'+record.id),args=argsFor(record);
  assert.equal(visible.enabled,true);assert.equal(visible.revision,record.revision);
  await c.renewPolicy();const token=await accessToken(c),before=await snapshot(),started=Date.now();
  assert.equal(before.agent_door_calls.some(row=>row.agent===c.agentId&&row.key===args.idempotency_key),false,'no cached action');
  const pending=await c.tool(tool,args,{version,token}),finished=Date.now();
  const handle=pendingWire(pending,version);pending.handle=handle;
  const path='/agents/api/approvals/'+encodeURIComponent(handle.id),view=(await c.personJson(path)).approval;
  assert.equal(view.state,'pending');assert.equal(view.id,handle.id);assert.equal(view.decision_id,pending.decision.id);
  assert.equal(view.revision,c.revision);assert.deepEqual(view.approvers,['person:'+c.person.sub]);assert.deepEqual(view.approvals,[]);
  assert.deepEqual(view.classes,facts);assert.deepEqual(view.summary.nativeTarget,{kind:'monitor',id:record.id});
  assert.deepEqual(view.summary.target,{id:record.id,name:record.definition.name});
  assert.ok(view.summary.items.includes('Current monitor revision: '+record.revision));assert.match(view.summary_sha256,/^[a-f0-9]{64}$/);
  assert.equal(view.expires_at,handle.expires_at);assert.ok(Date.parse(handle.expires_at)>=started+3600000&&Date.parse(handle.expires_at)<=finished+3600000);
  const waiting=await snapshot(),expected=structuredClone(before);
  const approvals=waiting.agent_door_approvals.filter(row=>!before.agent_door_approvals.some(old=>old.id===row.id));
  assert.equal(approvals.length,1);const [approval]=approvals,saved=JSON.parse(approval.saved);
  assert.deepEqual(approval,{id:handle.id,state:'pending',saved:approval.saved,approvals:'[]',result:null,version:0});
  assert.deepEqual(saved.args,{id:record.id,version:record.revision});assert.equal(saved.key,args.idempotency_key);
  assert.equal(saved.expected_revision,record.revision);assert.equal(saved.principal.person.id,sponsorId);assert.equal(saved.principal.agent.id,c.agentId);
  assert.deepEqual(saved.summary,view.summary);assert.equal(saved.summary_sha256,view.summary_sha256);assert.equal(saved.revision,view.revision);
  assert.equal(saved.decision_id,pending.decision.id);assert.deepEqual(saved.result.approval,handle);assert.deepEqual(saved.classes,facts);assert.deepEqual(saved.approvers,view.approvers);
  expected.agent_door_approvals=ordered([...before.agent_door_approvals,approval]);
  const calls=waiting.agent_door_calls.filter(row=>!before.agent_door_calls.some(old=>old.agent===row.agent&&old.key===row.key));
  assert.equal(calls.length,1);const [claim]=calls;
  assert.ok(claim.created_at>=started&&claim.created_at<=finished);
  assert.deepEqual(claim,{agent:c.agentId,key:args.idempotency_key,digest:saved.digest,decision_id:pending.decision.id,created_at:claim.created_at,
   state:'pending',outcome:JSON.stringify(saved.result),expires_at:null});
  expected.agent_door_calls=ordered([...before.agent_door_calls,claim]);
  const original=addAudit(expected,before,waiting,pending,args,started,finished);
  addEvent(expected,before,waiting,'approval.pending',handle,pending.decision.id,started,finished);
  admission(expected,before,waiting,started,finished);relay(expected,before,waiting,2);unchanged(expected,waiting);
  assert.deepEqual(await native('/api/v1/monitors/'+record.id),visible);

  const decision={revision:view.revision,summary_sha256:view.summary_sha256};
  const rejectionStart=Date.now(),rejected=await native(path+'/reject',decision),rejectionEnd=Date.now();
  assert.deepEqual(rejected.approval,{...view,state:'rejected'},'the person rejects exactly the saved revision and summary');
  const rejectedState=await snapshot(),rejectedExpected=structuredClone(waiting);
  rejectedExpected.agent_door_approvals=ordered(waiting.agent_door_approvals.map(row=>row.id===handle.id?{...row,state:'rejected',version:row.version+1}:row));
  addEvent(rejectedExpected,waiting,rejectedState,'approval.decided',handle,pending.decision.id,rejectionStart,rejectionEnd,true);
  relay(rejectedExpected,waiting,rejectedState,1);unchanged(rejectedExpected,rejectedState);
  const rpcIds=new Set([pending.body.id]);
  for(let repeat=0;repeat<2;repeat++) {
   const beforeRepeat=await snapshot(),again=await native(path+'/reject',decision);
   assert.deepEqual(again,rejected,'repeated native rejection preserves the same person decision');
   unchanged(beforeRepeat,await snapshot());
   const beforeRetry=await snapshot(),retryStart=Date.now();
   const retry=await c.tool(tool,args,{version,token}),retryEnd=Date.now(),afterRetry=await snapshot();
   assert.equal(rpcIds.has(retry.body.id),false,'each retry uses a new JSON-RPC id');rpcIds.add(retry.body.id);
   assert.equal(retry.status,200);assert.equal(retry.result.isError,true);assert.equal(retry.result.resultType,'complete');
   assert.equal(errorCode(retry),'approval_rejected');
   for(const key of ['structuredContent','contents','inputRequests'])assert.equal(retry.result[key],undefined,'rejection has no result or new elicitation');
   assert.equal(retry.result._meta['com.runeditrun/receipt'],undefined,'no execution receipt');
   assert.equal(retry.result._meta['com.runeditrun/approval'],undefined,'no second pending approval');
   assert.deepEqual(retry.result._meta['com.runeditrun/error'],{code:'approval_rejected'});
   assert.deepEqual(retry.result.content.map(item=>JSON.parse(item.text)),[{code:'approval_rejected'}],'wire content contains only the refusal');
   const retryExpected=structuredClone(beforeRetry);
   addAudit(retryExpected,beforeRetry,afterRetry,retry,args,retryStart,retryEnd,original);
   admission(retryExpected,beforeRetry,afterRetry,retryStart,retryEnd);relay(retryExpected,beforeRetry,afterRetry,1);unchanged(retryExpected,afterRetry);
   assert.deepEqual(await native('/api/v1/monitors/'+record.id),visible,'rejection and retry do not pause or revise');
   assert.deepEqual((await native('/api/monitors/'+record.id+'/revisions')).map(row=>({revision:row.revision,definition:row.definition})),[
    {revision:record.revision,definition:record.definition},
   ],'no new native revision');
   assert.deepEqual((await c.personJson(path)).approval,rejected.approval);
  }
  const {rows,differs}=await auditRows(c);assert.equal(differs,0);
  assert.equal(rows.filter(row=>row.decision_id===pending.decision.id).length,0,'a rejection never acquires an execution audit');
  console.log(`PROBE BASE-AGENT-007 acceptance-5-rejected-${version}: named native person rejects saved pause revision; identical arguments and key with fresh RPC ids -> approval_rejected twice, no execution receipt or second approval, enabled original revision; all ${Object.keys(waiting).length} durable tables match enumerated decision and audit deltas; zero runner or provider traffic`);

  // A different enabled monitor must still be actionable under held policy.
  const approvedControl=await newMonitor(),approvedArgs=argsFor(approvedControl);
  const approvedPending=await c.tool(tool,approvedArgs,{version});const approvedHandle=pendingWire(approvedPending,version);
  const approvedPath='/agents/api/approvals/'+encodeURIComponent(approvedHandle.id),approvedView=(await c.personJson(approvedPath)).approval;
  assert.deepEqual(approvedView.approvers,['person:'+c.person.sub]);
  const approvedDecision={revision:approvedView.revision,summary_sha256:approvedView.summary_sha256};
  const approved=await native(approvedPath+'/approve',approvedDecision);
  assert.equal(approved.approval.state,'executed');assert.equal(approved.approval.revision,approvedView.revision);
  assert.deepEqual(approved.approval.summary,approvedView.summary);assert.equal(approved.approval.summary_sha256,approvedView.summary_sha256);
  assert.deepEqual(approved.approval.approvals.map(mark=>({person:mark.person,ref:mark.ref})),[{person:sponsorId,ref:'person:'+c.person.sub}]);
  const completed=await c.tool(tool,approvedArgs,{version}),receipt=completed.result._meta['com.runeditrun/receipt'];
  assert.equal(completed.result.isError,false);assert.equal(completed.result.structuredContent.id,approvedControl.id);
  assert.equal(receipt.approval_id,approvedHandle.id);assert.equal(receipt.decision_id,approvedPending.decision.id);
  assert.deepEqual(receipt.approved_by,[sponsorId]);assert.equal(receipt.prepared_by.agent.id,c.agentId);assert.equal(receipt.prepared_by.for.id,sponsorId);
  assert.deepEqual(await native(approvedPath+'/approve',approvedDecision),approved);
  assert.deepEqual((await c.tool(tool,approvedArgs,{version})).result.structuredContent,completed.result.structuredContent);
  await pausedOnce(approvedControl);
  const executed=(await auditRows(c)).rows.filter(row=>row.decision_id===approvedPending.decision.id);
  assert.equal(executed.length,1);assert.equal(executed[0].outcome,'done');assert.deepEqual(executed[0].approval,{id:approvedHandle.id,by:[sponsorId]});

  await c.adopt(autonomousPolicy());
  const autonomous=await newMonitor(),autonomousArgs=argsFor(autonomous),automatic=await c.tool(tool,autonomousArgs,{version});
  assert.equal(automatic.result.isError,false);assert.equal(automatic.decision.disposition,'autonomous');
  assert.equal(automatic.result.structuredContent.id,autonomous.id);assert.equal(automatic.result._meta['com.runeditrun/approval'],undefined);
  assert.equal(automatic.result.inputRequests,undefined);
  assert.deepEqual((await c.tool(tool,autonomousArgs,{version})).result.structuredContent,automatic.result.structuredContent);
  await pausedOnce(autonomous);
  for(const target of [record,approvedControl,autonomous])assert.equal((await db.prepare('SELECT COUNT(*) n FROM slots WHERE monitor_id=?').bind(target.id).first()).n,0);
  assert.deepEqual(await native('/api/v1/monitors/'+record.id),visible,'independent successful controls cannot change the rejected target');
  noTraffic();
  console.log(`PROBE BASE-AGENT-007 acceptance-5-controls-${version}: distinct genuine held approval and autonomous calls -> each pauses its own enabled monitor exactly once; original rejected monitor stays enabled; zero runner or provider traffic`);
 }
 console.log('PASS BASE-AGENT-007 synchronous pause rejection, complete durable preservation and independent actionable controls in both supported protocols');
}
