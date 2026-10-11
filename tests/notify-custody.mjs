import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {notificationTestDB} from './notify-unit-database.mjs';
import {createDestination,rotateDestination,deleteDestination} from '../src/domain/notification-destinations.server.ts';
import {notificationRpc} from '../src/domain/notification-rpc.server.ts';
import {testDestination,notificationOverview} from '../src/domain/notifications.server.ts';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
const webhook={kind:'webhook',name:'Private receiver',url:'https://receiver.example.com/private'};
function setup(){return {DB:notificationTestDB(),SESSION_SECRET:randomBytes(32).toString('hex'),UPTIME_ORIGIN:'https://uptime.example.com'}}
const rows=async env=>(await env.DB.prepare('SELECT * FROM notification_credentials').all()).results;
const absent=(value,secrets)=>assert.ok(secrets.every(s=>!JSON.stringify(value).includes(s)),'credential plaintext is absent');
test('notification credentials are encrypted and missing custody key fails closed',async()=>{const env=setup();try{
 const d=await createDestination(env,webhook);absent(await rows(env),[d.signingSecret,webhook.url]);
 await assert.rejects(createDestination({...env,SESSION_SECRET:undefined},webhook));
}finally{env.DB.close()}});
test('Slack capability has no signing secret and cannot rotate',async()=>{const env=setup();try{
 const url='https://hooks.slack.com/services/TONE/BONE/private-capability',d=await createDestination(env,{name:'Slack',kind:'slack',url});
 assert.equal('signingSecret' in d,false);await assert.rejects(rotateDestination(env,d.id));absent(await rows(env),[url]);
}finally{env.DB.close()}});
test('rotation and deletion scrub every retired credential and cancel obsolete queued work',async()=>{const env=setup();try{
 const d=await createDestination(env,webhook),queued=await testDestination(env,d.id);await notificationRpc(env,{operation:'poll'});
 const rotated=await rotateDestination(env,d.id);let stored=await rows(env);const retired=stored.filter(r=>r.retired_at!==null);
 assert.equal(retired.length,1);assert.ok(retired.every(r=>r.endpoint===null&&r.signing_secret===null&&r.ciphertext===null));
 let sends=0;await dispatchNotifications(async(_p,v)=>notificationRpc(env,v),{async send(){sends++;return {status:202,headers:{},body:''}}});assert.equal(sends,0);
 const history=(await notificationOverview(env)).deliveries.find(j=>j.id===queued.deliveryId);assert.equal(history.code,'credential_rotated');assert.equal(history.attempts,0);
 await Promise.allSettled([rotateDestination(env,d.id),deleteDestination(env,d.id)]);stored=await rows(env);
 assert.ok(stored.every(r=>r.endpoint===null&&r.signing_secret===null&&r.ciphertext===null&&r.retired_at!==null));absent(stored,[d.signingSecret,rotated.signingSecret,webhook.url]);
}finally{env.DB.close()}});
test('wrong keys, ciphertext tampering and credential swaps cannot release runner credentials',async()=>{
 for(const mode of ['key','swap','tamper']){const env=setup();try{
  const a=await createDestination(env,webhook),b=await createDestination(env,{...webhook,name:'Second'});await testDestination(env,a.id);
  const before=await rows(env);assert.ok(before.every(r=>typeof r.ciphertext==='string'));
  const current=before.find(r=>r.destination_id===a.id),other=before.find(r=>r.destination_id===b.id);
  if(mode==='swap')await env.DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE id=?').bind(other.ciphertext,current.id).run();
  if(mode==='tamper')await env.DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE id=?').bind(current.ciphertext.slice(0,-5)+'AAAAA',current.id).run();
  const active=mode==='key'?{...env,SESSION_SECRET:randomBytes(32).toString('hex')}:env;
  assert.deepEqual((await notificationRpc(active,{operation:'poll'})).jobs,[]);
  const overview=await notificationOverview(active);assert.equal(overview.destinations.find(d=>d.id===a.id).credentialsAvailable,false);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM integration_attempts').first()).n,0);
 }finally{env.DB.close()}}
});
test('runner ahead leaves an unsent queue for a correctly timed runner',async()=>{const env=setup();try{
 const d=await createDestination(env,webhook),j=await testDestination(env,d.id);let sends=0;
 await dispatchNotifications(async(_p,v)=>notificationRpc(env,v),{async send(){sends++;return {status:202,headers:{},body:''}}},{now:()=>Date.now()+61000});
 const row=(await notificationOverview(env)).deliveries.find(r=>r.id===j.deliveryId);assert.equal(row.state,'queued');assert.equal(row.attempts,0);assert.equal(sends,0);
 await dispatchNotifications(async(_p,v)=>notificationRpc(env,v),{async send(){sends++;return {status:202,headers:{},body:''}}});assert.equal(sends,1);
 await dispatchNotifications(async(_p,v)=>notificationRpc(env,v),{async send(){throw Error('duplicate transport')}});
}finally{env.DB.close()}});
test('claim boundary, behind clock and slow preparation retain durable refusal and no replay',async()=>{const env=setup();try{
 const d=await createDestination(env,webhook);let sends=0;const transport={async send(){sends++;return {status:202,headers:{},body:''}}};
 for(const offset of [59000,-61000]){await testDestination(env,d.id);await dispatchNotifications(async(_p,v)=>notificationRpc(env,v),transport,{now:()=>Date.now()+offset})}assert.equal(sends,2);
 const slow=await testDestination(env,d.id);let reads=0;
 await dispatchNotifications(async(_p,v)=>{const result=await notificationRpc(env,v);if(v.operation==='get'&&v.id===slow.deliveryId&&++reads===1)await env.DB.prepare('UPDATE integration_deliveries SET claim_until=0 WHERE id=?').bind(slow.deliveryId).run();return result},transport,{now:()=>Date.now()-61000});
 let row=(await notificationOverview(env)).deliveries.find(r=>r.id===slow.deliveryId);assert.equal(row.code,'claim_expired');assert.equal(row.state,'uncertain');assert.equal(sends,2);
 await Promise.all([dispatchNotifications(async(_p,v)=>notificationRpc(env,v),transport),dispatchNotifications(async(_p,v)=>notificationRpc(env,v),transport)]);assert.equal(sends,2);
}finally{env.DB.close()}});

test('an ahead duplicate read cannot terminate another dispatch already at its receiver',async()=>{const env=setup();let release;try{
 const d=await createDestination(env,webhook),job=await testDestination(env,d.id);let arrived;const receiving=new Promise(r=>arrived=r),held=new Promise(r=>release=r);let sends=0;
 const delivery=dispatchNotifications(async(_p,v)=>notificationRpc(env,v),{async send(){sends++;arrived();await held;return {status:202,headers:{},body:''}}});
 await receiving;
 const current=await notificationRpc(env,{operation:'get',id:job.deliveryId,runnerNow:Date.now()+120000});assert.equal(current.state,'sending');
 await dispatchNotifications(async(_p,v)=>notificationRpc(env,v),{async send(){sends++;throw Error('duplicate send')}},{now:()=>Date.now()+120000});
 assert.equal((await notificationRpc(env,{operation:'get',id:job.deliveryId})).state,'sending');release();await delivery;
 const history=(await notificationOverview(env)).deliveries.find(r=>r.id===job.deliveryId);assert.equal(history.state,'accepted');assert.equal(history.attempts,1);assert.equal(sends,1);
}finally{release?.();env.DB.close()}});
test('clock ahead during asynchronous preparation records an owned unsent refusal',async()=>{const env=setup();try{
 const d=await createDestination(env,webhook),job=await testDestination(env,d.id);let reads=0,offset=59000,sends=0;
 await dispatchNotifications(async(_p,v)=>{const result=await notificationRpc(env,v);if(v.operation==='get'&&v.id===job.deliveryId&&++reads===2)offset=61000;return result},{async send(){sends++;return {status:202,headers:{},body:''}}},{now:()=>Date.now()+offset});
 const row=(await notificationOverview(env)).deliveries.find(r=>r.id===job.deliveryId);assert.equal(row.code,'runner_clock_ahead');assert.equal(row.state,'queued');assert.equal(row.attempts,0);assert.equal(sends,0);
 const released=(await env.DB.prepare('SELECT * FROM notification_claim_custody WHERE delivery_id=?').bind(job.deliveryId).all()).results;assert.equal(released.length,1);assert.ok(released[0].released_at!==null);assert.equal(released[0].started_at,null);
 await dispatchNotifications(async(_p,v)=>notificationRpc(env,v),{async send(){sends++;return {status:202,headers:{},body:''}}});assert.equal(sends,1);
 const attempts=await notificationRpc(env,{operation:'log',id:job.deliveryId});assert.equal(attempts.length,1);assert.equal(attempts[0].number,1);assert.notEqual(attempts[0].id,released[0].claim);
}finally{env.DB.close()}});
