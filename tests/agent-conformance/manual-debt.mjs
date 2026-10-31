import assert from 'node:assert/strict';
import https from 'node:https';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {certificates,socketEdge} from '../tls-auth-support.mjs';
import {executeTaskProbe} from '../../runners/src/execute-task.mjs';

// Only DNS, TLS and the authorized target socket are controlled. Production
// runner execution and signed intake create every debt through native doors.
export async function prepareManualDebt(http,{name='Native conformance cleanup boundary',open=2}={}){
 const directory=await mkdtemp(join(tmpdir(),'uptime-manual-debt-'));
 let server,restore;
 try{
  const certs=await certificates(directory),calls=[];
  server=https.createServer(certs.server,(request,response)=>{
   calls.push(request.method+' '+request.url);
   if(request.method==='DELETE'){response.socket.destroy();return}
   response.setHeader('content-type','application/json');
   response.statusCode=request.method==='POST'?201:200;
   response.end(JSON.stringify({ready:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,url=path=>`https://auth.example.test:${port}${path}`;
  restore=socketEdge(port,certs.ca);
  const runner=await http.json('/api/runners',{networkLabel:'synthetic-uptime-'+randomUUID()});
  const signed=async(path,body,enrollment=false)=>{
   const at=String(Date.now()),raw=JSON.stringify(body);
   return http.json(path,body,{headers:{'x-runner-key':runner.key,'x-runner-id':runner.runnerId,
    'x-sent-at':at,'x-runner-signature':createHmac('sha256',runner.key).update(at+'.'+(enrollment?'runner-enrolment.':'')+raw).digest('hex')}});
  };
  await signed('/api/runner/enroll',{version:1},true);
  const monitor=await http.json('/api/monitors',{
   name:name+' '+randomUUID().slice(0,8),type:'api',network:'public',url:url('/setup'),
   api:{variables:{},steps:[
    {name:'Create synthetic fixture',phase:'setup',url:url('/setup'),method:'POST',assertions:{status:201}},
    {name:'Read synthetic fixture',phase:'request',url:url('/fixture'),method:'GET',assertions:{status:200}},
    {name:'Remove synthetic fixture',phase:'cleanup',url:url('/fixture'),method:'DELETE',assertions:{status:200}},
   ]},intervalMs:86400000,timeoutMs:10000,retries:0,probes:['local-a'],
   assignments:{'local-a':{runnerId:runner.runnerId,canaryUrl:`https://token.example.test:${port}/canary`}},failureQuorum:1,confirmSlots:2,recoverSlots:1,
   freshnessMs:86400000,enabled:true,service:'conformance',group:'conformance',
  });
  const debts=()=>http.json('/api/monitors/'+monitor.id+'/cleanup-debt');
  async function execute({manual=false,queue=manual,slotId}={}){
   if(queue)slotId=(await http.json('/api/monitors/'+monitor.id+'/run',{})).slotId;
   const {task}=await http.json('/api/runner/claim',{}, {headers:{'x-runner-key':runner.key,'x-runner-id':runner.runnerId}});
   assert.equal(task?.monitorId,monitor.id,'the enrolled runner claims this immutable API definition');
   if(manual)assert.equal(task.id,slotId,'the runner executes exactly the queued manual slot');
   assert.equal(task.definition.retries,0);assert.deepEqual(task.probes,['local-a']);
   const before=calls.length,result=await executeTaskProbe(task,task.probes[0],{});
   assert.equal(result.outcome,'target_failure','the production API verdict retains denied cleanup');
   assert.equal(result.apiTransaction.cleanup.failed,1);
   assert.deepEqual(result.apiTransaction.steps.map(step=>[step.phase,step.outcome]),[
    ['setup','pass'],['request','pass'],['cleanup','target_failure'],
   ]);
   assert.ok(calls.length>before,'actual production execution reached the controlled target');
   const canary=await executeTaskProbe({...task,definition:{...task.definition,type:'http',api:undefined,
    url:task.definition.assignments[task.probes[0]].canaryUrl,request:undefined,assertions:{status:200}}},task.probes[0],{statusOnly:true});
   assert.equal(canary.outcome,'pass','the separately named authorized canary remains reachable');
   const accepted=await signed('/api/runner/results',{slotId:task.id,attempts:[{...result,attempt:0,canary:{...canary,attempt:0}}]});
   assert.equal(accepted.accepted,true,'signed production evidence establishes the debt');
   return task;
  }
  await execute();
  for(let count=1;count<open;count++)await execute({manual:true});
  assert.equal((await debts()).open.length,open);
  const close=async()=>{restore?.();restore=null;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true})};
  return {monitor,debts,execute,close};
 }catch(error){
  restore?.();if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
  await rm(directory,{recursive:true,force:true});throw error;
 }
}
