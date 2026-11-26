import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';

// The platform relay answers 504 after 8 s while the mail may still be delivered: the outcome is unknown. The real
// Worker, Base sign-in and D1 run; only the relay's network edge is fake. A kept link is the owner's own, single-use.
export async function proveUncertainSigninMail(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-signin-uncertain-'));
 const origin='https://uptime.example.test',relayUrl='https://relay.example.test/mail';
 const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,MAIL_PROVIDER:'rer',
  MAIL_FROM:['uptime','example.test'].join('@'),MAIL_API_KEY:'synthetic-uptime-signin',MAIL_RELAY_URL:relayUrl};
 const sent=[];let answer=202,worker;
 try{
  worker=await hostedRuntime(directory,bindings,async request=>{
   assert.equal(request.url,relayUrl,'only the relay receives mail');
   const message=await request.json();sent.push(message);
   return answer===202?Response.json({},{status:202}):new Response(null,{status:answer});
  });
  const db=await worker.getD1Database('DB');
  for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const call=(path,body,cookie)=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method:body===undefined?'GET':'POST',headers:{host:new URL(origin).host,origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.61',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
  const owner=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Owner'});assert.equal(owner.status,303,await owner.clone().text());
  const first=owner.headers.get('set-cookie').split(';')[0];
  await completeSecondFactor(origin,first,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),first));
  const request=async()=>{sent.length=0;const response=await call('/auth/magic-link',{email:bindings.OWNER_EMAIL,returnTo:'/app'});return {response,message:sent.at(-1)}};
  const tokenOf=message=>new URL(message.text.match(/https?:\/\/[^\s]+/)[0]).searchParams.get('token');
  const confirm=token=>call('/auth/confirm',{token});

  // An unknown address gets the answer a sent request gets: no enumeration.
  answer=202;
  const stranger=await call('/auth/magic-link',{email:['stranger','example.test'].join('@'),returnTo:'/app'});
  const neutral={status:stranger.status,body:await stranger.text()};

  // 504: uncertain. Answered as sent, link live, one send, only the owner addressed, usable once.
  answer=504;
  const uncertain=await request();
  assert.deepEqual({status:uncertain.response.status,body:await uncertain.response.text()},neutral,'an uncertain send is answered as a sent request');
  assert.equal(sent.length,1,'an uncertain send is not resent at once');
  assert.deepEqual(sent[0].to,bindings.OWNER_EMAIL,'only the owner is addressed');
  const kept=tokenOf(uncertain.message);
  assert.equal((await confirm(kept)).status,303,'the link stays live after a 504');
  assert.notEqual((await confirm(kept)).status,303,'a kept link is single-use');

  // A definite refusal (4xx) still revokes the link it sent.
  answer=400;
  const refused=await request();
  assert.equal(refused.response.status,503);assert.deepEqual(await refused.response.json(),{error:'mail_unavailable'});
  assert.notEqual((await confirm(tokenOf(refused.message))).status,303,'a refused send revokes its link');
  console.log('PASS a relay 504 keeps the owner sign-in link live; a 4xx still revokes it');
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
}
