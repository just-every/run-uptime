import {nativeDoorBrowser} from './agent-door-browser.mjs';
// One integrated core journey, through the emitted production Worker and real
// D1. Only mail/probe provider edges may be replaced; identities and mutations
// enter the ordinary native public doors.
import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {signJws,seconds,autonomousPolicy,heldPolicy,accessToken,policyEnvelope} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {createProtocol,errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const key=await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid='uptime-native-journey',issuer='https://business.example.test',installationId=randomUUID(),sub=randomUUID(),business=randomUUID();
const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin='http://127.0.0.1:'+port;
const signer={privateKey:pair.privateKey,kid,issuer,installationId};
const bindings={...testAuthBindings,RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:origin,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:key}),RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:origin,subject:installationId,keys:{[kid]:key}})};
let worker,proof;
try{
 ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings}));
 const iat=seconds(),claim=await signJws(pair.privateKey,kid,'rer-owner-claim+jwt',{v:1,iss:issuer,aud:origin,installationId,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat,exp:iat+300});
 const call=authRequest(origin);
 assert.equal((await call('/auth/owner-claim',{token:bindings.SETUP_TOKEN,displayName:'Riley Owner',returnTo:'/app'})).status,403,'raw setup token never becomes a signed owner claim');
 const claimed=await call('/auth/owner-claim',{token:claim,displayName:'Riley Owner',returnTo:'/app'}),cookie=sessionCookie(claimed);
 const settings=await signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:origin,sub:installationId,business,email:bindings.OWNER_EMAIL,owner_id:sub,jti:randomUUID(),iat,exp:iat+300,rev:1,values:{},logo:null,team:null});
 const paired=await call('/api/rer/business-settings',{settings});assert.equal(paired.status,200);assert.equal((await paired.json()).rev,1);
 const surface={seed:'uptime',specialist:'monitoring-operator',tools:['uptime:read','uptime:evidence','uptime:operate','definitions:preview','events:read'].map(scope=>({scope}))};
 const c=createProtocol({fetch,origin,surface,signer,person:{email:bindings.OWNER_EMAIL,cookie,sub},business,consent:randomUUID(),points:[],agentId:'night-shift-'+randomUUID(),seq:0,revision:0,listed:new Map()});
 const unset=await c.tool('uptime.monitors.list',{});assert.equal(errorCode(unset),'policy_unset');
 const initial=await policyEnvelope(c,autonomousPolicy());const firstPolicy=await c.request('/api/rer/agent-policy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({policy:initial.policy})});assert.equal(firstPolicy.status,200);c.seq=initial.payload.seq;c.revision=initial.payload.revision;
 const exposed=await c.mcp('tools/list');surface.tools=exposed.result.tools.map(t=>({name:t.name,scope:t._meta['com.runeditrun/scope'],readOnly:t.annotations.readOnlyHint,classes:t._meta['com.runeditrun/classes'],clauses:t._meta['com.runeditrun/clauses']}));
 const sendTool=c.tool;c.tool=(name,args={},options)=>sendTool(name,{...args,...(!surface.tools.find(t=>t.name===name)?.readOnly&&!args.idempotency_key?{idempotency_key:randomUUID()}:{})},options);
 const result=async(name,args={})=>{const answer=await c.tool(name,args);assert.equal(answer.result?.isError,false,`${name}: ${errorCode(answer)}`);return answer};
 await c.adopt(autonomousPolicy());
 for(const version of ['2026-07-28','2025-11-25']){const listed=await c.mcp('tools/list',{}, {version});assert.deepEqual(listed.result.tools.map(t=>t.name),surface.tools.map(t=>t.name).sort())}
 const native=async(path,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(origin+path,{method,redirect:'manual',headers:{cookie,origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(response.ok,`${path} HTTP ${response.status}`);return response.json()};
 const monitor=await native('/api/monitors',{name:'Checkout reachability',type:'http',network:'public',url:'https://checkout.example.test/health',method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:true,service:'checkout',group:'operations'});
 const second=await native('/api/monitors',{...monitor.definition,name:'Foreign service',service:'foreign'});
 const db=await worker.getD1Database('DB');
 const counts=async()=>Object.fromEntries(await Promise.all(['monitors','revisions','slots','observations','external_check','runners'].map(async table=>[table,(await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n])));
 const before=await counts();assert.equal((await result('uptime.monitors.read',{id:monitor.id})).result.structuredContent.id,monitor.id);assert.deepEqual(await counts(),before,'private reads do not kick hosted checks or initialize settings');
 const token=await accessToken(c,{sub:randomUUID(),email:bindings.OWNER_EMAIL});const rejected=await c.mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:monitor.id}},{token});assert.equal(rejected.status,401,'email cannot authorize an unmapped Business subject');
 const wrong=await accessToken(c,{aud:origin+'/other'});assert.equal((await c.mcp('tools/list',{}, {token:wrong})).status,401);
 const setup=await fetch(origin+'/setup',{method:'POST',redirect:'manual',headers:{origin,cookie}});assert.equal(setup.status,303);
 proof=await nativeDoorBrowser({origin,cookie,directory});
 const version=monitor.revision;
 const stale=await c.tool('uptime.monitors.update',{id:monitor.id,version:version-1,definition:{name:'must not save'},expected_revision:version-1});assert.equal(errorCode(stale),'revision_conflict');
 const changed=await result('uptime.monitors.update',{id:monitor.id,version,definition:{name:'Checkout reachability — investigated'},expected_revision:version});
 assert.equal(changed.result.structuredContent.revision,version+1);
 const replayArgs={id:monitor.id,version:version+1,idempotency_key:randomUUID()};
 const paused=await result('uptime.monitors.pause',replayArgs),replayed=await result('uptime.monitors.pause',replayArgs);assert.deepEqual(replayed.result.structuredContent,paused.result.structuredContent);assert.equal((await native('/api/v1/monitors/'+monitor.id)).revision,version+2,'one effect on exact-key replay');
 const conflict=await c.tool('uptime.monitors.pause',{...replayArgs,version:999});assert.equal(errorCode(conflict),'idempotency_conflict');
 await c.adopt(heldPolicy());
 const pending=await c.tool('uptime.monitors.resume',{id:monitor.id,version:version+2,expected_revision:version+2});assert.ok(pending.result._meta['com.runeditrun/approval']);
 assert.equal((await native('/api/v1/monitors/'+monitor.id)).enabled,false,'held resume has no native effect');
 await proof.capture('agents-pending','/agents');await proof.capture('approval-pending',new URL(pending.result._meta['com.runeditrun/approval'].url).pathname);
 const approved=await c.decideApproval(pending);assert.equal(approved.ok,true);assert.equal((await native('/api/v1/monitors/'+monitor.id)).enabled,true);
 await proof.capture('approval-executed',new URL(pending.result._meta['com.runeditrun/approval'].url).pathname);await proof.capture('monitor-attribution','/app/monitors/'+monitor.id);
 await native('/api/monitors/'+second.id,{...second.definition,enabled:false},'PATCH');
 const runners=await native('/api/runners'),runner=runners[0];
 const claimRunner=async()=>{const response=await fetch(origin+'/api/runner/claim',{method:'POST',headers:{origin,'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY,'x-runner-id':runner.runnerId},body:'{}'});assert.equal(response.status,200);return response.json()};
 await c.adopt(autonomousPolicy(),{paused:true});
 const stopped=await c.tool('uptime.monitors.pause',{id:monitor.id,version:version+3});assert.equal(errorCode(stopped),'agents_paused');
 await proof.capture('agents-paused','/agents');assert.equal((await claimRunner()).task,null,'Pause refuses delayed runner admission');
 await c.adopt(autonomousPolicy());const admittedTask=(await claimRunner()).task;assert.equal(admittedTask.monitorId,monitor.id);assert.equal((await claimRunner()).task,null,'native runner handoff is issued once');
 // Native owner enrolls and proves their actual second factor before issuing
 // a selected-monitor credential. No token, proof or secret is printed.
 await completeSecondFactor(origin,cookie);
 const keyIssued=await native('/api/credentials',{name:'Checkout read client',scopes:['monitoring:read'],expiresAt:Date.now()+3600000,resources:{mode:'selection',monitorIds:[monitor.id],tags:[]}});
 const local={token:keyIssued.token};
 const localRead=await c.mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:monitor.id}},local);assert.equal(localRead.result.isError,false);
 const foreign=await c.mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:second.id}},local),missing=await c.mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:'missing'}},local);assert.equal(errorCode(foreign),'not_found');assert.equal(errorCode(missing),'not_found');
 const denied=await c.mcp('tools/call',{name:'uptime.monitors.pause',arguments:{id:monitor.id,version:version+3,idempotency_key:randomUUID()}},local);assert.equal(errorCode(denied),'insufficient_scope');
 assert.equal((await c.mcp('tools/call',{name:'uptime.evidence.read',arguments:{id:monitor.id}},local)).status,403);
 const events=await result('uptime.events.list',{});assert.ok(events.result.structuredContent.events.some(event=>event.uri==='uptime://monitors/'+monitor.id));
 await proof.capture('agents-final','/agents');await proof.close();proof=null;
 assert.ok(c.points.every(point=>point.ok),JSON.stringify(c.points.filter(p=>!p.ok)));
 console.log('PASS Uptime agent native signed identity, both MCP eras, no-effect reads, current scopes, revision, one-effect replay, held approval, Pause and read-key fences');
}finally{await proof?.dispose();await worker?.dispose();await cleanupDirectory(directory)}
