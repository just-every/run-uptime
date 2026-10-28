import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {admissionRuntime} from './admission-runtime.mjs';
import {freePort} from '../scripts/local-ports.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {accessToken,signJws,policyEnvelope,autonomousPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
const origin=`http://localhost:${await freePort()}`,issuer='https://business.example.test',installationId=randomUUID(),sub=randomUUID(),kid=randomUUID(),pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const keys={[kid]:await webcrypto.subtle.exportKey('jwk',pair.publicKey)};
const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:origin,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify(keys),RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:origin,subject:installationId,email:testAuthBindings.OWNER_EMAIL,keys})};
const app=await admissionRuntime(bindings),ctx={origin,signer:{privateKey:pair.privateKey,kid,issuer,installationId},person:{email:bindings.OWNER_EMAIL,sub},surface:{specialist:'monitoring operator',tools:[{scope:'uptime:read'},{scope:'uptime:operate'}]},agentId:randomUUID(),business:'agent-test-business',consent:randomUUID(),seq:0,revision:0};
const post=(path,body,headers={})=>fetch(origin+path,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
let cookie,token;
async function mcp(method,params={},credential=token,version='2026-07-28'){
 const r=await post('/mcp',{jsonrpc:'2.0',id:randomUUID(),method,params:version==='2025-11-25'?params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':version,'io.modelcontextprotocol/clientCapabilities':{elicitation:{url:{}}},'io.modelcontextprotocol/clientInfo':{name:'Uptime test',version:'1'}}}},{authorization:`Bearer ${credential}`,accept:'application/json, text/event-stream','mcp-protocol-version':version,'mcp-method':method,...(params.name?{'mcp-name':params.name}:{})});
 return {status:r.status,body:await r.json()}
}
async function tool(name,args={}){return (await mcp('tools/call',{name,arguments:args})).body.result}
const refusal=r=>r?._meta?.['com.runeditrun/error']?.code;
const content=r=>r?.structuredContent;
try{
 const now=Math.floor(Date.now()/1000),claim=await signJws(pair.privateKey,kid,'rer-owner-claim+jwt',{v:1,iss:issuer,aud:origin,installationId,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat:now,exp:now+300});
 const owner=await post('/auth/owner-claim',{token:claim,displayName:'Morgan Monitor',returnTo:'/'});assert.equal(owner.status,303);cookie=owner.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const settings=await signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:origin,sub:installationId,business:ctx.business,email:bindings.OWNER_EMAIL,owner_id:sub,jti:randomUUID(),iat:now,exp:now+300,rev:1,values:{},logo:null,team:null});
 const paired=await post('/api/rer/business-settings',{settings});assert.equal(paired.status,200,await paired.clone().text());
 token=await accessToken(ctx);
 const unset=await mcp('tools/call',{name:'uptime.monitors.list',arguments:{}});assert.equal(refusal(unset.body.result),'policy_unset',JSON.stringify(unset));
 const envelope=await policyEnvelope(ctx,autonomousPolicy());const adopted=await post('/api/rer/agent-policy',{policy:envelope.policy});assert.equal(adopted.status,200);assert.deepEqual(Object.keys(await adopted.json()).sort(),['adopted','door']);ctx.seq=envelope.payload.seq;ctx.revision=envelope.payload.revision;
 for(const protocolVersion of ['2026-07-28','2025-11-25']){const r=await mcp('initialize',{protocolVersion,capabilities:{},clientInfo:{name:'Uptime test',version:'1'}},token,protocolVersion);assert.equal(r.status,200);assert.equal(r.body.result.protocolVersion,protocolVersion)}
 const rawCreated=await mcp('tools/call',{name:'uptime.monitors.create',arguments:{definition:{name:'Checkout uncertain',type:'http',url:'https://probe.uptime.example.test/checkout',enabled:false},idempotency_key:'create-checkout'}});const created=content(rawCreated.body.result);assert.ok(created?.id,JSON.stringify(rawCreated));
 const nativeBefore=JSON.stringify((await app.DB.prepare('SELECT * FROM monitors').all()).results);
 const replay=content(await tool('uptime.monitors.create',{definition:{name:'Checkout uncertain',type:'http',url:'https://probe.uptime.example.test/checkout',enabled:false},idempotency_key:'create-checkout'}));assert.equal(replay.id,created.id);assert.equal((await app.DB.prepare('SELECT count(*) n FROM monitors').first()).n,1);
 assert.equal(refusal(await tool('uptime.monitors.create',{definition:{name:'changed'},idempotency_key:'create-checkout'})),'idempotency_conflict');
 const read=content(await tool('uptime.monitors.read',{id:created.id}));assert.equal(read.id,created.id);assert.equal(read.current.state,'Paused');assert.equal(JSON.stringify((await app.DB.prepare('SELECT * FROM monitors').all()).results),nativeBefore,'private read does not kick checks or alter a definition');
 assert.equal(refusal(await tool('uptime.monitors.update',{id:created.id,definition:{name:'stale'},expected_revision:0,idempotency_key:'stale'})),'revision_conflict');
 const edited=content(await tool('uptime.monitors.update',{id:created.id,definition:{name:'Checkout evidence revised'},expected_revision:1,idempotency_key:'edit'}));assert.equal(edited.revision,2);
 const wrong=await accessToken(ctx,{sub:randomUUID(),email:bindings.OWNER_EMAIL});assert.equal((await mcp('tools/list',{},wrong)).status,401,'token email cannot select owner');
 const audience=await accessToken(ctx,{aud:origin});assert.equal((await mcp('tools/list',{},audience)).status,401);
 const paused=await post('/agents/api/pause',{paused:true},{cookie});assert.equal(paused.status,200);assert.equal(refusal(await tool('uptime.monitors.update',{id:created.id,definition:{name:'paused'},idempotency_key:'paused'})),'agents_paused');
 assert.equal((await fetch(origin+'/agents',{headers:{cookie}})).status,200);
 assert.equal((await app.DB.prepare('SELECT revision FROM monitors WHERE id=?').bind(created.id).first()).revision,2);
 console.log('UPTIME-AGENT: signed native owner/settings, both MCP eras, policy unset/adoption/Pause, no-effect reads, immutable revision, one-effect replay and identity negatives passed.');
 // PENDING BASE 2026-10-28, pin 7ce44fa: preserve these assertions for v2.
 // BASE-AGENT-009.native-target: audit row currently lacks native target attribution.
 // BASE-AGENT-003.resource-code: transport omits JSON-RPC error.data.code.
 // BASE-AGENT-012.replay-authority: replay precedes native service authorization.
 // BASE-AGENT-005.non-person-target: access fixtures demand sponsor escalation for monitor-route subjects.
 // BASE-AGENT-007.review-lifecycle: native reviewer lifecycle follows on combined v2.
}finally{await app.close()}
