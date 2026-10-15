import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import http from 'node:http';
import {startLocalWorker} from '../mail-provider-fixture.mjs';
import {splitSql} from '../migration-support.mjs';
import {testAuthBindings,signInOwner} from '../auth-test-support.mjs';
import {executeTaskProbe} from '../../runners/src/execute-task.mjs';
import {runRunner} from '../../runners/src/private-runner.mjs';
// Cleanup groups run in ownership order; every owner settles and every failure survives.
export async function cleanup(...groups){
 const errors=[];
 for(const group of groups){
  const actions=Array.isArray(group)?group:[group];
  const outcomes=await Promise.allSettled(actions.map(action=>Promise.resolve().then(action)));
  errors.push(...outcomes.filter(outcome=>outcome.status==='rejected').map(outcome=>outcome.reason));
 }
 if(errors.length)throw new AggregateError(errors,'Resilience resource cleanup failed');
}
export async function closeServer(server){
 if(!server.listening)return;
 const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 server.closeAllConnections();await closed;
}
export async function fixture(extraBindings={},outbound){
 const directory=await mkdtemp(join(tmpdir(),'uptime-resilience-')),key='test-only-resilience-runner-key-0001',legacyId=`self-${randomUUID()}`;
 const modes={target:503,canary:200,canaryBytes:0},migratedContact=Date.now()-5;
 const target=http.createServer((req,res)=>{res.statusCode=req.url==='/canary'?modes.canary:modes.target;res.end(req.url==='/canary'&&modes.canaryBytes?Buffer.alloc(modes.canaryBytes,'x'):'local network edge')});
 const original=http.request;let worker,port,closing;
 function close(){
  return closing??=(async()=>{
   http.request=original;
   await cleanup([()=>worker?.dispose(),()=>closeServer(target)],()=>rm(directory,{recursive:true,force:true}));
  })();
 }
 try{
 await new Promise((resolve,reject)=>{target.once('error',reject);target.listen(0,'127.0.0.1',()=>{target.off('error',reject);resolve()})});port=target.address().port;
 http.request=function(options,...args){if(options?.hostname==='93.184.216.34'||options?.hostname==='93.184.216.35'){assert.equal(options.headers.host,`${options.hostname}:${port}`,'C5 keeps the public Host while pinning');return original.call(this,{...options,hostname:'127.0.0.1'},...args)}return original.call(this,options,...args)};
 const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:key,...extraBindings};
 worker=await startLocalWorker({persist:directory,bindings,outboundService:outbound??(async request=>{assert.match(new URL(request.url).hostname,/^(watch|heartbeat)\.example\.test$/);return new Response('',{status:200})})});
 // This fixture owns one Worker lifetime, including tests that stop it early.
 const dispose=worker.dispose.bind(worker);let disposal;worker.dispose=()=>disposal??=Promise.resolve().then(dispose);
 const DB=await worker.getD1Database('DB'),names=(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort();
 for(const name of names){if(name.endsWith('_resilient_monitoring.sql')){await DB.prepare('INSERT INTO runner_registration(id,runner_id,registered_at) VALUES(1,?,?)').bind(legacyId,Date.now()).run();await DB.prepare('INSERT INTO runner_contact(id,last_contact_at) VALUES(1,?)').bind(migratedContact).run();}for(const sql of splitSql(await readFile(join('migrations',name),'utf8')))await DB.prepare(sql).run()}
 const origin=(await worker.ready).origin,cookie=await signInOwner(origin,{bindings}),first={runnerId:legacyId,key,networkLabel:'owner-network'};
 async function request(path,{body,method=body===undefined?'GET':'POST',runner,signed=false,headers={}}={}){
  const text=body===undefined?undefined:JSON.stringify(body),timestamp=String(Date.now());
  const response=await fetch(origin+path,{method,headers:{'content-type':'application/json',origin,cookie,...(runner?{'x-runner-key':runner.key,'x-runner-id':runner.runnerId}:{}),...(signed?{'x-sent-at':timestamp,'x-runner-signature':createHmac('sha256',runner.key).update(`${timestamp}.${path==='/api/runner/enroll'?'runner-enrolment.':''}${text}`).digest('hex')}:{}),...headers},body:text});
  return {status:response.status,data:await response.json()}
 }
 const second=(await request('/api/runners',{body:{networkLabel:'second-network'}})).data;
 async function monitor({runners=[first,second],canary=false,...options}={}){const probes=runners.map((_,i)=>['local-a','local-b','local-c'][i]),assignments=Object.fromEntries(probes.map((p,i)=>[p,{runnerId:runners[i].runnerId,...(canary?{canaryUrl:`http://93.184.216.35:${port}/canary`}:{})}]));const result=await request('/api/monitors',{body:{name:'Network flow',url:`http://93.184.216.34:${port}/target`,probes,assignments,intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1,...options}});assert.equal(result.status,201,JSON.stringify(result.data));return result.data}
 async function claim(runner){const response=await request('/api/runner/claim',{runner,body:{}});assert.equal(response.status,200);return response.data.task}
 async function evidence(task,probe=task.probes[0]){const observation={...await executeTaskProbe(task,probe,{controlPort:Number(new URL(origin).port)}),attempt:0},canaryUrl=task.definition.assignments[probe].canaryUrl;if(canaryUrl)observation.canary={...await executeTaskProbe({...task,definition:{...task.definition,type:'http',url:canaryUrl,request:undefined,assertions:{status:200}}},probe,{controlPort:Number(new URL(origin).port)}),attempt:0};return observation}
 async function submit(runner,task,attempts){return request('/api/runner/results',{runner,signed:true,body:{slotId:task.id,attempts}})}
 async function state(id){const overview=await request('/api/overview');assert.equal(overview.status,200);return overview.data.monitors.find(m=>m.id===id).state}
 async function pause(m){assert.equal((await request('/api/monitors/'+m.id,{method:'PATCH',body:{...m.definition,enabled:false}})).status,200)}
 return {worker,DB,origin,port,bindings,directory,migratedContact,first,second,modes,request,monitor,claim,evidence,submit,state,pause,run:runner=>runRunner({origin,key:runner.key,runnerId:runner.runnerId,localReview:true,once:true}),close}
 }catch(error){
  try{await close()}catch(cleanupError){throw new AggregateError([error,cleanupError],'Resilience fixture startup and cleanup failed')}
  throw error;
 }
}
