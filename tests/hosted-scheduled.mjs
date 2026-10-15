import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
// One public-door integration: HTTP create -> real scheduled handler -> HTTP history.
// Only public DNS/HTTP network edges are faked; no runner process or result submission.
const directory=await mkdtemp(join(tmpdir(),'uptime-hosted-scheduled-')),origin='https://uptime.example.test';
let worker;
try{
 worker=await hostedRuntime(directory,{...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-provider-key'},request=>{
  const url=new URL(request.url);
  if(url.origin==='https://cloudflare-dns.com')return Response.json({Status:0,Answer:[{type:1,data:'93.184.215.14'}]});
  assert.ok(['https://public.example.test','https://example.com'].includes(url.origin),'only declared public targets leave the Worker');
  return new Response('service ready',{status:200,headers:{'content-type':'text/plain'}});
 });
 const db=await worker.getD1Database('DB');
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const call=(path,body,cookie,extra={})=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method:body===undefined?'GET':'POST',headers:{host:'uptime.example.test',origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const owner=await call('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Owner'});assert.equal(owner.status,303,await owner.clone().text());
 const cookie=owner.headers.get('set-cookie').split(';')[0];
 const created=await call('/api/monitors',{name:'Public service',url:'https://public.example.test/health',intervalMs:60000,retries:0,assertions:{status:200,bodyIncludes:'ready'}},cookie);
 assert.equal(created.status,201,await created.clone().text());const monitor=await created.json();
 assert.equal((await (await call(`/api/monitors/${monitor.id}/history`,undefined,cookie)).json()).length,0);
 const privateClaim=await call('/api/runner/claim',{},undefined,{'x-runner-key':testAuthBindings.UPTIME_RUNNER_KEY});assert.equal(privateClaim.status,200);assert.equal((await privateClaim.json()).task,null,'a private runner cannot consume a Worker-only due slot');
 const scheduled=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(scheduled.status,204,await scheduled.text());
 const history=await (await call(`/api/monitors/${monitor.id}/history`,undefined,cookie)).json();
 assert.equal(history.length,1);assert.equal(history[0].manual,0);assert.equal(history[0].status,'complete',JSON.stringify(history));
 assert.ok(history[0].observations.every(o=>o.outcome==='pass'&&o.canary.outcome==='pass'),JSON.stringify(history));
 const overview=await (await call('/api/overview',undefined,cookie)).json();assert.equal(overview.monitors[0].state.targetState,'Healthy');
 console.log('PASS public monitor receives scheduled Worker evidence without a runner');
}finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
