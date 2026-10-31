import {proveSavedEmailDestinationFacts} from './agent-destination-facts-support.mjs';
import {proveAgentSurfaceDiscovery} from './agent-surface-discovery.mjs';
import {nativeDoorBrowser} from './agent-door-browser.mjs';
import {proveAccessFacts} from './agent-access-facts-support.mjs';
// One integrated core journey, through the emitted production Worker and real
// D1. Only mail/probe provider edges may be replaced; identities and mutations
// enter the ordinary native public doors.
import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,deliveredLink} from './auth-test-support.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';
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
 await proveAccessFacts({c,native,call,origin,cookie});
 const monitor=await native('/api/monitors',{name:'Checkout reachability',type:'http',network:'public',url:'https://checkout.example.test/health',method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:true,service:'checkout',group:'operations'});
 const second=await native('/api/monitors',{...monitor.definition,name:'Foreign service',service:'foreign'});
 const db=await worker.getD1Database('DB');
 const sponsor=await db.prepare('SELECT id FROM oa_operators WHERE email=?').bind(bindings.OWNER_EMAIL).first();
 await proveAgentSurfaceDiscovery({c,db,origin,monitorId:monitor.id});
 const target={kind:'monitor',id:monitor.id};
 const targetAudit=async(key,code)=>{
  const {rows,differs}=await auditRows(c);assert.equal(differs,0);
  const row=rows.findLast(row=>row.idempotency_key===key);
  assert.deepEqual(row.resource,target);assert.equal(row.code,code);
  assert.equal(row.sponsor.id,sponsor.id);assert.equal(row.agent.id,c.agentId);
  assert.ok(row.classes.some(item=>item.class==='live'));return row;
 };
 const selfGrant={id:monitor.id,operator_id:sponsor.id,granted:true,idempotency_key:randomUUID()};
 const grantsBefore=(await db.prepare('SELECT * FROM failure_evidence_grants ORDER BY monitor_id,operator_id').all()).results;
 assert.equal(errorCode(await c.tool('uptime.grants.update',selfGrant)),'self_escalation');
 assert.deepEqual((await db.prepare('SELECT * FROM failure_evidence_grants ORDER BY monitor_id,operator_id').all()).results,grantsBefore);
 console.log('PASS BASE-AGENT-005.uptime.evidence-self-escalation');
 const capabilities={mode:'declared',declared:['tools','policy','pause','audit','idempotency'],refused:['events','resources','prompts','subscriptions'],unscoped:['multiSponsor','mailEdges','resourceRefresh','timedLifecycle','dualHost','queuedLifecycle','ownerNativeApi']};
 const discovery=await c.mcp('server/discover');
 assert.deepEqual(discovery.result._meta['com.runeditrun/capabilities'],capabilities);
 assert.equal(surface.tools.length,34,'CORE exposes the native operator tools; worker admissions remain invoke-only');
 for(const name of ['uptime.checks.dispatch','uptime.destinations.dispatch','uptime.discovery.dispatch'])assert.ok(!surface.tools.some(tool=>tool.name===name),'worker admissions stay absent from MCP discovery');
 const capabilityWitness=await result('uptime.evidence.witness');
 for(const [capability,method,params] of [
  ['resources','resources/read',{uri:'uptime://monitors/missing'}],
  ['prompts','prompts/get',{name:'monitoring-shift'}],
  ['subscriptions','subscriptions/listen',{notifications:{toolsListChanged:true}}],
  ['events','tools/call',{name:'uptime.events.list',arguments:{}}],
 ]){
  const refused=await c.mcp(method,params);assert.equal(errorCode(refused),'capability_not_declared');
  assert.equal((refused.result?._meta?.['com.runeditrun/error']??refused.message.error.data).capability,capability);
  assert.equal(refused.result?.structuredContent,undefined);assert.equal(refused.result?.contents,undefined);
 }
 assert.deepEqual((await c.mcp('resources/templates/list')).result.resourceTemplates,[]);
 assert.deepEqual((await c.mcp('prompts/list')).result.prompts,[]);
 assert.deepEqual((await result('uptime.evidence.witness')).result.structuredContent,capabilityWitness.result.structuredContent);
 console.log('PASS BASE-AGENT-subset.uptime.core-declaration-and-refusals');
 await c.adopt(null);
 const unsetKey=randomUUID(),unsetWrite=await c.tool('uptime.monitors.pause',{id:monitor.id,version:monitor.revision,idempotency_key:unsetKey});
 assert.equal(errorCode(unsetWrite),'policy_unset');
 const unsetAudit=await targetAudit(unsetKey,'policy_unset');assert.equal(unsetAudit.decision,'unset');
 assert.ok(unsetAudit.rules.every(rule=>rule.rule===null));
 assert.equal((await native('/api/v1/monitors/'+monitor.id)).revision,monitor.revision);
 await c.adopt(autonomousPolicy());
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
 assert.deepEqual((await auditRows(c)).rows.findLast(row=>row.tool==='uptime.monitors.update').resource,target);
 const replayArgs={id:monitor.id,version:version+1,idempotency_key:randomUUID()};
 const paused=await result('uptime.monitors.pause',replayArgs),replayed=await result('uptime.monitors.pause',replayArgs);assert.deepEqual(replayed.result.structuredContent,paused.result.structuredContent);assert.equal((await native('/api/v1/monitors/'+monitor.id)).revision,version+2,'one effect on exact-key replay');
 const conflict=await c.tool('uptime.monitors.pause',{...replayArgs,version:999});assert.equal(errorCode(conflict),'idempotency_conflict');
 await c.adopt(autonomousPolicy(),{paused:true});
 const replayPaused=await c.tool('uptime.monitors.pause',replayArgs);
 assert.equal(errorCode(replayPaused),'agents_paused');assert.equal(replayPaused.result.structuredContent,undefined);
 assert.equal((await targetAudit(replayArgs.idempotency_key,'agents_paused')).decision,'paused');
 const blocked=autonomousPolicy();blocked.rules=[{id:'all',class:'*',do:'blocked'}];await c.adopt(blocked);
 const replayBlocked=await c.tool('uptime.monitors.pause',replayArgs);
 assert.equal(errorCode(replayBlocked),'policy_blocked');assert.equal(replayBlocked.result.structuredContent,undefined);
 await targetAudit(replayArgs.idempotency_key,'policy_blocked');
 await c.adopt(heldPolicy());
 const replayHeld=await c.tool('uptime.monitors.pause',replayArgs);
 assert.equal(errorCode(replayHeld),'approval_required');assert.equal(replayHeld.result.structuredContent,undefined);
 assert.equal((await native('/api/v1/monitors/'+monitor.id)).revision,version+2);
 const replayScope=await c.tool('uptime.monitors.pause',replayArgs,{token:await accessToken(c,{scope:'events:read'})});
 assert.equal(replayScope.status,403);assert.equal(errorCode(replayScope),'insufficient_scope');
 assert.equal(replayScope.result?.structuredContent,undefined);
 console.log('PASS BASE-AGENT-012.uptime.replay-current-admission');
 const pending=await c.tool('uptime.monitors.resume',{id:monitor.id,version:version+2,expected_revision:version+2});assert.ok(pending.result._meta['com.runeditrun/approval']);
 assert.equal((await native('/api/v1/monitors/'+monitor.id)).enabled,false,'held resume has no native effect');
 const heldView=await c.personJson(new URL(pending.result._meta['com.runeditrun/approval'].url).pathname.replace('/agents/approvals/','/agents/api/approvals/'));
 assert.deepEqual(heldView.approval.summary.nativeTarget,target);
 await proof.capture('agents-pending','/agents');await proof.capture('approval-pending',new URL(pending.result._meta['com.runeditrun/approval'].url).pathname);
 const approved=await c.decideApproval(pending);assert.equal(approved.ok,true);
 const execution=(await auditRows(c)).rows.findLast(row=>row.tool==='uptime.monitors.resume'&&row.decision_id);
 assert.deepEqual(execution.resource,target);assert.deepEqual(execution.approval.by,[sponsor.id]);
 console.log('PASS BASE-AGENT-009.uptime.native-target-and-approver');assert.equal((await native('/api/v1/monitors/'+monitor.id)).enabled,true);
 await proof.capture('approval-executed',new URL(pending.result._meta['com.runeditrun/approval'].url).pathname);await proof.capture('monitor-attribution','/app/monitors/'+monitor.id);
 await native('/api/monitors/'+second.id,{...second.definition,enabled:false},'PATCH');
 const runners=await native('/api/runners'),runner=runners[0];
 const claimRunner=async()=>{const response=await fetch(origin+'/api/runner/claim',{method:'POST',headers:{origin,'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY,'x-runner-id':runner.runnerId},body:'{}'});assert.equal(response.status,200);return response.json()};
 await c.adopt(autonomousPolicy(),{paused:true});
 const stopped=await c.tool('uptime.monitors.pause',{id:monitor.id,version:version+3});assert.equal(errorCode(stopped),'agents_paused');
 await proof.capture('agents-paused','/agents');assert.equal((await claimRunner()).task,null,'Pause refuses delayed runner admission');
 await c.adopt(autonomousPolicy());const admittedTask=(await claimRunner()).task;assert.equal(admittedTask.monitorId,monitor.id);assert.equal((await claimRunner()).task,null,'native runner handoff is issued once');
 const prepared=JSON.parse((await db.prepare('SELECT principal FROM uptime_agent_revisions WHERE monitor_id=? AND revision=?').bind(monitor.id,version+3).first()).principal);
 assert.ok(prepared.operationId);assert.ok(prepared.idempotencyKey);
 const dispatchRows=(await auditRows(c)).rows.filter(row=>row.tool==='uptime.checks.dispatch'&&row.outcome==='done');
 assert.equal(dispatchRows.length,1,'only one final runner admission completed');
 assert.equal(dispatchRows[0].operation_id,prepared.operationId,'queued work retains the originating door admission');
 assert.equal(dispatchRows[0].idempotency_key,prepared.idempotencyKey,'queued work retains the public preparation key');
 assert.equal(dispatchRows[0].consent,prepared.consent);
 const handoff=await db.prepare('SELECT id FROM uptime_agent_handoffs WHERE monitor_id=? AND delivered_at IS NOT NULL ORDER BY rowid DESC LIMIT 1').bind(monitor.id).first();
 assert.equal(dispatchRows[0].continuation_item_id,handoff.id,'the native handoff owns its own once-only claim');
 const originatingAudit=(await auditRows(c)).rows.find(row=>row.id===dispatchRows[0].operation_id);
 assert.deepEqual(originatingAudit.approval.by,[sponsor.id],'the continuation links the real preparatory approval');
 assert.deepEqual(prepared.approvers.map(person=>person.id),[sponsor.id],'native queue custody retains the real preparatory approver');
 console.log('PASS BASE-AGENT-012.uptime.native-continuation-identity');
 // Native owner enrolls and proves their actual second factor before issuing
 // a selected-monitor credential. No token, proof or secret is printed.
 await completeSecondFactor(origin,cookie);
 const keyIssued=await native('/api/credentials',{name:'Checkout read client',scopes:['monitoring:read'],expiresAt:Date.now()+3600000,resources:{mode:'selection',monitorIds:[monitor.id],tags:[]}});
 const local={token:keyIssued.token};
 const localRead=await c.mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:monitor.id}},local);assert.equal(localRead.result.isError,false);
 const foreign=await c.mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:second.id}},local),missing=await c.mcp('tools/call',{name:'uptime.monitors.read',arguments:{id:'missing'}},local);assert.equal(errorCode(foreign),'not_found');assert.equal(errorCode(missing),'not_found');
 const denied=await c.mcp('tools/call',{name:'uptime.monitors.pause',arguments:{id:monitor.id,version:version+3,idempotency_key:randomUUID()}},local);assert.equal(errorCode(denied),'insufficient_scope');
 assert.equal((await c.mcp('tools/call',{name:'uptime.evidence.read',arguments:{id:monitor.id}},local)).status,403);
 const foreignResource=await c.mcp('resources/read',{uri:'uptime://monitors/'+second.id},local);
 const absentResource=await c.mcp('resources/read',{uri:'uptime://monitors/missing'},local);
 assert.equal(foreignResource.message.error.data.code,'capability_not_declared');assert.deepEqual(foreignResource.message.error,absentResource.message.error);
 // A second reviewer is invited and confirmed through the real native lifecycle.
 const reviewerEmail='synthetic-door-reviewer@example.test',reviewerSub=randomUUID();
 const roster=await signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:origin,sub:installationId,business,email:bindings.OWNER_EMAIL,owner_id:sub,jti:randomUUID(),iat:seconds(),exp:seconds()+300,rev:2,values:{},logo:null,team:[{id:reviewerSub,email:reviewerEmail,name:'Morgan Reviewer',role:'admin',invite:1}]});
 const rosterResponse=await call('/api/rer/business-settings',{settings:roster});assert.equal(rosterResponse.status,200);
 assert.equal((await rosterResponse.json()).team[0].state,'invited');
 const invitation=await deliveredLink(call,{email:reviewerEmail,kind:'invite'});
 const reviewerCookie=sessionCookie(await call('/auth/confirm',{token:invitation.searchParams.get('token')}));
 await completeSecondFactor(origin,reviewerCookie);
 const reviewerSession=await call('/auth/session',undefined,{cookie:reviewerCookie});assert.equal(reviewerSession.status,200);
 const reviewerId=(await reviewerSession.json()).operator.id;
 const independent=heldPolicy();independent.rules=[{id:'all',class:'*',do:'approval',approver:['person:'+reviewerSub],wait:'PT1H'}];
 await c.adopt(independent);
 const reviewed=await c.tool('uptime.monitors.pause',{id:monitor.id,version:version+3,expected_revision:version+3});
 const reviewPath=new URL(reviewed.result._meta['com.runeditrun/approval'].url).pathname.replace('/agents/approvals/','/agents/api/approvals/');
 const view=(await c.personJson(reviewPath)).approval;
 const decision={revision:view.revision,summary_sha256:view.summary_sha256};
 assert.equal((await call(reviewPath+'/approve',decision,{cookie})).status,403,'sponsor cannot replace the independent reviewer');
 const reviewedResponse=await call(reviewPath+'/approve',decision,{cookie:reviewerCookie});assert.equal(reviewedResponse.status,200);
 assert.equal((await reviewedResponse.json()).approval.state,'executed');
 const reviewedAudit=(await auditRows(c)).rows.findLast(row=>row.tool==='uptime.monitors.pause'&&row.decision_id);
 assert.deepEqual(reviewedAudit.approval.by,[reviewerId]);assert.equal(reviewedAudit.sponsor.id,sponsor.id);
 assert.equal(reviewedAudit.agent.id,c.agentId);assert.deepEqual(reviewedAudit.resource,target);
 await proof.capture('approval-independent',reviewPath.replace('/agents/api/approvals/','/agents/approvals/'));
 console.log('PASS BASE-AGENT-008.uptime.native-independent-reviewer');
 const currentMonitor=await native('/api/v1/monitors/'+monitor.id);
 await c.adopt(heldPolicy());
 const pausedApproval=await c.tool('uptime.monitors.resume',{id:monitor.id,version:currentMonitor.revision,expected_revision:currentMonitor.revision});
 assert.ok(pausedApproval.result._meta['com.runeditrun/approval'],'resume is held before native execution');
 await c.adopt(autonomousPolicy(),{paused:true});
 const stoppedApproval=await c.decideApproval(pausedApproval);
 assert.equal(stoppedApproval.ok,true);assert.equal(stoppedApproval.body.approval.state,'refused');
 assert.equal((await native('/api/v1/monitors/'+monitor.id)).revision,currentMonitor.revision,'Pause stops an already pending native effect');
 await proof.capture('approval-refused',new URL(pausedApproval.result._meta['com.runeditrun/approval'].url).pathname);
 console.log('PASS BASE-AGENT-011.uptime.pause-pending-execution');
 await c.adopt(autonomousPolicy());
 await proveSavedEmailDestinationFacts({c,native,db,sponsorId:sponsor.id});
 const destination=await native('/api/notifications/destinations',{name:'Checkout incident webhook',kind:'webhook',url:'https://notifications.example.com/checkout'});
 const notificationArgs={id:destination.id,idempotency_key:randomUUID()};
 const queued=await result('uptime.destinations.test',notificationArgs),notificationId=queued.result.structuredContent.deliveryId;
 assert.equal((await result('uptime.destinations.test',notificationArgs)).result.structuredContent.deliveryId,notificationId,'preparation replay retains one native delivery');
 const rpc=async(operation,extra={})=>{
  const response=await fetch(origin+'/api/runner/notifications',{method:'POST',headers:{origin,'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY},body:JSON.stringify({operation,...extra})});
  assert.equal(response.status,200,'ordinary authenticated notification runner admission');return response.json();
 };
 await rpc('poll');
 const reservation=randomUUID(),transportClaim=await rpc('claim',{id:notificationId,reservation});assert.ok(transportClaim);
 await c.adopt(autonomousPolicy(),{paused:true});
 assert.equal(await rpc('start',{id:notificationId,claim:transportClaim,reservation}),false,'Pause stops transport admission of queued agent mail');
 assert.equal((await db.prepare('SELECT started_at FROM notification_claim_custody WHERE delivery_id=?').bind(notificationId).first()).started_at,null);
 await c.adopt(autonomousPolicy());
 assert.equal(await rpc('start',{id:notificationId,claim:transportClaim,reservation}),true);
 assert.equal(await rpc('start',{id:notificationId,claim:transportClaim,reservation}),false,'native transport custody starts only once');
 const notificationAudit=(await auditRows(c)).rows.findLast(row=>row.tool==='uptime.destinations.dispatch'&&row.outcome==='done');
 const notificationSource=JSON.parse((await db.prepare('SELECT principal FROM uptime_agent_notifications WHERE delivery_id=?').bind(notificationId).first()).principal);
 assert.equal(notificationAudit.operation_id,notificationSource.operationId);
 assert.equal(notificationAudit.idempotency_key,notificationArgs.idempotency_key);
 assert.equal(notificationAudit.continuation_item_id,notificationId);
 assert.equal(notificationAudit.consent,notificationSource.consent);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM notification_delivery_attempts WHERE delivery_id=? AND started_at IS NOT NULL').bind(notificationId).first()).n,1);
 console.log('PASS BASE-AGENT-012.uptime.notification-continuation-identity (native transport admission; provider delivery unclaimed)');
 const retainedEvents=await db.prepare('SELECT event FROM agent_door_events WHERE uri=?').bind('uptime://monitors/'+monitor.id).all();
 assert.ok(retainedEvents.results.length>0,'CORE retains internal native events without exposing an undeclared public event door');
 const continuationWitness=(await result('uptime.evidence.witness')).result.structuredContent;
 for(const [name,args] of [
  ['uptime.checks.dispatch',{id:monitor.id,version:currentMonitor.revision,runner_id:runner.runnerId,handoff_id:handoff.id}],
  ['uptime.destinations.dispatch',{id:destination.id,delivery_id:notificationId,credential_id:'not-a-native-credential'}],
  ['uptime.discovery.dispatch',{id:'not-a-native-job',runner_id:runner.runnerId}],
 ]){
  const hidden=await c.tool(name,args);
  assert.equal(hidden.status,400,'invoke-only admissions have the ordinary unknown-tool transport response');
  assert.equal(errorCode(hidden),'tool_not_found','MCP cannot discover or call a native worker admission');
  assert.equal(hidden.result,undefined,'a hidden worker admission returns no native result');
  assert.equal(hidden.decision,undefined,'MCP never reaches native worker policy or execution');
 }
 assert.deepEqual((await result('uptime.evidence.witness')).result.structuredContent,continuationWitness);
 console.log('PASS BASE-AGENT-012.uptime.worker-only-continuation-admission');
 // An approved aggregate read retains a receipt, not a snapshot of native
 // rows. Replaying through a scoped native credential must read current state.
 const readPolicy=autonomousPolicy();readPolicy.rules=[{id:'all',class:'*',do:'approval',approver:['sponsor'],wait:'PT1H'}];
 await c.adopt(readPolicy);
 const aggregate=state=>c.mcp('tools/call',{name:'uptime.monitors.list',arguments:{},...(state?{requestState:state}:{})},local);
 const readPending=await aggregate();assert.equal(readPending.result?.resultType,'input_required');
 assert.equal((await c.decideApproval(readPending)).ok,true);
 const readState=readPending.result.requestState,readFirst=await aggregate(readState);
 assert.equal(readFirst.result?.isError,false);assert.deepEqual(readFirst.result.structuredContent.items.map(item=>item.id),[monitor.id]);
 const [savedMonitor]=await native('/api/monitors/'+monitor.id+'/revisions'),renamed='Checkout reachability — current native read';
 await native('/api/monitors/'+monitor.id,{...savedMonitor.definition,name:renamed},'PATCH');
 const readReplay=await aggregate(readState);
 assert.equal(readReplay.result?.isError,false);assert.equal(readReplay.result.structuredContent.items[0].definition.name,renamed);
 assert.deepEqual(readReplay.result._meta['com.runeditrun/receipt'],readFirst.result._meta['com.runeditrun/receipt']);
 assert.notDeepEqual(readReplay.result.structuredContent,readFirst.result.structuredContent,'an old approval cannot return stale aggregate rows');
 await native('/api/credentials/'+keyIssued.credential.id,undefined,'DELETE');
 const revokedRead=await aggregate(readState);assert.equal(revokedRead.status,401);assert.equal(revokedRead.result?.structuredContent,undefined);
 console.log('PASS BASE-AGENT-012.uptime.current-native-read-replay');
 await c.adopt(autonomousPolicy());
 const eraseTarget=await native('/api/monitors',{...monitor.definition,name:'Native erasure replay'});
 const eraseArgs={id:eraseTarget.id,confirmation:eraseTarget.definition.name,idempotency_key:randomUUID()};
 const eraseProof=await native('/agents/native-proof',{agent_id:c.agentId,tool:'uptime.privacy.erase',arguments:{id:eraseArgs.id,confirmation:eraseArgs.confirmation}});
 const erased=await c.tool('uptime.privacy.erase',eraseArgs,{proofReference:eraseProof.reference});
 assert.equal(erased.result?.isError,false);
 assert.equal(erased.result.structuredContent.erased,true);
 const erasedWitness=(await result('uptime.evidence.witness')).result.structuredContent;
 const eraseReplay=await c.tool('uptime.privacy.erase',eraseArgs,{proofReference:eraseProof.reference});
 assert.equal(eraseReplay.result?.isError,false,'completed deletion does not require the deleted monitor to exist');
 assert.deepEqual(eraseReplay.result.structuredContent,erased.result.structuredContent);
 assert.deepEqual((await result('uptime.evidence.witness')).result.structuredContent,erasedWitness,'erasure replay has no second native effect');
 const unprovedReplay=await c.tool('uptime.privacy.erase',eraseArgs);
 assert.equal(errorCode(unprovedReplay),'native_proof_required','a completed deletion still requires current native human proof');
 assert.equal(unprovedReplay.result?.structuredContent,undefined);
 await c.adopt(autonomousPolicy(),{paused:true});
 const pausedErase=await c.tool('uptime.privacy.erase',eraseArgs,{proofReference:eraseProof.reference});
 assert.equal(errorCode(pausedErase),'agents_paused','Pause refuses the completed deletion replay');
 assert.equal(pausedErase.result?.structuredContent,undefined);
 await c.adopt(autonomousPolicy());
 const freshErase=await c.tool('uptime.privacy.erase',{...eraseArgs,idempotency_key:randomUUID()},{proofReference:eraseProof.reference});
 assert.equal(errorCode(freshErase),'not_found','a fresh operation cannot erase an absent target');
 assert.equal(freshErase.result?.structuredContent,undefined);
 assert.deepEqual((await result('uptime.evidence.witness')).result.structuredContent,erasedWitness);
 console.log('PASS BASE-AGENT-012.uptime.deleted-target-current-admission');
 await proof.capture('agents-final','/agents');await proof.close();proof=null;
 assert.ok(c.points.every(point=>point.ok),JSON.stringify(c.points.filter(p=>!p.ok)));
 // Updated 2026-10-30 BASE-AGENT-013.uptime.declarative-conformance:
 // agent-surface.json declares tools, policy, pause, audit and idempotency.
 // The installed rer 0.2.93 CLI measures every declared point; a declaration
 // does not promote any ct judgment or unimplemented capability.
 // Closed 2026-10-30 BASE-AGENT-013.uptime.ct-alignment:
 // ct 2026-10-29T14:12Z ruled that the contract follows native names. Its
 // retained outcome map preserves every existing clause, class and capability.
 // Closed 2026-10-30 BASE-AGENT-013.uptime.worker-exposure:
 // ct excludes checks.dispatch, destinations.dispatch and discovery.dispatch
 // from CORE: invoke-only and hidden from MCP. Published Base 0.2.93 carries
 // gr-base-0290-invokeonly-1's exposure option. Native final-admission and
 // continuation-identity assertions above still run through the runner and
 // notification doors; no MCP fixture manufactures their trusted identities.
 // Closed 2026-10-30 BASE-AGENT-013.uptime.archive-refresh:
 // rer refresh-base --ref 2f77cdb6d8dfaa82903c2839600e23b76631a537 acquired
 // its public source automatically and completed without a scratch checkout.
 // Closed 2026-10-29 BASE-AGENT-013.uptime.managed-mail-check:
 // rer 0.2.88 structural check and the unchanged managed generator both pass;
 // MAIL_PROVIDER stays public and the duplicate deploy secret stays absent.
 console.log('PASS Uptime agent native signed identity, both MCP eras, no-effect reads, current scopes, revision, one-effect replay, held approval, Pause and read-key fences');
}finally{await proof?.dispose();await worker?.dispose();await cleanupDirectory(directory)}
