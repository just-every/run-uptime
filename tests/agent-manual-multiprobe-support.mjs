import assert from 'node:assert/strict';
import https from 'node:https';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {certificates,socketEdge} from './tls-auth-support.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
import {nativeHttp,freshFactor} from './agent-conformance/http.mjs';
import {autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';
import {relaySnapshotGuard} from './agent-relay-state-support.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// Intended admission writes: adopted policy and request counters, audit rows,
// idempotent call outcomes, approvals, reviews, emitted events, usage and rate
// limits. Native writes are restricted separately to one slot and its custody;
// the relay guard checks membership and preserves unrelated decision rows.
const bookkeeping=new Set(['agent_door_state','agent_door_agents','agent_door_audit',
 'agent_door_calls','agent_door_approvals','agent_door_reviews','agent_door_events',
 'agent_door_usage','public_rate_limits']);
const classes=answer=>answer.decision.classes.map(({class:kind,facts})=>({class:kind,facts}));
const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));

// Independent saved-definition fixture for the two-probe boundary. Only the
// DNS, TLS and target socket edges are controlled; native owner writes and
// production runner execution with signed intake establish the saved evidence.
export async function proveManualMultiProbe({c,db,origin,cookie,proof,providerRequests}){
 const http=nativeHttp({request:fetch,origin,cookie}),owner=await http.json('/api/access/self');
 assert.equal(owner.role,'owner');
 await freshFactor({request:fetch,origin,cookie});
 const directory=await mkdtemp(join(tmpdir(),'uptime-multiprobe-'));
 let server,restore;
 try{
  const certs=await certificates(directory),calls=[];let cleanupCalls=0;
  server=https.createServer(certs.server,(request,response)=>{
   calls.push(request.method+' '+request.url);
   if(request.url==='/cleanup'&&++cleanupCalls===1){response.writeHead(403,{'content-type':'application/json'});response.end(JSON.stringify({refused:true}));return}
   response.setHeader('content-type','application/json');
   response.statusCode=request.method==='POST'?201:200;
   response.end(JSON.stringify({ready:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,url=path=>`https://auth.example.test:${port}${path}`;
  restore=socketEdge(port,certs.ca);
  const create=async name=>{
   const runners=[];
   for(const probe of ['local-a','local-b']){
    const runner=await http.json('/api/runners',{networkLabel:'synthetic-uptime-multiprobe-'+randomUUID()});
    const signed=async(path,body,enrollment=false)=>{
     const at=String(Date.now()),raw=JSON.stringify(body);
     return http.json(path,body,{headers:{'x-runner-key':runner.key,'x-runner-id':runner.runnerId,
      'x-sent-at':at,'x-runner-signature':createHmac('sha256',runner.key).update(at+'.'+(enrollment?'runner-enrolment.':'')+raw).digest('hex')}});
    };
    await signed('/api/runner/enroll',{version:1},true);
    runners.push({probe,runner,signed});
   }
   const monitor=await http.json('/api/monitors',{
    name:'synthetic-uptime-multiprobe-'+name,type:'api',network:'public',url:url('/setup'),
    api:{variables:{},steps:[
     {name:'Create synthetic fixture',phase:'setup',url:url('/setup'),method:'POST',assertions:{status:201}},
     {name:'Read synthetic fixture',phase:'request',url:url('/fixture'),method:'GET',assertions:{status:200}},
     {name:'Remove synthetic fixture',phase:'cleanup',url:url('/cleanup'),method:'DELETE',assertions:{status:200}},
    ]},intervalMs:86400000,timeoutMs:10000,retries:0,probes:runners.map(({probe})=>probe),
    assignments:Object.fromEntries(runners.map(({probe,runner})=>[probe,{runnerId:runner.runnerId,canaryUrl:`https://token.example.test:${port}/canary`}])),
    failureQuorum:1,confirmSlots:2,recoverSlots:1,freshnessMs:86400000,enabled:true,
   });
   return {monitor,runners};
  };
  const high=await create('boundary'),{monitor}=high;
  let slotId;
  for(const [index,{probe,runner,signed}] of high.runners.entries()){
   const {task}=await http.json('/api/runner/claim',{}, {headers:{'x-runner-key':runner.key,'x-runner-id':runner.runnerId}});
   assert.equal(task?.monitorId,monitor.id);assert.deepEqual(task.probes,[probe]);
   assert.equal((await db.prepare('SELECT manual FROM slots WHERE id=?').bind(task.id).first()).manual,0);
   if(index===0)slotId=task.id;else assert.equal(task.id,slotId,'both enrolled runners complete their own part of the same scheduled slot');
   const result=await executeTaskProbe(task,probe,{}),outcome=index===0?'target_failure':'pass';
   assert.equal(result.outcome,outcome);assert.equal(result.apiTransaction.cleanup.failed,index===0?1:0);
   const cleanup=result.apiTransaction.steps.find(step=>step.phase==='cleanup');
   assert.equal(cleanup.attempts,1);assert.equal(cleanup.status,index===0?403:200);
   assert.deepEqual(result.apiTransaction.steps.map(step=>[step.phase,step.outcome]),[
    ['setup','pass'],['request','pass'],['cleanup',outcome],
   ]);
   const canary=await executeTaskProbe({...task,definition:{...task.definition,type:'http',api:undefined,
    url:task.definition.assignments[probe].canaryUrl,request:undefined,assertions:{status:200}}},probe,{statusOnly:true});
   assert.equal(canary.outcome,'pass');
   assert.equal((await signed('/api/runner/results',{slotId:task.id,attempts:[{...result,attempt:0,canary:{...canary,attempt:0}}]})).accepted,true);
  }
  assert.deepEqual(calls,['POST /setup','GET /fixture','DELETE /cleanup','GET /canary',
   'POST /setup','GET /fixture','DELETE /cleanup','GET /canary'],'each probe runs one cleanup with no retry');
  const low=await create('below-boundary');
  const debts=id=>http.json('/api/monitors/'+id+'/cleanup-debt');
  for(const fixture of [high,low]){
   const saved=(await http.json('/api/monitors/'+fixture.monitor.id+'/revisions')).find(row=>row.revision===fixture.monitor.revision);
   assert.equal(saved.definition.enabled,true);assert.equal(saved.definition.type,'api');
   assert.deepEqual(saved.definition.probes,['local-a','local-b']);assert.equal(saved.definition.retries,0);
   assert.equal(saved.definition.api.steps.filter(step=>step.phase==='setup').length,1);
   assert.deepEqual(saved.definition.api.steps.filter(step=>step.phase==='cleanup').map(step=>step.url),[url('/cleanup')]);
   fixture.saved=saved.definition;
  }
  const open=await debts(monitor.id),stored=(await db.prepare("SELECT * FROM cleanup_debt WHERE monitor_id=? AND state='open'").bind(monitor.id).all()).results;
  assert.equal(open.limit,3);assert.equal(open.open.length,1);assert.equal(stored.length,1);
  assert.equal(open.open[0].id,stored[0].id);assert.equal(stored[0].slot_id,slotId);
  assert.equal(stored[0].step_name,'Remove synthetic fixture');assert.equal(stored[0].probe,'local-a');assert.equal(stored[0].attempt,0);
  assert.equal((await debts(low.monitor.id)).open.length,0);
  const observation=await db.prepare('SELECT * FROM observations WHERE id=?').bind(stored[0].observation_id).first();
  assert.ok(observation,'one open debt refers to retained signed production evidence');

  const checkRelay=relaySnapshotGuard(c.business);
  const snapshot=async()=>{
   const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results.map(row=>row.name);
   const rows=await db.batch(tables.map(name=>db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"')));
   const state=Object.fromEntries(tables.map((name,index)=>[name,ordered(rows[index].results)]));
   checkRelay(state);
   return Object.fromEntries(Object.entries(state).filter(([name])=>!bookkeeping.has(name)&&name!=='agent_door_relay'));
  };
  const unchanged=(before,after,label)=>{
   assert.deepEqual(Object.keys(after),Object.keys(before));
   for(const table of Object.keys(before))assert.ok(isDeepStrictEqual(after[table],before[table]),label+': '+table+' unchanged');
  };
  const scheduled=async()=>({
   monitors:(await db.prepare('SELECT * FROM monitors ORDER BY id').all()).results,
   slots:(await db.prepare('SELECT * FROM slots WHERE manual=0 ORDER BY id').all()).results,
   observations:(await db.prepare('SELECT * FROM observations ORDER BY id').all()).results,
   high:await http.json('/api/monitors/'+monitor.id+'/incidents'),
  });
  const baseline=await scheduled(),traffic=structuredClone(providerRequests),wire=[...calls],mail=allDeliveredMessages().length;
  const noTraffic=()=>{
   assert.deepEqual(providerRequests,traffic,'agent admission sends no Worker provider request');
   assert.deepEqual(calls,wire,'agent admission never executes a target fixture');
   assert.equal(allDeliveredMessages().length,mail,'agent admission sends no mail');
  };
  const external=[{class:'external',facts:{measure:2,counterparty:'public'}}];
  const live=[...external,{class:'live',facts:{measure:1,service:'monitor:'+monitor.id}}];
  const args=fixture=>({id:fixture.monitor.id,version:fixture.monitor.revision,idempotency_key:randomUUID()});
  async function oneSlot(before,fixture,answer,approvers){
   assert.equal(answer.result?.isError,false,errorCode(answer));
   const content=answer.result.structuredContent;assert.equal(content.queued,true);assert.equal(content.policyAdvanced,false);
   const after=await snapshot(),id=content.slotId;
   const expected=structuredClone(before);
   const slot=after.slots.find(row=>row.id===id),custody=after.uptime_agent_manual.find(row=>row.slot_id===id);
   assert.ok(slot);assert.ok(custody);
   assert.equal(slot.monitor_id,fixture.monitor.id);assert.equal(slot.revision,fixture.monitor.revision);
   assert.equal(slot.manual,1);assert.equal(slot.status,'queued');assert.equal(slot.lease_owner,'unclaimed');assert.equal(slot.lease_until,0);
   assert.deepEqual(JSON.parse(slot.definition),fixture.saved);
   const principal=JSON.parse(custody.principal);
   assert.equal(principal.person.id,owner.id);assert.equal(principal.agent.id,c.agentId);
   assert.deepEqual(principal.approvers.map(person=>person.id),approvers);
   expected.slots=ordered([...expected.slots,slot]);expected.uptime_agent_manual=ordered([...expected.uptime_agent_manual,custody]);
   unchanged(expected,after,'one queued manual slot and its originating custody are the only native effects');
   noTraffic();return after;
  }
  async function pendingApproval(answer,version,fixture,summary){
   assert.equal(answer.decision.disposition,'approval');assert.equal(answer.result.structuredContent,undefined);
   if(version==='2025-11-25'){
    assert.equal(answer.result.resultType,'complete');assert.equal(errorCode(answer),'approval_required');
   }else assert.equal(answer.result.resultType,'input_required');
   const handle=answer.result._meta['com.runeditrun/approval']??answer.result._meta['com.runeditrun/error'].approval;
   const path='/agents/api/approvals/'+encodeURIComponent(handle.id),view=(await c.personJson(path)).approval;
   assert.equal(view.state,'pending');assert.equal(view.tool,'uptime.checks.run');
   const saved=JSON.parse((await db.prepare('SELECT saved FROM agent_door_approvals WHERE id=?').bind(handle.id).first()).saved);
   assert.deepEqual(saved.summary,view.summary);assert.equal(saved.summary_sha256,view.summary_sha256);
   assert.equal(saved.revision,view.revision);assert.equal(view.decision_id,answer.decision.id);
   assert.equal(view.summary.target.name,fixture.saved.name);assert.deepEqual(view.summary.nativeTarget,{kind:'monitor',id:fixture.monitor.id});
   assert.ok(view.summary.items.includes(summary));
   if(fixture===high){
    assert.ok(view.summary.items.includes('Open cleanup debt evidence: '+stored[0].id+'.'));
    assert.ok(view.summary.items.includes('This check can make the next scheduled run refuse setup.'));
   }
   return {path,view};
  }
  let captured=false;
  for(const [policyName,makePolicy] of [['autonomous',autonomousPolicy],['held',heldPolicy]])for(const version of ['2026-07-28','2025-11-25']){
   const invoke=input=>c.tool('uptime.checks.run',input,{version});
   // Keep each standard policy's treatment of the external check itself.
   // The explicit selective and blocked counterparts below isolate live.
   await c.adopt(makePolicy());
   for(const fixture of [high,low]){
    const input=args(fixture),before=await snapshot(),answer=await invoke(input);
    assert.deepEqual(classes(answer),fixture===high?live:external);
    assert.equal(answer.decision.disposition,policyName==='held'?'approval':'autonomous');
    if(policyName==='held'){
     const {path,view}=await pendingApproval(answer,version,fixture,fixture===high?
      'Cleanup debt: 1 open + 2 possible = 3; setup refusal limit: 3.':'Cleanup debt: 0 open + 2 possible = 2; setup refusal limit: 3.');
     unchanged(before,await snapshot(),'held policy waits without a slot');
     const approved=await c.personRequest(path+'/approve',{method:'POST',body:JSON.stringify({revision:view.revision,summary_sha256:view.summary_sha256})});
     assert.equal(approved.status,200);assert.equal((await approved.json()).approval.state,'executed');
    }
    const completed=policyName==='held'?await invoke(input):answer;
    const after=await oneSlot(before,fixture,completed,policyName==='held'?[owner.id]:[]);
    const replay=await invoke(input);assert.deepEqual(replay.result.structuredContent,completed.result.structuredContent);
    unchanged(after,await snapshot(),'exact-key replay');noTraffic();
   }
   const selective=makePolicy();selective.rules.push(
    {id:'external-allowed',class:'external',do:'autonomous'},
    {id:'live-person',class:'live',do:'approval',approver:['person:'+c.person.sub],wait:'PT1H'});
   await c.adopt(selective);
   const input=args(high),before=await snapshot(),pending=await invoke(input);
   assert.deepEqual(classes(pending),live);
   const {path,view}=await pendingApproval(pending,version,high,'Cleanup debt: 1 open + 2 possible = 3; setup refusal limit: 3.');
   unchanged(before,await snapshot(),'selective live approval has no manual slot');noTraffic();
   assert.deepEqual(view.approvers,['person:'+c.person.sub]);assert.deepEqual(view.approvals,[]);
   const wrongSummary=await c.personRequest(path+'/approve',{method:'POST',body:JSON.stringify({revision:view.revision,summary_sha256:'0'.repeat(64)})});
   assert.equal(wrongSummary.status,409,'a different summary cannot release the saved check');
   assert.deepEqual((await c.personJson(path)).approval,view);
   unchanged(before,await snapshot(),'wrong summary approval leaves every native row unchanged');noTraffic();
   if(!captured){await proof.capture('manual-multiprobe-approval',new URL(pending.result._meta['com.runeditrun/approval'].url).pathname);captured=true}
   const approved=await c.personRequest(path+'/approve',{method:'POST',body:JSON.stringify({revision:view.revision,summary_sha256:view.summary_sha256})});
   assert.equal(approved.status,200);const executed=(await approved.json()).approval;
   assert.equal(executed.state,'executed');assert.deepEqual(executed.summary,view.summary);
   assert.equal(executed.summary_sha256,view.summary_sha256);assert.equal(executed.revision,view.revision);
   assert.deepEqual(executed.approvals.map(person=>({person:person.person,ref:person.ref})),[{person:owner.id,ref:'person:'+c.person.sub}]);
   const completed=await invoke(input),after=await oneSlot(before,high,completed,[owner.id]);
   const replay=await invoke(input);assert.deepEqual(replay.result.structuredContent,completed.result.structuredContent);
   unchanged(after,await snapshot(),'approved replay is effect free');noTraffic();
   const {rows,differs}=await auditRows(c);assert.equal(differs,0);
   const execution=rows.findLast(row=>row.decision_id===pending.decision.id&&row.outcome==='done');
   assert.ok(execution);assert.deepEqual(execution.approval.by,[owner.id]);assert.deepEqual(execution.classes,live);
   for(const blocked of [false,true]){
    if(blocked){const document=makePolicy();document.rules.push({id:'external-allowed',class:'external',do:'autonomous'},{id:'live-blocked',class:'live',do:'blocked'});await c.adopt(document)}
    if(blocked){
     const state=await snapshot(),refused=await invoke(args(high));
     assert.equal(errorCode(refused),'policy_blocked');assert.deepEqual(classes(refused),live);
     assert.equal(refused.result.structuredContent,undefined);assert.equal(refused.result._meta['com.runeditrun/approval'],undefined);
     unchanged(state,await snapshot(),'blocked live request');noTraffic();
    }
    const lowBefore=await snapshot(),lowArgs=args(low),below=await invoke(lowArgs);
    assert.equal(below.decision.disposition,'autonomous');assert.deepEqual(classes(below),external);
    assert.equal(below.result._meta['com.runeditrun/approval'],undefined);
    const lowAfter=await oneSlot(lowBefore,low,below,[]);
    assert.deepEqual((await invoke(lowArgs)).result.structuredContent,below.result.structuredContent);
    unchanged(lowAfter,await snapshot(),'below-boundary replay');noTraffic();
   }
   assert.deepEqual(await scheduled(),baseline,'all scheduled health, cadence and signed evidence remain exact');
   console.log(`PROBE SURFACE-006 4-multiprobe ${policyName} ${version}: saved two-probe one-cleanup API with one signed open debt -> 1 + 2 = 3, named live approval with no slot, native person approval queues exactly one undispatched slot, replay has no effect; live-blocked refuses; zero-open counterpart stays external under selective and blocked policies; unrelated durable state and all traffic unchanged`);
  }
  assert.deepEqual(await debts(monitor.id),open,'no manual slot was dispatched and no debt was resolved');
  assert.equal((await debts(low.monitor.id)).open.length,0);
  noTraffic();
  console.log('PASS SURFACE-006 independent two-probe cleanup boundary through native owner, signed production runner, both policies and both MCP protocols');
 }finally{
  restore?.();if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
  await rm(directory,{recursive:true,force:true});await c.adopt(autonomousPolicy());
 }
}
