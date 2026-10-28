// FLOW-003: the real checkout, production browser runner, signed result door,
// authenticated incident artifacts, denied capture storage, masks and erasure.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {fixture} from './resilience/support.mjs';
import {availablePorts,waitFor} from './notify-acceptance-runtime.mjs';
import {startFlowFixture,FIXTURE_EMAIL,FIXTURE_PASSWORD,FIXTURE_MASK} from './flow-fixture.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
import {traceEntries} from '../runners/src/flow/artifact-trace.mjs';
import {artifactBrowser} from './flow-artifact-browser.mjs';
const [fixturePort]=await availablePorts(1),f=await fixture({UPTIME_SYNTHETIC_PORT:String(fixturePort)});
let target,receiving;
try{
 const grantPath=join(f.directory,'grant.json'),credentials=join(f.directory,'credentials'),workspace=join(f.directory,'flow-artifacts');await mkdir(credentials,{mode:0o700});await mkdir(workspace,{mode:0o700});
 target=await startFlowFixture({port:fixturePort,grantPath});
 for(const runner of [f.first,f.second])assert.equal((await f.request('/api/runner/enroll',{runner,signed:true,body:{version:1,capabilities:{browser:true}}})).status,200);
 const base=target.origin+'/s/checkout-failure',flow={intent:'Confirm a sandbox checkout',steps:[{kind:'goto',url:base+'/login'},{kind:'fill',target:{label:'Email'},credentialRef:'artifact-email'},{kind:'fill',target:{label:'Password'},credentialRef:'artifact-password'},{kind:'click',target:{role:'button',name:'Sign in'}},{kind:'click',target:{role:'button',name:'Confirm sandbox order'}}],outcomes:[{id:'order',what:'text',value:'Order confirmed'}]};
 let monitor=await f.monitor({name:'Sandbox checkout artifacts',type:'flow',network:'synthetic',url:base+'/login',flow,intervalMs:300000,freshnessMs:900000,enabled:false});
 for(const [ref,value]of [['artifact-email',FIXTURE_EMAIL],['artifact-password',FIXTURE_PASSWORD]])await writeFile(join(credentials,ref+'.json'),JSON.stringify({monitorId:monitor.id,origin:target.origin,value}),{mode:0o600});
 const path=`/api/monitors/${monitor.id}/failure-snapshots`;
 assert.equal((await f.request(path,{method:'PATCH',body:{version:0,retentionDays:2,masks:[FIXTURE_MASK],screenshot:true}})).status,200);
 monitor=(await f.request('/api/monitors/'+monitor.id,{method:'PATCH',body:{...monitor.definition,enabled:true}})).data;
 const run=async(runner,{deny=false}={})=>{
  const task=await f.claim(runner);assert.ok(task&&task.monitorId===monitor.id);
  const pending=executeTaskProbe(task,task.probes[0],{grantPath,controlPort:Number(new URL(f.origin).port),flowWorkspace:workspace,credentialDir:credentials});
  if(deny){
   const folder=await waitFor(async()=>(await readdir(workspace)).find(name=>name.startsWith('run-')),'the private browser capture folder');
   // Real filesystem denial: these output paths are directories. The browser
   // can still check the target; its trace and encoder cannot store artifacts.
   for(const name of ['private-trace.zip','redacted.webm'])await mkdir(join(workspace,folder,name));
  }
  const observation={...await pending,attempt:0};assert.equal(observation.outcome,'target_failure',JSON.stringify(observation.checks));assert.equal(observation.flow.failure.reason,'http_status');
  assert.equal((await f.submit(runner,task,[observation])).status,200);return observation;
 };
 // Local credentials are supplied by the actual runner environment, as in a
 // deployed private runner. Never embed them in a monitor or signed task.
 const previous=process.env.UPTIME_CREDENTIAL_DIR;process.env.UPTIME_CREDENTIAL_DIR=credentials;
 let observations;try{observations=[await run(f.first),await run(f.second)]}finally{if(previous===undefined)delete process.env.UPTIME_CREDENTIAL_DIR;else process.env.UPTIME_CREDENTIAL_DIR=previous}
 assert.equal((await f.state(monitor.id)).state,'Failing');
 const items=(await f.request(path)).data.items;assert.equal(items.length,2);
 const output=resolve(process.env.UPTIME_SCREENSHOTS??'data/flow-artifact-evidence');await mkdir(output,{recursive:true});
 for(const item of items){const s=item.snapshot;assert.equal(s.screenshot.format,'png',s.screenshot.unavailable);assert.equal(s.artifacts.video.format,'webm',s.artifacts.video.unavailable);assert.equal(s.artifacts.trace.format,'zip',s.artifacts.trace.unavailable);assert.ok(s.artifacts.waterfall.some(r=>r.status===500));assert.ok(s.artifacts.console.length);assert.ok(s.artifacts.console.every(r=>!r.text.includes(FIXTURE_MASK)));
  const entries=await traceEntries(Buffer.from(s.artifacts.trace.data,'base64'));assert.ok(entries.length&&entries.every(e=>e.name.endsWith('.trace')),'native trace contains no resource/header/body files');const text=entries.map(e=>e.data.toString()).join('\n');assert.match(text,/context-options/);assert.match(text,/"type":"before"/);
  for(const secret of [FIXTURE_EMAIL,FIXTURE_PASSWORD,FIXTURE_MASK]){assert.ok(!text.includes(secret));assert.ok(!JSON.stringify(s).includes(secret))}
  const raw=JSON.parse((await f.DB.prepare('SELECT snapshot FROM failure_snapshots WHERE observation_id=?').bind(item.observation_id).first()).snapshot);for(const artifact of [raw.screenshot,raw.artifacts.video,raw.artifacts.trace])assert.ok(artifact.ciphertext&&!artifact.data,'opaque artifacts encrypted at rest');
  assert.equal(item.flow.digest,observations[0].flow.digest);assert.ok(item.expires_at-item.captured_at===2*86400000);
 }
 await writeFile(join(output,'redacted-failure.png'),Buffer.from(items[0].snapshot.screenshot.data,'base64'));
 assert.equal((await fetch(f.origin+path)).status,401);const incident=(await f.request(`/api/monitors/${monitor.id}/incidents`)).data[0];assert.equal((await fetch(f.origin+`/api/incidents/${incident.trigger.id}/failure-report`)).status,401);
 await artifactBrowser(f,monitor);
 const archive=(await f.request('/api/archive')).data;assert.equal(archive.payload.productTables.failure_snapshots.length,2);receiving=await fixture({SESSION_SECRET:randomBytes(32).toString('base64url')});assert.equal((await receiving.request('/api/restore',{body:archive})).status,200);assert.equal((await receiving.request(path)).data.items[0].snapshot.artifacts.video.data,items[0].snapshot.artifacts.video.data);await receiving.close();receiving=null;
 assert.equal((await f.request(`/api/monitors/${monitor.id}/run`,{body:{}})).status,200);
 const old=process.env.UPTIME_CREDENTIAL_DIR;process.env.UPTIME_CREDENTIAL_DIR=credentials;let denied;try{denied=await run(f.first,{deny:true})}finally{if(old===undefined)delete process.env.UPTIME_CREDENTIAL_DIR;else process.env.UPTIME_CREDENTIAL_DIR=old}
 assert.equal(denied.failureSnapshot.artifacts.trace.unavailable,'capture_failed');assert.equal(denied.failureSnapshot.artifacts.video.unavailable,'capture_failed');
 assert.equal((await f.request(path)).data.items[0].snapshot.artifacts.trace.unavailable,'capture_failed');assert.equal((await f.state(monitor.id)).state,'Failing');await artifactBrowser(f,monitor,{failedStorage:true});
 const policy=(await f.request(path)).data.settings;assert.equal((await f.request(path,{method:'PATCH',body:{...policy,masks:[FIXTURE_MASK,'checkout']}})).status,200);for(const item of (await f.request(path)).data.items){assert.equal(item.snapshot.screenshot.unavailable,'policy_changed');assert.equal(item.snapshot.artifacts.video.unavailable,'policy_changed');assert.equal(item.snapshot.artifacts.trace.unavailable,'policy_changed')}
 const erased=await f.request(`/api/monitors/${monitor.id}/erase`,{body:{name:monitor.definition.name}});assert.equal(erased.status,200);assert.equal(erased.data.receipt.counts.failure_snapshots,3);assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM failure_snapshots WHERE monitor_id=?').bind(monitor.id).first()).n,0);await artifactBrowser(f,monitor,{erased:true});
 assert.ok((await f.request('/api/archive')).data.payload.productTables.failure_snapshots.length===0);
 console.log('FLOW-003 passed: real failed checkout; redacted PNG, replay WebM, sanitized native trace, console/waterfall/step timings; encrypted retention/portable custody; authenticated 1440 incident detail; denied capture storage retains failed check; stricter masks and monitor erasure remove artifacts.');
}finally{await receiving?.close();await target?.close();await f.close()}
