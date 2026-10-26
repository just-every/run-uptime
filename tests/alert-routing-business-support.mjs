import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {main as routingCommand} from '../scripts/routing.mjs';
import assert from 'node:assert/strict';
import {fixture} from './resilience/support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';

// R2 through the saved route/sample doors and real confirmation/transport.
// Future DST instants are explicit public preview inputs, never a replaced clock.
export async function proveRoutingBusinessHours(){
 const f=await fixture(),sent=[];let replacement,release,pending;
 try{
  const ok=async(path,body,options={})=>{const r=await f.request(path,{...options,...(body===undefined?{}:{body})});assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
  const good=await ok('/api/notifications/destinations',{name:'Synthetic business receiver',kind:'webhook',url:'https://business-route.example.com/good'});
  const bad=await ok('/api/notifications/destinations',{name:'Synthetic business primary',kind:'webhook',url:'https://business-route.example.com/bad'});
  const m=await f.monitor({name:'Synthetic weekly route',enabled:false,runners:[f.first],canary:true,environment:'production'}),route=id=>`/api/monitors/${id}/alert-route`;
  const save=async(m,businessHours,{ids=[good.id],fallback={destinationIds:[],deadlineSeconds:120},consoleShape=false}={})=>{
   const current=await ok(route(m.id)),input={scope:'monitor',mode:'selected',destinationIds:ids,contactSettings:{},fallback,expectedRevision:current.policies[0].revision,...(consoleShape?{}:{businessHours})};
   const preview=await ok(route(m.id)+'/preview',input);return ok(route(m.id)+'/apply',{...input,digest:preview.digest});
  };
  const sample=async(policy,rows)=>{
   await save(m,policy);
   for(const [at,inside] of rows){
    const result=await ok(route(m.id)+'/sample',{kind:'trigger',regions:['local-a'],at:Date.parse(at)}),recipient=result.recipients.find(r=>r.id===good.id),selected=policy.selection==='always'||(policy.selection==='inside'?inside:!inside);
    assert.equal(recipient.eligible,selected,`${policy.selection} at ${at}`);assert.equal(recipient.reason,selected?'ready':'filter_business_hours');
   }
  };
  const week={timeZone:'America/New_York',weekdays:[1,2,3,4,5],start:'09:00',end:'17:00'};
  const sides=[['2026-10-30T12:59:00Z',false],['2026-10-30T13:00:00Z',true],['2026-10-30T21:00:00Z',false],['2026-11-02T13:59:00Z',false],['2026-11-02T14:00:00Z',true],['2026-11-02T22:00:00Z',false],['2026-11-01T15:00:00Z',false]];
  for(const selection of ['inside','outside','always'])await sample({...week,selection},sides);
  await sample({timeZone:'America/New_York',weekdays:[0],start:'01:00',end:'01:30',selection:'inside'},[['2026-11-01T05:15:00Z',true],['2026-11-01T05:45:00Z',false],['2026-11-01T06:15:00Z',true],['2026-11-01T06:45:00Z',false]]);
  await sample({timeZone:'America/New_York',weekdays:[5],start:'22:00',end:'02:00',selection:'inside'},[['2026-10-31T05:00:00Z',true],['2026-11-01T05:00:00Z',false]]);
  const preserved=(await ok(route(m.id))).effective.businessHours;await save(m,null,{consoleShape:true});
  assert.deepEqual((await ok(route(m.id))).effective.businessHours,preserved,'the console-shaped save preserves unspecified business fields');
  const inputFile=join(f.directory,'business-route.json'),cliInput={scope:'monitor',mode:'selected',destinationIds:[good.id],contactSettings:{},businessHours:preserved,expectedRevision:(await ok(route(m.id))).effective.revision};
  await writeFile(inputFile,JSON.stringify(cliInput),{mode:0o600});const cliArgs=['--origin',f.origin,'--monitor',m.id],cliEnv={UPTIME_ACCESS_COOKIE:f.cookie};
  const cliPreview=await routingCommand(['preview',...cliArgs,'--input',inputFile],cliEnv);await writeFile(inputFile,JSON.stringify({...cliInput,digest:cliPreview.digest}),{mode:0o600});await routingCommand(['apply',...cliArgs,'--input',inputFile],cliEnv);
  assert.deepEqual((await routingCommand(['route',...cliArgs],cliEnv)).effective.businessHours,preserved,'the routing CLI configures and reads the weekly window');
  const namedTarget=await f.monitor({name:'Synthetic business named target',enabled:false,runners:[f.first],canary:true,environment:'production'}),previousBusiness={...week,selection:'outside'};await save(namedTarget,previousBusiness);
  const cli=async(command,input)=>{await writeFile(inputFile,JSON.stringify(input),{mode:0o600});return routingCommand([command,'--origin',f.origin,'--input',inputFile],cliEnv)};
  const named=await cli('name-route',{name:'Synthetic weekly named route',monitorId:m.id}),batch={routeId:named.id,monitorIds:[namedTarget.id]},batchPreview=await cli('preview-batch',batch),applied=await cli('apply-batch',{...batch,digest:batchPreview.digest});
  assert.deepEqual((await ok(route(namedTarget.id))).effective.businessHours,preserved,'named assignment carries weekly fields');await cli('undo-batch',{batchId:applied.batchId});
  assert.deepEqual((await ok(route(namedTarget.id))).effective.businessHours,previousBusiness,'undo restores the prior weekly fields');
  const revision=(await ok(route(m.id))).effective.revision;
  for(const change of [{weekdays:[1,1]},{selection:'holiday'},{timeZone:'not-a-zone'}])assert.equal((await f.request(route(m.id)+'/preview',{body:{scope:'monitor',mode:'selected',destinationIds:[good.id],expectedRevision:revision,businessHours:{...week,selection:'inside',...change}}})).status,400);

  // A current, real confirmed outage selects inside a US window. Its fallback
  // is already reserved when the route changes and the Worker restarts.
  const clock=at=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at),now=Date.now();
  const live={timeZone:'America/New_York',weekdays:[0,1,2,3,4,5,6],start:clock(now-3600000),end:clock(now+3600000),selection:'inside'};
  const liveMonitor=await f.monitor({name:'Synthetic real business alert',enabled:false,runners:[f.first],canary:true,environment:'production'});
  await save(liveMonitor,live,{ids:[bad.id],fallback:{destinationIds:[good.id],deadlineSeconds:5}});
  await ok('/api/monitors/'+liveMonitor.id,{...liveMonitor.definition,enabled:true},{method:'PATCH'});
  const task=await f.claim(f.first);assert.equal(task.monitorId,liveMonitor.id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
  let enter;const entered=new Promise(resolve=>enter=resolve),held=new Promise(resolve=>release=resolve);
  const transport={async send(wire,beforeRequest){if(wire.url.endsWith('/good')){enter();await held}await beforeRequest();sent.push(JSON.parse(wire.body));return {status:wire.url.endsWith('/bad')?400:202,headers:{},body:''}}};
  const rpc=async(_path,body)=>ok('/api/runner/notifications',body,{runner:f.first}),dispatch=()=>dispatchNotifications(rpc,transport),deliveries=async id=>(await ok('/api/notifications')).deliveries.filter(j=>j.event.monitorId===id);
  await dispatch();pending=dispatch();await Promise.race([entered,pending.then(()=>{throw Error('The fallback did not reach its transport boundary')})]);
  const before=await deliveries(liveMonitor.id),fallback=before.find(j=>j.destinationId===good.id),primary=before.find(j=>j.destinationId===bad.id);
  assert.equal(primary.businessHours.selected,true);assert.equal(fallback.businessHours.selected,true);assert.equal(primary.businessHours.at,fallback.businessHours.at);assert.equal(fallback.state,'sending');
  await save(liveMonitor,{...live,selection:'outside'},{ids:[bad.id],fallback:{destinationIds:[good.id],deadlineSeconds:5}});
  await f.worker.dispose();replacement=await startLocalWorker({persist:f.directory,port:Number(new URL(f.origin).port),bindings:f.bindings});f.DB=await replacement.getD1Database('DB');
  release();await pending;pending=null;
  const after=await deliveries(liveMonitor.id),accepted=after.find(j=>j.destinationId===good.id);
  assert.equal(accepted.state,'accepted');assert.deepEqual(accepted.businessHours,fallback.businessHours,'fallback retains the selected confirmation policy/result across restart and route edits');
  await dispatch();assert.equal(sent.filter(e=>e.monitorId===liveMonitor.id&&e.fallbackContext).length,1);
  await f.pause(liveMonitor);
  const excluded=await f.monitor({name:'Synthetic excluded business alert',enabled:false,runners:[f.first],canary:true,environment:'production'});
  await save(excluded,{...live,selection:'outside'});
  await ok('/api/monitors/'+excluded.id,{...excluded.definition,enabled:true},{method:'PATCH'});
  const excludedTask=await f.claim(f.first);assert.equal(excludedTask.monitorId,excluded.id);assert.equal((await f.submit(f.first,excludedTask,[await f.evidence(excludedTask)])).status,200);
  await dispatch();const [refused]=await deliveries(excluded.id);assert.equal(refused.state,'rejected');assert.equal(refused.code,'filter_business_hours');assert.equal(refused.businessHours.selected,false);assert.equal(refused.attempts,0);
  assert.equal(sent.filter(e=>e.monitorId===excluded.id).length,0);await f.pause(excluded);
  const archive=await ok('/api/archive');for(const table of ['alert_routes','alert_contact_schedules','alert_fallback_chains'])assert.equal(Object.hasOwn(archive.payload.productTables,table),false);
  assert.equal((await ok(route(liveMonitor.id))).portability.reason,'route_policy_installation_local');
  const survived=(await ok(route(m.id)+'/sample',{kind:'trigger',regions:['local-a'],at:Date.parse('2026-10-31T05:00:00Z')})).recipients.find(r=>r.id===good.id);assert.equal(survived.eligible,true,'weekly preview remains DST-safe after restart');
  console.log('ROUTING-001 R2 passed: weekly US-zone inside/outside/always API previews on both sides of DST and both repeated-hour copies, overnight weekdays, console-shaped preservation, real selected/excluded outage sends and snapshotted fallback authority across route edit/restart. DST instants are preview proof, not future real alert sends.');
 }finally{release?.();try{await pending}finally{await replacement?.dispose();await f.close()}}
}
