import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';

// One public-door journey. Only the relay's network edge is replaced.
const directory=await mkdtemp(join(tmpdir(),'uptime-rer-mail-'));
const origin='https://uptime.example.test',relay='https://runeditrun.example.test/api/managed-mail/send';
const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,
 MAIL_PROVIDER:'rer',MAIL_RELAY_URL:relay,MAIL_API_KEY:'test-only-relay-credential'};
const requests=[],edgeErrors=[];let status=202,worker;
try{
 worker=await hostedRuntime(directory,bindings,async request=>{
  try{
  assert.equal(request.url,relay);assert.equal(request.method,'POST');
  assert.equal(request.headers.get('authorization'),'Bearer '+bindings.MAIL_API_KEY);
  assert.equal(request.headers.get('content-type'),'application/json');
  const body=await request.json();
  assert.deepEqual(Object.keys(body).sort(),['to','subject','text',...(body.html?['html']:[])].sort());
  assert.equal(typeof body.to,'string');assert.ok(body.subject&&body.text);
  requests.push(body);
  }catch(error){edgeErrors.push(error.message);throw error}
  if(status===302)return new Response(null,{status,headers:{location:'https://redirect-target.example.test/'}});
  return Response.json(status===202?{accepted:true}:{error:'relay problem'},
   {status,headers:status===429?{'retry-after':'2'}:{}});
 },{observeFetch:true});
 const db=await worker.getD1Database('DB');
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())
  for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const call=(path,body,cookie,form=false)=>worker.dispatchFetch('http://127.0.0.1:15504/',{
  method:'POST',redirect:'manual',body:JSON.stringify({url:origin+path,method:body===undefined?'GET':'POST',
   headers:{host:'uptime.example.test',origin,'content-type':form?'application/x-www-form-urlencoded':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{})},
   ...(body===undefined?{}:{body:form?body:JSON.stringify(body)})})});
 const scheduled=async()=>{const r=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(r.status,204,await r.text())};
 const owner=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Relay owner'});
 assert.equal(owner.status,303,await owner.clone().text());const cookie=owner.headers.get('set-cookie').split(';')[0];
 const signIn=await call('/auth/magic-link',{email:bindings.OWNER_EMAIL});
 assert.deepEqual(edgeErrors,[]);assert.equal(signIn.status,202,await signIn.clone().text());
 const message=requests[0],link=new URL(message.text.match(/https:\/\/[^\s]+/)[0]);
 assert.equal(link.origin,origin);assert.equal(link.pathname,'/auth/confirm');
 assert.ok(link.searchParams.get('token'));
 assert.equal(message.to,bindings.OWNER_EMAIL);
 assert.deepEqual(Object.keys(message).sort(),['html','subject','text','to'],'exact relay envelope: content only');
 assert.ok(message.html.includes(link.href.replaceAll('&','&amp;')),'HTML and text carry the same confirmation');

 const added=await call('/api/notifications/destinations',{name:'Operations inbox',kind:'email',address:'oncall@example.test'},cookie);
 assert.equal(added.status,201);const destination=await added.json();
 status=429;
 const queued=await call(`/api/notifications/destinations/${destination.id}/test`,{},cookie);
 assert.equal(queued.status,202);const {deliveryId}=await queued.json();
 const row=()=>db.prepare('SELECT state,code,claim_until,attempts FROM notification_jobs WHERE id=?').bind(deliveryId).first();
 await scheduled();const limited=await row();
 assert.equal(limited.state,'queued');assert.equal(limited.code,'provider_rate_limited');
 assert.ok(limited.claim_until>Date.now(),'Retry-After defers the next submission');
 const count=requests.length;await scheduled();assert.equal(requests.length,count,'no early retry');
 status=202;await new Promise(resolve=>setTimeout(resolve,Math.max(0,limited.claim_until-Date.now()+20)));
 await scheduled();assert.equal(requests.length,count+1);
 assert.deepEqual(requests.at(-1),requests.at(-2),'retry preserves the message');
 assert.equal((await row()).state,'accepted');assert.equal((await row()).attempts,2);

 status=302;const beforeRedirect=requests.length;
 assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL})).status,503);
 assert.equal(requests.length,beforeRedirect+1,'a redirect is rejected without following it');
 assert.deepEqual(edgeErrors,[]);
 status=401;
 const rejected=await call('/auth/magic-link',{email:bindings.OWNER_EMAIL});
 assert.equal(rejected.status,503);assert.equal((await rejected.json()).error,'mail_unavailable');
 const native=await call('/auth/magic-link','email='+bindings.OWNER_EMAIL,undefined,true);assert.equal(native.status,303);
 assert.equal(native.headers.get('location'),'/login?notice=mail_unavailable');
 const login=await call(native.headers.get('location'));assert.equal(login.status,200);
 assert.match(await login.text(),/Sign-in email is not available right now/);
 for(const [failure,expected] of [[302,'rejected'],[400,'rejected'],[401,'rejected'],[402,'rejected'],[403,'rejected'],[413,'rejected'],[502,'uncertain'],[503,'uncertain']]){
  status=failure;const response=await call(`/api/notifications/destinations/${destination.id}/test`,{},cookie);
  assert.equal(response.status,202);const {deliveryId:id}=await response.json();await scheduled();
  const delivery=await db.prepare('SELECT state,code,attempts FROM notification_jobs WHERE id=?').bind(id).first();
  assert.equal(delivery.state,expected);assert.equal(delivery.attempts,1);
  if(failure===302)assert.equal(delivery.code,'provider_redirected');
  const sent=requests.length;await scheduled();assert.equal(requests.length,sent,'terminal or uncertain sends never replay');
 }
 assert.deepEqual(edgeErrors,[]);
 assert.equal((await call('/health')).status,200,'credential rejection does not crash the app');
 const observed=await (await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({transportObservation:true})})).json();
 assert.equal(observed.length,requests.length,'every observed fetch reached the relay edge');
 assert.ok(observed.length>0);assert.ok(observed.every(mode=>mode==='manual'),'all provider fetches use manual inside workerd');
 console.log('PASS workerd emitted Worker RER relay: exact sign-in POST and Bearer/JSON envelope, redirect=manual, 302 refused/provider_redirected without follow, 429 Retry-After queued then accepted on attempt 2, 401 owner-visible mail problem; app stays healthy');
}finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
