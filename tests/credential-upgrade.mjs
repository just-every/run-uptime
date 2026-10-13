// Upgrade and inactive restore through commands, owner routes, authenticated claims and real sockets.
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {fixture} from './resilience/support.mjs';
import {signInOwner} from './auth-test-support.mjs';
import {startFlowFixture,FIXTURE_EMAIL,FIXTURE_PASSWORD} from './flow-fixture.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
import {bindingCommand} from '../src/domain/credential-binding.mjs';

export async function credentialUpgrade(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-credential-upgrade-')),credentials=join(directory,'credentials'),empty=join(directory,'empty'),workspace=join(directory,'flows'),grantPath=join(directory,'grant.json');
 const previous=process.env.UPTIME_CREDENTIAL_DIR;process.env.UPTIME_CREDENTIAL_DIR=credentials;
 let f,recovery,flow,receiver,original,browser;
 const records=[],sharedRef='shared-'.padEnd(80,'x'),token='upgrade-private-auth-value';
 try{
  for(const path of [credentials,empty,workspace])await mkdir(path,{mode:0o700});
  flow=await startFlowFixture({grantPath});f=await fixture({UPTIME_SYNTHETIC_PORT:String(flow.port)});
  receiver=http.createServer((req,res)=>{records.push(req.headers.authorization);res.end('ready')});await new Promise(r=>receiver.listen(0,'127.0.0.1',r));
  const origin=`http://93.184.216.36:${receiver.address().port}`;
  original=http.request;http.request=function(options,...args){return original.call(this,options?.hostname==='93.184.216.36'?{...options,hostname:'127.0.0.1'}:options,...args)};
  const old={origin,headers:{'x-client':'upgrade'},auth:{type:'bearer',token}};
  const write=(ref,value=old,mode=0o600)=>writeFile(join(credentials,`${ref}.json`),JSON.stringify(value),{mode});
  const read=ref=>readFile(join(credentials,`${ref}.json`),'utf8');
  const migrate=()=>promisify(execFile)(process.execPath,[resolve('runners/migrations/0001-monitor-credentials.mjs'),'--directory',credentials,'--persist-to',f.directory]);
  const create=(options={})=>f.monitor({runners:[f.first],canary:true,url:origin+'/health',intervalMs:86400000,request:{credentialRef:'unique'},...options});
  const run=task=>executeTaskProbe(task,task.probes[0],{grantPath,controlPort:Number(new URL(f.origin).port),flowWorkspace:workspace});
  const claim=async(instance,id)=>{const task=await instance.claim(instance.first);assert.equal(task?.monitorId,id);return task};
  const submit=async(instance,task,result)=>{
   const probe=task.probes[0],url=task.definition.assignments[probe].canaryUrl;
   if(url)result={...result,canary:{...await executeTaskProbe({...task,definition:{...task.definition,url,request:undefined,assertions:{status:200}}},probe,{statusOnly:true}),attempt:0}};
   const response=await instance.submit(instance.first,task,[{...result,attempt:0}]);assert.equal(response.status,200,JSON.stringify(response.data));return result;
  };
  const unique=await create({name:'Unique upgrade'}),paused=await create({name:'Paused upgrade',enabled:false,request:{credentialRef:'paused'}});
  const flowBody={intent:'Sign in',steps:[{kind:'goto',url:flow.origin+'/s/healthy/login'},{kind:'fill',target:{label:'Email'},credentialRef:'email'},{kind:'fill',target:{label:'Email'},credentialRef:'email'},{kind:'fill',target:{label:'Password'},credentialRef:'password'},{kind:'click',target:{role:'button',name:'Sign in'}},{kind:'expect',what:'text',value:'Welcome back'}],outcomes:[{id:'signed-in',what:'text',value:'Welcome back'}]};
  const browserMonitor=await create({name:'Unique browser upgrade',enabled:false,type:'flow',network:'synthetic',url:flow.origin+'/s/healthy/login',request:undefined,canary:false,intervalMs:300000,timeoutMs:10000,flow:flowBody});
  for(const ref of ['unique','paused','unused',sharedRef])await write(ref,old,ref==='paused'?0o400:0o600);
  for(const [ref,value] of [['email',FIXTURE_EMAIL],['password',FIXTURE_PASSWORD]])await write(ref,{origin:flow.origin,value});
  const before=await read('unused'),first=await migrate();
  assert.match(first.stdout,/unused: unbound; no existing monitor/);assert.ok(!first.stdout.includes(token));
  for(const [ref,id] of [['unique',unique.id],['paused',paused.id],['email',browserMonitor.id],['password',browserMonitor.id]]){
   const input=JSON.parse(await read(ref));assert.equal(input.monitorId,id);
   if(['unique','paused'].includes(ref))assert.deepEqual(input,{...old,monitorId:id});
  }
  assert.equal((await stat(join(credentials,'paused.json'))).mode&0o777,0o400,'automatic binding preserves exact owner-only mode');
  const unchanged=await read('unique');await migrate();assert.equal(await read('unique'),unchanged);assert.equal(await read('unused'),before);
  const ownTask=await claim(f,unique.id),own=await run(ownTask);assert.equal(own.outcome,'pass');await submit(f,ownTask,own);assert.equal((await f.state(unique.id)).state,'Healthy');
  assert.equal((await f.request(`/api/monitors/${browserMonitor.id}`,{method:'PATCH',body:{...browserMonitor.definition,enabled:true}})).status,200);
  const flowTask=await claim(f,browserMonitor.id),flowResult=await run(flowTask);assert.equal(flowResult.outcome,'pass',JSON.stringify(flowResult));await submit(f,flowTask,flowResult);assert.equal((await f.state(browserMonitor.id)).state,'Healthy');await f.pause(browserMonitor);
  const unused=await create({name:'Later unused reference',request:{credentialRef:'unused'}}),unusedTask=await claim(f,unused.id),unusedResult=await run(unusedTask);
  assert.equal(unusedResult.outcome,'runner_error');assert.equal(await read('unused'),before,'execution never binds even a sole new reference');
  assert.ok(unusedResult.checks[0].reason.includes(bindingCommand('unused',unused.id)));await submit(f,unusedTask,unusedResult);await f.pause(unused);
  const copied=await create({...unique.definition,name:'Copied definition'}),copyTask=await claim(f,copied.id),copiedResult=await run(copyTask);assert.notEqual(copied.id,unique.id);assert.equal(copiedResult.outcome,'runner_error');await submit(f,copyTask,copiedResult);await f.pause(copied);
  const file={format:'uptime.monitors',version:1,monitors:[{name:'Imported definition',url:origin+'/health',request:{credentialRef:'unique'}}]};
  const preview=await f.request('/api/definitions/preview',{body:file});assert.equal(preview.status,200);
  const imported=await f.request(`/api/definitions/apply?digest=${preview.data.digest}`,{body:file});assert.equal(imported.status,201);
  const importedId=imported.data.created[0],importedMonitor=(await f.request('/api/overview')).data.monitors.find(m=>m.id===importedId);assert.equal(importedMonitor.definition.enabled,false);assert.notEqual(importedId,unique.id);
  const activated=await f.request(`/api/monitors/${importedId}`,{method:'PATCH',body:{...importedMonitor.definition,enabled:true,assignments:unique.definition.assignments,probes:unique.definition.probes}});assert.equal(activated.status,200);
  const importedTask=await claim(f,importedId),importedResult=await run(importedTask);assert.equal(importedResult.outcome,'runner_error');await submit(f,importedTask,importedResult);await f.pause(activated.data);
  const archive=(await f.request('/api/archive')).data;
  assert.deepEqual(JSON.parse(archive.payload.tables.monitors.find(m=>m.id===unique.id).definition).request,{credentialRef:'unique'});
  const exported=JSON.stringify(archive);for(const secret of [token,FIXTURE_EMAIL,FIXTURE_PASSWORD,f.first.key])assert.ok(!exported.includes(secret));
  recovery=await fixture({UPTIME_SYNTHETIC_PORT:String(flow.port)});
  const restored=await recovery.request('/api/restore',{body:archive});assert.equal(restored.status,200,JSON.stringify(restored.data));
  const restoredMonitors=(await recovery.request('/api/overview')).data.monitors;assert.ok(restoredMonitors.every(m=>!m.definition.enabled));assert.equal(await recovery.claim(recovery.first),null);
  const restoredOwn=restoredMonitors.find(m=>m.id===unique.id);assert.deepEqual(restoredOwn.definition.request,{credentialRef:'unique'});
  assert.equal((await recovery.request(`/api/monitors/${unique.id}`,{method:'PATCH',body:{...restoredOwn.definition,enabled:true,assignments:{'local-a':{runnerId:recovery.first.runnerId,canaryUrl:`http://93.184.216.35:${recovery.port}/canary`}}}})).status,200);
  process.env.UPTIME_CREDENTIAL_DIR=empty;
  const missingTask=await claim(recovery,unique.id),missing=await run(missingTask);assert.equal(missing.outcome,'runner_error','archive alone transfers no local credential');await submit(recovery,missingTask,missing);
  process.env.UPTIME_CREDENTIAL_DIR=credentials;
  assert.equal((await recovery.request(`/api/monitors/${unique.id}/run`,{body:{}})).status,200);
  const retainedTask=await claim(recovery,unique.id),retained=await run(retainedTask);assert.equal(retained.outcome,'pass','same monitor ID can reuse its separately retained local file');await submit(recovery,retainedTask,retained);
  await recovery.close();recovery=null;
  // At product capacity, every known referring ID survives signed completion and rendered history.
  const shared=await create({name:'Shared upgrade',request:{credentialRef:sharedRef}});
  const count=(await f.request('/api/overview')).data.monitors.length;
  const many={format:'uptime.monitors',version:1,monitors:Array.from({length:100-count},(_,i)=>({name:`Paused shared ${i}`,url:origin+'/health',request:{credentialRef:sharedRef}}))};
  const manyPreview=await f.request('/api/definitions/preview',{body:many});assert.equal(manyPreview.status,200);
  const manyImport=await f.request(`/api/definitions/apply?digest=${manyPreview.data.digest}`,{body:many});assert.equal(manyImport.status,201);
  const sharedBefore=await read(sharedRef),report=await migrate();assert.equal(await read(sharedRef),sharedBefore);
  const ids=[shared.id,...manyImport.data.created].sort();for(const id of ids)assert.ok(report.stdout.includes(bindingCommand(sharedRef,id)));
  const sharedTask=await claim(f,shared.id),blocked=await run(sharedTask);assert.equal(blocked.outcome,'runner_error');assert.deepEqual(blocked.credentialBinding.monitorIds,ids);
  assert.ok(JSON.stringify(blocked).length>4000,'exercise the diagnostic beyond the ordinary evidence limit');await submit(f,sharedTask,blocked);
  const history=(await f.request(`/api/monitors/${shared.id}/history`)).data;assert.ok(history[0].observations[0].checks[0].reason.includes(bindingCommand(sharedRef,shared.id)));
  browser=await chromium.launch({headless:true});const context=await browser.newContext(),cookie=await signInOwner(f.origin,{bindings:f.bindings,finishFirstRun:true});
  const [name,...value]=cookie.split('=');await context.addCookies([{name,value:value.join('='),url:f.origin}]);
  const page=await context.newPage();await page.goto(f.origin+'/app/monitors/'+shared.id);await page.locator('#raw-history details[data-slot] > summary').first().click();await page.getByText('Known monitors referencing this credential').waitFor();
  await page.getByText('Known monitors referencing this credential').click();const text=await page.locator('#raw-history').innerText();assert.match(text,/separate owner-only credential files and references/);assert.ok(text.includes(bindingCommand(sharedRef,shared.id)));for(const id of ids)assert.ok(text.includes(id));
  await browser.close();browser=null;
  // Ambiguous local databases must not choose an inventory and bind unused files.
  const {readdir}=await import('node:fs/promises'),dbDir=join(f.directory,'v3/d1/miniflare-D1DatabaseObject'),dbName=(await readdir(dbDir)).find(name=>name.endsWith('.sqlite'));
  await copyFile(join(dbDir,dbName),join(dbDir,'ambiguous.sqlite'));
  for(const suffix of ['-wal','-shm'])await copyFile(join(dbDir,dbName+suffix),join(dbDir,'ambiguous.sqlite'+suffix)).catch(error=>{if(error.code!=='ENOENT')throw error});
  await write('ambiguity',old);
  await assert.rejects(migrate());assert.equal(JSON.parse(await read('ambiguity')).monitorId,undefined);
  console.log('Upgrade: unique HTTP/browser and paused files bound; shared/unused diagnosed; repeated migration stable; copy/import denied; archive identity retained without secrets; 100-monitor diagnostics rendered.');
 }finally{
  await browser?.close();await recovery?.close();if(original)http.request=original;
  if(receiver){receiver.closeAllConnections();await new Promise(r=>receiver.close(r))}
  await f?.close();await flow?.close();if(previous===undefined)delete process.env.UPTIME_CREDENTIAL_DIR;else process.env.UPTIME_CREDENTIAL_DIR=previous;
  await rm(directory,{recursive:true,force:true});
 }
}
