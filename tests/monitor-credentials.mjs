import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fixture} from './resilience/support.mjs';
import {startFlowFixture,FIXTURE_EMAIL,FIXTURE_PASSWORD} from './flow-fixture.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';

// One complete owner/claim/receiver flow. Only the public socket edge is routed to a local server.
test('claimed HTTP and browser checks require their own monitor-bound local credential, including upgrade, rotation and erasure',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'uptime-credential-authority-')),grantPath=join(directory,'grant.json'),workspace=join(directory,'flows');
 const previous=process.env.UPTIME_CREDENTIAL_DIR;process.env.UPTIME_CREDENTIAL_DIR=directory;
 let f,flow,receiver;const records=[];let original;
 try{
  await mkdir(workspace,{mode:0o700});flow=await startFlowFixture({grantPath});
  f=await fixture({UPTIME_SYNTHETIC_PORT:String(flow.port)});
  receiver=http.createServer((req,res)=>{records.push(req.headers.authorization);res.end('ready')});await new Promise(r=>receiver.listen(0,'127.0.0.1',r));
  const port=receiver.address().port,origin=`http://93.184.216.36:${port}`;
  original=http.request;http.request=function(options,...args){return original.call(this,options?.hostname==='93.184.216.36'?{...options,hostname:'127.0.0.1'}:options,...args)};
  const write=(ref,input)=>writeFile(join(directory,`${ref}.json`),JSON.stringify(input),{mode:0o600});
  const migrate=async(ref,monitorId)=>promisify(execFile)(process.execPath,[resolve('runners/migrations/0001-monitor-credentials.mjs'),'--directory',directory,'--reference',ref,'--monitor-id',monitorId]);
  const create=options=>f.monitor({runners:[f.first],canary:options.type!=='flow',intervalMs:86400000,...options});
  const claim=async id=>{const task=await f.claim(f.first);assert.equal(task?.monitorId,id);return task};
  const run=async task=>executeTaskProbe(task,task.probes[0],{grantPath,controlPort:Number(new URL(f.origin).port),flowWorkspace:workspace});
  const manual=async id=>{assert.equal((await f.request(`/api/monitors/${id}/run`,{body:{}})).status,200);return claim(id)};
  const submit=async(task,result)=>{const probe=task.probes[0],url=task.definition.assignments[probe].canaryUrl;if(url)result={...result,canary:{...await executeTaskProbe({...task,definition:{...task.definition,url,request:undefined,assertions:{status:200}}},probe,{statusOnly:true}),attempt:0}};const response=await f.submit(f.first,task,[{...result,attempt:0}]);assert.equal(response.status,200,JSON.stringify(response.data))};
  const A=await create({name:'Credential A',url:origin+'/health',request:{credentialRef:'shared'}}),taskA=await claim(A.id);
  const B=await create({name:'Credential B',url:origin+'/health',request:{credentialRef:'shared'}}),taskB=await claim(B.id);
  const old={origin,auth:{type:'bearer',token:'http-private-one'}};await write('shared',old);
  assert.equal((await run(taskA)).outcome,'runner_error');assert.equal(records.length,0,'unbound prior files fail closed');
  const migrated=await migrate('shared',A.id);assert.doesNotMatch(migrated.stdout+migrated.stderr,/http-private-one/);
  assert.deepEqual(JSON.parse(await readFile(join(directory,'shared.json'),'utf8')),{...old,monitorId:A.id},'explicit transition preserves populated old file fields');
  const allowed=await run(taskA);assert.equal(allowed.outcome,'pass');assert.deepEqual(records,['Bearer http-private-one']);await submit(taskA,allowed);
  const denied=await run(taskB);assert.equal(denied.outcome,'runner_error');assert.equal(records.length,1,'same reference, origin and runner gives B no authority');await submit(taskB,denied);
  await assert.rejects(migrate('shared',B.id),'migration cannot silently rebind an already-bound file');
  for(const invalid of [{...taskA,monitorId:undefined},{...taskA,id:undefined},{...taskA,probes:['local-b']}])await assert.rejects(run(invalid),/Credential claim unavailable/);
  assert.equal(records.length,1);
  await write('shared',{...old,monitorId:A.id,auth:{type:'bearer',token:'http-private-two'}});
  const rotatedTask=await manual(A.id),rotated=await run(rotatedTask);assert.equal(rotated.outcome,'pass');assert.equal(records.at(-1),'Bearer http-private-two');await submit(rotatedTask,rotated);
  await rm(join(directory,'shared.json'));const removedTask=await manual(A.id),removed=await run(removedTask);assert.equal(removed.outcome,'runner_error');assert.equal(records.length,2);await submit(removedTask,removed);
  // Deleting a monitor does not grant its leftover runner file to a same-name replacement.
  await write('shared',{...old,monitorId:A.id});assert.equal((await f.request(`/api/monitors/${A.id}/erase`,{body:{name:A.definition.name}})).status,200);
  const replacement=await create({name:A.definition.name,url:origin+'/health',request:{credentialRef:'shared'}});const replacedTask=await claim(replacement.id);assert.notEqual(replacement.id,A.id);const replaced=await run(replacedTask);assert.equal(replaced.outcome,'runner_error');assert.equal(records.length,2);await submit(replacedTask,replaced);
  assert.equal((await f.request('/api/runner/claim',{body:{},headers:{'x-runner-key':'foreign-key-not-authorized'}})).status,401);

  const body={intent:'Sign in',steps:[{kind:'goto',url:flow.origin+'/s/healthy/login'},{kind:'fill',target:{label:'Email'},credentialRef:'email'},{kind:'fill',target:{label:'Password'},credentialRef:'password'},{kind:'click',target:{role:'button',name:'Sign in'}},{kind:'expect',what:'text',value:'Welcome back'}],outcomes:[{id:'signed-in',what:'text',value:'Welcome back'}]};
  const flowOptions={type:'flow',network:'synthetic',url:flow.origin+'/s/healthy/login',intervalMs:300000,timeoutMs:10000,flow:body};
  const C=await create({name:'Flow credential A',...flowOptions}),taskC=await claim(C.id);
  const D=await create({name:'Flow credential B',...flowOptions}),taskD=await claim(D.id);
  for(const [ref,value] of [['email',FIXTURE_EMAIL],['password',FIXTURE_PASSWORD]])await write(ref,{origin:flow.origin,value});
  const flowBefore=flow.seen.requests.length;assert.equal((await run(taskC)).outcome,'runner_error');assert.equal(flow.seen.requests.length,flowBefore,'unbound flow credential makes no target request');
  for(const [ref,value] of [['email',FIXTURE_EMAIL],['password',FIXTURE_PASSWORD]]){await migrate(ref,C.id);assert.deepEqual(JSON.parse(await readFile(join(directory,`${ref}.json`),'utf8')),{origin:flow.origin,value,monitorId:C.id})}
  const flowAllowed=await run(taskC);assert.equal(flowAllowed.outcome,'pass',JSON.stringify(flowAllowed));assert.ok(flow.seen.requests.includes('/s/healthy/dashboard'));await submit(taskC,flowAllowed);
  const reached=flow.seen.requests.length,flowDenied=await run(taskD);assert.equal(flowDenied.outcome,'runner_error');assert.equal(flow.seen.requests.length,reached);await submit(taskD,flowDenied);
  for(const invalid of [{...taskC,monitorId:undefined},{...taskC,probes:[]}])await assert.rejects(run(invalid),/Credential claim unavailable/);
  await write('password',{monitorId:C.id,origin:flow.origin,value:'rotated-invalid-password'});
  const wrongTask=await manual(C.id),wrong=await run(wrongTask);assert.equal(wrong.outcome,'target_failure','rotation is read afresh by the browser');await submit(wrongTask,wrong);
  await rm(join(directory,'password.json'));const absentTask=await manual(C.id),absent=await run(absentTask);assert.equal(absent.outcome,'runner_error');await submit(absentTask,absent);
  assert.deepEqual(await readdir(workspace),[],'every browser profile is removed');
  await new Promise(r=>setTimeout(r,Math.max(0,Math.max(taskA.acceptUntil,taskC.acceptUntil)-Date.now()+1)));
  for(const task of [taskA,taskC])await assert.rejects(run(task),/Credential claim unavailable/,'a genuinely expired claimed task cannot load a credential');
  const tables=(await f.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA'").all()).results;
  const persisted=await Promise.all(tables.map(async({name})=>(await f.DB.prepare(`SELECT * FROM "${name}"`).all()).results));
  const data=JSON.stringify([persisted,(await f.request('/api/archive')).data,(await f.request('/api/definitions/export')).data,allowed,flowAllowed,flowDenied,wrong]);
  for(const secret of ['http-private-one','http-private-two',FIXTURE_EMAIL,FIXTURE_PASSWORD,'rotated-invalid-password'])assert.ok(!data.includes(secret),'no credential value in D1, archive, definitions or traces');
  console.log('Credential authority: HTTP A passed/B refused; flow A passed/B refused; prior files explicitly bound; missing/foreign/expired refused; rotation and erasure verified.');
 }finally{
  if(original)http.request=original;
  if(receiver){receiver.closeAllConnections();await new Promise(r=>receiver.close(r))}
  await f?.close();await flow?.close();if(previous===undefined)delete process.env.UPTIME_CREDENTIAL_DIR;else process.env.UPTIME_CREDENTIAL_DIR=previous;
  await rm(directory,{recursive:true,force:true});
 }
});
