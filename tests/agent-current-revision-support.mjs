import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {accessToken,autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// Continue the registered emitted-Worker journey with independent owner-created
// paused records. The owner read, rather than a tool result or a classifier,
// establishes the revision the stale caller must be told to use.
export async function proveCurrentRevision({c,native,db,sponsorId,providerRequests}) {
 const tool='uptime.monitors.update',owner=await native('/api/access/self');
 assert.equal(owner.id,sponsorId);assert.equal(owner.role,'owner');
 const sponsor=await db.prepare('SELECT * FROM oa_operators WHERE id=?').bind(sponsorId).first();
 assert.equal(sponsor.status,'active');
 const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const snapshot=async()=>{
  // Include all product, authentication and custody tables and their sequence
  // ledger. Only D1 and SQLite implementation metadata are outside this proof.
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') AND name NOT GLOB '_cf_*' ORDER BY name").all()).results.map(row=>row.name);
  const rows=await db.batch(tables.map(name=>db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`)));
  return Object.fromEntries(tables.map((name,index)=>[name,ordered(rows[index].results)]));
 };
 for(const [policyName,policy] of [['autonomous',autonomousPolicy()],['held',heldPolicy()]]) {
  await c.adopt(policy);
  for(const version of ['2026-07-28','2025-11-25']) {
   const record=await native('/api/monitors',{
    name:'synthetic-uptime-revision-original',type:'http',network:'public',
    url:'https://revision.example.test/health',method:'GET',assertions:{status:200},
    intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,
    confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:false,
   });
   const original=await native('/api/v1/monitors/'+record.id);
   assert.equal(original.enabled,false);assert.equal(original.revision,record.revision);
   const ownerName='synthetic-uptime-revision-owner';
   await native('/api/monitors/'+record.id,{...record.definition,name:ownerName},'PATCH');
   const current=await native('/api/v1/monitors/'+record.id);
   assert.equal(current.revision,original.revision+1);assert.equal(current.name,ownerName);
   assert.equal(current.enabled,false);
   const history=await native('/api/monitors/'+record.id+'/revisions');
   assert.equal(history.length,2);
   assert.deepEqual(history.find(row=>row.revision===original.revision).definition,record.definition);
   assert.deepEqual(history.find(row=>row.revision===current.revision).definition,{...record.definition,name:ownerName});

   // The native version is current and every argument is otherwise valid.
   // Only expected_revision is stale, and this explicit key has no custody yet.
   const args={id:record.id,version:current.revision,definition:{name:'synthetic-uptime-revision-agent'},
    expected_revision:original.revision,idempotency_key:randomUUID()};
   await c.renewPolicy();const token=await accessToken(c,{scope:'uptime:operate'});
   const before=await snapshot(),networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
   assert.equal(before.agent_door_calls.some(row=>row.agent===c.agentId&&row.key===args.idempotency_key),false);
   const started=Date.now(),refused=await c.tool(tool,args,{version,token}),finished=Date.now(),after=await snapshot();
   const conflict={code:'revision_conflict',current_revision:current.revision};
   assert.equal(refused.status,200);assert.equal(errorCode(refused),'revision_conflict');
   assert.equal(refused.message.error,undefined,'native conflict is a tool refusal');
   assert.equal(refused.result.resultType,'complete');assert.equal(refused.result.isError,true);
   assert.deepEqual(refused.result._meta['com.runeditrun/error'],conflict,'metadata names the independently read native revision');
   assert.deepEqual(refused.result.content,[{type:'text',text:JSON.stringify(conflict)}],'agent-readable error agrees with structured metadata');
   assert.equal(refused.result._meta['com.runeditrun/decision'],null,'stale revision precedes a policy execution decision');
   for(const field of ['structuredContent','requestState','inputRequests'])assert.equal(refused.result[field],undefined,'no success or pending execution');
   for(const field of ['com.runeditrun/receipt','com.runeditrun/approval','com.runeditrun/review'])assert.equal(refused.result._meta[field],undefined,'no execution, approval or review receipt');

   const expected=structuredClone(before),prior=before.agent_door_agents.find(row=>row.id===c.agentId),admitted=after.agent_door_agents.find(row=>row.id===c.agentId);
   assert.ok(prior);assert.equal(prior.sponsor,sponsorId);assert.equal(prior.revoked,0);
   // Accept either observed minute if admission crosses its boundary.
   assert.ok(admitted.window>=Math.floor(started/60000)&&admitted.window<=Math.floor(finished/60000));
   expected.agent_door_agents=ordered(before.agent_door_agents.map(row=>row.id===c.agentId?{
    ...row,name:'Agent door conformance',specialist:c.surface.specialist,sponsor_name:sponsor.display_name,
    window:admitted.window,requests:prior.window===admitted.window?prior.requests+1:1,
   }:row));
   const added=after.agent_door_audit.filter(row=>!before.agent_door_audit.some(old=>old.id===row.id));
   assert.equal(added.length,1);const audit=added[0],auditSequence=before.sqlite_sequence.find(row=>row.name==='agent_door_audit').seq;
   assert.ok(Date.parse(audit.at)>=started&&Date.parse(audit.at)<=finished);
   assert.deepEqual(JSON.parse(audit.row),{
    id:audit.id,role:owner.role,operation_id:audit.id,scopes:['uptime:operate'],client_id:'rer-agent-conformance',at:audit.at,door:'mcp',
    agent:{id:c.agentId,name:'Agent door conformance',specialist:c.surface.specialist},
    sponsor:{id:sponsorId,name:sponsor.display_name},label:'Agent door conformance for '+sponsor.display_name,
    consent:c.consent,tool,resource:{kind:'monitor',id:record.id},decision_id:null,
    classes:[],revision:c.revision,rules:[],decision:'none',outcome:'refused',code:'revision_conflict',
    approval:null,review:null,idempotency_key:args.idempotency_key,trace:null,ignored_arguments:[],replay_of:null,
   });
   assert.deepEqual(audit,{sequence:auditSequence+1,id:audit.id,at:audit.at,agent:c.agentId,classes:'[]',row:audit.row,evidence:null});
   expected.agent_door_audit=ordered([...before.agent_door_audit,audit]);
   const relaySequence=before.sqlite_sequence.find(row=>row.name==='agent_door_relay').seq;
   expected.agent_door_relay=ordered([...before.agent_door_relay,{sequence:relaySequence+1,decision_id:audit.id,business:c.business}]);
   expected.sqlite_sequence=ordered(before.sqlite_sequence.map(row=>['agent_door_audit','agent_door_relay'].includes(row.name)?{...row,seq:row.seq+1}:row));
   assert.deepEqual(Object.keys(after),Object.keys(expected),'no durable table appears or disappears');
   for(const table of Object.keys(expected))assert.deepEqual(after[table],expected[table],table+': only the enumerated admission and refusal audit with its relay and sequence counters may change');
   assert.deepEqual(providerRequests,networkBefore,'stale edit sends no target or provider request');
   assert.equal(allDeliveredMessages().length,mailBefore,'stale edit sends no intercepted mail');
   assert.deepEqual(await native('/api/v1/monitors/'+record.id),current,'owner sees the unchanged monitor');
   assert.deepEqual(await native('/api/monitors/'+record.id+'/revisions'),history,'immutable definitions remain exact');
   console.log(`PROBE BASE-AGENT-012 acceptance-4-stale-${policyName}-${version}: owner name edit and independent revision read; MCP current version with stale expected_revision and fresh explicit key -> revision_conflict current_revision=${current.revision} in metadata and error text, no receipts or traffic; all ${Object.keys(before).length} durable tables retain exact rows except one admission and one refusal audit with relay and sequences`);

   // The matching-revision counterpart proves this same name edit is actionable
   // with the ordinary autonomous or standard-review decision, never approval.
   const allowed=await c.tool(tool,{...args,expected_revision:current.revision,idempotency_key:randomUUID()},{version,token});
   assert.equal(allowed.status,200);assert.equal(allowed.result.resultType,'complete');assert.equal(allowed.result.isError,false);
   const disposition=policyName==='held'?'review':'autonomous';
   assert.equal(allowed.decision.disposition,disposition);assert.equal(allowed.decision.revision,c.revision);
   assert.deepEqual(allowed.decision.classes,[{class:'standard',facts:{measure:1},rule:policyName==='held'?'standard':'all',do:disposition}]);
   assert.equal(allowed.result._meta['com.runeditrun/approval'],undefined);
   assert.equal(allowed.result.requestState,undefined);assert.equal(allowed.result.inputRequests,undefined);
   const execution=await db.prepare('SELECT row FROM agent_door_audit WHERE id=?').bind(allowed.decision.id).first();
   assert.equal(JSON.parse(execution.row).outcome,'done');
   if(policyName==='held') {
    const handle=allowed.result._meta['com.runeditrun/review'];assert.ok(handle.id);
    const reviews=await c.personJson('/agents/api/reviews'),review=reviews.reviews.find(row=>row.id===handle.id);
    assert.equal(review.state,'open');assert.equal(review.tool,tool);assert.equal(review.decision_id,allowed.decision.id);
    assert.deepEqual(review.summary.nativeTarget,{kind:'monitor',id:record.id});
   } else assert.equal(allowed.result._meta['com.runeditrun/review'],undefined);
   const saved=await native('/api/v1/monitors/'+record.id),revisions=await native('/api/monitors/'+record.id+'/revisions');
   assert.equal(saved.id,record.id);assert.equal(saved.enabled,false);assert.equal(saved.name,args.definition.name);
   assert.equal(saved.revision,current.revision+1);assert.equal(revisions.length,history.length+1,'one accepted edit adds one immutable revision');
   assert.deepEqual(revisions.filter(row=>row.revision<=current.revision),history,'all prior revisions survive exactly');
   assert.deepEqual(revisions.find(row=>row.revision===saved.revision).definition,{...record.definition,...args.definition});
   assert.equal(allowed.result.structuredContent.revision,saved.revision);assert.equal(allowed.result.structuredContent.name,saved.name);
   assert.deepEqual(providerRequests,networkBefore,'paused allowed edit sends no target or provider request');
   assert.equal(allDeliveredMessages().length,mailBefore);
   console.log(`PROBE BASE-AGENT-012 acceptance-4-current-${policyName}-${version}: matching native expected revision -> ${disposition}, exactly one paused name edit and one immutable revision, no approval wait or traffic`);
  }
 }
 await c.adopt(autonomousPolicy());
 console.log('PASS BASE-AGENT-012 independently observed current revision in stale expected-revision refusals under both policies and both MCP versions');
}
