import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';

// Mounted before the retained unset-policy read: no MCP discovery or policy
// adoption precedes this otherwise-valid native monitor update.
export async function provePolicyEntry({c,worker,origin,cookie,providerRequests}){
 const db=await worker.getD1Database('DB');
 const native=async(path,body)=>{
  const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal(response.status,body===undefined?200:201,'authenticated owner door');return response.json();
 };
 const monitor=await native('/api/monitors',{name:'synthetic-uptime-policy-entry',type:'http',network:'public',url:'https://example.com/health',method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:false});
 const original=await native('/api/v1/monitors/'+monitor.id);
 assert.equal(original.enabled,false);
 const args={id:monitor.id,version:monitor.revision,expected_revision:monitor.revision,definition:{name:'synthetic-uptime-policy-entry-renamed'},idempotency_key:randomUUID()};
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;
  return Object.fromEntries(await Promise.all(tables.map(async({name})=>[name,(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}" ORDER BY rowid`).all()).results])));
 };
 const before=await snapshot(),networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
 assert.equal(c.calls.length,0,'the monitor rename is the first MCP invocation');
 assert.equal(c.adoptedPolicy,undefined,'the client has adopted no policy');
 assert.ok(before.agent_door_state.every(row=>row.envelope===null&&row.local_document===null&&row.local_revision===0),'no policy answer has been stored');
 assert.deepEqual(before.agent_door_agents,[]);
 assert.deepEqual(before.agent_door_audit,[]);
 const refused=await c.tool('uptime.monitors.update',args);
 assert.equal(c.calls.length,1);
 assert.equal(refused.status,200,'MCP returns a policy refusal');
 assert.equal(errorCode(refused),'policy_unset');
 assert.equal(refused.result.isError,true);
 assert.equal(refused.result.resultType,'complete','no pending execution is returned');
 const error=refused.result._meta['com.runeditrun/error'],setupUrl=origin+'/agents';
 assert.equal(error.setup_url,setupUrl,'the exact installation setup URL is returned before any company policy is adopted');
 assert.deepEqual(JSON.parse(refused.result.content[0].text),error,'agent-readable content carries the same refusal and setup link');
 for(const field of ['structuredContent','requestState','inputRequests'])assert.equal(refused.result[field],undefined,'no success or pending result');
 for(const field of ['com.runeditrun/receipt','com.runeditrun/approval','com.runeditrun/review'])assert.equal(refused.result._meta[field],undefined,'no execution or review handle');
 assert.equal(refused.decision.disposition,'unset');
 assert.equal(refused.decision.revision,null);
 assert.ok(refused.decision.classes.some(row=>row.class==='live'),'the valid target was classified');
 assert.ok(refused.decision.classes.every(row=>row.rule===null&&row.do==='unset'));
 const after=await snapshot();
 assert.deepEqual(Object.keys(after),Object.keys(before),'no durable table is created or removed');
 // Only the admitted identity and its refusal audit may differ. This includes
 // policy state, credentials, product audit, revisions, scheduling, outbox,
 // notification custody, approvals, idempotency calls and usage in the comparison.
 for(const table of Object.keys(before))if(!['agent_door_agents','agent_door_audit'].includes(table))assert.deepEqual(after[table],before[table],`${table}: unset policy changes no durable rows`);
 assert.equal(after.agent_door_agents.length,1);
 const admitted=after.agent_door_agents[0],sponsor=before.oa_operators.find(row=>row.email===c.person.email);
 assert.ok(sponsor,'the admitted sponsor is the real native owner');
 assert.equal(admitted.id,c.agentId);assert.equal(admitted.sponsor,sponsor.id);assert.equal(admitted.revoked,0);assert.equal(admitted.requests,1);
 assert.equal(after.agent_door_audit.length,1);
 const audit=JSON.parse(after.agent_door_audit[0].row);
 assert.equal(audit.agent.id,c.agentId);assert.equal(audit.sponsor.id,sponsor.id);
 assert.equal(audit.door,'mcp');assert.equal(audit.tool,'uptime.monitors.update');assert.equal(audit.idempotency_key,args.idempotency_key);
 assert.deepEqual(audit.resource,{kind:'monitor',id:monitor.id});
 assert.equal(audit.decision,'unset');assert.equal(audit.outcome,'refused');assert.equal(audit.code,'policy_unset');
 assert.equal(audit.approval,null);assert.equal(audit.review,null);
 assert.deepEqual(providerRequests,networkBefore,'no provider request leaves the Worker');
 assert.equal(allDeliveredMessages().length,mailBefore,'no intercepted mail leaves the Worker');
 assert.deepEqual(await native('/api/v1/monitors/'+monitor.id),original,'the owner still sees the original name, revision and paused state');
 console.log(`PROBE SURFACE-005 acceptance-5-first-call: first MCP monitor rename before policy -> policy_unset, canonical installation setup_url, no success or pending execution, no provider traffic; ${Object.keys(before).length-2} durable tables unchanged, only agent identity admission and refusal audit added`);
 return {async proveAllowed(){
  const accepted=await c.tool('uptime.monitors.update',args);
  assert.equal(accepted.result?.isError,false,'the identical rename succeeds after explicit autonomous policy adoption');
  assert.equal(accepted.result.structuredContent.revision,monitor.revision+1);
  const current=await native('/api/v1/monitors/'+monitor.id);
  assert.equal(current.name,args.definition.name);assert.equal(current.revision,monitor.revision+1);assert.equal(current.enabled,false);
  assert.deepEqual(providerRequests,networkBefore);assert.equal(allDeliveredMessages().length,mailBefore);
  console.log('PASS SURFACE-005 first-call refusal and unchanged native state; the identical authorized rename completes once policy is adopted');
 }};
}
