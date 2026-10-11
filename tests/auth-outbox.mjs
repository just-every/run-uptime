import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,outboxLink,hostRequest} from './auth-test-support.mjs';
import {authOutboxRuntime} from './auth-outbox-runtime.mjs';
import {splitSql} from './migration-support.mjs';
import {createDevelopmentOutboxHandler,createD1DevelopmentOutbox} from '../src/base/modules/mail/src/development/index.mjs';
const branding=JSON.parse(await readFile(new URL('../src/branding.json',import.meta.url),'utf8'));
const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
const bindings={...testAuthBindings,SENDGRID_API_KEY:'test-provider-must-never-be-contacted'};
let worker,submissions=0;
async function identity(response,status){
 assert.equal(response.status,status);
 const html=await response.text();
 assert.ok(html.includes(`>${branding.name}</`),'auth document uses product name from branding.json');
 assert.ok(html.includes(`background:${branding.primaryColor}`),'auth document uses accent from branding.json');
 return html;
}
async function invalidLink(call,path){
 const response=await call(path);assert.ok(!response.headers.has('set-cookie'),'invalid preview cannot create a session');
 const html=await identity(response,400);
 const action=html.match(/<a\b[^>]*href="([^"]+)"[^>]*>Request a new link<\/a>/)?.[1];
 assert.ok(action==='/login','replacement link goes to the served sign-in route');
 await identity(await call(action),200);
}
async function migrate(DB){
 for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
}
const boundaryCases=[
 ['missing Host',{host:undefined}],
 ['nonloopback Host',{host:'attacker.example.test'}],
 ['mismatched Origin',{origin:'https://attacker.example.test'}],
 ['cross-site fetch metadata',{'sec-fetch-site':'cross-site'}],
 ['forwarded Host cannot replace missing Host',{host:undefined,'x-forwarded-host':new URL(origin).host,forwarded:`host="${new URL(origin).host}";proto=http`}],
 ['forwarded Host cannot replace nonloopback Host',{host:'attacker.example.test','x-forwarded-host':new URL(origin).host,forwarded:`host="${new URL(origin).host}";proto=http`}],
];
async function refusedBeforeReads(call){
 for(const [label,headers] of boundaryCases)for(const path of ['/__dev/outbox','/__dev/outbox?message=private-message']){
  const response=await call(path,undefined,headers);
  assert.equal(response.status,404,`${label} refuses the native outbox route`);
  assert.equal(response.headers.get('x-test-outbox-reads'),'0',`${label} refuses before private outbox reads`);
 }
}
try{
 ({worker}=await migratedWorker({port,persist:join(directory,'local'),bindings,outboundService:()=>{submissions++;throw Error('External transport forbidden')}}));
 const DB=await worker.getD1Database('DB'),call=authRequest(origin);
 const unsignedSetup=await call('/setup');assert.equal(unsignedSetup.status,303);assert.equal(unsignedSetup.headers.get('location'),'/login?returnTo=%2Fsetup');
 const setup=await identity(await call('/claim'),200);assert.match(setup,/data\/local-secrets\.json/);
 const first=sessionCookie(await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Outbox owner'}));
 assert.equal((await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Second owner'})).status,409);
 assert.equal((await call('/auth/signout',{}, {cookie:first})).status,204);
 assert.equal((await call('/api/overview',undefined,{cookie:first})).status,401);
 const loginHTML=await identity(await call('/login'),200);assert.match(loginHTML,/development outbox/);assert.match(loginHTML,/href="\/__dev\/outbox"/);
 await invalidLink(call,'/auth/confirm?token=invalid');
 const sent=await fetch(origin+'/auth/magic-link',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:bindings.OWNER_EMAIL,returnTo:'/'})});
 assert.match(await identity(sent,200),/sign-in link is in the development outbox/);
 const link=await outboxLink(call),token=link.searchParams.get('token');
 await identity(await call(link.pathname+link.search),200);
 assert.equal((await DB.prepare('SELECT consumed_at FROM oa_tokens').first()).consumed_at,null,'opening a link does not consume it');
 const cookie=sessionCookie(await call('/auth/confirm',{token}));
 assert.equal((await call('/api/overview',undefined,{cookie})).status,200);
 assert.equal((await call('/auth/confirm',{token})).status,400,'confirmed link is single-use');
 await invalidLink(call,link.pathname+link.search);
 assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL})).status,202);
 const expired=await outboxLink(call);
 await DB.prepare('UPDATE oa_tokens SET expires_at=? WHERE consumed_at IS NULL').bind(Date.now()-1).run();
 await invalidLink(call,expired.pathname+expired.search);
 assert.equal((await DB.prepare("SELECT COUNT(*) n FROM oa_sessions WHERE kind!='native'").first()).n,0);
 assert.equal((await hostRequest(origin,'/__dev/outbox','nonloopback.example.test')).status,404);
 assert.equal((await call('/__dev/outbox',undefined,{origin:'https://attacker.example.test'})).status,404);
 assert.equal((await hostRequest(origin,'/login','nonloopback.example.test')).status,403,'normal Host guard remains active');
 assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL},{origin:'https://attacker.example.test'})).status,403);
 assert.equal(submissions,0,'development delivery never calls an external mail provider');
 await worker.dispose();worker=null;
 // The envelope keeps exact Host headers through local workerd and counts real
 // outbox reads. It does not alter the emitted application or D1 implementation.
 const native=await authOutboxRuntime(directory,{...bindings,UPTIME_LOCAL_REVIEW:'true',UPTIME_ORIGIN:origin},()=>{submissions++;throw Error('External transport forbidden')});worker=native.worker;
 await migrate(native.DB);
 const admitted=await native.call('/__dev/outbox');assert.equal(admitted.status,200);assert.equal(admitted.headers.get('x-test-outbox-reads'),'1','positive control observes the real D1 outbox read');
 await refusedBeforeReads(native.call);
 // Exercise Base itself with the same native D1 reader. Count attempted SQL
 // preparation, so refusal cannot conceal a read even if it later catches it.
 let baseReads=0;
 const baseDB={prepare(sql){baseReads++;return native.DB.prepare(sql)},batch(statements){return native.DB.batch(statements)}};
 const baseHandler=createDevelopmentOutboxHandler({local:true,origin,outbox:createD1DevelopmentOutbox({db:baseDB})});
 for(const [,headers] of boundaryCases)for(const path of ['/__dev/outbox','/__dev/outbox?message=private-message']){
  const response=await baseHandler(new Request(origin+path,{headers:Object.fromEntries(Object.entries({host:new URL(origin).host,origin,...headers}).filter(([,value])=>value!==undefined))}));
  assert.equal(response,null,'Base rejects the boundary request');
 }
 assert.equal(baseReads,0,'Base refuses every boundary case before private D1 reads');
 assert.equal((await baseHandler(new Request(origin+'/__dev/outbox',{headers:{host:new URL(origin).host}}))).status,200);assert.equal(baseReads,1,'Base read counter has a positive control');
 await worker.dispose();worker=null;
 for(const mode of [
  {UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:'https://uptime.example.test'},
  {UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:'https://127.0.0.1'},
  {UPTIME_LOCAL_REVIEW:'true',UPTIME_ORIGIN:'https://uptime.example.test'},
 ]){
  const settings={...bindings,...mode},native=await authOutboxRuntime(directory,settings,()=>{submissions++;throw Error('External transport forbidden')});worker=native.worker;const callHosted=native.call;
  for(const path of ['/__dev/outbox','/__dev/outbox?message=private-message']){
   const outbox=await callHosted(path);assert.equal(outbox.status,404,'hosted origin never exposes outbox');assert.equal(outbox.headers.get('x-test-outbox-reads'),'0','hosted refusal precedes private outbox reads');
  }
  assert.equal((await callHosted('/auth/magic-link',{email:bindings.OWNER_EMAIL})).status,503,'hosted or nonloopback development provider fails closed');
  await worker.dispose();worker=null;
 }
 assert.equal(submissions,0);
 // Actual hosted SendGrid transport is captured only by this test's outbound
 // service. No provider request leaves the local runtime.
 const hosted={...bindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:'https://uptime.example.test',MAIL_PROVIDER:'sendgrid'},mails=[];
 const nativeHosted=await authOutboxRuntime(directory,hosted,async request=>{assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');mails.push(await request.json());return new Response(null,{status:202})});worker=nativeHosted.worker;
 const callHosted=nativeHosted.call;
 await identity(await callHosted('/claim'),200);
 sessionCookie(await callHosted('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Hosted outbox owner'}));
 await invalidLink(callHosted,'/auth/confirm?token=invalid');
 assert.equal((await callHosted('/auth/magic-link',{email:bindings.OWNER_EMAIL})).status,202);
 assert.equal(mails.length,1,'hosted sign-in still uses SendGrid');
 const hostedLink=new URL(mails[0].content.find(part=>part.type==='text/plain').value.match(/https:\/\/[^\s]+/)[0]);
 await identity(await callHosted(hostedLink.pathname+hostedLink.search),200);
 await nativeHosted.DB.prepare('UPDATE oa_tokens SET expires_at=? WHERE consumed_at IS NULL').bind(Date.now()-1).run();
 await invalidLink(callHosted,hostedLink.pathname+hostedLink.search);
 await worker.dispose();worker=null;
 for(const [label,overrides] of [
  ['missing SendGrid key',{SENDGRID_API_KEY:undefined}],
  ['invalid SendGrid key',{SENDGRID_API_KEY:'invalid key with whitespace'}],
  ['missing sender',{MAIL_FROM:undefined}],
  ['invalid sender',{MAIL_FROM:'not-an-email-address'}],
 ]){
  const settings=Object.fromEntries(Object.entries({...hosted,...overrides}).filter(([,value])=>value!==undefined));
  const native=await authOutboxRuntime(directory,settings,()=>{submissions++;throw Error('External transport forbidden')});worker=native.worker;
  const before=(await native.DB.prepare('SELECT COUNT(*) n FROM oa_sessions').first()).n;
  const response=await native.call('/auth/magic-link',{email:bindings.OWNER_EMAIL});
  assert.equal(response.status,503,`${label} fails closed per request`);assert.ok(!response.headers.has('set-cookie'),'refused mail configuration cannot issue a session cookie');
  assert.equal((await native.DB.prepare('SELECT COUNT(*) n FROM oa_sessions').first()).n,before,`${label} creates no session`);
  assert.equal((await native.DB.prepare('SELECT COUNT(*) n FROM oa_tokens WHERE expires_at>? AND consumed_at IS NULL AND revoked_at IS NULL').bind(Date.now()).first()).n,0,`${label} leaves no usable sign-in link`);
  const outbox=await native.call('/__dev/outbox');assert.equal(outbox.status,404,`${label} does not select development delivery`);assert.equal(outbox.headers.get('x-test-outbox-reads'),'0');
  await worker.dispose();worker=null;
 }
 assert.equal(submissions,0,'no rejected configuration contacts an external provider');
 console.log('AUTH-OUTBOX passed local and hosted identity/recovery, real link expiry, setup/revocation/single-use, all outbox boundaries before private reads, Base guard controls and missing/invalid SendGrid configuration.');
}finally{await worker?.dispose();await cleanupDirectory(directory)}
