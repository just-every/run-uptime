import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';

const mailbox=(name,domain)=>[name,domain].join('@');
const relayUrl='https://relay.example.test/api/managed-mail/send';
// One hosted Worker, real D1 and the real provider adapter (SendGrid, or Base's owner relay sender for rer). Only the
// provider's network edge is fake: it records every recipient and message that would have left the Worker.
async function run(name,settings,check){
 const directory=await mkdtemp(join(tmpdir(),'uptime-owner-mail-')),origin='https://uptime.example.test',sent=[],messages=[];
 const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,...settings};
 if(settings.MAIL_PROVIDER==='none')delete bindings.MAIL_FROM;
 let worker;
 try{
  worker=await hostedRuntime(directory,bindings,async request=>{
   if(settings.MAIL_PROVIDER==='rer'){
    assert.equal(request.url,relayUrl,'only the assigned relay is reachable');
    assert.equal(request.headers.get('authorization'),'Bearer '+settings.MAIL_API_KEY);
    const body=await request.json();
    sent.push([body.to]);messages.push(body);
    return Response.json({messageId:'<relay-'+messages.length+'@relay.example.test>'},{status:202});
   }
   assert.equal(new URL(request.url).hostname,'api.sendgrid.com','only the mail provider is reachable');
   const body=await request.json();
   sent.push(body.personalizations.flatMap(p=>[...(p.to??[]),...(p.cc??[]),...(p.bcc??[])].map(r=>r.email)));
   return new Response(null,{status:202});
  });
  const db=await worker.getD1Database('DB');
  for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const call=(path,body,cookie,method=body===undefined?'GET':'POST')=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method,headers:{host:new URL(origin).host,origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.51',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
  const json=async response=>{assert.ok(response.ok,await response.clone().text());return response.json()};
  const owner=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Owner'});assert.equal(owner.status,303,await owner.clone().text());
  const cookie=owner.headers.get('set-cookie').split(';')[0];
  await completeSecondFactor(origin,cookie,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),cookie,init.method));
  const scheduled=async()=>{const response=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(response.status,204,await response.text())};
  const drill=async(label,address)=>{
   const destination=await json(await call('/api/notifications/destinations',{name:label,kind:'email',address},cookie));
   const started=await json(await call(`/api/notifications/destinations/${destination.id}/drill`,{},cookie));
   await scheduled();
   for(let attempt=0;attempt<100;attempt++){
    const delivery=(await json(await call('/api/notifications',undefined,cookie))).deliveries.find(row=>row.id===started.deliveryId);
    if(delivery&&delivery.state!=='queued'&&delivery.state!=='sending')return delivery;
    await new Promise(resolve=>setTimeout(resolve,25));
   }
   assert.fail('delivery did not settle');
  };
  await check({drill,sent,messages,call,owner:bindings.OWNER_EMAIL,db});
  console.log('PASS '+name);
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
}

export async function proveOwnerOnlyMail(){
 const sender={MAIL_PROVIDER:'sendgrid',MAIL_FROM:'Uptime <'+mailbox('alerts','notify-sender.dev')+'>',SENDGRID_API_KEY:'synthetic-uptime-owner-mail'};
 await run('MAIL_RECIPIENTS=owner sends one test alert to the owner address only and refuses every other address',{...sender,MAIL_RECIPIENTS:'owner'},async({drill,sent,owner})=>{
  const mine=await drill('Owner email',owner);
  assert.equal(mine.state,'accepted',JSON.stringify(mine));
  const before=sent.length;
  const other=await drill('Someone else',mailbox('someone.else','example.test'));
  assert.equal(other.state,'rejected');assert.equal(other.code,'mail_input_invalid');
  assert.equal(sent.length,before,'the refused address never reached the provider');
  assert.ok(sent.length>0&&sent.every(to=>to.length===1&&to[0]===owner),'every message that left the Worker was addressed to the owner alone: '+JSON.stringify(sent));
 });
 const relay={MAIL_PROVIDER:'rer',MAIL_RECIPIENTS:'owner',MAIL_FROM:mailbox('alerts','notify-sender.dev'),MAIL_API_KEY:'synthetic-uptime-owner-relay',MAIL_RELAY_URL:relayUrl};
 await run('rer MAIL_RECIPIENTS=owner sends the owner sign-in link and alerts through Base\'s owner relay sender and refuses every other address',relay,async({drill,sent,messages,call,owner})=>{
  const requested=await call('/auth/magic-link',{email:owner,returnTo:'/app'});
  assert.equal(requested.status,202,await requested.clone().text());
  const signIn=messages.findLast(message=>message.subject.startsWith('Your sign-in link'));
  assert.ok(signIn,'the relay received the owner sign-in link');
  assert.equal(signIn.to,owner);
  const link=new URL(signIn.text.match(/https?:\/\/[^\s]+/)[0]);
  const confirmed=await call('/auth/confirm',{token:link.searchParams.get('token')});
  assert.equal(confirmed.status,303,await confirmed.clone().text());
  const mine=await drill('Owner email',owner);
  assert.equal(mine.state,'accepted',JSON.stringify(mine));
  const before=sent.length;
  const other=await drill('Someone else',mailbox('someone.else','example.test'));
  assert.equal(other.state,'rejected');assert.equal(other.code,'rer_owner_recipient_required');
  assert.equal(sent.length,before,'the refused address never reached the relay');
  assert.ok(sent.every(to=>to.length===1&&to[0]===owner),'every message that left the Worker was addressed to the owner alone: '+JSON.stringify(sent));
 });
 await run('with no mail input set nothing is sent',{MAIL_PROVIDER:'none'},async({drill,sent,owner})=>{
  const mine=await drill('Owner email',owner);
  assert.equal(mine.state,'rejected');assert.equal(mine.code,'mail_unavailable');
  assert.deepEqual(sent,[]);
 });
}
