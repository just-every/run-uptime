import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {isDeepStrictEqual} from 'node:util';
import {availablePorts} from './notify-acceptance-runtime.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';
import {autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';

const tool='uptime.monitors.pause',receiptKey='com.runeditrun/receipt';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Extend the registered native journey without replacing its protocol, owner,
// Worker, D1 or action. Only the HTTP response delivery below is interrupted.
export async function proveLostResponseReplay({c,native,db,sponsorId,providerRequests}){
 const names=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results.map(row=>row.name);
 const snapshot=async()=>{
  const tables={};
  for(let offset=0;offset<names.length;offset+=32){
   const chunk=names.slice(offset,offset+32);
   const result=await db.batch(chunk.map(name=>db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`)));
   for(const [index,name] of chunk.entries())tables[name]=result[index].results;
  }
  return tables;
 };
 const unchanged=(before,after,except=[])=>{
  for(const name of names)if(!except.includes(name))assert.equal(hash(after[name]),hash(before[name]),name+' has no unexpected durable change');
 };
 const added=(before,after,table)=>{
  const old=new Set(before[table].map(hash)),fresh=after[table].filter(row=>!old.has(hash(row)));
  assert.equal(after[table].length,before[table].length+fresh.length,table+' retains every previous row');
  return fresh;
 };
 const bookkeeping=(before,after,answer,args,recorded)=>{
  unchanged(before,after,['agent_door_agents','agent_door_audit']);
  const [entry]=added(before,after,'agent_door_audit');
  assert.equal(after.agent_door_audit.length,before.agent_door_audit.length+1,'one replay audit, no extra execution');
  const row=JSON.parse(entry.row);
  assert.equal(row.id,answer.decision.id);assert.equal(row.outcome,'replayed');
  assert.equal(row.replay_of,recorded.call.decision_id);
  assert.equal(row.operation_id,recorded.execution.operation_id);
  assert.equal(row.tool,tool);assert.equal(row.idempotency_key,args.idempotency_key);
  assert.deepEqual(row.resource,{kind:'monitor',id:args.id});
  assert.equal(row.agent.id,c.agentId);assert.equal(row.sponsor.id,sponsorId);
  const prior=before.agent_door_agents.find(row=>row.id===c.agentId);
  const current=after.agent_door_agents.find(row=>row.id===c.agentId);
  assert.ok(prior&&current);
  assert.deepEqual({...current,window:prior.window,requests:prior.requests},prior,'admission changes only its rate counter');
  assert.equal(current.requests,current.window===prior.window?prior.requests+1:1,'one admitted retry, including a new minute window');
  assert.deepEqual(after.agent_door_agents.filter(row=>row.id!==c.agentId),before.agent_door_agents.filter(row=>row.id!==c.agentId));
 };
 const savedOutcome=async(args,held)=>{
  const call=await db.prepare('SELECT * FROM agent_door_calls WHERE agent=? AND key=?').bind(c.agentId,args.idempotency_key).first();
  assert.equal(call?.state,'done','the independent D1 read observes completion before delivery is cut');
  const outcome=JSON.parse(call.outcome);assert.equal(outcome.outcome,'done');
  const audit=await db.prepare('SELECT row FROM agent_door_audit WHERE id=?').bind(outcome.execution_id??call.decision_id).first();
  const execution=JSON.parse(audit.row);
  assert.equal(execution.outcome,'done');assert.equal(execution.tool,tool);
  assert.equal(execution.idempotency_key,args.idempotency_key);
  assert.equal(execution.sponsor.id,sponsorId);assert.equal(execution.agent.id,c.agentId);
  const monitor=await db.prepare('SELECT * FROM monitors WHERE id=?').bind(args.id).first();
  assert.equal(monitor.revision,args.version+1);assert.equal(JSON.parse(monitor.definition).enabled,false);
  if(held){
   assert.ok(outcome.receipt?.id,'the original approval execution receipt is durably recorded');
   assert.equal(outcome.receipt.decision_id,call.decision_id);
   assert.deepEqual(outcome.receipt.approved_by,[sponsorId]);
   const approval=await db.prepare('SELECT state,result FROM agent_door_approvals WHERE id=?').bind(outcome.receipt.approval_id).first();
   assert.equal(approval.state,'executed');assert.deepEqual(JSON.parse(approval.result),outcome);
  }else{
   assert.equal(execution.id,call.decision_id);
   assert.equal(outcome.receipt,undefined,'autonomous execution has an audit identity, without a person-approval receipt');
  }
  return {call,outcome,execution};
 };
 try{
  for(const [label,policy,held] of [['all-autonomous',autonomousPolicy(),false],['held',heldPolicy(),true]]){
   await c.adopt(policy);
   const monitor=await native('/api/monitors',{
    name:'synthetic-uptime-lost-response-'+label,type:'http',network:'public',
    url:'https://synthetic-uptime-103.example.test/health',method:'GET',assertions:{status:200},
    intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,
    confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:true,service:'synthetic-uptime-replay',group:'operations',
   });
   assert.equal(monitor.definition.enabled,true);
   const args={id:monitor.id,version:monitor.revision,expected_revision:monitor.revision,idempotency_key:randomUUID()};
   const before=await snapshot();
   const providerCount=providerRequests.length,mailCount=allDeliveredMessages().length;
   if(held){
    const pending=await c.tool(tool,args);
    assert.equal(pending.result?.resultType,'input_required');
    assert.equal(pending.result.structuredContent,undefined);assert.equal(pending.decision.disposition,'approval');
    const waiting=await snapshot();
    unchanged(before,waiting,['agent_door_agents','agent_door_audit','agent_door_calls','agent_door_approvals','agent_door_events']);
    assert.equal((await native('/api/v1/monitors/'+monitor.id)).enabled,true,'the ordinary owner read sees no pause before approval');
    const approval=await c.decideApproval(pending);
    assert.equal(approval.ok,true);assert.equal(approval.body.approval.state,'executed');
    assert.deepEqual(approval.body.approval.approvals.map(mark=>mark.person),[sponsorId]);
   }
   const originalFetch=c.fetch,[port]=await availablePorts(1);
   const edge={requests:[],failure:null,cut:null,headersSeen:false,cutCount:0,recorded:null,committed:null,wire:null};
   const proxy=createServer(async(request,response)=>{
    try{
     assert.equal(request.method,'POST');assert.equal(request.url,'/mcp');
     const chunks=[];for await(const chunk of request)chunks.push(chunk);
     const body=Buffer.concat(chunks),rpc=JSON.parse(body);
     assert.equal(rpc.method,['tools','call'].join('/'));assert.equal(rpc.params.name,tool);
     assert.deepEqual(rpc.params.arguments,args,'the transport forwards identical admitted arguments and the explicit key');
     edge.requests.push(rpc);
     const headers=new Headers(request.headers);headers.delete('host');headers.delete('connection');headers.delete('content-length');
     const upstream=await originalFetch(c.origin+'/mcp',{method:'POST',headers,body,signal:AbortSignal.timeout(15000)});
     const bytes=Buffer.from(await upstream.arrayBuffer()),wire=JSON.parse(bytes);
     assert.equal(upstream.status,200);assert.equal(wire.result?.isError,false);
     assert.equal(wire.id,rpc.id);assert.ok(wire.result.structuredContent);
     if(edge.cutCount===0){
      edge.recorded=await savedOutcome(args,held);
      assert.deepEqual(wire.result.structuredContent,edge.recorded.outcome.result,'the completed upstream response matches the independent durable outcome');
      edge.committed=await snapshot();edge.wire=wire;
      const prefix=bytes.subarray(0,24);assert.ok(bytes.length>prefix.length);
      response.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type'),'content-length':String(bytes.length)});
      response.write(prefix);
      // Wait until the real HTTP client has received the headers. It then
      // starts reading an advertised full body whose socket is cut short.
      edge.cut=()=>{edge.cutCount++;response.destroy()};
     }else{
      response.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')});response.end(bytes);
     }
    }catch(error){edge.failure=error;response.destroy()}
   });
   proxy.requestTimeout=15000;proxy.listen(port,'127.0.0.1');await once(proxy,'listening');
   c.fetch=async(url,init)=>{
    if(new URL(url).pathname!=='/mcp')return originalFetch(url,init);
    const response=await originalFetch('http://127.0.0.1:'+port+'/mcp',{...init,signal:AbortSignal.timeout(15000)});
    if(edge.cut){
     assert.equal(response.status,200);edge.headersSeen=true;
     const cut=edge.cut;edge.cut=null;setImmediate(cut);
    }
    return response;
   };
   try{
    await assert.rejects(()=>c.tool(tool,args),error=>error instanceof TypeError&&error.cause?.code==='UND_ERR_SOCKET',
     'the real client must observe a truncated HTTP response body, not a completed MCP result');
    assert.equal(edge.failure,null);assert.equal(edge.headersSeen,true);assert.equal(edge.cutCount,1);
    const lost=edge.committed,recorded=edge.recorded;
    assert.ok(lost&&recorded,'durable outcome was observed before disconnect');
    const replay=await c.tool(tool,args);
    assert.equal(replay.status,200);assert.equal(replay.result?.isError,false);
    assert.equal(edge.requests.length,2);assert.notEqual(edge.requests[0].id,edge.requests[1].id,'retry uses a new JSON-RPC request id');
    assert.deepEqual(edge.requests[1].params,edge.requests[0].params);
    assert.deepEqual(replay.result.structuredContent,recorded.outcome.result);
    assert.deepEqual(replay.result.structuredContent,edge.wire.result.structuredContent);
    const receipt=recorded.outcome.receipt?{...recorded.outcome.receipt,decision:recorded.outcome.decision}:undefined;
    assert.deepEqual(replay.result._meta[receiptKey],receipt,'retry returns the original durable execution receipt and decision');
    assert.deepEqual(replay.result._meta[receiptKey],edge.wire.result._meta[receiptKey]);
    assert.notEqual(replay.decision.id,edge.wire.result._meta['com.runeditrun/decision'].id,'retry has a fresh admission decision');
    const after=await snapshot();bookkeeping(lost,after,replay,args,recorded);
    unchanged(before,after,['monitors','revisions','uptime_agent_revisions','uptime_audit',
     'agent_door_agents','agent_door_audit','agent_door_calls','agent_door_approvals','agent_door_events','agent_door_usage','oa_sessions']);
    assert.deepEqual(after.monitors.filter(row=>row.id!==monitor.id),before.monitors.filter(row=>row.id!==monitor.id));
    const [paused]=after.monitors.filter(row=>row.id===monitor.id);
    assert.equal(paused.revision,monitor.revision+1);assert.equal(JSON.parse(paused.definition).enabled,false);
    const revisions=added(before,after,'revisions');assert.equal(revisions.length,1);
    assert.equal(revisions[0].monitor_id,monitor.id);assert.equal(revisions[0].revision,monitor.revision+1);
    const original=before.revisions.find(row=>row.monitor_id===monitor.id&&row.revision===monitor.revision);
    assert.ok(original);assert.equal(JSON.parse(original.definition).enabled,true);
    const originalDefinition=JSON.parse(original.definition),pausedDefinition=JSON.parse(revisions[0].definition);
    assert.equal(pausedDefinition.enabled,false);
    for(const field of ['name','type','network','url','method','assertions','intervalMs','timeoutMs','retries','probes','failureQuorum','confirmSlots','recoverSlots','freshnessMs','service','group']){
     assert.deepEqual(pausedDefinition[field],originalDefinition[field],'pause retains the saved '+field);
    }
    const custody=added(before,after,'uptime_agent_revisions');assert.equal(custody.length,1);
    assert.equal(custody[0].monitor_id,monitor.id);assert.equal(custody[0].revision,monitor.revision+1);
    const principal=JSON.parse(custody[0].principal);
    assert.equal(principal.operationId,recorded.call.decision_id);assert.equal(principal.idempotencyKey,args.idempotency_key);
    assert.deepEqual(principal.approvers.map(person=>person.id),held?[sponsorId]:[]);
    const mutations=added(before,after,'uptime_audit');assert.equal(mutations.length,1,'one native domain mutation receipt');
    assert.equal(mutations[0].action,'access_check_write');assert.equal(mutations[0].actor_ref,sponsorId);
    const executions=after.agent_door_audit.map(row=>JSON.parse(row.row)).filter(row=>row.idempotency_key===args.idempotency_key&&row.outcome==='done');
    assert.equal(executions.length,1,'one completed action across disconnect and retry');
    assert.equal(executions[0].id,recorded.execution.id);
    assert.ok(isDeepStrictEqual(await savedOutcome(args,held),recorded),'replay leaves the durable first outcome and execution audit exact');
    assert.equal(providerRequests.length,providerCount,'pause and retry make no provider request');
    assert.equal(allDeliveredMessages().length,mailCount,'pause and retry submit no mail');
    const visible=await native('/api/v1/monitors/'+monitor.id);
    assert.equal(visible.enabled,false);assert.equal(visible.revision,monitor.revision+1);
    console.log('PROBE BASE-AGENT-012 acceptance-2 '+label+': owner-created enabled monitor, signed MCP pause, committed D1 then truncated HTTP body -> incomplete client response; new JSON-RPC id with identical arguments and key returns original outcome and execution receipt; one pause, revision and domain mutation; retry changes only agent admission and replay audit; no observation, incident, notification or provider work'+(held?'; native person approval required with no preapproval mutation':''));
   }finally{
    c.fetch=originalFetch;proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));
   }
  }
 }finally{await c.adopt(autonomousPolicy())}
 console.log('PASS BASE-AGENT-012 lost-response replay under all-autonomous and held policies');
}
