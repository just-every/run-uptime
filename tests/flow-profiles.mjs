// FLOW-004 through the migrated Worker and real production runner. A profile is
// one monitor, so another engine's pass cannot clear a mobile-only outage.
import {flowProfilesBrowser,flowMissingBrowser} from './flow-profiles-browser.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {readdir} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {testAuthBindings} from './auth-test-support.mjs';
import {availablePorts,cleanupDirectory,migratedWorker,ownerAPI,root,runtimeDirectory,waitFor} from './notify-acceptance-runtime.mjs';
import {startFlowFixture} from './flow-fixture.mjs';
import {FLOW_BROWSERS} from '../src/domain/flow-profile.mjs';

const directory=await runtimeDirectory(),[port,fixturePort]=await availablePorts(2),origin=`http://127.0.0.1:${port}`;
const grantPath=join(directory,'grant.json'),flowDir=join(directory,'flows');
const bindings={...testAuthBindings,UPTIME_SYNTHETIC_PORT:String(fixturePort),MAIL_PROVIDER:'development'};
const owner=ownerAPI(origin);let worker,fixture;const children=[],runnerKeys=[];
const stop=async()=>{for(const child of children.splice(0))if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit')}};
const start=(engines=FLOW_BROWSERS)=>{
 for(const [key,id] of runnerKeys)children.push(spawn(process.execPath,[join(root,'runners/src/private-runner.mjs')],{cwd:root,stdio:['ignore','ignore','ignore'],env:{...process.env,
  UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,...(id?{UPTIME_RUNNER_ID:id}:{}),UPTIME_GRANT_FILE:grantPath,UPTIME_LOCAL_REVIEW:'true',UPTIME_FLOW_DIR:flowDir,UPTIME_RUNNER_BROWSERS:engines.join(',')}}));
};
try{
 ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings}));
 fixture=await startFlowFixture({port:fixturePort,grantPath});await owner.signIn(bindings);
 const {api}=owner,ok=async(path,method='GET',value)=>{const response=await api(path,method,value);assert.ok(response.status>=200&&response.status<300,`${path}: ${response.status}`);return response.data};
 const second=await ok('/api/runners','POST',{networkLabel:'independent-profile-network'});
 runnerKeys.push([bindings.UPTIME_RUNNER_KEY,undefined],[second.key,second.runnerId]);
 // Each browser/device monitor retains two independent assigned vantages.
 const create=async(browser,device='desktop',path='browser-checkout')=>{
  const url=`${fixture.origin}/s/transport-policy/${path}`;
  return ok('/api/monitors','POST',{name:`Checkout ${browser} ${device}`,type:'flow',network:'synthetic',url,probes:['local-a','local-b'],intervalMs:300000,timeoutMs:20000,retries:0,confirmSlots:1,recoverSlots:1,
   flow:{browser,device,intent:'Confirm checkout in this browser and device',steps:[{kind:'goto',url}],outcomes:[{id:'confirmed',what:'text',value:'Order confirmed'},...(path==='browser-checkout'?[{id:'transport-policy',what:'text',value:'Direct transports disabled'}]:[])]}});
 };
 const monitors=[];for(const browser of FLOW_BROWSERS)monitors.push(await create(browser));
 const mobile=await create('chromium','mobile');
 start();
 const slots=async id=>ok(`/api/monitors/${id}/history`),observations=async id=>(await slots(id)).flatMap(slot=>slot.observations);
 const latest=async id=>{const items=await observations(id);return items.at(0)};
 for(const monitor of [...monitors,mobile])await waitFor(async()=>(await observations(monitor.id)).length>=2,'the selected browser profile completed',120000);
 const overview=await ok('/api/overview');
 for(const monitor of monitors){
  const result=await latest(monitor.id);assert.equal(result.outcome,'pass',`${monitor.definition.flow.browser} must execute the real checkout: ${JSON.stringify({checks:result.checks,failure:result.flow?.failure,trace:result.flow?.trace})}`);
  assert.ok(result.flow.bytes>0,`${monitor.definition.flow.browser} must return bounded proxy-counted response bytes: ${JSON.stringify(result.flow)}`);assert.equal(result.flow.profile.browser,monitor.definition.flow.browser);assert.equal(result.flow.profile.device,'desktop');
  assert.equal(overview.monitors.find(m=>m.id===monitor.id).state.state,'Healthy');
 }
 const mobileResult=await latest(mobile.id);assert.equal(mobileResult.outcome,'target_failure');assert.equal(mobileResult.flow.failure.reason,'outcome_missing');
 assert.deepEqual(mobileResult.flow.profile,{browser:'chromium',device:'mobile',viewport:{width:390,height:844}});
 assert.equal(overview.monitors.find(m=>m.id===mobile.id).state.state,'Failing','desktop passes cannot hide a mobile-only defect');
 const capabilities=overview.runner.runners.find(r=>!r.hosted).capabilities.browsers;
 assert.ok(FLOW_BROWSERS.every(engine=>capabilities[engine]===true),'enrollment advertises every engine that actually launched');
 const immutableSlot=(await slots(monitors[0].id))[0],forged=structuredClone(immutableSlot.observations.find(result=>result.probe==='local-a'));
 forged.flow.profile.device='mobile';forged.flow.profile.viewport={width:390,height:844};
 const body=JSON.stringify({slotId:immutableSlot.id,attempts:[forged]}),timestamp=String(Date.now());
 const rejection=await fetch(origin+'/api/runner/results',{method:'POST',headers:{'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY,'x-sent-at':timestamp,'x-runner-signature':createHmac('sha256',bindings.UPTIME_RUNNER_KEY).update(`${timestamp}.${body}`).digest('hex')},body});
 assert.equal(rejection.status,400,'signed evidence cannot claim another profile for the retained revision');
 assert.deepEqual((await slots(monitors[0].id))[0].observations,immutableSlot.observations,'a contradictory signed result changes no observation');

 for(const monitor of [...monitors,mobile]){
  const report=await ok(`/api/v1/monitors/${monitor.id}/report?period=24h`);
  assert.ok(report.flowProfiles.some(segment=>segment.profile.browser===monitor.definition.flow.browser&&segment.profile.device===monitor.definition.flow.device));
  assert.equal((await api(`/api/v1/monitors/${monitor.id}/report?period=24h&format=csv`)).status,200);
 }
 await stop();await flowProfilesBrowser({origin,monitors,mobile,directory});start();
 // Each engine must send even a metadata subresource through the filtering
 // proxy. Manual results prove execution without changing scheduled health.
 for(const monitor of monitors){
  const url=`${fixture.origin}/s/transport-policy/browser-metadata`;
  const revised=await ok(`/api/monitors/${monitor.id}`,'PATCH',{...monitor.definition,url,flow:{...monitor.definition.flow,steps:[{kind:'goto',url}],outcomes:[{id:'confirmed',what:'text',value:'Order confirmed'}]}});
  await ok(`/api/monitors/${monitor.id}/run`,'POST',{});
  const result=await waitFor(async()=>{const records=await slots(monitor.id);return records.find(slot=>slot.manual&&slot.revision===revised.revision&&slot.observations.length)?.observations[0]},'the engine refused a metadata subresource',60000);
  assert.equal(result.outcome,'target_failure');assert.equal(result.flow.failure.reason,'blocked_request',JSON.stringify({browser:monitor.definition.flow.browser,checks:result.checks,flow:result.flow}));assert.equal(result.flow.failure.blocked,'link_local_or_metadata_address');
 }
 // A changed device is a changed assertion context, including recovery labels.
 const revision=await ok(`/api/monitors/${mobile.id}`,'PATCH',{...mobile.definition,flow:{...mobile.definition.flow,device:'desktop'}});
 const change=(await ok(`/api/monitors/${mobile.id}/revisions`)).find(row=>row.revision===revision.revision).flowChange;
 assert.equal(change.change,'shrank');assert.ok(change.removed.some(value=>value.includes('mobile')));
 const changedReport=await ok(`/api/v1/monitors/${mobile.id}/report?period=24h`);
 assert.ok(changedReport.flowProfiles.some(segment=>segment.profile.device==='mobile'));
 assert.ok(changedReport.flowProfiles.some(segment=>segment.profile.device==='desktop'));

 await stop();
 // Removing selected engine capacity must not substitute Chromium.
 start(['chromium','firefox']);const missing=await create('webkit');
 await waitFor(async()=>(await observations(missing.id)).length>=2,'missing selected engine returned Unknown evidence',60000);
 for(const unavailable of await observations(missing.id)){
  assert.equal(unavailable.outcome,'runner_error');assert.equal(unavailable.checks[0].assertion,'browser');assert.match(unavailable.checks[0].reason,/webkit/);
  assert.equal(unavailable.flow,undefined,'no substituted browser produces a passing trace');
 }
 assert.equal((await ok('/api/overview')).monitors.find(m=>m.id===missing.id).state.state,'Unknown');
 await waitFor(async()=>{const current=await ok('/api/overview');return current.runner.runners.find(r=>!r.hosted).capabilities.browsers.webkit===false},'enrollment names lost engine capacity',30000);
 await stop();await flowMissingBrowser({origin,missing,directory});
 const remaining=(await Promise.all((await readdir(flowDir)).map(folder=>readdir(join(flowDir,folder))))).flat().filter(name=>name.startsWith('run-'));assert.equal(remaining.length,0,'completed and failed profile runs leave no browser folders');
 const archive=await ok('/api/archive');assert.ok(archive.payload.tables.observations.some(row=>JSON.parse(row.evidence).flow?.profile?.device==='mobile'),'archives retain immutable profile evidence');
 await worker.dispose();worker=null;
 ({worker}=await migratedWorker({port,persist:join(directory,'receiver'),bindings}));await owner.signIn(bindings);
 await ok('/api/restore','POST',archive);
 const restored=await ok('/api/overview');assert.ok(restored.monitors.every(m=>m.definition.enabled===false),'restored profile monitors remain paused');
 const restoredEvidence=(await slots(mobile.id)).flatMap(slot=>slot.observations);
 assert.ok(restoredEvidence.some(result=>result.flow?.profile?.device==='mobile'),'inactive restore retains the original failing mobile profile');
 console.log('FLOW-004 passed: three real engines, mobile-only failure, engine-specific capacity, protected subresources, revision/profile reporting and retained archive evidence.');
}finally{await stop();await fixture?.close();await worker?.dispose();await cleanupDirectory(directory)}
