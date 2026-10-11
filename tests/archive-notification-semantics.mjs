import assert from 'node:assert/strict';
import {test} from 'node:test';
import {archive,restore} from '../src/domain/archive.server.ts';
import {validateArchive} from '../src/domain/archive-validation.ts';
import {digest} from '../src/domain/archive-schema.ts';
import {slackContent} from '../src/domain/notification-content.ts';
import {createDestination} from '../src/domain/notification-destinations.server.ts';
import {testDestination} from '../src/domain/notifications.server.ts';
import {notificationRpc,notificationRepository} from '../src/domain/notification-rpc.server.ts';
import {pickEnvelope} from '../src/base/modules/integrations/core/repository.ts';
import {populateArchiveFixture} from './archive-fixture.mjs';
import {archiveTables} from './archive-restore-fixtures.mjs';
import {archiveEnvironment,assertSemanticRefusal} from './archive-native-support.mjs';

const protocols={webhook:'webhook',slack:'slack.incoming-webhook.v1'};
const bodyFor=(protocol,event)=>protocol===protocols.slack?slackContent(JSON.parse(event)):event;

async function assertQuarantinedRoundtrip(source){
 const target=archiveEnvironment(),again=archiveEnvironment();
 try{
  const original=archiveTables(source);await restore(target,source);
  const exported=await archive(target),rows=archiveTables(exported);
  assert.ok(rows.notification_destinations.every(row=>row.enabled===0));
  assert.ok(rows.notification_jobs.every(row=>row.state==='imported-inactive'));
  assert.ok(rows.outbox.every(row=>row.status==='imported-inactive'));
  assert.ok(rows.monitors.every(row=>!JSON.parse(row.definition).enabled));
  assert.ok(rows.integration_deliveries.every(row=>!['queued','sending'].includes(row.state)));
  for(const name of ['integration_attempts','integration_resolutions','integration_replays'])assert.equal(JSON.stringify(rows[name]),JSON.stringify(original[name]),`${name} retained byte for byte`);
  for(const name of ['notification_destinations','notification_jobs','integration_deliveries'])for(const old of original[name]){
   const current=rows[name].find(row=>row.id===old.id);assert.ok(current);
   if(JSON.stringify(current)!==JSON.stringify(old))assert.ok(rows.archive_history.some(row=>row.table_name===name&&row.record===JSON.stringify(old)),`${name} exact original history`);
  }
  assert.deepEqual((await notificationRpc(target,{operation:'poll'})).jobs,[]);
  for(const row of rows.notification_jobs.filter(row=>row.kind!=='email'))assert.equal(await notificationRpc(target,{operation:'claim',id:row.id}),null);
  assert.deepEqual(archiveTables(await archive(target)),rows,'poll and stale claims never replay imported notifications');
  await restore(again,exported);
  assert.deepEqual(archiveTables(await archive(again)),rows,'repeated inactive import preserves all histories');
 }finally{target.DB.close();again.DB.close()}
}

test('valid retained email, webhook and Slack histories remain portable and nonreplaying',async()=>{
 const env=archiveEnvironment();try{
  await populateArchiveFixture(env);
  const slack=await notificationRepository(env).get('job-slack');
  const envelope={...pickEnvelope(slack),id:'replay-slack'};
  await notificationRepository(env).acceptReplay({envelope,fingerprint:await digest(JSON.stringify(envelope)),receivedAt:Date.now()});
  const source=await archive(env),rows=archiveTables(source);
  assert.equal(rows.notification_jobs.find(row=>row.kind==='email').state,'accepted');
  assert.ok(!rows.integration_deliveries.some(row=>row.id==='job-email'));
  assert.deepEqual(rows.integration_replays.map(row=>JSON.parse(row.envelope).protocol).sort(),Object.values(protocols).sort());
  await assertQuarantinedRoundtrip(source);
 }finally{env.DB.close()}
});

test('actual notification producers export their email and exact integration protocols',async()=>{
 const env=archiveEnvironment();try{
  const created=[];
  for(const input of [
   {kind:'email',name:'Inbox',address:'owner@example.test'},
   {kind:'webhook',name:'Receiver',url:'https://receiver.example.com/private'},
   {kind:'slack',name:'Channel',url:'https://hooks.slack.com/services/example/fixture/private'},
  ]){const destination=await createDestination(env,input),job=await testDestination(env,destination.id);created.push({...destination,...job})}
  assert.equal((await notificationRpc(env,{operation:'poll'})).jobs.length,2);
  for(const row of created.filter(row=>row.kind!=='email')){
   const delivery=await notificationRpc(env,{operation:'get',id:row.deliveryId});
   assert.equal(delivery.protocol,protocols[row.kind]);
   const claim=await notificationRpc(env,{operation:'claim',id:row.deliveryId});assert.ok(claim);
   assert.equal(await notificationRpc(env,{operation:'finish',id:row.deliveryId,claim,outcome:{kind:'accepted',code:'fixture_accepted'}}),true);
  }
  const source=await archive(env),rows=archiveTables(source),mail=rows.notification_jobs.find(row=>row.kind==='email');
  assert.equal(mail.code,'mail_not_configured');assert.equal(mail.attempts,1);
  assert.ok(!rows.integration_deliveries.some(row=>row.id===mail.id));
  assert.equal(rows.integration_attempts.length,2);
  await assertQuarantinedRoundtrip(source);
 }finally{env.DB.close()}
});

test('integration delivery kind and protocol mismatches reject rehashed archives before writes',async()=>{
 const env=archiveEnvironment(),target=archiveEnvironment();try{
  await populateArchiveFixture(env);const source=await archive(env);
  for(const [kind,protocol] of [['email',protocols.webhook],['email',protocols.slack],['webhook',protocols.slack],['slack',protocols.webhook]]){
   const invalid=structuredClone(source),rows=invalid.payload.productTables;
   // Remove unrelated replay records so only this delivery invariant is tested.
   rows.integration_replays=[];
   const job=rows.notification_jobs.find(row=>row.kind=== (kind==='email'?'webhook':kind));
   const destination=rows.notification_destinations.find(row=>row.id===job.destination_id);
   job.kind=destination.kind=kind;destination.address=kind==='email'?'archive@example.test':null;
   const delivery=rows.integration_deliveries.find(row=>row.id===job.id),envelope=JSON.parse(delivery.envelope);
   Object.assign(envelope,{protocol,body:bodyFor(protocol,job.event)});delivery.envelope=JSON.stringify(envelope);
   await assertSemanticRefusal(target,invalid,kind==='email'?/Invalid delivery reference/:/Notification envelope event mismatch/);
  }
 }finally{env.DB.close();target.DB.close()}
});

test('replay destination kind must match its exact protocol before any restore write',async()=>{
 const env=archiveEnvironment(),target=archiveEnvironment();try{
  await populateArchiveFixture(env);const source=await archive(env);
  for(const kind of ['email','webhook','slack'])for(const protocol of Object.values(protocols)){
   const changed=structuredClone(source),rows=changed.payload.productTables,replay=rows.integration_replays[0];
   const job=rows.notification_jobs.find(row=>row.kind===kind),envelope=JSON.parse(replay.envelope);
   Object.assign(envelope,{destinationId:job.destination_id,protocol,body:bodyFor(protocol,job.event)});replay.envelope=JSON.stringify(envelope);
   changed.sha256=await digest(JSON.stringify(changed.payload));
   if(protocols[kind]===protocol){await validateArchive(changed);await assertQuarantinedRoundtrip(changed)}
   else await assertSemanticRefusal(target,changed,/Invalid notification replay/);
  }
 }finally{env.DB.close();target.DB.close()}
});
