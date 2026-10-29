import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {runRunner} from '../runners/src/private-runner.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {splitSql} from './migration-support.mjs';
import {acceptanceReceiver,loopbackWireTransport,verifySecurityNotice} from './notify-acceptance-receivers.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,fixtureProcess,cleanupDirectory,ownerAPI,waitFor} from './notify-acceptance-runtime.mjs';

export const lifecycleEndpoints={
 webhook:'https://synthetic-uptime-461.example.com/incident',
 slack:['https://hooks.slack.com/services/synthetic-uptime-462/synthetic-uptime-463/synthetic-uptime-464','https://hooks.slack.com/services/synthetic-uptime-465/synthetic-uptime-466/synthetic-uptime-467'],
 email:['synthetic-uptime-468','synthetic-uptime-469'].map(local=>local+'@'+'example.test'),
};

// Only the target and provider transports are controlled. Both harnesses run
// the emitted application, its real authentication, D1 and scheduled delivery.
export async function lifecycleRuntime(mode,observe){
 const directory=await runtimeDirectory(),endpoints=lifecycleEndpoints;
 const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',MAIL_FROM:'synthetic-uptime-471'+'@'+'example.test',SENDGRID_API_KEY:'synthetic-uptime-472'};
 let worker,DB,fixture,api,origin,monitorURL,healthy=true,now=Date.now();
 const receivers=[];
 const mail=record=>{
  if(record.body.subject==='Uptime second-factor security change')return verifySecurityNotice(record,bindings.OWNER_EMAIL);
  return observe('email',record.body.personalizations[0].to[0].email,record);
 };
 const close=async()=>{await worker?.dispose();await fixture?.stop();await Promise.all(receivers.map(receiver=>receiver.close()));await cleanupDirectory(directory)};
 try{
  if(mode==='runner'){
   const [controlPort,fixturePort,mailPort,webhookPort,oldSlackPort,newSlackPort]=await availablePorts(6);
   origin=`http://127.0.0.1:${controlPort}`;monitorURL=`http://127.0.0.1:${fixturePort}/health`;
   bindings.UPTIME_SYNTHETIC_PORT=String(fixturePort);
   receivers.push(await acceptanceReceiver(mailPort,mail));
   receivers.push(await acceptanceReceiver(webhookPort,record=>observe('webhook',endpoints.webhook,record)));
   for(const [index,port]of [oldSlackPort,newSlackPort].entries())receivers.push(await acceptanceReceiver(port,record=>observe('slack',endpoints.slack[index],record)));
   const transport=loopbackWireTransport(new Map([[endpoints.webhook,{port:webhookPort,path:'/incident'}],...[oldSlackPort,newSlackPort].map((port,index)=>[endpoints.slack[index],{port,path:'/slack'}])]));
   ({worker,DB}=await migratedWorker({port:controlPort,persist:join(directory,'worker'),bindings,outboundService:async request=>{
    assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');
    const headers=new Headers(request.headers);for(const name of ['host','connection','transfer-encoding','content-length'])headers.delete(name);
    return fetch(`http://127.0.0.1:${mailPort}/v3/mail/send`,{method:request.method,headers,body:await request.arrayBuffer(),redirect:'error'});
   }}));
   const grantPath=join(directory,'grant.json');fixture=fixtureProcess(fixturePort,grantPath,directory);
   await waitFor(async()=>(await fetch(monitorURL)).ok,'lifecycle target ready');
   const owner=ownerAPI(origin);await owner.signIn(bindings);api=owner.api;
   const drain=async()=>{await runRunner({origin,key:bindings.UPTIME_RUNNER_KEY,grantPath,localReview:true,transport,once:true});receivers.forEach(receiver=>receiver.assertValid())};
   return {api,origin,monitorURL,intervalMs:5000,get DB(){return DB},drain,close,
    async transition(id,passing){
     assert.equal((await fetch(`http://127.0.0.1:${fixturePort}/control`,{method:'POST',body:JSON.stringify({mode:passing?'healthy':'failing'})})).status,200);
     await waitFor(async()=>{await drain();const result=await api('/api/overview');assert.equal(result.status,200);return result.data.monitors.find(m=>m.id===id)?.state.state===(passing?'Healthy':'Failing')},'signed scheduled lifecycle transition');
     await drain();
    }};
  }
  origin='https://synthetic-uptime-473.example.test';monitorURL='https://synthetic-uptime-474.example.test/health';
  // Advance scheduled slots without real minute-long sleeps. Keep the whole
  // journey within the independent receiver's real five-minute signature window.
  now-=180000;
  Object.assign(bindings,{UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin});
  const outbound=async request=>{
   const url=new URL(request.url);
   if(url.origin==='https://cloudflare-dns.com')return Response.json({Status:0,Answer:[{type:url.searchParams.get('type')==='A'?1:28,data:url.searchParams.get('type')==='A'?'93.184.215.14':'2606:2800:21f:cb07:6820:80da:af6b:8b2c'}]});
   if(request.url==='https://example.com/')return new Response('external check ready',{status:200});
   if(request.url===monitorURL)return new Response(healthy?'ready':'unavailable',{status:healthy?200:503});
   const raw=Buffer.from(await request.arrayBuffer()),record={raw,headers:request.headers,body:JSON.parse(raw.toString('utf8')),path:url.pathname};
   if(url.origin==='https://api.sendgrid.com'){await mail(record);return new Response(null,{status:202})}
   assert.ok(request.url===endpoints.webhook||endpoints.slack.includes(request.url),'only reviewed notification endpoints leave the Worker');
   await observe(url.hostname==='hooks.slack.com'?'slack':'webhook',request.url,record);
   return new Response(url.hostname==='hooks.slack.com'?'ok':'accepted',{status:200});
  };
  const start=async()=>{worker=await hostedRuntime(directory,bindings,outbound,{now});DB=await worker.getD1Database('DB')};
  await start();
  for(const file of(await readdir('migrations')).filter(file=>file.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  let cookie='';
  const fetcher=(url,init={})=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url,method:init.method??'GET',headers:{host:new URL(origin).host,origin,'cf-connecting-ip':'192.0.2.1','content-type':'application/json',cookie,...init.headers},...(init.body===undefined?{}:{body:init.body})})});
  const owner=await fetcher(origin+'/auth/bootstrap',{method:'POST',body:JSON.stringify({token:bindings.SETUP_TOKEN,displayName:'Lifecycle owner'})});assert.equal(owner.status,303);cookie=owner.headers.get('set-cookie').split(';')[0];
  await completeSecondFactor(origin,cookie,fetcher,now);
  api=async(path,method='GET',value)=>{const response=await fetcher(origin+path,{method,...(value===undefined?{}:{body:JSON.stringify(value)})});return {status:response.status,data:await response.json()}};
  const drain=async()=>{const response=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(response.status,204,await response.text())};
  return {api,origin,monitorURL,intervalMs:60000,get DB(){return DB},drain,close,
   async transition(id,passing){
    healthy=passing;await worker.dispose();worker=null;now+=60000;await start();await drain();
    await waitFor(async()=>{const result=await api('/api/overview');assert.equal(result.status,200);return result.data.monitors.find(m=>m.id===id)?.state.state===(passing?'Healthy':'Failing')},'hosted scheduled lifecycle transition');
    await drain();
   }};
 }catch(error){await close();throw error}
}
