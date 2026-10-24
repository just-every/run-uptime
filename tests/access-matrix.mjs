import {completeSecondFactor} from './mfa-auth-support.mjs';
// BASE-ACCESS-002 and BASE-ACCESS-004: native session denial, fixed expiry, revocation, member refusal and forged claims, with no denied mutation.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {join} from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,emailSignIn,finishSetup} from './auth-test-support.mjs';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {splitSql} from './migration-support.mjs';
import {proveMemberLifecycle} from './access-admin-support.mjs';
import {apiRoutes} from '../src/domain/request-boundary.ts';
const directory=await runtimeDirectory(),[port]=await availablePorts(1);
let worker;
const documents=['/app','/app/','/app/monitor','/app/monitor/','/app/monitors','/app/locations','/app/notifications','/app/archive','/app/settings','/app/signout','/app/monitors/new','/app/monitors/new/manual','/app/monitors/new/discovery/private','/app/monitors/private','/app/monitors/private/edit','/_serverFn/private','/setup'];
// Every owner route in the Worker's route table (runner and heartbeat routes carry their own credentials and are checked below).
const ownerRoutes=apiRoutes.filter(route=>route.path!=='/api/v1/openapi.json'&&!route.path.startsWith('/api/runner/')&&!route.path.startsWith('/api/heartbeats/')&&!route.path.startsWith('/api/evidence/')).map(route=>[route.method,route.path.replace(':id',route.path.startsWith('/api/discoveries/')?'00000000-0000-0000-0000-000000000000':'private')]);
const reads=ownerRoutes.filter(([method])=>method==='GET').map(([,path])=>path),writes=ownerRoutes.filter(([method])=>method!=='GET');
// Every durable table but the request counters a refused request may still advance.
async function everything(DB){
 const tables=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB '_cf*' AND name NOT IN ('public_rate_limits','oa_limits') ORDER BY name").all()).results;
 return Promise.all(tables.map(async({name})=>[name,(await DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results]));
}
async function snapshot(DB){
 const tables=['monitors','revisions','slots','observations','outbox','oa_sessions','oa_operators','uptime_first_run','external_check'];
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
   if(!hosted)return emailSignIn(origin,{bindings,fetcher});
   assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL})).status,202);
   const link=new URL(mails.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s]+/)[0]);
   const cookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));await completeSecondFactor(origin,cookie,fetcher);return cookie;
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
  for(const path of ['/app/monitors','/app/monitors/new','/app/monitors/private']){const response=await call(path,undefined,{cookie:valid});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/)}
  const canonical=await call('/app/monitor/',undefined,{cookie:valid});assert.equal(canonical.status,308);assert.equal(canonical.headers.get('location'),'/app/monitors/new');
  assert.equal((await call('/api/overview',undefined,{cookie:valid})).status,200);
  assert.equal((await call('/api/monitors',{name:'Authorized write',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000}},{cookie:valid})).status,201);
  // Discovery: owner routes refuse a cross-origin caller even with a valid owner session, and a runner key is not an owner session.
  // Runner routes admit only the runner's own key (and, for an answer, its fresh signature); an owner session is not a runner.
  const jobId='00000000-0000-0000-0000-000000000000',runnerKey=bindings.UPTIME_RUNNER_KEY,answer=JSON.stringify({error:'Nothing to report'}),answerPath=`/api/runner/discoveries/${jobId}/result`;
  const hmac=(key,at,body)=>createHmac('sha256',key).update(`${at}.${body}`).digest('hex'),now=String(Date.now()),old=String(Date.now()-120000);
  const discoveryBefore=await snapshot(DB);
  for(const headers of [{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'}]){
   assert.equal((await call('/api/discoveries',{url:'https://example.com/'},{cookie:valid,...headers})).status,403,'cross-origin create');
   assert.equal((await call('/api/discoveries/'+jobId,undefined,{cookie:valid,...headers})).status,403,'cross-origin read');
  }
  // The External check URL: the same owner-only, same-origin rules, and a refused change leaves the stored value as it was.
  // First-run stores its default URL, so each refused change asks for a different one.
  const external=async()=>(await DB.prepare('SELECT url FROM external_check').first()).url,stored=await external(),attempt='https://example.net/';
  assert.notEqual(stored,attempt);
  for(const headers of [{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'}]){
   assert.equal((await call('/api/external-check',{url:attempt},{cookie:valid,...headers})).status,403,'cross-origin external check change');
   assert.equal((await call('/api/external-check',undefined,{cookie:valid,...headers})).status,403,'cross-origin external check read');
  }
  assert.equal((await call('/api/external-check',{url:attempt},{'x-runner-key':runnerKey})).status,401,'a runner key is not an owner session');
  assert.equal(await external(),stored,'refused requests leave the External check URL unchanged');
  assert.equal((await call('/api/discoveries',{url:'https://example.com/'},{'x-runner-key':runnerKey})).status,401,'a runner key does not open owner routes');
  assert.equal((await call('/api/discoveries/'+jobId,undefined,{'x-runner-key':runnerKey})).status,401);
  for(const path of ['/api/runner/discoveries/claim',answerPath]){
   for(const [label,headers] of [['no credentials',{}],['an owner session alone',{cookie:valid}],['a wrong key',{'x-runner-key':'wrong'+runnerKey}],['a truncated key',{'x-runner-key':runnerKey.slice(1)}],['an unknown runner id',{'x-runner-key':runnerKey,'x-runner-id':`self-${jobId}`}]]){
    const response=await call(path,path===answerPath?JSON.parse(answer):{},headers);assert.equal(response.status,401,`${path} with ${label}`);assert.deepEqual(await response.json(),{error:'Runner authorization required'});
   }
  }
  for(const [label,headers] of [['no signature',{'x-runner-key':runnerKey}],['a wrong signature',{'x-runner-key':runnerKey,'x-sent-at':now,'x-runner-signature':hmac('wrong'+runnerKey,now,answer)}],['a signature over another body',{'x-runner-key':runnerKey,'x-sent-at':now,'x-runner-signature':hmac(runnerKey,now,'{}')}],['a stale clock',{'x-runner-key':runnerKey,'x-sent-at':old,'x-runner-signature':hmac(runnerKey,old,answer)}]]){
   const response=await call(answerPath,JSON.parse(answer),headers);assert.equal(response.status,403,`signed answer with ${label}`);assert.deepEqual(await response.json(),{error:'Invalid signed result'});
  }
  assert.deepEqual(await snapshot(DB),discoveryBefore,'refused discovery requests change no installation data');
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM discovery_jobs').first()).n,0,'refused discovery requests create no job');
   if(hosted){
   // BASE-ACCESS-004: a signed-in member is not an owner. Every owner read and mutation, every owner-only account change and
   // first-run setup refuse it, and nothing durable changes.
   await DB.prepare("INSERT INTO oa_operators VALUES('member','member@example.test','Member','member','active',1,?)").bind(Date.now()).run();
   assert.equal((await call('/auth/magic-link',{email:'member@example.test'})).status,202);
   const memberCookie=sessionCookie(await call('/auth/confirm',{token:new URL(mails.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s]+/)[0]).searchParams.get('token')}));
   const ownerId=(await DB.prepare("SELECT id FROM oa_operators WHERE role='owner'").first()).id,memberBefore=await everything(DB);
   for(const path of reads)assert.equal((await call(path,undefined,{cookie:memberCookie})).status,401,`member GET ${path}`);
   for(const [method,path] of writes){const response=await fetcher(origin+path,{method,redirect:'manual',headers:{host:new URL(origin).host,origin,'content-type':'application/json',cookie:memberCookie},...(method==='DELETE'?{}:{body:'{}'})});assert.equal(response.status,401,`member ${method} ${path}`)}
   for(const [path,body] of [['/auth/operator/role',{operatorId:'member',role:'owner'}],['/auth/operator/status',{operatorId:ownerId,status:'inactive'}],['/auth/invite',{email:'friend@example.test',displayName:'Friend',role:'owner'}],['/auth/invite/cancel',{operatorId:ownerId}]])assert.equal((await call(path,body,{cookie:memberCookie})).status,403,`member ${path}`);
   assert.equal((await call('/setup',{}, {cookie:memberCookie})).status,403,'member first-run setup');
   assert.deepEqual(await everything(DB),memberBefore,'a member changes nothing durable');
   await proveMemberLifecycle({origin,call,fetcher,DB,cookie:valid,memberCookie,hosted,mails});
   // Identity, role and ownership claims a client sends are never authority: an owner's request carrying forged claims in its
   // headers and body is recorded under the session's own operator, and no claim is stored anywhere.
   const marker='forged-claim-0001',claims={'x-operator-id':marker,'x-user-id':marker,'x-forwarded-user':marker,'x-forwarded-email':`${marker}@example.test`,'cf-access-authenticated-user-email':`${marker}@example.test`,'x-runner-id':marker};
   const forged={actor:{kind:'operator',ref:marker},operatorId:marker,ownerId:marker,role:'owner',email:`${marker}@example.test`};
   const created=await call('/api/monitors',{name:'Forged claims',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000},...forged},{cookie:valid,...claims});assert.equal(created.status,201);
   assert.equal((await call(`/api/monitors/${(await created.json()).id}/erase`,{name:'Forged claims',...forged},{cookie:valid,...claims})).status,200);
   const erasure=await DB.prepare("SELECT actor_kind,actor_ref FROM uptime_audit WHERE action LIKE '%erase%' ORDER BY rowid DESC").first();
   assert.deepEqual({...erasure},{actor_kind:'operator',actor_ref:ownerId},'the erasure is recorded under the session operator');
   assert.ok(!JSON.stringify(await everything(DB)).includes(marker),'no forged claim is stored');
   const discoveryJobsBefore=(await DB.prepare('SELECT * FROM discovery_jobs ORDER BY id').all()).results;
   assert.equal((await call('/api/discoveries',{url:'https://example.com/'},{cookie:memberCookie})).status,401,'member create');
   assert.equal(await external(),stored);
   assert.deepEqual((await DB.prepare('SELECT * FROM discovery_jobs ORDER BY id').all()).results,discoveryJobsBefore,'refused member creation preserves every existing job byte for byte');
  }
  assert.equal((await call('/does-not-exist',undefined,{cookie:valid})).status,404);
  assert.equal((await call('/login')).status,200);
  assert.match(await (await call('/claim')).text(),/data\/local-secrets\.json/);
  await worker.dispose();worker=null;
 }
 console.log('BASE-ACCESS-002 passed missing, expired, revoked and valid Base sessions on local and emitted hosted Worker documents, reads and every owner mutation; denied operations leave durable data unchanged; seven-day absolute expiry stays below 30 days and never slides on reads. BASE-ACCESS-004 passed: a member is refused every owner route and account change with nothing durable changed, and forged identity claims are neither authority nor stored.');
}finally{await worker?.dispose();await cleanupDirectory(directory)}
