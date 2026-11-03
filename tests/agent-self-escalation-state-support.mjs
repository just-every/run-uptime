import {includeRelayExpectation} from './agent-relay-state-support.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deliveredLink,sessionCookie} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';
import {accessToken,autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';

// One continuation of the registered native journey: the real owner sponsors
// every call; an independently invited member is only the allowed grant target.
export async function proveSelfEscalationState({c,native,call,db,origin,cookie,providerRequests}) {
 const tool='uptime.grants.update';
 await completeSecondFactor(origin,cookie);
 const owner=await native('/api/access/self');
 assert.equal(owner.role,'owner');
 const sponsor=await db.prepare('SELECT * FROM oa_operators WHERE id=?').bind(owner.id).first();
 assert.equal(sponsor.status,'active');
 const monitor=await native('/api/monitors',{
  name:'synthetic-uptime-self-grant',type:'http',network:'public',
  url:'https://example.com/health',method:'GET',assertions:{status:200},
  intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,
  confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:false,
 });
 const original=await native('/api/v1/monitors/'+monitor.id);
 assert.equal(original.enabled,false,'the independent fixture cannot schedule checks');
 const email='synthetic-uptime-'+randomUUID()+'@'+'example.test';
 assert.equal((await call('/api/access/invitations',{
  email,displayName:'synthetic-uptime-grant-member',role:'read-only',scopes:[],
 },{cookie})).status,202);
 const link=await deliveredLink(call,{email,kind:'invite'});
 const memberCookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
 await completeSecondFactor(origin,memberCookie);
 const memberResponse=await call('/api/access/self',undefined,{cookie:memberCookie});
 assert.equal(memberResponse.status,200);
 const member=await memberResponse.json();
 assert.notEqual(member.id,owner.id);assert.equal(member.role,'read-only');
 const grants=()=>native('/api/monitors/'+monitor.id+'/evidence-access');
 const proof=async args=>(await native('/agents/native-proof',{
  agent_id:c.agentId,tool,arguments:args,
 })).reference;
 const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const snapshot=async()=>{
  // Include all application and authentication tables, plus SQLite's sequence
  // ledger. Only D1's private metadata and SQLite implementation tables are out.
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;
  const state={};
  for(const {name} of tables)state[name]=ordered((await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results);
  return state;
 };
 const selfArgs={id:monitor.id,operator_id:owner.id,granted:true};
 const otherArgs={...selfArgs,operator_id:member.id};
 for(const [policy,document] of [['autonomous',autonomousPolicy()],['held',heldPolicy()]]) {
  await c.adopt(document);
  for(const version of ['2026-07-28','2025-11-25']) {
   // Qualify the supported grant and required human proof outside the refusal
   // snapshots. Each policy and protocol starts with an ungranted member.
   await native('/api/monitors/'+monitor.id+'/evidence-access',{operatorId:member.id,granted:false});
   const initial=await grants();
   assert.equal(initial.members.find(row=>row.id===member.id)?.granted,false);
   const unproved=await c.tool(tool,{...otherArgs,idempotency_key:randomUUID()},{version});
   assert.equal(errorCode(unproved),'native_proof_required');
   assert.deepEqual(await grants(),initial,'missing native proof cannot grant access');
   const granted=await c.tool(tool,{...otherArgs,idempotency_key:randomUUID()},{version,proofReference:await proof(otherArgs)});
   if(policy==='held') {
    let handle;
    if(version==='2025-11-25') {
     assert.equal(granted.result?.resultType,'complete');
     assert.equal(granted.result.isError,true);assert.equal(errorCode(granted),'approval_required');
     handle=granted.result._meta['com.runeditrun/error'].approval;
    } else {
     assert.equal(granted.result?.resultType,'input_required');
     handle=granted.result._meta['com.runeditrun/approval'];
    }
    assert.equal(granted.decision.disposition,'approval');
    assert.equal(granted.result.structuredContent,undefined);
    assert.deepEqual(await grants(),initial,'held grant has no effect before person approval');
    const path='/agents/api/approvals/'+encodeURIComponent(handle.id);
    const {approval}=await c.personJson(path);
    assert.equal(approval.state,'pending');assert.equal(approval.decision_id,granted.decision.id);
    assert.deepEqual(approval.summary.nativeTarget,{kind:'monitor',id:monitor.id});
    const approved=await native(path+'/approve',{revision:approval.revision,summary_sha256:approval.summary_sha256});
    assert.equal(approved.approval.state,'executed');
    const {rows,differs}=await auditRows(c);assert.equal(differs,0);
    const executed=rows.filter(row=>row.decision_id===granted.decision.id);
    assert.equal(executed.length,1);assert.equal(executed[0].outcome,'done');
    assert.deepEqual(executed[0].approval,{id:handle.id,by:[owner.id]});
    assert.deepEqual(executed[0].resource,{kind:'monitor',id:monitor.id});
   } else {
    assert.equal(granted.result?.isError,false);assert.equal(granted.decision.disposition,'autonomous');
    assert.equal(granted.result.structuredContent.members.find(row=>row.id===member.id)?.granted,true);
   }
   const allowed=await grants();
   assert.equal(allowed.members.find(row=>row.id===member.id)?.granted,true,'ordinary independently invited member grant is actionable');
   assert.deepEqual(allowed.members.filter(row=>row.id!==member.id),initial.members.filter(row=>row.id!==member.id));
   assert.deepEqual(await native('/api/access/self'),owner,'ordinary grant never changes sponsor authority');
   console.log(`PROBE BASE-AGENT-005 acceptance-4-allowed-${policy}-${version}: MCP native member grant -> missing proof refused, valid native proof ${policy==='held'?'and signed-in sponsor approval ':''}grant access`);

   // Authentication, proof issuance and policy renewal precede the snapshot.
   // The refused call itself must leave even those custody rows untouched.
   await completeSecondFactor(origin,cookie);
   await c.renewPolicy();
   const proofReference=await proof(selfArgs),token=await accessToken(c,{scope:'uptime:operate'});
   const args={...selfArgs,idempotency_key:randomUUID()};
   const before=await snapshot(),networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
   const started=Date.now();
   const refused=await c.tool(tool,args,{version,token,proofReference});
   const finished=Date.now(),after=await snapshot();
   assert.equal(refused.status,200);assert.equal(errorCode(refused),'self_escalation');
   assert.equal(refused.result.isError,true);assert.equal(refused.result.resultType,'complete');
   assert.deepEqual(JSON.parse(refused.result.content[0].text),{code:'self_escalation'});
   for(const field of ['structuredContent','requestState','inputRequests'])assert.equal(refused.result[field],undefined,'refusal returns no success or pending work');
   for(const field of ['com.runeditrun/receipt','com.runeditrun/approval','com.runeditrun/review'])assert.equal(refused.result._meta[field],undefined,'refusal returns no execution, approval or review handle');
   assert.deepEqual(refused.decision,{id:refused.decision.id,disposition:'self_escalation',revision:c.revision,classes:[]});
   assert.deepEqual(Object.keys(after),Object.keys(before),'no durable table is added or removed');
   const expected=structuredClone(before);

   // Enumerate the exact admitted identity delta, preserving every other cell
   // and every other agent. Permit the minute rollover without a clock race.
   const admitted=after.agent_door_agents.find(row=>row.id===c.agentId);
   const prior=before.agent_door_agents.find(row=>row.id===c.agentId);
   assert.ok(prior);assert.equal(prior.sponsor,owner.id);assert.equal(prior.revoked,0);
   assert.ok(admitted.window>=Math.floor(started/60000)&&admitted.window<=Math.floor(finished/60000));
   expected.agent_door_agents=ordered(before.agent_door_agents.map(row=>row.id===c.agentId?{
    ...row,name:'Agent door conformance',specialist:c.surface.specialist,sponsor_name:sponsor.display_name,
    window:admitted.window,requests:prior.window===admitted.window?prior.requests+1:1,
   }:row));

   // Exactly one append-only refusal audit is allowed, with no execution or
   // policy evidence. Existing audits, usage and idempotency rows stay exact.
   const added=after.agent_door_audit.filter(row=>!before.agent_door_audit.some(old=>old.id===row.id));
   assert.equal(added.length,1);const record=added[0],audit=JSON.parse(record.row);
   assert.equal(record.id,refused.decision.id);
   assert.ok(Date.parse(record.at)>=started&&Date.parse(record.at)<=finished);
   const sequence=before.sqlite_sequence.find(row=>row.name==='agent_door_audit');
   assert.ok(sequence);assert.equal(record.sequence,sequence.seq+1);
   assert.deepEqual(audit,{
    id:record.id,role:owner.role,operation_id:record.id,scopes:['uptime:operate'],client_id:'rer-agent-conformance',at:record.at,door:'mcp',
    agent:{id:c.agentId,name:'Agent door conformance',specialist:c.surface.specialist},
    sponsor:{id:owner.id,name:sponsor.display_name},label:'Agent door conformance for '+sponsor.display_name,
    consent:c.consent,tool,resource:{kind:'monitor',id:monitor.id},decision_id:null,
    classes:[],revision:c.revision,rules:[],decision:'self_escalation',outcome:'refused',code:'self_escalation',
    approval:null,review:null,idempotency_key:args.idempotency_key,trace:null,ignored_arguments:[],replay_of:null,
   });
   assert.deepEqual(record,{sequence:sequence.seq+1,id:record.id,at:record.at,agent:c.agentId,classes:'[]',row:record.row,evidence:null});
   expected.agent_door_audit=ordered([...before.agent_door_audit,record]);
   expected.sqlite_sequence=ordered(before.sqlite_sequence.map(row=>row.name==='agent_door_audit'?{...row,seq:row.seq+1}:row));
   includeRelayExpectation(expected,before,after,c.business);
   for(const table of Object.keys(expected))assert.deepEqual(after[table],expected[table],`${table}: self-escalation preserves every row except the enumerated admission and refusal-audit deltas`);
   assert.deepEqual(providerRequests,networkBefore,'self-escalation sends no provider traffic');
   assert.equal(allDeliveredMessages().length,mailBefore,'self-escalation sends no intercepted mail');
   assert.deepEqual(await native('/api/v1/monitors/'+monitor.id),original,'owner sees the original paused monitor and revision');
   assert.deepEqual(await grants(),allowed,'refusal preserves the independently allowed member grant');
   console.log(`PROBE BASE-AGENT-005 acceptance-4-self-${policy}-${version}: owner-sponsored MCP self-grant with fresh explicit key and native proof -> self_escalation, no success or pending work, zero provider traffic; all ${Object.keys(before).length} durable tables preserve exact rows except one admission count and one refusal audit with its sequence`);
  }
 }
 await c.adopt(autonomousPolicy());
 console.log('PASS BASE-AGENT-005 synchronous self-grant refusal and complete durable-state preservation under both policies and both MCP versions');
}
