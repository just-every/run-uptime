import {includeRelayExpectation} from './agent-relay-state-support.mjs';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {accessToken,autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';

// Continue the registered journey through the real emitted Worker and D1.
// This owner-enrolled private runner is never polled, even after approval.
export async function proveFormAccept({c,native,db,origin,cookie,sponsorId,providerRequests}) {
 await completeSecondFactor(origin,cookie);
 const tool='uptime.monitors.pause',owner=await native('/api/access/self');
 assert.equal(owner.id,sponsorId);assert.equal(owner.role,'owner');
 const sponsor=await db.prepare('SELECT * FROM oa_operators WHERE id=?').bind(sponsorId).first();
 assert.equal(sponsor.status,'active');
 assert.deepEqual((await db.prepare("SELECT id FROM oa_operators WHERE status='active'").all()).results,[{id:sponsorId}],
  'the isolated fixture has one active native sponsor');
 const runner=await native('/api/runners',{networkLabel:'synthetic-uptime-form'});
 const body=JSON.stringify({version:1}),stamp=String(Date.now());
 const enrollment=await fetch(origin+'/api/runner/enroll',{method:'POST',headers:{origin,'content-type':['application','json'].join('/'),
  'x-runner-id':runner.runnerId,'x-runner-key':runner.key,'x-sent-at':stamp,
  'x-runner-signature':createHmac('sha256',runner.key).update(stamp+'.runner-enrolment.'+body).digest('hex')},body});
 assert.equal(enrollment.status,200);assert.equal((await enrollment.json()).runnerId,runner.runnerId);
 const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;
  const rows=await db.batch(tables.map(({name})=>db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`)));
  return Object.fromEntries(tables.map(({name},index)=>[name,ordered(rows[index].results)]));
 };
 const networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
 const noTraffic=()=>{
  assert.deepEqual(providerRequests,networkBefore,'form responses and native approval send no provider traffic');
  assert.equal(allDeliveredMessages().length,mailBefore,'no intercepted mail is sent');
 };
 function pendingWire(answer,version) {
  assert.equal(answer.status,200);assert.equal(answer.decision.disposition,'approval');
  assert.equal(answer.result.structuredContent,undefined);
  assert.equal(answer.result._meta['com.runeditrun/receipt'],undefined,'pending responses have no execution receipt');
  assert.equal(answer.result._meta['com.runeditrun/review'],undefined);
  if(version==='2025-11-25') {
   assert.equal(answer.result.resultType,'complete');assert.equal(answer.result.isError,true);
   assert.equal(errorCode(answer),'approval_required');assert.equal(answer.result.inputRequests,undefined);
   return answer.result._meta['com.runeditrun/error'].approval;
  }
  assert.equal(answer.result.resultType,'input_required');assert.equal(errorCode(answer),null);
  assert.equal(typeof answer.result.requestState,'string');assert.ok(answer.result.requestState.length>0);
  const handle=answer.result._meta['com.runeditrun/approval'];
  assert.equal(answer.result.inputRequests.approval.method,['elicitation','create'].join('/'));
  assert.equal(answer.result.inputRequests.approval.params.mode,'url');
  assert.equal(answer.result.inputRequests.approval.params.url,handle.url);
  return handle;
 }
 function replayOnly(before,after,answer,args,original,started,finished) {
  assert.deepEqual(Object.keys(after),Object.keys(before),'every durable table is inventoried');
  const expected=structuredClone(before),prior=before.agent_door_agents.find(row=>row.id===c.agentId);
  const admitted=after.agent_door_agents.find(row=>row.id===c.agentId);
  assert.ok(prior);assert.equal(prior.sponsor,sponsorId);assert.equal(prior.revoked,0);
  assert.ok(admitted.window>=Math.floor(started/60000)&&admitted.window<=Math.floor(finished/60000));
  expected.agent_door_agents=ordered(before.agent_door_agents.map(row=>row.id===c.agentId?{
   ...row,name:'Agent door conformance',specialist:c.surface.specialist,sponsor_name:sponsor.display_name,
   window:admitted.window,requests:prior.window===admitted.window?prior.requests+1:1,
  }:row));
  const added=after.agent_door_audit.filter(row=>!before.agent_door_audit.some(old=>old.id===row.id));
  assert.equal(added.length,1,'one replay audit, with every prior audit preserved');
  const [record]=added,sequence=before.sqlite_sequence.find(row=>row.name==='agent_door_audit');
  assert.ok(sequence);assert.equal(record.id,answer.decision.id);
  assert.ok(Date.parse(record.at)>=started&&Date.parse(record.at)<=finished);
  const initial=JSON.parse(original.row),audit=JSON.parse(record.row);
  assert.deepEqual(audit,{
   ...initial,id:record.id,operation_id:initial.operation_id,at:record.at,
   outcome:'replayed',replay_of:initial.replay_of??initial.id,
  },'only the new audit identity, time and replay outcome differ from the admitted original');
  assert.equal(audit.tool,tool);assert.equal(audit.idempotency_key,args.idempotency_key);
  assert.equal(audit.agent.id,c.agentId);assert.equal(audit.sponsor.id,sponsorId);
  // Both fixture policies are unscoped. Independently total the retained
  // usage ledger for the replay's day; an earlier successful pause counts too.
  // Accept either observed day if the request crosses midnight.
  const evidence=JSON.parse(record.evidence),template=JSON.parse(original.evidence);
  const candidates=[started,finished].map(now=>{
   const day=Math.floor(now/86400000)*86400000;
   const classes=before.agent_door_usage.filter(row=>row.at>=day&&row.at<day+86400000).flatMap(row=>JSON.parse(row.classes));
   const usage=Object.fromEntries(Object.keys(template.usage).map(key=>[key,
    classes.filter(item=>item.class===key.split(':')[1]).reduce((sum,item)=>sum+item.facts.measure,0),
   ]));
   return {...template,usage};
  });
  assert.ok(candidates.some(expected=>isDeepStrictEqual(evidence,expected)),'replay audit records exactly the current policy and independently counted usage');
  assert.deepEqual(record,{sequence:sequence.seq+1,id:record.id,at:record.at,agent:c.agentId,
   classes:original.classes,row:record.row,evidence:JSON.stringify(evidence)});
  expected.agent_door_audit=ordered([...before.agent_door_audit,record]);
  expected.sqlite_sequence=ordered(before.sqlite_sequence.map(row=>row.name==='agent_door_audit'?{...row,seq:row.seq+1}:row));
  includeRelayExpectation(expected,before,after,c.business);
  for(const table of Object.keys(expected))assert.deepEqual(after[table],expected[table],
   table+': only the exact agent admission counter, replay audit and audit sequence may change');
  noTraffic();
 }
 async function pausedOnce(record) {
  const visible=await native('/api/v1/monitors/'+record.id),revisions=await native('/api/monitors/'+record.id+'/revisions');
  assert.equal(visible.enabled,false);assert.equal(visible.revision,record.revision+1);
  assert.equal(revisions.length,2,'one pause appends one immutable native revision');
  assert.deepEqual(revisions.find(row=>row.revision===record.revision).definition,record.definition);
  assert.equal(revisions.find(row=>row.revision===record.revision+1).definition.enabled,false);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM slots WHERE monitor_id=?').bind(record.id).first()).n,0,
   'the unpolled runner creates no work or observations');
 }
 for(const [policyName,policy] of [['held',heldPolicy()],['autonomous',autonomousPolicy()]]) {
  await c.adopt(policy);
  for(const version of ['2026-07-28','2025-11-25']) {
   const record=await native('/api/monitors',{name:'synthetic-uptime-form',type:'http',network:'public',url:'https://form.example.test/health',
    method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],assignments:{'local-a':runner.runnerId},
    failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:true,service:'synthetic-uptime-form'});
   const visible=await native('/api/v1/monitors/'+record.id);
   assert.equal(visible.enabled,true);assert.equal(record.definition.assignments['local-a'].runnerId,runner.runnerId);
   const args={id:record.id,version:record.revision,expected_revision:record.revision,idempotency_key:randomUUID()};
   assert.equal(await db.prepare('SELECT key FROM agent_door_calls WHERE agent=? AND key=?').bind(c.agentId,args.idempotency_key).first(),null);
   const pending=await c.tool(tool,args,{version});
   assert.deepEqual(pending.decision.classes.map(({class:kind,facts})=>({class:kind,facts})),[
    {class:'live',facts:{measure:1,service:'synthetic-uptime-form'}},
   ]);
   let completed=pending;
   if(policyName==='held') {
    const handle=pendingWire(pending,version);
    assert.equal(handle.url,origin+'/agents/approvals/'+encodeURIComponent(handle.id));
    // The older response has no requestState field. Obtain the same action's
    // real continuation state from its modern response, retaining the key.
    const modern=version==='2025-11-25'?await c.tool(tool,args,{version:'2026-07-28'}):pending;
    assert.deepEqual(pendingWire(modern,'2026-07-28'),handle);
    const requestState=modern.result.requestState,path='/agents/api/approvals/'+encodeURIComponent(handle.id);
    const view=(await c.personJson(path)).approval;
    assert.equal(view.state,'pending');assert.equal(view.revision,c.revision);
    assert.deepEqual(view.approvers,['sponsor']);assert.deepEqual(view.approvals,[]);
    assert.deepEqual(view.summary.target,{id:record.id,name:record.definition.name});
    assert.ok(view.summary.items.includes('Current monitor revision: '+record.revision));
    assert.deepEqual(view.summary.nativeTarget,{kind:'monitor',id:record.id});
    assert.match(view.summary_sha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(await native('/api/v1/monitors/'+record.id),visible,'pending pause leaves the monitor enabled at its original revision');
    await c.renewPolicy();
    const token=await accessToken(c),before=await snapshot();
    const approval=before.agent_door_approvals.find(row=>row.id===handle.id),saved=JSON.parse(approval.saved);
    assert.equal(approval.state,'pending');assert.equal(approval.result,null);assert.equal(approval.version,0);
    assert.equal(approval.approvals,'[]');assert.equal(saved.result.requestState,requestState);
    assert.deepEqual(saved.args,{id:record.id,version:record.revision});assert.equal(saved.key,args.idempotency_key);
    assert.equal(saved.expected_revision,record.revision);assert.equal(saved.summary_sha256,view.summary_sha256);
    assert.equal(saved.principal.person.id,sponsorId);assert.equal(saved.principal.agent.id,c.agentId);
    const original=before.agent_door_audit.find(row=>row.id===pending.decision.id);
    assert.ok(original);assert.equal(JSON.parse(original.row).outcome,'pending');
    const started=Date.now();
    // Send the form response at the transport level, rather than as an ignored
    // tool argument. The agent bearer carries no signed-in person session.
    const accepted=await c.mcp(['tools','call'].join('/'),{name:tool,arguments:args,requestState,
     inputResponses:{approval:{mode:'form',action:'accept',content:{approved:true}}},
     _meta:{'io.modelcontextprotocol/clientCapabilities':{elicitation:{url:{},form:{}}}},
    },{version,token,headers:{cookie:''}});
    const finished=Date.now(),after=await snapshot();
    assert.deepEqual(pendingWire(accepted,version),handle,'form acceptance retains the original pending approval');
    if(version==='2026-07-28')assert.equal(accepted.result.requestState,requestState);
    replayOnly(before,after,accepted,args,original,started,finished);
    assert.deepEqual((await c.personJson(path)).approval,view,'saved arguments, summary, revision and approver marks remain identical');
    assert.deepEqual(await native('/api/v1/monitors/'+record.id),visible,'form accept cannot pause or revise the monitor');
    assert.deepEqual(after.agent_door_approvals,before.agent_door_approvals,'no second approval or execution result is created');
    console.log(`PROBE BASE-AGENT-008 acceptance-3-form-${version}: agent-only MCP form accept with exact key and returned state -> original pending approval, no receipt or native effect; all ${Object.keys(before).length} durable tables match except one admission counter, replay audit and sequence; zero runner or provider traffic`);

    const approved=await native(path+'/approve',{revision:view.revision,summary_sha256:view.summary_sha256});
    assert.equal(approved.approval.state,'executed');assert.equal(approved.approval.revision,view.revision);
    assert.deepEqual(approved.approval.summary,view.summary);assert.equal(approved.approval.summary_sha256,view.summary_sha256);
    assert.deepEqual(approved.approval.approvals.map(mark=>({person:mark.person,ref:mark.ref})),[{person:sponsorId,ref:'sponsor'}]);
    const stored=await db.prepare('SELECT * FROM agent_door_approvals WHERE id=?').bind(handle.id).first();
    assert.equal(stored.saved,approval.saved,'the native person executes exactly the saved action');
    const receipt=JSON.parse(stored.result).receipt;
    assert.equal(receipt.approval_id,handle.id);assert.deepEqual(receipt.approved_by,[sponsorId]);
    assert.equal(receipt.prepared_by.agent.id,c.agentId);assert.equal(receipt.prepared_by.for.id,sponsorId);
    completed=await c.tool(tool,args,{version,requestState});
    assert.equal(completed.result.isError,false);
    assert.deepEqual(completed.result._meta['com.runeditrun/receipt'],{...receipt,decision:pending.decision});
    const {rows,differs}=await auditRows(c);assert.equal(differs,0);
    const executions=rows.filter(row=>row.decision_id===pending.decision.id);
    assert.equal(executions.length,1);assert.equal(executions[0].outcome,'done');
    assert.deepEqual(executions[0].approval,{id:handle.id,by:[sponsorId]});
    console.log(`PROBE BASE-AGENT-008 acceptance-3-person-${version}: named sponsor native approval of exact saved revision -> one pause, person approver and agent preparer receipt`);
   } else {
    assert.equal(pending.result.isError,false);assert.equal(pending.result.resultType,'complete');
    assert.equal(pending.decision.disposition,'autonomous');
    assert.equal(pending.result._meta['com.runeditrun/approval'],undefined);
    assert.equal(pending.result.inputRequests,undefined);
    assert.equal(await db.prepare("SELECT id FROM agent_door_approvals WHERE json_extract(saved,'$.key')=?").bind(args.idempotency_key).first(),null);
    console.log(`PROBE BASE-AGENT-008 acceptance-3-autonomous-${version}: ordinary MCP pause -> one revision without an approval requirement`);
   }
   await pausedOnce(record);
   await c.renewPolicy();
   const token=await accessToken(c),before=await snapshot(),started=Date.now();
   const replay=await c.tool(tool,args,{version,token});
   const finished=Date.now(),after=await snapshot();
   assert.equal(replay.result.isError,false);assert.deepEqual(replay.result.structuredContent,completed.result.structuredContent);
   assert.deepEqual(replay.result._meta['com.runeditrun/receipt'],completed.result._meta['com.runeditrun/receipt']);
   const previous=before.agent_door_audit.find(row=>row.id===completed.decision.id);
   replayOnly(before,after,replay,args,previous,started,finished);
   await pausedOnce(record);noTraffic();
  }
 }
 await c.adopt(autonomousPolicy());
 console.log('PASS BASE-AGENT-008 synchronous form accept cannot approve; native person approval, ordinary autonomous pause and effect-free replay in both protocol versions');
}
