import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {notificationTestDB} from './notify-unit-database.mjs';
import {createDestination,destinations} from '../src/domain/notification-destinations.server.ts';
import {ensureNotificationCustody} from '../src/domain/notification-credentials.server.ts';
import {notificationRpc} from '../src/domain/notification-rpc.server.ts';
import {testDestination,notificationOverview} from '../src/domain/notifications.server.ts';
import {maintenance} from '../src/domain/maintenance.server.ts';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
const webhook={kind:'webhook',name:'Receiver',url:'https://receiver.example.com/private'};
const email={kind:'email',name:'Inbox',address:'owner@example.com'};
const setup=()=>({DB:notificationTestDB(),SESSION_SECRET:randomBytes(32).toString('hex'),UPTIME_ORIGIN:'https://uptime.example.com'});
const stored=async env=>(await env.DB.prepare('SELECT * FROM notification_credentials ORDER BY created_at,id').all()).results;
const api=env=>async(_p,input)=>notificationRpc(env,input);
const sender=sent=>({async send(){sent.n++;return {status:202,headers:{},body:''}}});
const wrongKeys={'a different 32-byte key':()=>randomBytes(32).toString('hex'),'a short key':()=>'too-short','no key':()=>undefined};

test('a wrong key then the right key restores every destination with nothing re-entered',async()=>{
 const env=setup();try{
  const hook=await createDestination(env,webhook),mail=await createDestination(env,email);
  const wrong={...env,SESSION_SECRET:randomBytes(32).toString('hex')};
  assert.ok((await destinations(wrong)).every(d=>d.credentialsAvailable===false),'wrong key: unavailable while the wrong key is in use');
  assert.ok((await stored(env)).every(r=>r.unavailable_at!==null),'a wrong key is recorded against the rows it could not open');
  const list=await destinations(env);
  assert.ok(list.every(d=>d.credentialsAvailable),'right key again: available without re-entry');
  assert.equal(list.find(d=>d.id===mail.id).address,email.address);
  assert.ok((await stored(env)).every(r=>r.unavailable_at===null&&r.ciphertext&&r.endpoint===null),'marker cleared, ciphertext untouched');
  const sent={n:0},job=await testDestination(env,hook.id);await dispatchNotifications(api(env),sender(sent));
  assert.equal(sent.n,1,'the recovered webhook sends');assert.equal((await notificationOverview(env)).deliveries.find(d=>d.id===job.deliveryId).state,'accepted');
 }finally{env.DB.close()}
});

for(const [name,make] of Object.entries(wrongKeys).filter(([n])=>n!=='a different 32-byte key'))test(`${name} never marks a destination unavailable, and the right key needs no re-entry`,async()=>{
 const env=setup();try{
  const hook=await createDestination(env,webhook),mail=await createDestination(env,email);
  const before=await stored(env),bad={...env,SESSION_SECRET:make()};
  assert.ok((await destinations(bad)).every(d=>d.credentialsAvailable===false),'unreadable while the key is bad');
  assert.deepEqual(await stored(env),before,`${name} leaves every credential row exactly as it was`);
  assert.ok((await destinations(env)).every(d=>d.credentialsAvailable));
  assert.equal((await destinations(env)).find(d=>d.id===mail.id).address,email.address);
  assert.ok(hook.signingSecret);
 }finally{env.DB.close()}
});

for(const [name,make] of Object.entries(wrongKeys).filter(([n])=>n!=='a different 32-byte key'))test(`queued alerts survive ${name} on a poll and send once under the right key`,async()=>{
 const env=setup();try{
  const hook=await createDestination(env,webhook),mail=await createDestination(env,email);
  const hookJob=await testDestination(env,hook.id),mailJob=await testDestination(env,mail.id);
  const bad={...env,SESSION_SECRET:make()};
  assert.deepEqual((await notificationRpc(bad,{operation:'poll'})).jobs,[],'nothing enters runner memory');
  const sent={n:0};await dispatchNotifications(api(bad),sender(sent));assert.equal(sent.n,0);
  for(const job of [hookJob,mailJob]){
   const row=await env.DB.prepare('SELECT state,code FROM notification_jobs WHERE id=?').bind(job.deliveryId).first();
   assert.equal(row.state,'queued',`${name} does not reject queued work`);assert.notEqual(row.code,'credential_unavailable');
  }
  await dispatchNotifications(api(env),sender(sent));
  assert.equal(sent.n,1,'the webhook is delivered once with the right key');
  const history=(await notificationOverview(env)).deliveries;
  assert.equal(history.find(d=>d.id===hookJob.deliveryId).state,'accepted');
  assert.notEqual(history.find(d=>d.id===mailJob.deliveryId).code,'credential_unavailable','email not rejected as unavailable');
 }finally{env.DB.close()}
});

test('a claim made without a usable key leaves the credential and the delivery for the right key',async()=>{
 const env=setup();try{
  const hook=await createDestination(env,webhook),job=await testDestination(env,hook.id);
  await notificationRpc(env,{operation:'poll'});
  const bad={...env,SESSION_SECRET:'x'.repeat(8)};
  assert.equal(await notificationRpc(bad,{operation:'claim',id:job.deliveryId}),null,'no claim without the key');
  assert.equal((await stored(env))[0].unavailable_at,null);
  const row=await env.DB.prepare('SELECT state,attempts FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first();
  assert.deepEqual({...row},{state:'queued',attempts:0});
  const sent={n:0};await dispatchNotifications(api(env),sender(sent));assert.equal(sent.n,1);
 }finally{env.DB.close()}
});

test('a wrong key seen by a claim is recovered by the right key on the next claim',async()=>{
 const env=setup();try{
  const hook=await createDestination(env,webhook),first=await testDestination(env,hook.id);
  await notificationRpc(env,{operation:'poll'});
  const wrong={...env,SESSION_SECRET:randomBytes(32).toString('hex')};
  assert.equal(await notificationRpc(wrong,{operation:'claim',id:first.deliveryId}),null);
  assert.ok((await stored(env))[0].unavailable_at!==null);
  const second=await testDestination(env,hook.id).catch(()=>null);
  assert.ok(second,'owner can send a new test once the right key is back');
  const sent={n:0};await dispatchNotifications(api(env),sender(sent));assert.equal(sent.n,1,'the new test is delivered');
  assert.equal((await stored(env))[0].unavailable_at,null);
 }finally{env.DB.close()}
});

test('a missing key does not replace queued delivery destination hashes with a permanent failure marker',async()=>{
 const env=setup();try{
  const hook=await createDestination(env,webhook),job=await testDestination(env,hook.id);await notificationRpc(env,{operation:'poll'});
  const legacy='a'.repeat(64);await env.DB.prepare('UPDATE integration_deliveries SET destination_hash=? WHERE id=?').bind(legacy,job.deliveryId).run();
  await ensureNotificationCustody({...env,SESSION_SECRET:undefined});
  assert.equal((await env.DB.prepare('SELECT destination_hash h FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first()).h,legacy,'unchanged until the key returns');
  await ensureNotificationCustody(env);
  assert.match((await env.DB.prepare('SELECT destination_hash h FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first()).h,/^hmac-v1:/);
 }finally{env.DB.close()}
});

test('the scheduled run seals plaintext credentials from an upgrade without any owner visit',async()=>{
 const env=setup();try{
  const now=Date.now();
  await env.DB.batch([
   env.DB.prepare('INSERT INTO notification_credentials(id,destination_id,endpoint,signing_secret,created_at) VALUES(?,?,?,?,?)').bind('c1','d1',webhook.url,randomBytes(32).toString('hex'),now),
   env.DB.prepare('INSERT INTO notification_destinations(id,name,kind,enabled,credential_id,created_at,deleted_at) VALUES(?,?,?,?,?,?,NULL)').bind('d1','Prior','webhook',1,'c1',now),
  ]);
  assert.ok((await stored(env))[0].endpoint,'fixture holds plaintext');
  await maintenance(env);
  const [row]=await stored(env);
  assert.ok(row.ciphertext&&row.endpoint===null&&row.signing_secret===null&&row.unavailable_at===null,'sealed by the scheduled run');
  assert.ok((await destinations(env)).every(d=>d.credentialsAvailable),'sealed credential opens with the same key');
 }finally{env.DB.close()}
});

test('the scheduled run with no usable key leaves plaintext legacy rows for the next run',async()=>{
 const env=setup();try{
  const now=Date.now();
  await env.DB.batch([
   env.DB.prepare('INSERT INTO notification_credentials(id,destination_id,endpoint,signing_secret,created_at) VALUES(?,?,?,?,?)').bind('c1','d1',webhook.url,randomBytes(32).toString('hex'),now),
   env.DB.prepare('INSERT INTO notification_destinations(id,name,kind,enabled,credential_id,created_at,deleted_at) VALUES(?,?,?,?,?,?,NULL)').bind('d1','Prior','webhook',1,'c1',now),
  ]);
  const before=await stored(env);await maintenance({...env,SESSION_SECRET:undefined});
  assert.deepEqual(await stored(env),before,'not marked unavailable, not rewritten');
  await maintenance(env);assert.ok((await stored(env))[0].ciphertext);
 }finally{env.DB.close()}
});
