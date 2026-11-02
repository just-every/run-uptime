import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {once} from 'node:events';
import {accessToken,autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// Exercise the emitted Worker's public HTTP transport, without replacing its
// parser, authentication, policy, native actions or D1. The retained journey
// supplies a real owner and signed business identity.
export async function proveOversizeNoEffect({c,native,db,origin,providerRequests}) {
 const monitor=await native('/api/monitors',{name:'synthetic-uptime-oversize-0',type:'http',network:'public',
  url:'https://oversize.example.test/health',method:'GET',assertions:{status:200},
  intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,
  confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:false});
 const tool='uptime.monitors.update';
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results;
  const state={};
  for(const {name} of tables)state[name]=(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return state;
 };
 const send=async({version,token,body,mode,max})=>{
  const headers={origin,accept:'application/json, text/event-stream','content-type':'application/json',
   authorization:'Bearer '+token,'mcp-protocol-version':version,'mcp-method':'tools/call','mcp-name':tool,connection:'close',
   ...(mode==='declared'?{'content-length':body.length}:{'transfer-encoding':'chunked'})};
  // A streamed request has no declared length. Write the in-bound prefix
  // separately from the final crossing byte through a real chunked socket.
  assert.equal(Object.hasOwn(headers,'content-length'),mode==='declared');
  let request;
  const response=new Promise((resolve,reject)=>{
   request=http.request(origin+'/mcp',{method:'POST',agent:false,headers},reply=>{
    let text='';reply.setEncoding('utf8');
    reply.on('data',chunk=>text+=chunk);reply.on('error',reject);
    reply.on('end',()=>{try{resolve({status:reply.statusCode,body:JSON.parse(text)})}catch(error){reject(error)}});
   });
   request.on('error',reject);
   request.setTimeout(30000,()=>request.destroy(Error('MCP body probe timed out')));
  });
  response.catch(()=>{});
  try{
   if(mode==='declared')request.end(body);
   else{
    const prefix=body.subarray(0,Math.min(max,body.length-1));
    if(!request.write(prefix))await once(request,'drain');
    request.end(body.subarray(prefix.length));
   }
   return await response;
  }finally{request.destroy()}
 };
 let revision=monitor.revision,index=0;
 for(const [policy,document] of [['autonomous',autonomousPolicy()],['held',heldPolicy()]]){
  // Adoption and discovery can legitimately write policy or admission state;
  // neither belongs inside an oversized-request refusal snapshot.
  await c.adopt(document);
  const discovered=await c.mcp('server/discover');
  const max=discovered.result._meta['com.runeditrun/limits'].maxBodyBytes;
  assert.ok(Number.isSafeInteger(max)&&max>0,'the installed door discovers a usable body bound');
  for(const version of ['2026-07-28','2025-11-25']){
   if(version==='2025-11-25'){
    const initialized=await c.mcp('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'synthetic-uptime',version:'1'}},{version});
    assert.equal(initialized.result.protocolVersion,version);
   }
   for(const mode of ['declared','streamed']){
    const token=await accessToken(c),name='synthetic-uptime-oversize-'+(++index);
    const args={id:monitor.id,version:revision,expected_revision:revision,definition:{name},idempotency_key:randomUUID()};
    const params={name:tool,arguments:args,...(version==='2026-07-28'?{_meta:{
     'io.modelcontextprotocol/protocolVersion':version,
     'io.modelcontextprotocol/clientCapabilities':{elicitation:{url:{}}},
     'io.modelcontextprotocol/clientInfo':{name:'synthetic-uptime',version:'1'},
    }}:{})};
    const envelope={jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params},json=JSON.stringify(envelope);
    assert.ok(Buffer.byteLength(json)<max,'the native edit itself fits the discovered limit');
    const bounded=Buffer.from(json+' '.repeat(max-Buffer.byteLength(json))),oversized=Buffer.concat([bounded,Buffer.from(' ')]);
    assert.deepEqual(JSON.parse(oversized.toString()),envelope,'only JSON whitespace crosses the bound');
    assert.equal(oversized.length,max+1);assert.equal(bounded.length,max);
    const before=await snapshot(),networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
    assert.ok(before.monitors.some(row=>row.id===monitor.id&&row.revision===revision),'the refused edit targets a populated native monitor at its current revision');
    assert.ok(before.oa_operators.some(row=>row.status==='active'&&row.role==='owner'),'the native owner remains active');
    for(const table of ['agent_door_audit','agent_door_approvals','agent_door_reviews','agent_door_usage','public_rate_limits'])assert.ok(Object.hasOwn(before,table),table+' is included in complete durable state');
    const refused=await send({version,token,body:oversized,mode,max});
    assert.equal(refused.status,413,`${policy} ${version} ${mode}: oversized native edit is refused`);
    assert.equal(refused.body.error.message,'Body too large');
    assert.equal(refused.body.result,undefined,'no success, pending action, approval or review is returned');
    const after=await snapshot();
    assert.deepEqual(Object.keys(after),Object.keys(before),'no durable table is added or removed');
    // Public admission is a separate boundary from agent execution. Compare
    // it explicitly rather than dropping counters from the no-effect proof.
    assert.deepEqual(after.public_rate_limits,before.public_rate_limits,'MCP refusal has zero public-admission counter delta');
    assert.deepEqual(after,before,'every product, credential, revision, scheduling, notification, agent audit, approval, review, usage and custody row remains exact');
    assert.deepEqual(providerRequests,networkBefore,'no provider traffic leaves the Worker');
    assert.equal(allDeliveredMessages().length,mailBefore,'no mail submission leaves the Worker');
    console.log(`PROBE BASE-AGENT-001 acceptance-6 ${policy} ${version} ${mode}: paused native name update at maxBodyBytes+1 -> 413, no result, zero provider traffic, ${Object.keys(before).length} durable tables exact, public-admission delta=0`);

    // Same authority, JSON envelope, operation key and mutation at the exact
    // bound: acceptance cannot be explained by an invalid or inert fixture.
    const accepted=await send({version,token,body:bounded,mode,max});
    assert.equal(accepted.status,200);
    assert.equal(accepted.body.result?.isError,false,'the bounded counterpart executes');
    assert.equal(accepted.body.result.structuredContent.revision,++revision);
    const decision=accepted.body.result._meta['com.runeditrun/decision'];
    assert.equal(decision.disposition,policy==='held'?'review':'autonomous');
    assert.deepEqual(decision.classes.map(({class:kind})=>kind),['standard']);
    if(policy==='held')assert.ok(accepted.body.result._meta['com.runeditrun/review'],'held standard work creates its real review only after the bounded mutation');
    const current=await native('/api/v1/monitors/'+monitor.id),revisions=await native('/api/monitors/'+monitor.id+'/revisions');
    assert.equal(current.name,name);assert.equal(current.revision,revision);assert.equal(current.enabled,false);
    assert.equal(revisions.length,index+1,'only bounded counterparts append native revisions');
    assert.deepEqual(revisions.find(row=>row.revision===monitor.revision).definition,monitor.definition,'the original paused definition is immutable');
    assert.deepEqual(providerRequests,networkBefore);assert.equal(allDeliveredMessages().length,mailBefore);
    console.log(`PROBE BASE-AGENT-001 acceptance-6 counterpart ${policy} ${version} ${mode}: identical envelope at maxBodyBytes -> one native revision, saved name, still paused, ${decision.disposition}`);
   }
  }
 }
 await c.adopt(autonomousPolicy());
 console.log('PASS BASE-AGENT-001 oversized native mutation has no effect under both policies, both protocol versions and declared or streamed body crossings');
}
