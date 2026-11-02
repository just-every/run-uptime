import assert from 'node:assert/strict';
import {randomUUID,webcrypto} from 'node:crypto';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,sessionCookie} from './auth-test-support.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';
import {splitSql} from './migration-support.mjs';
import {accessToken,autonomousPolicy,heldPolicy,policyEnvelope,seconds,signJws} from '../src/base/modules/agent-door/conformance/crypto.mjs';

// One isolated native capacity journey. The existing envelope fixes only the
// Worker clock; authentication, policy, transport, persistence and tools are real.
// Each case starts with one active native sponsor and a fresh agent. Counters
// are populated exclusively by authenticated HTTP requests, never database writes.
const now=Date.parse('2026-10-27T12:34:17.250Z');
const directory=await runtimeDirectory();
let worker;
try{
 for(const [policyName,policy] of [['autonomous',autonomousPolicy],['held',heldPolicy]]){
  for(const version of ['2026-07-28','2025-11-25']){
   const persist=join(directory,policyName+'-'+version);await mkdir(persist);
   const origin='http://127.0.0.1:15504',providerRequests=[];
   const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
   const key=await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid='synthetic-uptime-118';
   const issuer='https://business.example.test',installationId=randomUUID(),sub=randomUUID(),business=randomUUID();
   const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,RER_OWNER_CLAIM_ISSUER:issuer,
    RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:origin,
    RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:key}),
    RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:origin,subject:installationId,keys:{[kid]:key}})};
   worker=await hostedRuntime(persist,bindings,async request=>{
    providerRequests.push({method:request.method,origin:new URL(request.url).origin});
    throw Error('Unexpected provider request');
   },{now});
   const db=await worker.getD1Database('DB');
   for(const file of(await readdir('migrations')).filter(file=>file.endsWith('.sql')).sort())
    for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();

   // Send direct HTTP to the unchanged emitted-Worker envelope. This deliberately
   // does not use the conformance client's automatic capacity retry.
   const request=(path,{method='GET',headers={},body}={})=>fetch('http://127.0.0.1:15504/',{
    method:'POST',redirect:'manual',headers:{'content-type':'application/json'},
    body:JSON.stringify({url:origin+path,method,
     headers:{host:new URL(origin).host,origin,'content-type':'application/json',...headers},
     ...(body===undefined?{}:{body})})});
   const json=async response=>{assert.ok(response.ok,'native door HTTP '+response.status);return response.json()};
   const post=(path,body)=>request(path,{method:'POST',body:JSON.stringify(body)});
   const iat=seconds(now),signer={privateKey:pair.privateKey,kid,issuer,installationId};
   const claim=await signJws(pair.privateKey,kid,'rer-owner-claim+jwt',{
    v:1,iss:issuer,aud:origin,installationId,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat,exp:iat+300});
   const claimed=await post('/auth/owner-claim',{token:claim,displayName:'Synthetic Uptime owner',returnTo:'/app'});
   assert.equal(claimed.status,303,await claimed.clone().text());
   const cookie=sessionCookie(claimed);
   const settings=await signJws(pair.privateKey,kid,'rer-business-settings+jwt',{
    v:1,iss:issuer,aud:origin,sub:installationId,business,email:bindings.OWNER_EMAIL,owner_id:sub,
    jti:randomUUID(),iat,exp:iat+300,rev:1,values:{},logo:null,team:null});
   assert.equal((await post('/api/rer/business-settings',{settings})).status,200);
   const context={origin,signer,person:{email:bindings.OWNER_EMAIL,sub},business,consent:randomUUID(),
    agentId:randomUUID(),now:()=>now,seq:0,revision:0,
    surface:{specialist:'monitoring-operator',tools:[{scope:'uptime:operate'},{scope:'uptime:read'}]}};
   const signed=await policyEnvelope(context,policy());
   assert.equal((await post('/api/rer/agent-policy',{policy:signed.policy})).status,200);
   const native=(path,body)=>request(path,{method:body===undefined?'GET':'POST',headers:{cookie},
    ...(body===undefined?{}:{body:JSON.stringify(body)})}).then(json);
   const monitor=await native('/api/monitors',{
    name:'synthetic-uptime-118',type:'http',network:'public',url:'https://example.com/health',
    method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:5000,retries:0,
    probes:['local-a'],failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:false});
   const sponsors=(await db.prepare("SELECT * FROM oa_operators WHERE status='active'").all()).results;
   assert.equal(sponsors.length,1,'one active native sponsor in isolated persistence');
   assert.equal(sponsors[0].email,bindings.OWNER_EMAIL);
   assert.deepEqual((await db.prepare('SELECT * FROM agent_door_agents').all()).results,[]);

   const token=await accessToken(context);let requestId=0;
   const rpcBody=(method,params)=>JSON.stringify({jsonrpc:'2.0',id:++requestId,method,
    params:version==='2025-11-25'?params:{...params,_meta:{
     'io.modelcontextprotocol/protocolVersion':version,
     'io.modelcontextprotocol/clientCapabilities':{elicitation:{url:{}}},
     'io.modelcontextprotocol/clientInfo':{name:'synthetic-uptime-118',version:'1'}}}});
   const mcp=async(method,params={},body=rpcBody(method,params))=>{
    const response=await request('/mcp',{method:'POST',headers:{authorization:'Bearer '+token,
     accept:'application/json, text/event-stream','mcp-protocol-version':version,'mcp-method':method,
     ...(params.name?{'mcp-name':params.name}:{})},body});
    return {response,message:await response.json()};
   };
   const discovered=await mcp('server/discover');assert.equal(discovered.response.status,200);
   assert.ok(discovered.message.result.supportedVersions.includes(version));
   const ceiling=discovered.message.result._meta['com.runeditrun/limits'].requestsPerMinute;
   assert.ok(Number.isSafeInteger(ceiling)&&ceiling>0,'use the actual advertised capacity unchanged');

   const allowedArgs={id:monitor.id,version:monitor.revision,expected_revision:monitor.revision,
    definition:{name:'synthetic-uptime-119'},idempotency_key:randomUUID()};
   const allowed=await mcp('tools/call',{name:'uptime.monitors.update',arguments:allowedArgs});
   assert.equal(allowed.response.status,200);
   assert.equal(allowed.message.result.isError,false,'authorized paused name write completes before the ceiling');
   assert.equal(allowed.message.result.resultType,'complete');
   assert.equal(allowed.message.result.structuredContent.revision,monitor.revision+1);
   const current=await native('/api/v1/monitors/'+monitor.id);
   assert.equal(current.name,allowedArgs.definition.name);assert.equal(current.revision,monitor.revision+1);
   assert.equal(current.enabled,false);
   const revisions=await native('/api/monitors/'+monitor.id+'/revisions');
   assert.equal(revisions.length,2);
   assert.deepEqual(revisions.find(row=>row.revision===monitor.revision).definition,monitor.definition);
   assert.deepEqual(revisions.find(row=>row.revision===current.revision).definition,
    {...monitor.definition,name:allowedArgs.definition.name},'the successful counterpart changes only the name');
   const counter=()=>db.prepare('SELECT * FROM agent_door_agents WHERE id=?').bind(context.agentId).first();
   assert.equal((await counter()).requests,1,'only the successful authenticated call has consumed capacity');
   for(let admitted=1;admitted<ceiling;admitted++){
    const listed=await mcp('tools/list');
    assert.equal(listed.response.status,200,'every request up to the discovered ceiling is admitted');
    assert.ok(listed.message.result.tools.some(tool=>tool.name==='uptime.monitors.update'),
     'genuine authenticated discovery retains the native name-write door');
   }

   const snapshot=async()=>{
    const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') AND name NOT GLOB '_cf*' ORDER BY name").all()).results;
    const state={};
    for(const {name} of tables)state[name]=(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results
     .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return state;
   };
   const before=await snapshot(),networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
   assert.deepEqual(networkBefore,[],'the paused successful counterpart needs no provider traffic');
   assert.equal(before.agent_door_agents.length,1);
   assert.equal(before.agent_door_agents[0].id,context.agentId);
   assert.equal(before.agent_door_agents[0].sponsor,sponsors[0].id);
   assert.equal(before.agent_door_agents[0].revoked,0);
   assert.equal(before.agent_door_agents[0].requests,ceiling);
   assert.equal(before.agent_door_agents[0].window,Math.floor(now/60000));
   assert.ok(before.agent_door_audit.some(row=>row.agent===context.agentId),'the successful counterpart populated audit');
   assert.ok(before.agent_door_usage.some(row=>row.agent===context.agentId),'the successful counterpart populated usage');
   assert.ok(before.agent_door_calls.some(row=>row.key===allowedArgs.idempotency_key),'the successful counterpart populated idempotency custody');
   const refusedArgs={id:monitor.id,version:current.revision,expected_revision:current.revision,
    definition:{name:'synthetic-uptime-120'},idempotency_key:randomUUID()};
   const params={name:'uptime.monitors.update',arguments:refusedArgs},body=rpcBody('tools/call',params);
   const expectedRetry=Math.ceil((60000-now%60000)/1000);
   for(let attempt=0;attempt<2;attempt++){
    const refused=await mcp('tools/call',params,body);
    assert.equal(refused.response.status,429,'otherwise-valid current-revision write is refused at capacity');
    assert.equal(refused.message.error.data.code,'rate_limited','native per-agent capacity refusal');
    const retry=refused.response.headers.get('retry-after');
    assert.match(retry,/^[1-9][0-9]*$/,'Retry-After is positive integral seconds');
    assert.equal(Number(retry),expectedRetry,'Retry-After matches the remaining fixed minute');
    assert.deepEqual(Object.keys(refused.message).sort(),['error','id','jsonrpc']);
    assert.deepEqual(refused.message.error.data,{code:'rate_limited'},'no success, decision, pending approval or review handle');
    assert.deepEqual(await snapshot(),before,
     'refusal preserves every durable product, revision, scheduling, notification, credential, audit, approval, review, usage, idempotency and custody row, including counters');
    assert.deepEqual(providerRequests,networkBefore,'no provider traffic from the refused write');
    assert.equal(allDeliveredMessages().length,mailBefore,'no mail from the refused write');
   }
   const unchanged=await native('/api/v1/monitors/'+monitor.id);
   assert.deepEqual(unchanged,current,'the public monitor still has the successful name, revision and paused state');
   assert.deepEqual(await native('/api/monitors/'+monitor.id+'/revisions'),revisions);
   assert.equal((await counter()).requests,ceiling,'the repeated refusal never grows the admitted counter');
   console.log(`PROBE BASE-AGENT-011 acceptance-1 ${policyName} ${version}: authenticated paused rename -> one revision; ${ceiling-1} authenticated tools list requests -> ceiling ${ceiling}; current-revision fresh-key rename and identical retry -> HTTP 429 rate_limited, Retry-After ${expectedRetry}, ${Object.keys(before).length} durable tables unchanged, no provider traffic`);
   await worker.dispose();worker=null;
  }
 }
}finally{await worker?.dispose();await cleanupDirectory(directory)}
