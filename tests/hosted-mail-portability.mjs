import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';

// Continue the hosted alert journey through a relay rejection and its accepted retry.
export async function relayAttemptPortability(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-relay-portability-'));
 const origin='https://uptime.example.test',relay='https://relay.example.test/api/managed-mail/send';
 const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,MAIL_PROVIDER:'rer',MAIL_RELAY_URL:relay,MAIL_API_KEY:'test-only-relay-credential'};
 const requests=[];let status=202,worker;
 try{
  worker=await hostedRuntime(directory,bindings,async request=>{
   assert.equal(request.url,relay);assert.equal(request.method,'POST');assert.equal(request.headers.get('authorization'),'Bearer '+bindings.MAIL_API_KEY);
   requests.push(await request.json());return Response.json(status===202?{accepted:true}:{error:'relay rate limit'},{status,headers:status===429?{'retry-after':'2'}:{}});
  });
  const db=await worker.getD1Database('DB');
  for(const file of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const call=(path,body,cookie)=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',body:JSON.stringify({url:origin+path,method:body===undefined?'GET':'POST',headers:{host:'uptime.example.test',origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
  const scheduled=async()=>{const response=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(response.status,204,await response.text())};
  const owner=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Relay owner'});assert.equal(owner.status,303);const cookie=owner.headers.get('set-cookie').split(';')[0];
  await completeSecondFactor(origin,cookie,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),cookie));
  const added=await call('/api/notifications/destinations',{name:'Operations inbox',kind:'email',address:'oncall@example.test'},cookie);assert.equal(added.status,201);const destination=await added.json();
  status=429;const queued=await call(`/api/notifications/destinations/${destination.id}/test`,{},cookie);assert.equal(queued.status,202);const {deliveryId}=await queued.json();
  const row=()=>db.prepare('SELECT state,code,claim_until,attempts FROM notification_jobs WHERE id=?').bind(deliveryId).first();
  await scheduled();const limited=await row();assert.equal(limited.state,'queued');assert.equal(limited.code,'provider_rate_limited');assert.ok(limited.claim_until>Date.now());
  const count=requests.length;await scheduled();assert.equal(requests.length,count,'a proven-unaccepted relay send honors Retry-After');
  status=202;await new Promise(resolve=>setTimeout(resolve,Math.max(0,limited.claim_until-Date.now()+20)));await scheduled();
  assert.equal(requests.length,count+1);assert.deepEqual(requests.at(-1),requests.at(-2),'the relay retry preserves the message');assert.equal((await row()).state,'accepted');assert.equal((await row()).attempts,2);
  const exported=await call('/api/archive',undefined,cookie);assert.equal(exported.status,200,'both relay attempts remain portable');
  const attempts=(await exported.json()).payload.productTables.notification_delivery_attempts.filter(a=>a.delivery_id===deliveryId);
  assert.deepEqual(attempts.map(a=>[a.number,a.outcome_category]),[[1,'retryable'],[2,'accepted']]);assert.ok(attempts[0].retry_after_seconds>0&&attempts[0].retry_after_seconds<=2);
  console.log('PASS DELIVERY-002 proven-unaccepted relay submission and accepted retry retain both portable attempts');
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
}
