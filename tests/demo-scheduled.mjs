import {completeSecondFactor} from './mfa-auth-support.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';

// Real demo seed, owner API and scheduler; only the public DNS/HTTP edge is faked.
// Any notification reaching that edge fails the test: Base must mock its send.
const directory=await mkdtemp(join(tmpdir(),'uptime-demo-scheduled-')),origin='https://uptime.example.test';
const reads=[];let worker;
try{
 worker=await hostedRuntime(directory,{...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,RER_DEMO:'1'},request=>{
  assert.equal(request.method,'GET','demo notifications must never reach the network');
  const url=new URL(request.url);
  if(url.origin==='https://cloudflare-dns.com'){
   const name=url.searchParams.get('name');
   // Website discovery may guess subdomains of the visitor's site; they do not exist here.
   if(name.endsWith('.example.com'))return Response.json({Status:3});
   assert.ok(['run-uptime.com','app.runeditrun.com','www.githubstatus.com','example.com','example.org'].includes(name),'notification preflight must also stay mocked');
   return Response.json({Status:0,Answer:[{type:1,data:'93.184.215.14'}]});
  }
  assert.ok(['https://run-uptime.com','https://app.runeditrun.com','https://www.githubstatus.com','https://example.com','https://example.org'].includes(url.origin),'only public monitor targets leave the Worker');
  reads.push(url.href);
  if(url.origin==='https://app.runeditrun.com')return Response.json({status:'ok',service:'rer-management'});
  if(url.origin==='https://www.githubstatus.com')return Response.json({page:{name:'GitHub'},status:{indicator:'none',description:'All Systems Operational'}});
  if(url.origin==='https://example.com'&&url.pathname==='/')return new Response('<!doctype html><title>Example Domain</title><h1>Example Domain</h1>',{status:200,headers:{'content-type':'text/html'}});
  return new Response('Uptime service ready',{status:200,headers:{'content-type':'text/plain'}});
 });
 const db=await worker.getD1Database('DB');
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const call=(path,body,cookie)=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method:body===undefined?'GET':'POST',headers:{host:'uptime.example.test',origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const json=async response=>{assert.ok(response.ok,await response.clone().text());return response.json()};
 const startedAt=Date.now(),owner=await call('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Owner'});
 assert.equal(owner.status,303,await owner.clone().text());
 const cookie=owner.headers.get('set-cookie').split(';')[0];
 await completeSecondFactor(origin,cookie,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),cookie));
 // The editor's first path: the Worker checks the visitor's site itself (no private runner exists) and its proposal
 // starts on the Worker, confirmed against the demo's External check URL, which is not the editor's example.com.
 const editor=await json(await call('/api/monitor-editor',undefined,cookie));
 assert.equal(editor.runner.workerDiscovery,true);assert.equal(editor.runner.externalCheckUrl,'https://example.org/');
 const asked=await json(await call('/api/discoveries',{url:'https://example.com/'},cookie));
 const found=await json(await call(`/api/discoveries/${asked.id}`,undefined,cookie));
 assert.equal(found.status,'done',JSON.stringify(found));assert.equal(found.networkLabel,'Cloudflare Worker');
 const home=found.result.proposals.find(p=>p.definition.url==='https://example.com/');assert.ok(home,JSON.stringify(found.result));
 const workerRunner=editor.runner.runners.find(r=>r.hosted).runnerId;
 const proposed=await json(await call('/api/monitors',{...home.definition,probes:['local-a'],assignments:{'local-a':{runnerId:workerRunner}}},cookie));
 // The form's path: example.com, the URL field's placeholder, with no External check URL of its own.
 const monitor=await json(await call('/api/monitors',{name:'Visitor website',url:'https://example.com/',intervalMs:60000,retries:0,recoverSlots:1},cookie));
 const notifications=await json(await call('/api/notifications',undefined,cookie));
 const webhook=notifications.destinations.find(d=>d.kind==='webhook');
 const queued=await json(await call(`/api/notifications/destinations/${webhook.id}/test`,{},cookie));
 const scheduled=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});
 assert.equal(scheduled.status,204,await scheduled.text());
 for(const id of [proposed.id,monitor.id,'checkout-api','status-endpoint','docs-site','run-page']){
  const complete=slot=>slot.manual===0&&slot.status==='complete'&&slot.due_at>=startedAt&&slot.observations.length>0&&slot.observations.every(o=>o.outcome==='pass'&&o.runnerVersion.startsWith('uptime-worker/'));
  let history=[];
  // Console waitUntil and Cron share claims; wait for whichever owns the check.
  for(let attempt=0;attempt<100;attempt++){
   history=await json(await call(`/api/monitors/${id}/history`,undefined,cookie));
   if(history.some(complete))break;
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(history.some(complete),`${id} received a live scheduled Worker check: ${JSON.stringify(history.slice(0,1))}`);
 }
 assert.ok(['https://example.com/','https://app.runeditrun.com/health','https://www.githubstatus.com/api/v2/status.json','https://run-uptime.com/docs','https://run-uptime.com/run'].every(url=>reads.includes(url)));
 const notes=await json(await call('/api/notifications',undefined,cookie));
 assert.equal(notes.deliveries.find(d=>d.id===queued.deliveryId)?.state,'accepted','mocked notification completes normally');
 assert.equal(notes.runnerContact.state,'Never seen','no private runner checked or sent anything');
 console.log('PASS the Worker checks a visitor\'s example.com with no runner; all four demo samples and both visitor example.com monitors receive scheduled Worker results with no runner; notification accepted with no delivery reaching the network');
}finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
