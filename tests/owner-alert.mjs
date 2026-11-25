import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
// A stranger's first alert: a hosted owner with no second factor adds an email destination for their own sign-in
// address, a check fails on the real Cron path, and the provider receives one alert for that address only.
// Any other address still asks for a fresh second factor. Only DNS, the canary, the target and SendGrid are faked.
const directory=await mkdtemp(join(tmpdir(),'uptime-owner-alert-')),origin='https://uptime.example.test',owner=testAuthBindings.OWNER_EMAIL;
const mail=[];let worker;
try{
 worker=await hostedRuntime(directory,{...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-owner-alert'},async request=>{
  const url=new URL(request.url);
  if(url.hostname==='api.sendgrid.com'){mail.push(await request.json());return new Response(null,{status:202})}
  if(url.origin==='https://cloudflare-dns.com')return Response.json({Status:0,Answer:[{type:url.searchParams.get('type')==='A'?1:28,data:url.searchParams.get('type')==='A'?'93.184.215.14':'2606:2800:21f:cb07:6820:80da:af6b:8b2c'}]});
  if(url.origin==='https://example.com')return new Response('canary ready',{status:200,headers:{'content-type':'text/plain'}});
  assert.equal(url.hostname,'down.example.test','only the network canary, the target and SendGrid leave the Worker');
  return new Response('maintenance',{status:503});
 });
 const db=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const call=(path,body,cookie)=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method:body===undefined?'GET':'POST',headers:{host:'uptime.example.test',origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const json=async response=>{assert.ok(response.ok,await response.clone().text());return response.json()};
 const bootstrap=await call('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Owner'});assert.equal(bootstrap.status,303,await bootstrap.clone().text());
 const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
 assert.deepEqual((await json(await call('/api/access/mfa/status',undefined,cookie))).factors,[],'the owner has enrolled nothing');

 const other=await call('/api/notifications/destinations',{name:'Someone else',kind:'email',address:'synthetic-uptime-other@example.test'},cookie);
 assert.equal(other.status,403);assert.equal((await other.json()).code,'fresh_second_factor_required','another address still asks for a fresh second factor');
 const hook=await call('/api/notifications/destinations',{name:'Hook',kind:'webhook',url:'https://hooks.example.com/uptime'},cookie);
 assert.equal(hook.status,403,'a URL still asks for a fresh second factor');
 const own=await call('/api/notifications/destinations',{name:'Me',kind:'email',address:owner},cookie);
 assert.equal(own.status,201,await own.clone().text());
 const {id}=await own.json(),patch=body=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:`${origin}/api/notifications/destinations/${id}`,method:'PATCH',headers:{host:'uptime.example.test',origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',cookie},body:JSON.stringify(body)})});
 const repointed=await patch({name:'Me',enabled:true,address:'synthetic-uptime-other@example.test'});
 assert.equal(repointed.status,403);assert.equal((await repointed.json()).code,'fresh_second_factor_required','re-pointing it at another address still asks');
 assert.equal((await patch({name:'My inbox',enabled:true})).status,200,'a rename needs nothing');

 await json(await call('/api/monitors',{name:'Down service',url:'https://down.example.test/health',retries:0,confirmSlots:1,recoverSlots:1},cookie));
 for(let run=0;run<3&&!mail.length;run++){const response=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(response.status,204)}
 assert.equal(mail.length,1,'one alert');
 assert.deepEqual(mail[0].personalizations.flatMap(p=>[...p.to,...(p.cc??[]),...(p.bcc??[])]).map(r=>r.email),[owner],'to the owner only');
 assert.match(mail[0].subject,/Down service/);
 console.log('PASS a factorless owner adds their own address and a failing check mails them once; other addresses and URLs still need a fresh second factor');
}finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
