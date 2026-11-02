import assert from 'node:assert/strict';
import {randomUUID,webcrypto} from 'node:crypto';
import {join} from 'node:path';
import http from 'node:http';
import {isDeepStrictEqual} from 'node:util';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,deliveredLink} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
import {signJws,seconds,autonomousPolicy,heldPolicy,policyEnvelope} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {createProtocol,errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';

// Isolated persistence and native identities: the retained conformance fixture
// assigns its default owner, whereas this journey actually transfers ownership.
export async function proveIncidentOwnership() {
 const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin='http://127.0.0.1:'+port;
 const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const key=await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid='synthetic-uptime-ownership';
 const issuer='https://business.example.test',installationId=randomUUID(),sub=randomUUID(),business=randomUUID();
 const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-1',
  RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:origin,
  RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:key}),
  RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:origin,subject:installationId,keys:{[kid]:key}})};
 const providerRequests=[],target=http.createServer((request,response)=>{
  response.statusCode=request.url==='/canary'?200:503;response.end('synthetic-uptime-2');
 });
 const originalRequest=http.request;let worker;
 try {
  await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));
  const targetPort=target.address().port;
  // Only the probe's controlled network edge is replaced. Claim, signature,
  // scheduled evaluation, native incident work and agent admission are real.
  http.request=function(options,...args){
   if(['93.184.216.34','93.184.216.35'].includes(options?.hostname)){
    assert.equal(options.headers.host,options.hostname+':'+targetPort);
    return originalRequest.call(this,{...options,hostname:'127.0.0.1'},...args);
   }
   return originalRequest.call(this,options,...args);
  };
  const outboundService=async request=>{
   providerRequests.push({method:request.method,origin:new URL(request.url).origin});
   assert.equal(new URL(request.url).hostname,'api.sendgrid.com','only native authentication mail uses the provider edge');
   return new Response(null,{status:202});
  };
  ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings,outboundService}));
  let db=await worker.getD1Database('DB');
  const call=authRequest(origin),iat=seconds();
  const claim=await signJws(pair.privateKey,kid,'rer-owner-claim+jwt',{v:1,iss:issuer,aud:origin,installationId,
   email:bindings.OWNER_EMAIL,jti:randomUUID(),iat,exp:iat+300});
  const cookie=sessionCookie(await call('/auth/owner-claim',{token:claim,displayName:'Ownership sponsor',returnTo:'/app'}));
  await completeSecondFactor(origin,cookie);
  const native=async(path,body,method=body===undefined?'GET':'POST',session=cookie)=>{
   const response=await fetch(origin+path,{method,redirect:'manual',headers:{cookie:session,origin,'content-type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
   assert.ok(response.ok,path+' HTTP '+response.status);return response.json();
  };
  const sponsor=await native('/api/access/self');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM oa_operators WHERE role='owner' AND status='active'").first()).n,1);
  const settings=await signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:origin,sub:installationId,
   business,email:bindings.OWNER_EMAIL,owner_id:sub,jti:randomUUID(),iat,exp:iat+300,rev:1,values:{},logo:null,team:null});
  assert.equal((await call('/api/rer/business-settings',{settings})).status,200);
  const email=['synthetic-uptime-3','example.test'].join('@');
  await native('/api/access/invitations',{email,displayName:'Ownership responder',role:'responder',scopes:[]});
  const invitation=await deliveredLink(call,{email,kind:'invite'});
  const memberCookie=sessionCookie(await call('/auth/confirm',{token:invitation.searchParams.get('token')}));
  await completeSecondFactor(origin,memberCookie);
  const member=await native('/api/access/self',undefined,'GET',memberCookie);
  assert.notEqual(member.id,sponsor.id);assert.equal(member.role,'responder');
  const runner=await native('/api/runners',{networkLabel:'synthetic-uptime-6'});
  const monitor=await native('/api/monitors',{name:'synthetic-uptime-4',type:'http',network:'public',
   url:'http://93.184.216.34:'+targetPort+'/target',assertions:{status:200},intervalMs:60000,timeoutMs:5000,retries:0,
   probes:['local-a'],assignments:{'local-a':{runnerId:runner.runnerId,canaryUrl:'http://93.184.216.35:'+targetPort+'/canary'}},
   failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:true,service:'synthetic-uptime-ownership'});
  await runRunner({origin,key:runner.key,runnerId:runner.runnerId,localReview:true,once:true});
  const incidents=await native('/api/monitors/'+monitor.id+'/incidents');assert.equal(incidents.length,1);
  const id=incidents[0].id,path='/api/v1/incidents/'+encodeURIComponent(id),targetIdentity={kind:'incident',id};
  const confirmed=await native(path);assert.equal(confirmed.machineState,'open');
  assert.equal(confirmed.timeline[0].kind,'confirmation');assert.equal(confirmed.recovery,null);
  assert.ok((await db.prepare('SELECT COUNT(*) n FROM observations').first()).n>0,'signed scheduled evidence is populated');
  const paused=await native('/api/monitors/'+monitor.id,{...monitor.definition,enabled:false},'PATCH');
  assert.equal(paused.definition.enabled,false,'the owner stops the producer before mutation snapshots');
  // Populate independent root-cause work so assignment must preserve meaningful
  // unrelated incident fields as well as all monitoring and custody records.
  await native('/api/incidents/'+encodeURIComponent(id)+'/root-cause',{version:0,categoryId:null,text:'synthetic-uptime-5'},'PATCH');
  // Keep real queued notification custody and encrypted endpoint authority in
  // the preservation comparison. Reserving a native claim never starts a send.
  const destination=await native('/api/notifications/destinations',{
   name:'synthetic-uptime-7',kind:'webhook',url:'https://notifications.example.com/ownership',
  });
  const queued=await native('/api/notifications/destinations/'+destination.id+'/test',{});
  const notification=async body=>{
   const response=await fetch(origin+'/api/runner/notifications',{method:'POST',headers:{origin,'content-type':'application/json',
    'x-runner-id':runner.runnerId,'x-runner-key':runner.key},body:JSON.stringify(body)});
   assert.equal(response.status,200);return response.json();
  };
  await notification({operation:'poll'});
  assert.ok(await notification({operation:'claim',id:queued.deliveryId,reservation:randomUUID()}));
  const custody=await db.prepare('SELECT * FROM notification_claim_custody WHERE delivery_id=?').bind(queued.deliveryId).first();
  assert.ok(custody);assert.equal(custody.started_at,null,'the retained transport claim has never sent');
  assert.ok(await db.prepare('SELECT c.id FROM notification_credentials c JOIN notification_jobs j ON j.credential_id=c.id WHERE j.id=?').bind(queued.deliveryId).first(),
   'the queued notification retains actual endpoint credential custody');
  let current=await native(path);
  assert.equal(current.owner.id,sponsor.id);assert.equal(current.version,0);
  assert.ok(current.assignmentMembers.some(person=>person.id===member.id),'the independently invited responder is eligible');
  assert.equal((await native(path,undefined,'GET',memberCookie)).id,id,'the responder has native incident access');

  const surface={seed:'uptime',specialist:'monitoring-operator',tools:[{scope:'uptime:operate'}]};
  const c=createProtocol({fetch,origin,surface,signer:{privateKey:pair.privateKey,kid,issuer,installationId},
   person:{email:bindings.OWNER_EMAIL,cookie,sub},business,consent:randomUUID(),points:[],agentId:'synthetic-uptime-'+randomUUID(),
   seq:0,revision:0,listed:new Map()});
  const initial=await policyEnvelope(c,autonomousPolicy());
  assert.equal((await c.request('/api/rer/agent-policy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({policy:initial.policy})})).status,200);
  c.seq=initial.payload.seq;c.revision=initial.payload.revision;
  const listed=await c.mcp('tools/list');
  surface.tools=listed.result.tools.map(tool=>({name:tool.name,scope:tool._meta['com.runeditrun/scope'],classes:tool._meta['com.runeditrun/classes']}));
  const classes=[{class:'standard',facts:{measure:1}}],tool='uptime.incidents.assign';
  async function snapshot(){
   const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results;
   const state={},results=await db.batch(tables.map(({name})=>db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"')));
   for(const [index,{name}] of tables.entries())state[name]=results[index].results
    .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   return state;
  }
  function appended(before,after,name,count){
   const rows=after[name].filter(row=>!before[name].some(old=>isDeepStrictEqual(old,row)));
   assert.equal(rows.length,count,name+' appends exactly the intended rows');
   assert.deepEqual(after[name],before[name].concat(rows).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),name+' preserves every existing row');
   return rows;
  }
  function bookkeeping(before,after,answer,args,mode,outcome,original){
   const allowed=['agent_door_agents','agent_door_audit'];
   if(outcome==='done')allowed.push('incident_work','incident_timeline','uptime_audit','agent_door_calls','agent_door_usage','agent_door_events',...(mode==='review'?['agent_door_reviews']:[]));
   for(const name of Object.keys(before))if(!allowed.includes(name))assert.ok(isDeepStrictEqual(after[name],before[name]),name+' is unchanged');
   assert.deepEqual(Object.keys(after),Object.keys(before));
   assert.equal(after.agent_door_agents.length,1);
   const oldAgent=before.agent_door_agents[0],agent=after.agent_door_agents[0];
   assert.deepEqual({...agent,window:oldAgent.window,requests:oldAgent.requests},oldAgent,'only agent capacity counters change');
   assert.equal(agent.requests,agent.window===oldAgent.window?oldAgent.requests+1:1);
   const [record]=appended(before,after,'agent_door_audit',1),audit=JSON.parse(record.row);
   assert.equal(audit.tool,tool);assert.equal(audit.idempotency_key,args.idempotency_key);
   assert.equal(audit.outcome,outcome);assert.equal(audit.sponsor.id,sponsor.id);assert.equal(audit.agent.id,c.agentId);
   assert.deepEqual(audit.resource,targetIdentity);assert.equal(audit.revision,c.revision);
   assert.equal(audit.approval,null);assert.equal(audit.decision_id,null);
   if(outcome==='refused'){
    assert.equal(audit.code,'revision_conflict');assert.equal(audit.review,null);return;
   }
   assert.equal(audit.id,answer.decision.id);assert.deepEqual(audit.classes,classes);
   assert.deepEqual(audit.rules,[{class:'standard',rule:mode==='review'?'standard':'all',do:mode}]);
   assert.equal(audit.decision,mode);assert.equal(audit.code,null);
   if(outcome==='replayed'){
    assert.equal(audit.replay_of,original.decision.id);assert.equal(audit.operation_id,original.decision.id);
    assert.deepEqual(audit.review,original.result._meta['com.runeditrun/review']?{id:original.result._meta['com.runeditrun/review'].id,by:null}:null);return;
   }
   assert.equal(audit.replay_of,null);
   const [claim]=appended(before,after,'agent_door_calls',1);
   assert.equal(claim.key,args.idempotency_key);assert.equal(claim.agent,c.agentId);assert.equal(claim.decision_id,audit.id);assert.equal(claim.state,'done');
   const saved=JSON.parse(claim.outcome);assert.deepEqual(saved.result,answer.result.structuredContent);assert.equal(saved.outcome,'done');
   const [usage]=appended(before,after,'agent_door_usage',1);
   assert.equal(usage.decision_id,audit.id);assert.equal(usage.agent,c.agentId);assert.equal(usage.seed,'uptime');assert.deepEqual(JSON.parse(usage.classes),classes);
   const [eventRow]=appended(before,after,'agent_door_events',1),event=JSON.parse(eventRow.event);
   assert.equal(event.type,'incident.updated');assert.equal(event.uri,'uptime://incidents/'+id);assert.equal(event.version,args.version+1);
   assert.equal(event.actor.kind,'agent');assert.equal(event.actor.agent.id,c.agentId);assert.equal(event.actor.for.id,sponsor.id);
   if(mode==='review'){
    const [review]=appended(before,after,'agent_door_reviews',1),savedReview=JSON.parse(review.saved);
    assert.equal(review.state,'open');assert.equal(review.id,audit.review.id);assert.equal(review.marked_by,null);assert.equal(review.marked_at,null);
    assert.equal(savedReview.decision_id,audit.id);assert.equal(savedReview.tool,tool);assert.deepEqual(savedReview.classes,classes);
    assert.equal(savedReview.principal.agent.id,c.agentId);assert.equal(savedReview.principal.person.id,sponsor.id);
    assert.deepEqual(savedReview.summary.nativeTarget,targetIdentity);
   }else assert.equal(audit.review,null);
  }
  const providerBaseline=providerRequests.length;
  for(const [mode,policy] of [['autonomous',autonomousPolicy()],['review',heldPolicy()]]){
   await c.adopt(policy);
   // Two actual transfers per protocol: away from the independently read owner,
   // then back. Reusing that same owner would not prove reassignment.
   for(const version of ['2026-07-28','2025-11-25'])for(const ownerId of [member.id,sponsor.id]){
    const beforeDetail=await native(path);assert.notEqual(beforeDetail.owner.id,ownerId);
    const args={id,version:beforeDetail.version,owner_id:ownerId,idempotency_key:randomUUID()},before=await snapshot();
    const answer=await c.tool(tool,args,{version});
    assert.equal(answer.status,200);assert.equal(answer.result?.isError,false,'native ownership transfer completes');
    assert.equal(answer.decision.disposition,mode);assert.equal(answer.decision.revision,c.revision);
    assert.deepEqual(answer.decision.classes,[{...classes[0],rule:mode==='review'?'standard':'all',do:mode}],
     'assignment is exactly standard measure one, without destructive or live effects');
    assert.equal(answer.result._meta['com.runeditrun/approval'],undefined);assert.equal(answer.result.resultType,'complete');
    assert.deepEqual(answer.result.structuredContent,{id,version:beforeDetail.version+1});
    const after=await snapshot();bookkeeping(before,after,answer,args,mode,'done');
    assert.deepEqual(after.incident_work,before.incident_work.map(row=>({...row,owner_id:ownerId,version:row.version+1})),
     'assignment changes only the owner and one incident version');
    const [timeline]=appended(before,after,'incident_timeline',1),data=JSON.parse(timeline.data);
    assert.equal(timeline.incident_id,id);assert.equal(timeline.monitor_id,monitor.id);assert.equal(timeline.kind,'owner_assigned');
    assert.equal(timeline.actor_id,sponsor.id);assert.equal(data.ownerId,ownerId);
    assert.equal(data.preparedBy.agent.id,c.agentId);assert.equal(data.preparedBy.for.id,sponsor.id);assert.deepEqual(data.approvers,[]);
    const nativeAudits=appended(before,after,'uptime_audit',2);
    assert.deepEqual(nativeAudits.map(row=>row.action).sort(),['access_respond','incident_assign']);
    for(const audit of nativeAudits){assert.equal(audit.actor_ref,sponsor.id);assert.equal(audit.actor_kind,'operator')}
    current=await native(path);
    assert.equal(current.owner.id,ownerId);assert.equal(current.version,beforeDetail.version+1);
    const {owner:oldOwner,version:oldVersion,timeline:oldTimeline,...oldFacts}=beforeDetail;
    const {owner:newOwner,version:newVersion,timeline:newTimeline,...newFacts}=current;
    assert.deepEqual(newFacts,oldFacts,'machine state, acknowledgment, recovery and notification facts are unchanged');
    const assigned=current.timeline.find(entry=>entry.id===timeline.id);
    assert.equal(assigned.actor.kind,'agent');assert.equal(assigned.actor.agent.id,c.agentId);assert.equal(assigned.actor.sponsor.id,sponsor.id);
    assert.equal(assigned.data.owner.id,ownerId);
    const reviews=(await c.personJson('/agents/api/reviews')).reviews;
    const review=reviews.find(row=>row.decision_id===answer.decision.id);
    if(mode==='review'){
     assert.equal(review.state,'open');assert.equal(review.tool,tool);assert.deepEqual(review.classes,classes);
     assert.deepEqual(review.summary.nativeTarget,targetIdentity);
     assert.deepEqual(review.prepared_by,{agent:'Agent door conformance',for:'Ownership sponsor'});
    }else assert.equal(review,undefined,'autonomous assignments create no review');
    const replayBefore=await snapshot(),replay=await c.tool(tool,args,{version});
    assert.equal(replay.result?.isError,false);assert.deepEqual(replay.result.structuredContent,answer.result.structuredContent);
    bookkeeping(replayBefore,await snapshot(),replay,args,mode,'replayed',answer);
    assert.deepEqual(await native(path),current,'exact-key replay retains the first owner and timeline outcome');
    const staleArgs={...args,owner_id:beforeDetail.owner.id,idempotency_key:randomUUID()},staleBefore=await snapshot();
    const stale=await c.tool(tool,staleArgs,{version});
    assert.equal(errorCode(stale),'revision_conflict');assert.equal(stale.result.structuredContent,undefined);
    bookkeeping(staleBefore,await snapshot(),stale,staleArgs,mode,'refused');
    assert.deepEqual(await native(path),current,'a stale version cannot overwrite the actual native owner');
    assert.equal(providerRequests.length,providerBaseline,'assignment, replay and refusal make zero provider requests');
   }
   console.log('PROBE SURFACE-006 acceptance-2-'+mode+': both MCP protocols transfer native ownership away and back -> standard measure 1, current rule, one version, no approval'+(mode==='review'?', attributed native review':', no review'));
   console.log('PROBE SURFACE-006 acceptance-3-'+mode+': paused incident producer, assignment and exact-key replay -> no live class, no second ownership or timeline effect, stale refusal, all other durable state preserved, zero provider traffic');
  }
  const durable=await snapshot();await worker.dispose();worker=null;
  ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings,outboundService}));db=await worker.getD1Database('DB');
  assert.deepEqual(await native(path),current,'the actual owner and version survive Worker restart');
  assert.deepEqual(await snapshot(),durable,'restart preserves the complete durable record comparison');
  assert.equal(providerRequests.length,providerBaseline);
  assert.ok(c.points.every(point=>point.ok),'policy adoption checks pass');
  console.log('PASS SURFACE-006 bounded native ownership reassignment and assignment-only absence of live effects');
 } finally {
  http.request=originalRequest;
  await worker?.dispose();target.closeAllConnections();await new Promise(resolve=>target.close(resolve));
  await cleanupDirectory(directory);
 }
}
