import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {admissionRuntime} from './admission-runtime.mjs';
import {freePort} from '../scripts/local-ports.mjs';
import {readDeliveredMessages} from './mail-provider-fixture.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {accessToken,signJws,policyEnvelope,autonomousPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
const origin=`http://localhost:${await freePort()}`,issuer='https://business.example.test',installationId=randomUUID(),sub=randomUUID(),kid=randomUUID(),pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const keys={[kid]:await webcrypto.subtle.exportKey('jwk',pair.publicKey)};
const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:origin,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify(keys),RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:origin,subject:installationId,email:testAuthBindings.OWNER_EMAIL,keys})};
const app=await admissionRuntime(bindings),ctx={origin,signer:{privateKey:pair.privateKey,kid,issuer,installationId},person:{email:bindings.OWNER_EMAIL,sub},surface:{specialist:'monitoring operator',tools:[{scope:'uptime:read'},{scope:'uptime:operate'}]},agentId:randomUUID(),business:'agent-test-business',consent:randomUUID(),seq:0,revision:0};
const post=(path,body,headers={})=>fetch(origin+path,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
let cookie,token;
async function mcp(method,params={},credential=token,version='2026-07-28'){
 const r=await post('/mcp',{jsonrpc:'2.0',id:randomUUID(),method,params:version==='2025-11-25'?params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':version,'io.modelcontextprotocol/clientCapabilities':{elicitation:{url:{}}},'io.modelcontextprotocol/clientInfo':{name:'Uptime test',version:'1'}}}},{authorization:`Bearer ${credential}`,accept:'application/json, text/event-stream','mcp-protocol-version':version,'mcp-method':method,...((params.name||params.uri)?{'mcp-name':params.name??params.uri}:{})});
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
 const rawCreated=await mcp('tools/call',{name:'uptime.monitors.create',arguments:{definition:{name:'Checkout uncertain',type:'http',url:'https://probe.uptime.example.test/checkout',service:'checkout',enabled:false},idempotency_key:'create-checkout'}});const created=content(rawCreated.body.result);assert.ok(created?.id,JSON.stringify(rawCreated));
 const nativeBefore=JSON.stringify((await app.DB.prepare('SELECT * FROM monitors').all()).results);
 const replay=content(await tool('uptime.monitors.create',{definition:{name:'Checkout uncertain',type:'http',url:'https://probe.uptime.example.test/checkout',service:'checkout',enabled:false},idempotency_key:'create-checkout'}));assert.equal(replay.id,created.id);assert.equal((await app.DB.prepare('SELECT count(*) n FROM monitors').first()).n,1);
 assert.equal(refusal(await tool('uptime.monitors.create',{definition:{name:'changed'},idempotency_key:'create-checkout'})),'idempotency_conflict');
 const read=content(await tool('uptime.monitors.read',{id:created.id}));assert.equal(read.id,created.id);assert.equal(read.current.state,'Paused');assert.equal(JSON.stringify((await app.DB.prepare('SELECT * FROM monitors').all()).results),nativeBefore,'private read does not kick checks or alter a definition');
 assert.equal(refusal(await tool('uptime.monitors.update',{id:created.id,definition:{name:'stale'},expected_revision:0,idempotency_key:'stale'})),'revision_conflict');
 const edited=content(await tool('uptime.monitors.update',{id:created.id,definition:{name:'Checkout evidence revised'},expected_revision:1,idempotency_key:'edit'}));assert.equal(edited.revision,2);
 // The native credential is minted through the existing person/MFA door.
 await completeSecondFactor(origin,cookie);
 const minted=await post('/api/credentials',{name:'Selected-monitor evidence reader',scopes:['monitoring:read'],expiresAt:Date.now()+3600000,resources:{mode:'selection',monitorIds:[created.id],tags:[]}},{cookie});assert.equal(minted.status,201);const key=await minted.json();assert.ok(key.token);
 const localRead=await mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:created.id}},key.token);assert.equal(content(localRead.body.result).id,created.id);
 const localForeign=await mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:'outside-selection'}},key.token),localMissing=await mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:'missing'}},key.token);assert.equal(refusal(localForeign.body.result),refusal(localMissing.body.result));assert.equal(refusal(localForeign.body.result),'not_found');
 const localWrite=await mcp('tools/call',{name:'uptime.monitors.update',arguments:{id:created.id,definition:{name:'forbidden'},idempotency_key:'key-write'}},key.token);assert.equal(localWrite.status,403);
 const workspaceRead=await mcp('tools/call',{name:'uptime.definitions.read',arguments:{}},key.token);assert.equal(refusal(workspaceRead.body.result),'not_found','a selected key cannot read workspace definitions');
 const privateEvidence=await mcp('tools/call',{name:'uptime.evidence.read',arguments:{id:created.id}},key.token);assert.equal(refusal(privateEvidence.body.result),'not_found','read key does not inherit private evidence');
 const revoked=await fetch(origin+'/api/credentials/'+key.credential.id,{method:'DELETE',headers:{origin,cookie,'content-type':'application/json'}});assert.equal(revoked.status,200);assert.equal((await mcp('tools/list',{},key.token)).status,401);
 // Business creates its native teammate; the owner's normal product-role
 // assignment remains a distinct and narrower admission.
 const teammateSub=randomUUID(),teammateEmail='synthetic-agent-responder@example.test';
 const teamSettings=await signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:origin,sub:installationId,business:ctx.business,email:bindings.OWNER_EMAIL,owner_id:sub,jti:randomUUID(),iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,rev:2,values:{},logo:null,team:[{id:teammateSub,email:teammateEmail,name:'Casey Evidence',role:'member',invite:1}]});
 const teamApplied=await post('/api/rer/business-settings',{settings:teamSettings});assert.equal(teamApplied.status,200,await teamApplied.clone().text());
 const members=await (await fetch(origin+'/api/access/members',{headers:{cookie}})).json(),teammate=members.find(p=>p.email===teammateEmail);assert.ok(teammate);
 const assigned=await post('/api/access/members/'+teammate.id,{role:'read-only',scopes:[{kind:'service',value:'checkout'}]},{cookie});assert.equal(assigned.status,200,await assigned.clone().text());
 const delivered=(await readDeliveredMessages()).findLast(m=>m.origin===origin&&m.message.subject.startsWith("You're invited")&&m.message.personalizations.some(p=>p.to.some(t=>t.email===teammateEmail)));assert.ok(delivered,'native Business invitation reaches the configured mail edge');
 const inviteLink=new URL(delivered.text.match(/https?:\/\/[^\s]+/)[0]);assert.equal((await post('/auth/confirm',{token:inviteLink.searchParams.get('token')})).status,303);
 const teammateAgentId=randomUUID(),teammateToken=await accessToken(ctx,{sub:teammateSub,email:teammateEmail,act:{sub:teammateAgentId,name:'Casey assistant',specialist:'monitoring operator'}});
 const teamRead=await mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:created.id}},teammateToken);assert.equal(content(teamRead.body.result).id,created.id);
 const narrowed=await post('/api/access/members/'+teammate.id,{role:'read-only',scopes:[{kind:'service',value:'other-service'}]},{cookie});assert.equal(narrowed.status,200);
 const teamDenied=await mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:created.id}},teammateToken);assert.equal(refusal(teamDenied.body.result),'not_found','live native scope narrowing applies to the same Business token');
 const reassignedEmail=await accessToken(ctx,{sub:teammateSub,email:bindings.OWNER_EMAIL,act:{sub:teammateAgentId,name:'Casey assistant',specialist:'monitoring operator'}});assert.equal(refusal((await mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:created.id}},reassignedEmail)).body.result),'not_found','an owner email cannot widen the durable teammate binding');
 const inactive=await fetch(origin+'/api/access/members/'+teammate.id,{method:'DELETE',headers:{origin,cookie,'content-type':'application/json'}});assert.equal(inactive.status,200);assert.equal((await mcp('tools/list',{},teammateToken)).status,401,'native deactivation stops the next Business call');
 const wrong=await accessToken(ctx,{sub:randomUUID(),email:bindings.OWNER_EMAIL});assert.equal((await mcp('tools/list',{},wrong)).status,401,'token email cannot select owner');
 const audience=await accessToken(ctx,{aud:origin});assert.equal((await mcp('tools/list',{},audience)).status,401);
 const paused=await post('/agents/api/pause',{paused:true},{cookie});assert.equal(paused.status,200);assert.equal(refusal(await tool('uptime.monitors.update',{id:created.id,definition:{name:'paused'},idempotency_key:'paused'})),'agents_paused');
 assert.equal((await fetch(origin+'/agents',{headers:{cookie}})).status,200);
 assert.equal((await app.DB.prepare('SELECT revision FROM monitors WHERE id=?').bind(created.id).first()).revision,2);
 await post('/agents/api/pause',{paused:false},{cookie});
 const heldDocument={schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'ordinary',class:'standard',do:'autonomous'},{id:'effects',class:'*',do:'approval',approver:['sponsor'],wait:'PT1H'}],spend:{none:true}};
 const heldEnvelope=await policyEnvelope(ctx,heldDocument);assert.equal((await post('/api/rer/agent-policy',{policy:heldEnvelope.policy})).status,200);ctx.seq=heldEnvelope.payload.seq;ctx.revision=heldEnvelope.payload.revision;
 const held=await tool('uptime.monitors.resume',{id:created.id,expected_revision:2,idempotency_key:'held-resume'});
 const handle=held?._meta?.['com.runeditrun/approval'];assert.ok(handle?.id,JSON.stringify(held));
 const approvalPath='/agents/api/approvals/'+encodeURIComponent(handle.id),approval=(await (await fetch(origin+approvalPath,{headers:{cookie}})).json()).approval;
 assert.equal(approval.summary.target.name,'Checkout evidence revised');assert.ok(approval.summary_sha256);
 assert.equal((await post(approvalPath+'/approve',{revision:approval.revision,summary_sha256:'0'.repeat(64)},{cookie})).status,409);
 assert.equal((await app.DB.prepare('SELECT revision FROM monitors WHERE id=?').bind(created.id).first()).revision,2,'wrong summary runs nothing');
 if(process.env.UPTIME_AGENT_BROWSER_PROOF){
  const {inspectAgentPages}=await import('./agent-door-browser-support.mjs');
  await inspectAgentPages({origin,cookie,phase:'pending',approvalId:handle.id});
 }
 const executed=await post(approvalPath+'/approve',{revision:approval.revision,summary_sha256:approval.summary_sha256},{cookie});assert.equal(executed.status,200);assert.equal((await executed.json()).approval.state,'executed');
 assert.equal((await app.DB.prepare('SELECT revision FROM monitors WHERE id=?').bind(created.id).first()).revision,3);
 assert.equal((await post(approvalPath+'/approve',{revision:approval.revision,summary_sha256:approval.summary_sha256},{cookie})).status,200);
 assert.equal((await app.DB.prepare('SELECT revision FROM monitors WHERE id=?').bind(created.id).first()).revision,3,'repeat person decision executes once');
 const resource=await mcp('resources/read',{uri:'uptime://monitors/'+encodeURIComponent(created.id)});assert.equal(resource.status,200);
 if(process.env.UPTIME_AGENT_BROWSER_PROOF){
  const {inspectAgentPages}=await import('./agent-door-browser-support.mjs');await inspectAgentPages({origin,cookie,phase:'executed',approvalId:handle.id});
 }
 console.log('UPTIME-AGENT: signed native owner/settings, both MCP eras, policy unset/adoption/Pause, no-effect reads, immutable revision, one-effect replay identity negatives, exact held summary and one named-person execution passed.');
 // PENDING BASE 2026-10-28, pin 7ce44fa: preserve these assertions for v2.
 // BASE-AGENT-009.native-target: audit row currently lacks native target attribution.
 // BASE-AGENT-003.resource-code: transport omits JSON-RPC error.data.code.
 // BASE-AGENT-012.replay-authority: replay precedes native service authorization.
 // BASE-AGENT-005.non-person-target: access fixtures demand sponsor escalation for monitor-route subjects.
 // BASE-AGENT-007.review-lifecycle: native reviewer lifecycle follows on combined v2.
}finally{await app.close()}
