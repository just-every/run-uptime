import {completeSecondFactor} from './mfa-auth-support.mjs';
// FLOW-001 qualification through migrated Worker routes and two production
// runner processes. Network placement is a separate hosted acceptance boundary.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {testAuthBindings} from './auth-test-support.mjs';
import {availablePorts,cleanupDirectory,migratedWorker,ownerAPI,root,runtimeDirectory,waitFor} from './notify-acceptance-runtime.mjs';
import {FIXTURE_EMAIL,FIXTURE_PASSWORD,startFlowFixture} from './flow-fixture.mjs';
import {qualificationBrowser,closeQualificationBrowser} from './flow-qualification-browser.mjs';
const directory=await runtimeDirectory(),[port,fixturePort]=await availablePorts(2),origin=`http://127.0.0.1:${port}`;
const grantPath=join(directory,'grant.json'),credentialDir=join(directory,'credentials');
const bindings={...testAuthBindings,UPTIME_SYNTHETIC_PORT:String(fixturePort),MAIL_PROVIDER:'development'};
const owner=ownerAPI(origin),children=[],screens=[];let worker,fixture;
const stop=async()=>{for(const child of children.splice(0))if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit')}};
try{
 ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings}));
 fixture=await startFlowFixture({port:fixturePort,grantPath});await mkdir(credentialDir,{mode:0o700});await owner.signIn(bindings);
 const ok=async(path,method='GET',body)=>{const r=await owner.api(path,method,body);assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status}`);return r.data};
 const second=await ok('/api/runners','POST',{networkLabel:'qualification-network-b'}),keys=[[bindings.UPTIME_RUNNER_KEY,null],[second.key,second.runnerId]];
 const start=(available=true)=>{for(const [key,id] of keys)children.push(spawn(process.execPath,[join(root,'runners/src/private-runner.mjs')],{cwd:root,stdio:'ignore',env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,...(id?{UPTIME_RUNNER_ID:id}:{}),UPTIME_GRANT_FILE:grantPath,UPTIME_LOCAL_REVIEW:'true',UPTIME_CREDENTIAL_DIR:credentialDir,UPTIME_FLOW_DIR:join(directory,'flows'),UPTIME_RUNNER_BROWSERS:'chromium',...(available?{}:{UPTIME_RUNNER_BROWSER:'off'})}}))};
 const makeFlow=(scenario,{signup=false,checkout=false,confirmation=false,path}={})=>{
  const base=`${fixture.origin}/s/${scenario}`,entry=path??(signup?'/signup':'/login');
  const steps=path?[{kind:'goto',url:base+entry}]:[{kind:'goto',url:base+entry},{kind:'fill',target:{label:'Email'},credentialRef:'email'},{kind:'fill',target:{label:'Password'},credentialRef:'password'},{kind:'click',target:{role:'button',name:signup?'Create account':'Sign in'}},{kind:'waitFor',what:'text',value:'Welcome back'}];
  if(confirmation)steps.push({kind:'click',target:{text:'Confirm order'}});
  if(checkout)steps.push({kind:'click',target:{role:'button',name:'Confirm sandbox order'}});
  return {url:base+entry,flow:{intent:signup?'Create an authorized synthetic account':checkout?'Submit an order in the authorized sandbox':'Sign in to the synthetic account',steps,outcomes:[{id:'customer-outcome',what:'text',value:checkout||confirmation?'Order confirmed':path?'Hostile page':'Welcome back'}]}};
 };
 const create=async(name,scenario,options={},timeoutMs=15000)=>{
  await completeSecondFactor(origin,owner.cookie);
  const body=makeFlow(scenario,options),scope=crypto.randomUUID();body.flow.steps=body.flow.steps.map(step=>step.kind==='fill'?{...step,credentialRef:scope+'-'+step.credentialRef}:step);
  const monitor=await ok('/api/monitors','POST',{name,type:'flow',network:'synthetic',...body,probes:['local-a','local-b'],intervalMs:300000,timeoutMs,retries:0,confirmSlots:1,recoverSlots:1,freshnessMs:900000,enabled:false});
  for(const [ref,value] of [['email',FIXTURE_EMAIL],['password',FIXTURE_PASSWORD]])await writeFile(join(credentialDir,scope+'-'+ref+'.json'),JSON.stringify({monitorId:monitor.id,origin:fixture.origin,value}),{mode:0o600});
  await ok(`/api/monitors/${monitor.id}`,'PATCH',{...monitor.definition,enabled:true});return monitor;
 };
 const evidence=async monitor=>(await ok(`/api/monitors/${monitor.id}/history`)).flatMap(slot=>slot.observations);
 const complete=async monitor=>{await waitFor(async()=>(await evidence(monitor)).length>=2,'both assigned browsers returned immutable evidence',90000);return evidence(monitor)};
 const state=async monitor=>(await ok('/api/overview')).monitors.find(m=>m.id===monitor.id).state.state;
 const erase=async monitor=>{await completeSecondFactor(origin,owner.cookie);return ok(`/api/monitors/${monitor.id}/erase`,'POST',{name:monitor.definition.name})};
 start();
 // Keep this failing definition unchanged until its next scheduled slot. Fix
 // only the controlled site's behavior, so recovery proves the original intent.
 fixture.setScenario('recovery','checkout-failure');
 const recovery=await create('Acme sandbox checkout','recovery',{checkout:true});
 const initial=await complete(recovery);assert.ok(initial.every(o=>o.outcome==='target_failure'));assert.equal(await state(recovery),'Failing');screens.push({id:recovery.id,label:'checkout-failing'});
 await qualificationBrowser({origin,monitors:[screens.at(-1)],directory});
 fixture.setScenario('recovery','sandbox-checkout');
 for(const [name,scenario,options,reason] of [
  ['Acme account login','healthy',{},null],
  ['Acme account signup','signup',{signup:true},null],
  ['Acme sandbox purchase','sandbox-checkout',{checkout:true},null],
  ['Missing sign-in control','missing-element',{},'element_missing'],
  ['Confirmation server error','confirm-500',{confirmation:true},'http_status'],
  ['Missing confirmation','missing-outcome',{confirmation:true},'outcome_missing'],
  ['Slow confirmation','slow',{confirmation:true},'navigation_timeout'],
  ['Private redirect','redirect',{path:'/redirect-private'},'blocked_request'],
  ['Metadata subresource','metadata-subresource',{},'blocked_request'],
  ['Undeclared origin','hostile',{path:'/hostile'},'extra_page'],
 ]){
  const monitor=await create(name,scenario,options);
  const results=await complete(monitor);
  if(reason){assert.ok(results.every(o=>o.outcome==='target_failure'));assert.ok(results.every(o=>o.flow?.failure?.reason===reason),`${scenario}: ${JSON.stringify(results.map(o=>o.flow?.failure))}`);assert.equal(await state(monitor),'Failing')}
  else{assert.ok(results.every(o=>o.outcome==='pass'),name+': '+JSON.stringify(results.map(o=>({outcome:o.outcome,checks:o.checks,failure:o.flow?.failure}))));assert.equal(await state(monitor),'Healthy')}
  if(scenario==='slow')await qualificationBrowser({origin,monitors:[{id:monitor.id,label:scenario}],directory});await erase(monitor);
 }
 assert.ok(fixture.seen.signups>=2,'the signup submitted the synthetic form on both browsers');assert.ok(fixture.seen.orders>=2,'checkout submitted sandbox orders instead of just reading a health endpoint');
 await waitFor(async()=>await state(recovery)==='Healthy','the original unchanged checkout recovered on scheduled evidence',360000);
 const incidents=await ok(`/api/monitors/${recovery.id}/incidents`);assert.ok(JSON.stringify(incidents).includes('recovery'),'scheduled recovery is retained');
 await qualificationBrowser({origin,monitors:[{id:recovery.id,label:'checkout-recovered'}],directory});await erase(recovery);await stop();
 start(false);const missing=await create('Checkout without browser capacity','healthy');
 const unavailable=await complete(missing);assert.ok(unavailable.every(o=>o.outcome==='runner_error'&&!o.flow));assert.equal(await state(missing),'Unknown');
 await qualificationBrowser({origin,monitors:[{id:missing.id,label:'browser-unavailable'}],directory});
 const bytes=JSON.stringify([await ok('/api/archive'),await ok('/api/overview')]);for(const secret of [FIXTURE_EMAIL,FIXTURE_PASSWORD])assert.ok(!bytes.includes(secret),'synthetic credentials remain outside product storage');
 console.log('FLOW-001 PASS login, signup and sandbox order submission; retained failure matrix, unchanged scheduled recovery, browser-capacity Unknown and desktop/phone evidence. Local runner processes do not certify geographic placement.');
}finally{await closeQualificationBrowser();await stop();await fixture?.close();await worker?.dispose();await cleanupDirectory(directory)}
