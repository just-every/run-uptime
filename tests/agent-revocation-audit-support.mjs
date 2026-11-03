import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {accessToken,autonomousPolicy,heldPolicy,seconds} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit-rows.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// The owner and both policies come from the registered native journey. Each
// revocation uses a separate signed agent, never the continuing journey agent.
export async function proveAgentRevocationAudit({c,db,native,monitorId,sponsorId,providerRequests}) {
 const owner=await native('/api/access/self'),session=await native('/auth/session');
 const ownerName=session.operator.displayName;
 assert.ok(ownerName);assert.equal(session.operator.id,owner.id);
 assert.equal(owner.id,sponsorId);assert.equal(owner.role,'owner');
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;
  return Object.fromEntries(await Promise.all(tables.map(async({name})=>[name,(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}" ORDER BY rowid`).all()).results])));
 };
 for(const [policy,document,decision] of [
  ['autonomous',autonomousPolicy(),'autonomous'],
  ['held',heldPolicy(),'review'],
 ]) {
  await c.adopt(document);
  const agent={id:randomUUID(),name:'synthetic-uptime-revocation-'+policy,specialist:c.surface.specialist};
  assert.notEqual(agent.id,c.agentId);
  const client='synthetic-uptime-revocation-'+policy,consent=randomUUID();
  const expires=seconds()+300;
  const token=await accessToken(c,{act:{sub:agent.id,name:agent.name,specialist:agent.specialist},client_id:client,consent,exp:expires});
  const listed=await c.mcp('tools/list',{}, {token});
  assert.equal(listed.status,200);
  assert.ok(listed.result.tools.some(tool=>tool.name==='uptime.monitors.read'),'the live independent bearer discovers its authorized read');
  const read=await c.mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:monitorId}},{token});
  assert.equal(read.status,200);assert.equal(read.result?.isError,false);
  assert.equal(read.result.structuredContent.id,monitorId,'the agent reads the real private monitor');
  assert.equal(read.decision.disposition,decision,'the held policy reads with its standard review rule');
  const historical=await auditRows(c,{agents:[agent.id]});
  assert.equal(historical.differs,0);assert.equal(historical.rows.length,1);
  const row=historical.rows[0];
  assert.equal(row.id,read.decision.id);assert.deepEqual(row.agent,agent);
  assert.deepEqual(row.sponsor,{id:owner.id,name:ownerName});
  assert.equal(row.label,agent.name+' for '+ownerName);
  assert.equal(row.client_id,client);assert.equal(row.consent,consent);
  assert.equal(row.tool,'uptime.monitors.read');assert.deepEqual(row.resource,{kind:'monitor',id:monitorId});
  assert.equal(row.decision,decision);assert.equal(row.outcome,'done');
  assert.equal(row.revision,c.revision);assert.ok(row.classes.length>0);assert.ok(row.rules.length>0);
  if(policy==='held')assert.ok(row.review?.id,'the successful held read retains its review identity');
  const inventory=(await native('/agents/api/agents')).agents;
  const identity=inventory.find(item=>item.id===agent.id);
  assert.deepEqual(identity,{...agent,sponsor:row.sponsor,revoked:false});
  const before=await snapshot(),networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
  const revoked=await native('/agents/api/agents/'+encodeURIComponent(agent.id)+'/revoke',{});
  assert.deepEqual(revoked,{revoked:true},'the real native owner synchronously revokes this agent');
  const retained=await auditRows(c,{agents:[agent.id]});
  assert.deepEqual(retained,historical,'all original row identities and every owner-readable audit field survive unchanged');
  const afterInventory=(await native('/agents/api/agents')).agents;
  assert.deepEqual(afterInventory,inventory.map(item=>item.id===agent.id?{...item,revoked:true}:item),
   'the original name, specialist and sponsor remain readable; other agent identities are unchanged');
  assert.ok(expires>seconds(),'the same signed bearer has not expired');
  const denied=await c.mcp('tools/list',{}, {token});
  assert.equal(denied.status,401,'native revocation immediately refuses the still-unexpired bearer');
  assert.equal(denied.result,undefined,'revoked discovery discloses no tools or private result');
  assert.deepEqual(await auditRows(c,{agents:[agent.id]}),historical,'refused discovery does not replace the historical audit');
  const after=await snapshot();
  assert.deepEqual(Object.keys(after),Object.keys(before));
  assert.ok(before.agent_door_agents.some(item=>item.id===agent.id&&item.revoked===0));
  for(const table of Object.keys(before))assert.deepEqual(after[table],table==='agent_door_agents'
   ?before[table].map(item=>item.id===agent.id?{...item,revoked:1}:item):before[table],
   `${policy}: revocation changes only the intended native agent flag, with no product, audit, notification or admission side effects`);
  assert.deepEqual(providerRequests,networkBefore,'revocation sends no provider requests');
  assert.equal(allDeliveredMessages().length,mailBefore,'revocation sends no mail');
  console.log(`PROBE BASE-AGENT-009 acceptance-6-${policy}: private MCP monitor read then native owner revoke -> complete historical audit and identity unchanged, inventory revoked, same unexpired bearer tools list 401; ${Object.keys(before).length} durable tables compared, only intended revoked flag changed, no provider or mail effects`);
 }
 await c.adopt(autonomousPolicy());
}
