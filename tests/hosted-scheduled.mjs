import {completeSecondFactor} from './mfa-auth-support.mjs';
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
  const url=new URL(request.url);if(url.hostname==='api.sendgrid.com')return new Response(null,{status:202});
  if(url.origin==='https://cloudflare-dns.com')return Response.json({Status:0,Answer:[{type:1,data:'93.184.215.14'}]});
  assert.ok(['https://public.example.test','https://example.com'].includes(url.origin),'only declared public targets leave the Worker');
  if(url.pathname==='/self-redirect')return new Response(null,{status:302,headers:{location:origin+'/health'}});
  return new Response('service ready',{status:200,headers:{'content-type':'text/plain'}});
 });
 const db=await worker.getD1Database('DB');
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const call=(path,body,cookie,extra={},method=body===undefined?'GET':'POST')=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method,headers:{host:'uptime.example.test',origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const owner=await call('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Owner'});assert.equal(owner.status,303,await owner.clone().text());
 const cookie=owner.headers.get('set-cookie').split(';')[0];
 await completeSecondFactor(origin,cookie,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),cookie));
 const selfInput={name:'Own health',url:'HTTPS://UPTIME.EXAMPLE.TEST:443/health?probe=1',intervalMs:60000,retries:0,assertions:{status:200}};
 const refused=await call('/api/monitors',selfInput,cookie);
 assert.equal(refused.status,400);assert.match((await refused.json()).error,/private runner/i);
 assert.equal((await (await call('/api/overview',undefined,cookie)).json()).monitors.length,0,'refused self-monitor is not saved');
 const created=await call('/api/monitors',{name:'Public service',url:'https://public.example.test/health',intervalMs:60000,retries:0,assertions:{status:200,bodyIncludes:'ready'}},cookie);
 assert.equal(created.status,201,await created.clone().text());const monitor=await created.json();
 let firstHistory=[];
 for(let attempt=0;attempt<100;attempt++){firstHistory=await (await call(`/api/monitors/${monitor.id}/history`,undefined,cookie)).json();if(firstHistory.some(s=>s.status==='complete'))break;await new Promise(resolve=>setTimeout(resolve,50))}
 assert.ok(firstHistory.some(s=>s.status==='complete'&&s.manual===0),'saving a hosted monitor runs its first scheduled check without Cron');
 const privateClaim=await call('/api/runner/claim',{},undefined,{'x-runner-key':testAuthBindings.UPTIME_RUNNER_KEY});assert.equal(privateClaim.status,200);assert.equal((await privateClaim.json()).task,null,'a private runner cannot consume a Worker-only due slot');
 const edit=await call(`/api/monitors/${monitor.id}`,selfInput,cookie,{},'PATCH');
 assert.equal(edit.status,400);assert.match((await edit.json()).error,/private runner/i);
 const unchanged=(await (await call('/api/overview',undefined,cookie)).json()).monitors[0];
 assert.equal(unchanged.revision,monitor.revision);assert.equal(unchanged.definition.url,monitor.definition.url,'refused edit leaves the saved monitor unchanged');
 const canaryRefused=await call('/api/monitors',{name:'Own canary',url:'https://public.example.test/health',canaryUrl:origin+'/health'},cookie);
 assert.equal(canaryRefused.status,400);assert.match((await canaryRefused.json()).error,/private runner/i);
 // Monitors follow the setting live, so this app's own address is refused as the setting itself.
 const ownSetting=await call('/api/external-check',{url:origin+'/health'},cookie);
 assert.equal(ownSetting.status,400);assert.match((await ownSetting.json()).error,/own address/);
 assert.equal((await call('/api/external-check',{url:'https://example.com/'},cookie)).status,200);
 const runners=await (await call('/api/runners',undefined,cookie)).json(),privateRunner=runners.find(r=>!r.hosted);
 const privateCreated=await call('/api/monitors',{...selfInput,name:'Externally checked own health',assignments:Object.fromEntries(monitor.definition.probes.map(probe=>[probe,privateRunner.runnerId]))},cookie);
 assert.equal(privateCreated.status,201,await privateCreated.clone().text());const privateMonitor=await privateCreated.json();
 const redirected=await call('/api/monitors',{name:'Redirect to own app',url:'https://public.example.test/self-redirect',retries:0,recoverSlots:1},cookie);
 assert.equal(redirected.status,201,await redirected.clone().text());const redirectMonitor=await redirected.json();
 const scheduled=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(scheduled.status,204,await scheduled.text());
 const history=await (await call(`/api/monitors/${monitor.id}/history`,undefined,cookie)).json();
 assert.equal(history.length,1);assert.equal(history[0].manual,0);assert.equal(history[0].status,'complete',JSON.stringify(history));
 assert.ok(history[0].observations.every(o=>o.outcome==='pass'&&o.canary.outcome==='pass'),JSON.stringify(history));
 const overview=await (await call('/api/overview',undefined,cookie)).json();assert.equal(overview.monitors.find(m=>m.id===monitor.id).state.targetState,'Healthy');
 const redirectedHistory=await (await call(`/api/monitors/${redirectMonitor.id}/history`,undefined,cookie)).json();
 assert.equal(redirectedHistory.length,1);assert.ok(redirectedHistory[0].observations.every(o=>o.outcome==='runner_error'&&o.status===undefined),JSON.stringify(redirectedHistory));
 assert.equal(overview.monitors.find(m=>m.id===redirectMonitor.id).state.targetState,'Unknown','an unsupported self-fetch is not a target failure or success');
 assert.equal((await (await call(`/api/monitors/${privateMonitor.id}/history`,undefined,cookie)).json()).length,0,'the Worker does not execute private assignments');
 console.log('PASS request-started and scheduled public Worker checks preserve external health, refuse self-monitor saves and leave self-redirects Unknown');
}finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
