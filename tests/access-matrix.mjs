// BASE-ACCESS-002: native session denial, fixed expiry, revocation and no denied mutation.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,outboxSignIn,finishSetup} from './auth-test-support.mjs';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {splitSql} from './migration-support.mjs';
const directory=await runtimeDirectory(),[port]=await availablePorts(1);
let worker;
const documents=['/app','/app/','/app/monitor','/app/monitor/','/app/monitors/private','/_serverFn/private','/setup'];
const reads=['/api/overview','/api/archive','/api/notifications','/api/notifications/destinations','/api/monitors/private/history','/api/monitors/private/revisions'];
const writes=[['POST','/api/monitors'],['PATCH','/api/monitors/private'],['POST','/api/monitors/private/heartbeat-key'],['POST','/api/monitors/private/run'],['POST','/api/restore'],['POST','/api/notifications/destinations'],['PATCH','/api/notifications/destinations/private'],['DELETE','/api/notifications/destinations/private'],['POST','/api/notifications/destinations/private/rotate'],['POST','/api/notifications/destinations/private/test'],['POST','/api/auth/sign-out']];
async function snapshot(DB){
 const tables=['monitors','revisions','slots','observations','outbox','oa_sessions','oa_operators','uptime_first_run'];
 return Promise.all(tables.map(async table=>(await DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
}
try{
 for(const hosted of [false,true]){
  const origin=hosted?'https://uptime.example.test':`http://127.0.0.1:${port}`,mails=[];
  const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,UPTIME_LOCAL_REVIEW:hosted?'false':'true',...(hosted?{MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-captured-provider-key'}:{})};
  let DB,fetcher=fetch;
  if(hosted){
   worker=await hostedRuntime(directory,bindings,async request=>{assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');mails.push(await request.json());return new Response(null,{status:202})});DB=await worker.getD1Database('DB');
   for(const file of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
   fetcher=(url,init)=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url,method:init.method,headers:{...init.headers,'cf-connecting-ip':'192.0.2.1'},body:init.body})});
  }else({worker,DB}=await migratedWorker({port,persist:join(directory,'local'),bindings}));
  const call=authRequest(origin,fetcher);
  const bootstrapStarted=Date.now();
  const expired=sessionCookie(await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Access owner'}));
  const bootstrapFinished=Date.now(),dayMs=24*60*60*1000;
  const lifetime=await DB.prepare('SELECT created_at,expires_at FROM oa_sessions').first();
  const duration=lifetime.expires_at-lifetime.created_at;
  assert.ok(duration>0&&duration<=30*dayMs,'native session absolute lifetime is positive and at most 30 days');
  assert.ok(duration<=7*dayMs&&duration>=7*dayMs-(bootstrapFinished-bootstrapStarted),'Base seed defaults to seven days, allowing only measured issuance time');
  assert.ok(lifetime.expires_at>=bootstrapStarted+7*dayMs&&lifetime.expires_at<=bootstrapFinished+7*dayMs,'absolute expiry uses the seven-day default from issuance');
  assert.equal((await call('/api/overview',undefined,{cookie:expired})).status,200);
  assert.deepEqual(await DB.prepare('SELECT created_at,expires_at FROM oa_sessions').first(),lifetime,'ordinary authenticated reads do not slide or extend session expiry');
  // Fixed absolute expiry also bounds an inactive session by the same lifetime.
  await DB.prepare('UPDATE oa_sessions SET expires_at=?').bind(Date.now()-1000).run();
  async function login(){
   if(!hosted)return outboxSignIn(origin,{bindings,fetcher});
   assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL})).status,202);
   const link=new URL(mails.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s]+/)[0]);
   return sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
  }
  const revoked=await login();assert.equal((await call('/auth/signout',{}, {cookie:revoked})).status,204);
  const valid=await login();await finishSetup(origin,valid,fetcher);
  assert.equal((await call('/api/monitors',{name:'Private access evidence',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000}},{cookie:valid})).status,201);
  const before=await snapshot(DB);
  for(const [state,cookie] of [['missing',''],['expired',expired],['revoked',revoked]]){
   for(const path of documents){const response=await call(path,undefined,{cookie});assert.equal(response.status,303,`${hosted?'hosted':'local'} ${state} ${path}`);assert.equal(response.headers.get('location'),path==='/setup'?'/login?returnTo=%2Fsetup':'/login');assert.doesNotMatch(await response.text(),/monitor-list|Private access evidence/)}
   for(const path of reads){const response=await call(path,undefined,{cookie});assert.equal(response.status,401,`${state} ${path}`);assert.deepEqual(await response.json(),{error:'Owner session required'})}
   for(const [method,path] of writes){const response=await fetcher(origin+path,{method,redirect:'manual',headers:{host:new URL(origin).host,origin,'content-type':'application/json',cookie},...(method==='DELETE'?{}:{body:'{}'})});assert.equal(response.status,401,`${state} ${method} ${path}`);assert.deepEqual(await response.json(),{error:'Owner session required'})}
   const setupDenied=await call('/setup',{}, {cookie});assert.equal(setupDenied.status,303);assert.equal(setupDenied.headers.get('location'),'/login?returnTo=%2Fsetup');
   assert.deepEqual(await snapshot(DB),before,`${state} requests disclose no data and perform no mutation`);
   assert.equal((await call('/does-not-exist',undefined,{cookie})).status,404);
  }
  for(const path of ['/app','/app/monitor','/app/monitors/private']){const response=await call(path,undefined,{cookie:valid});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/)}
  const canonical=await call('/app/monitor/',undefined,{cookie:valid});assert.equal(canonical.status,307);assert.equal(canonical.headers.get('location'),'/app/monitor');
  assert.equal((await call('/api/overview',undefined,{cookie:valid})).status,200);
  assert.equal((await call('/api/monitors',{name:'Authorized write',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000}},{cookie:valid})).status,201);
  assert.equal((await call('/does-not-exist',undefined,{cookie:valid})).status,404);
  assert.equal((await call('/login')).status,200);
  assert.match(await (await call('/claim')).text(),/data\/local-secrets\.json/);
  await worker.dispose();worker=null;
 }
 console.log('BASE-ACCESS-002 passed missing, expired, revoked and valid Base sessions on local and emitted hosted Worker documents, reads and every owner mutation; denied operations leave durable data unchanged; seven-day absolute expiry stays below 30 days and never slides on reads.');
}finally{await worker?.dispose();await cleanupDirectory(directory)}
