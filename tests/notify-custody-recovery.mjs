import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash,createHmac} from 'node:crypto';
import {notificationTestDB} from './notify-unit-database.mjs';
import {createDestination,destinations,updateDestination,rotateDestination,deleteDestination} from '../src/domain/notification-destinations.server.ts';
import {ensureNotificationCustody,readCredential,notificationReadiness} from '../src/domain/notification-credentials.server.ts';
import {notificationRpc} from '../src/domain/notification-rpc.server.ts';
import {testDestination,notificationOverview} from '../src/domain/notifications.server.ts';
import {incidentEvent} from '../src/domain/notification-content.ts';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
const webhook={kind:'webhook',name:'Receiver',url:'https://receiver.example.com/private'};
const setup=()=>({DB:notificationTestDB(),SESSION_SECRET:randomBytes(32).toString('hex'),UPTIME_ORIGIN:'https://uptime.example.com'});
const api=env=>async(_p,input)=>notificationRpc(env,input);
const stored=async env=>(await env.DB.prepare('SELECT * FROM notification_credentials').all()).results;
const assertScrubbed=row=>assert.ok(row.retired_at!==null&&row.ciphertext===null&&row.endpoint===null&&row.signing_secret===null,'obsolete credential is erased');
test('legacy upgrade retires unused and queued obsolete versions, retains only live sending credentials until outcome',async()=>{
 const env=setup();try{
  const destination=await createDestination(env,webhook),current=(await stored(env))[0];
  for(const state of ['unused','queued','accepted','rejected','uncertain','sending','expired']){
   const id='legacy-'+state;
   await env.DB.prepare('INSERT INTO notification_credentials(id,destination_id,endpoint,signing_secret,created_at) VALUES(?,?,?,?,?)').bind(id,destination.id,webhook.url,randomBytes(32).toString('hex'),1).run();
   if(state!=='unused')await env.DB.prepare('INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at,state) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,id,destination.id,'Legacy','webhook',id,JSON.stringify({kind:'test'}),1,state==='expired'?'sending':state).run();
   if(state==='sending'||state==='expired')await env.DB.prepare('UPDATE notification_jobs SET claim=?,claim_until=? WHERE id=?').bind(crypto.randomUUID(),state==='sending'?Date.now()+60000:0,id).run();
  }
  await ensureNotificationCustody(env);
  let rows=await stored(env);for(const row of rows.filter(r=>r.id.startsWith('legacy-')&&r.id!=='legacy-sending'))assertScrubbed(row);
  assert.equal((await env.DB.prepare("SELECT code FROM notification_jobs WHERE id='legacy-queued'").first()).code,'credential_rotated');
  assert.ok((await readCredential(env,rows.find(r=>r.id==='legacy-sending'))).endpoint===webhook.url,'live committed key retained');
  assert.ok((await readCredential(env,rows.find(r=>r.id===current.id))).endpoint===webhook.url);
  await env.DB.prepare("UPDATE notification_jobs SET state='accepted' WHERE id='legacy-sending'").run();await ensureNotificationCustody(env);assertScrubbed((await stored(env)).find(r=>r.id==='legacy-sending'));
 }finally{env.DB.close()}
});
test('one tampered row is unavailable without blocking healthy dispatch, owner recovery or deletion',async()=>{
 const env=setup();try{
  const broken=await createDestination(env,webhook),good=await createDestination(env,{...webhook,name:'Good'});
  await testDestination(env,broken.id);await testDestination(env,good.id);
  await env.DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE destination_id=?').bind('corrupt-record',broken.id).run();
  const list=await destinations(env);assert.equal(list.find(d=>d.id===broken.id).credentialsAvailable,false);assert.equal(list.find(d=>d.id===broken.id).credentialError,'credential_unavailable');
  let sends=0;await dispatchNotifications(api(env),{async send(){sends++;return {status:202,headers:{},body:''}}});assert.equal(sends,1);
  await assert.rejects(testDestination(env,broken.id));await deleteDestination(env,broken.id);assert.ok(!(await stored(env)).some(r=>r.destination_id===broken.id),'erasure removes every credential version');
 }finally{env.DB.close()}
});
test('SESSION rotation permits reentry of each kind and email edits rotate queued work once',async()=>{
 let env=setup();try{
  const email=await createDestination(env,{kind:'email',name:'Inbox',address:'old@example.com'}),hook=await createDestination(env,webhook),slack=await createDestination(env,{kind:'slack',name:'Chat',url:'https://hooks.slack.com/services/TONE/BONE/test-capability'});
  const queued=await testDestination(env,email.id);
  env={...env,SESSION_SECRET:randomBytes(32).toString('hex')};assert.ok((await destinations(env)).every(d=>d.credentialsAvailable===false));
  await updateDestination(env,email.id,{name:'Inbox',enabled:true,address:'new@example.com'});
  const replacement=await updateDestination(env,hook.id,{name:'Receiver',enabled:true,url:webhook.url});assert.ok(typeof replacement.signingSecret==='string');
  await updateDestination(env,slack.id,{name:'Chat',enabled:true,url:'https://hooks.slack.com/services/TONE/BONE/new-capability'});
  const list=await destinations(env);assert.ok(list.every(d=>d.credentialsAvailable));assert.equal(list.find(d=>d.id===email.id).address,'new@example.com');
  const history=(await notificationOverview(env)).deliveries.find(j=>j.id===queued.deliveryId);assert.equal(history.code,'credential_rotated');assert.equal(history.attempts,0);
  const count=(await stored(env)).length;await updateDestination(env,email.id,{name:'Renamed',enabled:true,address:'new@example.com'});assert.equal((await stored(env)).length,count,'unchanged email does not rotate');
 }finally{env.DB.close()}
});
test('stored delivery destination hashes resist endpoint guesses and legacy hashes are removed without identity changes',async()=>{
 const env=setup();try{
  const d=await createDestination(env,webhook),job=await testDestination(env,d.id);await notificationRpc(env,{operation:'poll'});
  const digest=createHash('sha256').update(webhook.url).digest('hex');let row=await env.DB.prepare('SELECT * FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first();assert.ok(row.destination_hash!==digest,'no unsalted endpoint digest persists');assert.match(row.destination_hash,/^hmac-v1:/);
  const id=row.id,envelope=row.envelope;await env.DB.prepare('UPDATE integration_deliveries SET destination_hash=? WHERE id=?').bind(digest,id).run();await ensureNotificationCustody(env);row=await env.DB.prepare('SELECT * FROM integration_deliveries WHERE id=?').bind(id).first();assert.ok(row.destination_hash!==digest);assert.equal(row.id,id);assert.equal(row.envelope,envelope);
  let sends=0;await dispatchNotifications(api(env),{async send(){sends++;return {status:202,headers:{},body:''}}});assert.equal(sends,1);
  await deleteDestination(env,d.id);await env.DB.prepare('UPDATE integration_deliveries SET destination_hash=? WHERE id=?').bind(digest,id).run();await ensureNotificationCustody(env);assert.ok(!JSON.stringify((await env.DB.prepare('SELECT * FROM integration_deliveries').all()).results).includes(digest),'deletion leaves no guessable hash');
 }finally{env.DB.close()}
});
test('ahead runners leave queue available and correct runner sends exactly once across mixed skew',async()=>{
 const env=setup();try{
  const d=await createDestination(env,webhook);for(let n=0;n<5;n++)await testDestination(env,d.id);let sends=0;
  const transport={async send(){sends++;return {status:202,headers:{},body:''}}};
  for(let n=0;n<3;n++)await dispatchNotifications(api(env),transport,{now:()=>Date.now()+120000});
  assert.equal(sends,0);assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM notification_claim_custody').first()).n,0,'repeated ahead polls consume no reservations');assert.ok((await notificationOverview(env)).deliveries.every(j=>j.state==='queued'&&j.attempts===0));
  await Promise.all([dispatchNotifications(api(env),transport),dispatchNotifications(api(env),transport,{now:()=>Date.now()+120000})]);await dispatchNotifications(api(env),transport);assert.equal(sends,5);assert.ok((await notificationOverview(env)).deliveries.every(j=>j.state==='accepted'&&j.attempts===1));
 }finally{env.DB.close()}
});
test('unstarted release cannot alter foreign, started, expired or unknown claims',async()=>{
 const env=setup();try{
  const d=await createDestination(env,webhook);
  for(const mode of ['foreign','started','expired','legacy']){
   const job=await testDestination(env,d.id);await notificationRpc(env,{operation:'poll'});
   const reservation=crypto.randomUUID(),claim=await notificationRpc(env,{operation:'claim',id:job.deliveryId,reservation});assert.ok(claim);
   if(mode==='started')assert.equal(await notificationRpc(env,{operation:'start',id:job.deliveryId,claim,reservation}),true);
   if(mode==='expired')await env.DB.prepare('UPDATE integration_deliveries SET claim_until=0 WHERE id=?').bind(job.deliveryId).run();
   if(mode==='legacy')await env.DB.prepare('DELETE FROM notification_claim_custody WHERE claim=?').bind(claim).run();
   assert.equal(await notificationRpc(env,{operation:'releaseUnstarted',id:job.deliveryId,claim,reservation:mode==='foreign'?'foreign-reservation':reservation}),false);
   const record=await env.DB.prepare('SELECT * FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first();assert.equal(record.state,'sending');assert.equal(record.attempts,1);
   const result=await notificationRpc(env,{operation:'get',id:job.deliveryId});assert.equal(result.state,mode==='expired'?'uncertain':'sending');
  }
 }finally{env.DB.close()}
});
for(const kind of ['trigger','test'])for(const mutation of ['unchanged','disabled','deleted','rotated'])test(`unstarted ${kind} release enforces ${mutation} destination policy before a cached runner resumes`,async()=>{
 const env=setup();let resume,pending;try{
  const d=await createDestination(env,webhook);let id;
  if(kind==='test')id=(await testDestination(env,d.id)).deliveryId;
  else{
   const event=incidentEvent({id:crypto.randomUUID(),kind,monitor:{id:'monitor',revision:1,definition:{name:'Reserved incident',url:'https://monitor.example.com'}},slotId:'slot',now:Date.now(),state:{reason:'HTTP 500'},observations:[],origin:env.UPTIME_ORIGIN,incidentKey:'incident:slot'});
   id=`${event.id}:${d.id}`;
   await env.DB.prepare('INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at) SELECT ?,?,id,name,kind,credential_id,?,? FROM notification_destinations WHERE id=?').bind(id,event.id,JSON.stringify(event),event.observedAt,d.id).run();
  }
  const original=await env.DB.prepare('SELECT event,credential_id FROM notification_jobs WHERE id=?').bind(id).first();
  let signal,sends=0;const arrived=new Promise(resolve=>signal=resolve),held=new Promise(resolve=>resume=resolve);
  // Runner B retains the real poll credentials, then pauses after recovery and
  // before claiming. No later poll may be needed to enforce cancellation.
  const bridge=async(_p,input)=>{const result=await notificationRpc(env,input);if(input.operation==='recoverExpired'){signal();await held}return result};
  pending=dispatchNotifications(bridge,{async send(wire){
   sends++;assert.equal(wire.body,original.event);
   const expected=createHmac('sha256',d.signingSecret).update(`${wire.headers['x-lamp-timestamp']}.${wire.body}`).digest('base64url');
   assert.ok(wire.headers['x-lamp-signature']===expected,'released work retains exact signed bytes');
   return {status:202,headers:{},body:''};
  }});await arrived;
  const reservation=crypto.randomUUID(),claim=await notificationRpc(env,{operation:'claim',id,reservation});assert.ok(claim);
  if(mutation==='disabled')await updateDestination(env,d.id,{name:d.name,enabled:false});
  if(mutation==='deleted'){
   await deleteDestination(env,d.id);
   await assert.rejects(notificationRpc(env,{operation:'releaseUnstarted',id,claim,reservation}),/Notification not found/);
   resume();await assert.rejects(pending,/Notification not found/);pending=null;
   assert.equal(sends,0,'cached credentials cannot send after erasure');
   for(const table of ['notification_jobs','integration_deliveries','integration_attempts','notification_claim_custody'])assert.equal((await env.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0,'erasure removes delivery and reservation history');
   assert.ok(!(await stored(env)).some(row=>row.destination_id===d.id));return;
  }
  if(mutation==='rotated')await rotateDestination(env,d.id);
  assert.equal(await notificationRpc(env,{operation:'releaseUnstarted',id,claim,reservation}),true);
  const released=await env.DB.prepare('SELECT * FROM integration_deliveries WHERE id=?').bind(id).first();
  const job=await env.DB.prepare('SELECT * FROM notification_jobs WHERE id=?').bind(id).first();
  const audit=await env.DB.prepare('SELECT * FROM notification_claim_custody WHERE claim=?').bind(claim).first();
  assert.equal(released.attempts,0);assert.equal(released.claim,null);assert.equal(released.claim_until,null);
  assert.deepEqual(await notificationRpc(env,{operation:'log',id}),[]);
  assert.ok(audit.released_at!==null&&audit.started_at===null);
  assert.ok(audit.reservation_hash===createHash('sha256').update(reservation).digest('hex'),'private proof remains hashed');
  assert.equal(await notificationRpc(env,{operation:'releaseUnstarted',id,claim,reservation}),false,'released proof cannot replay');
  const cancelled=mutation==='deleted'||mutation==='rotated'||(mutation==='disabled'&&kind!=='test');
  resume();await pending;
  assert.equal(sends,cancelled?0:1,'cached runner obeys destination cancellation');
  assert.equal(released.state,cancelled?'rejected':'queued','release transaction decides durable policy');
  assert.equal(job.state,cancelled?'rejected':'queued');
  assert.equal(job.code,cancelled?{disabled:'destination_disabled',deleted:'destination_deleted',rotated:'credential_rotated'}[mutation]:'runner_clock_ahead');
  assert.equal(job.finished_at!==null,cancelled);assert.equal(job.event,original.event);assert.equal(job.credential_id,original.credential_id);
  await dispatchNotifications(api(env),{async send(){sends++;return {status:202,headers:{},body:''}}});assert.equal(sends,cancelled?0:1,'fresh runner never replays');
  const final=await env.DB.prepare('SELECT state,attempts FROM integration_deliveries WHERE id=?').bind(id).first();assert.equal(final.state,cancelled?'rejected':'accepted');assert.equal(final.attempts,cancelled?0:1);
  if(mutation==='deleted'||mutation==='rotated')assertScrubbed((await stored(env)).find(r=>r.id===original.credential_id));
 }finally{resume?.();await pending;env.DB.close()}
});
for(const mode of ['tampered','session-rotated'])test(`cached runner cannot claim credentials marked ${mode} before admission`,async()=>{
 let env=setup(),resume,pending;try{
  const d=await createDestination(env,webhook),job=await testDestination(env,d.id);
  let signal,sends=0;const arrived=new Promise(resolve=>signal=resolve),held=new Promise(resolve=>resume=resolve);
  pending=dispatchNotifications(async(_p,input)=>{const result=await notificationRpc(env,input);if(input.operation==='recoverExpired'){signal();await held}return result},{async send(){sends++;return {status:202,headers:{},body:''}}});await arrived;
  if(mode==='tampered')await env.DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE destination_id=?').bind('damaged-ciphertext',d.id).run();
  else env={...env,SESSION_SECRET:randomBytes(32).toString('hex')};
  assert.equal((await destinations(env))[0].credentialsAvailable,false);
  assert.ok((await stored(env))[0].unavailable_at!==null);
  resume();await pending;assert.equal(sends,0,'cached credentials cannot authorize a new attempt');
  const record=await env.DB.prepare('SELECT state,code,finished_at FROM notification_jobs WHERE id=?').bind(job.deliveryId).first();
  assert.equal(record.state,'rejected');assert.equal(record.code,'credential_unavailable');assert.ok(record.finished_at!==null);
  const delivery=await env.DB.prepare('SELECT state,attempts,claim,claim_until FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first();
  assert.equal(delivery.state,'rejected');assert.equal(delivery.attempts,0);assert.equal(delivery.claim,null);assert.equal(delivery.claim_until,null);
  assert.deepEqual(await notificationRpc(env,{operation:'log',id:job.deliveryId}),[]);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM notification_claim_custody').first()).n,0);
  await dispatchNotifications(api(env),{async send(){sends++;return {status:202,headers:{},body:''}}});assert.equal(sends,0);
 }finally{resume?.();await pending;env.DB.close()}
});
test('rotation retains an actually sending old version until finish and never replays it',async()=>{
 const env=setup();try{
  const d=await createDestination(env,webhook),job=await testDestination(env,d.id);await notificationRpc(env,{operation:'poll'});
  const claim=await notificationRpc(env,{operation:'claim',id:job.deliveryId}),old=(await stored(env)).find(r=>r.destination_id===d.id);assert.ok(claim);
  await rotateDestination(env,d.id);assert.ok((await stored(env)).find(r=>r.id===old.id).ciphertext,'inflight credential retained');
  assert.equal(await notificationRpc(env,{operation:'finish',id:job.deliveryId,claim,outcome:{kind:'accepted',code:'webhook_accepted'}}),true);
  assertScrubbed((await stored(env)).find(r=>r.id===old.id));assert.equal((await notificationOverview(env)).deliveries.find(j=>j.id===job.deliveryId).state,'accepted');
  await dispatchNotifications(api(env),{async send(){throw Error('committed history must not replay')}});
 }finally{env.DB.close()}
});
// Control only transaction admission; each statement uses the migrated native
// database. Exercise both serialization orders instead of relying on timing.
function transactionSchedule(DB){
 const original=DB.batch.bind(DB),pending=[];
 DB.batch=statements=>new Promise((resolve,reject)=>pending.push({statements,resolve,reject,released:false}));
 return {
  async ready(){const until=Date.now()+5000;while(pending.length<2&&Date.now()<until)await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,2);DB.batch=original},
  async release(index){const call=pending[index];call.released=true;try{call.resolve(await original(call.statements))}catch(error){call.reject(error)}},
  close(){DB.batch=original;for(const call of pending)if(!call.released)call.reject(Error('Transaction schedule closed'))},
 };
}
for(const winner of ['finish','release'])test(`finish and unstarted release serialize safely when ${winner} wins`,async()=>{
 const env=setup();let schedule;try{
  const d=await createDestination(env,webhook),job=await testDestination(env,d.id);await notificationRpc(env,{operation:'poll'});
  const reservation=crypto.randomUUID(),claim=await notificationRpc(env,{operation:'claim',id:job.deliveryId,reservation});assert.ok(claim);
  schedule=transactionSchedule(env.DB);
  const finish=notificationRpc(env,{operation:'finish',id:job.deliveryId,claim,outcome:{kind:'accepted',code:'webhook_accepted'}});
  // finish reaches its batch without crypto; release waits for the reservation
  // digest, so capture the first before starting the second operation.
  await new Promise(resolve=>setImmediate(resolve));
  const release=notificationRpc(env,{operation:'releaseUnstarted',id:job.deliveryId,claim,reservation});
  const settled=Promise.all([finish,release]);await schedule.ready();await schedule.release(winner==='finish'?0:1);await schedule.release(winner==='finish'?1:0);
  assert.deepEqual(await settled,winner==='finish'?[true,false]:[false,true]);
  const state=await notificationRpc(env,{operation:'get',id:job.deliveryId});assert.equal(state.state,winner==='finish'?'accepted':'queued');assert.equal(state.attempts,winner==='finish'?1:0);
  const audit=(await env.DB.prepare('SELECT * FROM notification_claim_custody WHERE claim=?').bind(claim).first());assert.equal(audit.released_at!==null,winner==='release');
  let sends=0;await dispatchNotifications(api(env),{async send(){sends++;return {status:202,headers:{},body:''}}});await dispatchNotifications(api(env),{async send(){throw Error('second automatic transport')}});assert.equal(sends,winner==='finish'?0:1);
  const attempts=await notificationRpc(env,{operation:'log',id:job.deliveryId});assert.equal(attempts.length,1);assert.equal(attempts[0].number,1);
 }finally{schedule?.close();env.DB.close()}
});
test('even the owning reservation cannot release a request already at its receiver',async()=>{
 const env=setup();let resume,claim,reservation;try{
  const d=await createDestination(env,webhook),job=await testDestination(env,d.id);let signal,sends=0;
  const arrived=new Promise(resolve=>signal=resolve),held=new Promise(resolve=>resume=resolve);
  const bridge=async(_p,input)=>{const value=await notificationRpc(env,input);if(input.operation==='claim'&&value){claim=value;reservation=input.reservation}return value};
  const delivery=dispatchNotifications(bridge,{async send(){sends++;signal();await held;return {status:202,headers:{},body:''}}});await arrived;
  assert.equal(await notificationRpc(env,{operation:'releaseUnstarted',id:job.deliveryId,claim,reservation}),false);
  assert.equal((await notificationRpc(env,{operation:'get',id:job.deliveryId})).state,'sending');resume();await delivery;
  await dispatchNotifications(api(env),{async send(){throw Error('already started request cannot replay')}});assert.equal(sends,1);assert.equal((await notificationOverview(env)).deliveries.find(j=>j.id===job.deliveryId).state,'accepted');
 }finally{resume?.();env.DB.close()}
});

test('health readiness checks schema without reading custody keys or altering bad credentials',async()=>{
 const env=setup();try{
  const d=await createDestination(env,webhook);await env.DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE destination_id=?').bind('tampered-record',d.id).run();
  const before=JSON.stringify(await stored(env));await notificationReadiness({...env,SESSION_SECRET:undefined});assert.equal(JSON.stringify(await stored(env)),before,'health does not decrypt, mark, scrub or otherwise mutate credentials');
 }finally{env.DB.close()}
});

test('actual 0008 migration sequence erases obsolete plaintext before any key-bearing request',async()=>{
 let originals;const DB=notificationTestDB({beforeMigration(name,sqlite){
  if(!name.startsWith('0009'))return;
  sqlite.prepare('INSERT INTO notification_destinations VALUES(?,?,?,?,?,?,NULL)').run('legacy-destination','Legacy','webhook',1,'current',1);
  for(const state of ['current','unused','queued','accepted','rejected','uncertain','sending','expired']){
   sqlite.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').run(state,'legacy-destination',webhook.url,randomBytes(32).toString('hex'),1);
   if(!['current','unused'].includes(state))sqlite.prepare('INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at,state) VALUES(?,?,?,?,?,?,?,?,?)').run(state,state,'legacy-destination','Legacy','webhook',state,'{}',1,state==='expired'?'sending':state);
   if(state==='sending'||state==='expired')sqlite.prepare('UPDATE notification_jobs SET claim=?,claim_until=? WHERE id=?').run(crypto.randomUUID(),state==='sending'?Date.now()+60000:0,state);
  }
  originals=sqlite.prepare('SELECT id,event,event_id FROM notification_jobs ORDER BY id').all();
 }});
 try{
  const rows=(await DB.prepare('SELECT * FROM notification_credentials').all()).results;
  for(const row of rows.filter(r=>!['current','sending'].includes(r.id)))assertScrubbed(row);
  assert.ok(rows.filter(r=>['current','sending'].includes(r.id)).every(r=>r.endpoint!==null&&r.retired_at===null),'only current and actually sending versions survive for key-bearing upgrade');
  assert.deepEqual((await DB.prepare('SELECT id,event,event_id FROM notification_jobs ORDER BY id').all()).results,originals);
  assert.equal((await DB.prepare("SELECT code FROM notification_jobs WHERE id='queued'").first()).code,'credential_rotated');
  const env={DB,SESSION_SECRET:randomBytes(32).toString('hex')};await ensureNotificationCustody(env);
  assert.ok((await stored(env)).filter(r=>['current','sending'].includes(r.id)).every(r=>r.endpoint===null&&r.signing_secret===null&&r.ciphertext));
 }finally{DB.close()}
});

for(const mode of ['tampered','session-rotated'])test(`claim detects unobserved ${mode} credentials after a valid poll`,async()=>{
 let env=setup(),resume,pending;try{
  const d=await createDestination(env,webhook),job=await testDestination(env,d.id);
  let signal,sends=0;const arrived=new Promise(resolve=>signal=resolve),held=new Promise(resolve=>resume=resolve);
  pending=dispatchNotifications(async(_p,input)=>{const result=await notificationRpc(env,input);if(input.operation==='recoverExpired'){signal();await held}return result},{async send(){sends++;return {status:202,headers:{},body:''}}});await arrived;
  if(mode==='tampered')await env.DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE destination_id=?').bind('unobserved-damage',d.id).run();
  else env={...env,SESSION_SECRET:randomBytes(32).toString('hex')};
  assert.equal((await stored(env))[0].unavailable_at,null,'no owner read or new poll has detected invalidation');
  assert.equal((await env.DB.prepare('SELECT attempts FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first()).attempts,0);
  resume();await pending;assert.equal(sends,0,'old poll credentials cannot authorize transport');
  const credential=(await stored(env))[0];assert.ok(credential.unavailable_at!==null,'claim isolates the selected invalid credential');
  const state=await env.DB.prepare('SELECT state,attempts,claim,claim_until FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first();
  assert.deepEqual({...state},{state:'rejected',attempts:0,claim:null,claim_until:null});
  const result=await env.DB.prepare('SELECT state,code FROM notification_jobs WHERE id=?').bind(job.deliveryId).first();assert.deepEqual({...result},{state:'rejected',code:'credential_unavailable'});
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM integration_attempts WHERE delivery_id=?').bind(job.deliveryId).first()).n,0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM notification_claim_custody WHERE delivery_id=?').bind(job.deliveryId).first()).n,0);
 }finally{resume?.();await pending;env.DB.close()}
});

// The hook controls the transaction boundary only. Validation, mutation SQL,
// admission and dispatch all execute production code against native SQLite.
for(const field of ['ciphertext','created_at','id','destination_id'])test(`credential ${field} mutation after validation cannot enter atomic admission`,async()=>{
 const env=setup();let originalBatch,pending;try{
  const d=await createDestination(env,webhook),job=await testDestination(env,d.id),before=(await stored(env))[0];
  let reached=false,sends=0;
  originalBatch=env.DB.batch.bind(env.DB);
  env.DB.batch=async statements=>{
   if(!reached&&statements.some(s=>s.sql.includes("SET state='sending',attempts=attempts+1"))){
    reached=true;
    assert.equal((await env.DB.prepare('SELECT attempts FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first()).attempts,0,'invalidation precedes attempt commitment');
    assert.equal((await stored(env))[0].unavailable_at,null);
    if(field==='ciphertext')await env.DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE id=?').bind('changed-after-validation',before.id).run();
    if(field==='created_at')await env.DB.prepare('UPDATE notification_credentials SET created_at=created_at+1 WHERE id=?').bind(before.id).run();
    if(field==='id'){
     const replacement=crypto.randomUUID();
     await originalBatch([
      env.DB.prepare('UPDATE notification_credentials SET id=? WHERE id=?').bind(replacement,before.id),
      env.DB.prepare('UPDATE notification_jobs SET credential_id=? WHERE id=?').bind(replacement,job.deliveryId),
      env.DB.prepare('UPDATE notification_destinations SET credential_id=? WHERE id=?').bind(replacement,d.id),
     ]);
    }
    if(field==='destination_id'){
     const replacement=crypto.randomUUID();
     await originalBatch([
      env.DB.prepare('UPDATE notification_credentials SET destination_id=? WHERE id=?').bind(replacement,before.id),
      env.DB.prepare('UPDATE notification_jobs SET destination_id=? WHERE id=?').bind(replacement,job.deliveryId),
      env.DB.prepare('UPDATE notification_destinations SET id=? WHERE id=?').bind(replacement,d.id),
     ]);
    }
   }
   return originalBatch(statements);
  };
  pending=dispatchNotifications(api(env),{async send(){sends++;return {status:202,headers:{},body:''}}});await pending;
  assert.equal(reached,true,'mutation ran after validation and immediately before admission');assert.equal(sends,0,'stale validation cannot authorize cached transport');
  const state=await env.DB.prepare('SELECT state,attempts,claim,claim_until FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first();
  assert.deepEqual({...state},{state:'queued',attempts:0,claim:null,claim_until:null},'changed row requires fresh validation');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM integration_attempts WHERE delivery_id=?').bind(job.deliveryId).first()).n,0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM notification_claim_custody WHERE delivery_id=?').bind(job.deliveryId).first()).n,0);
 }finally{if(originalBatch)env.DB.batch=originalBatch;await pending;env.DB.close()}
});

test('selected credential validation leaves unrelated damaged custody untouched',async()=>{
 const env=setup();let resume,pending;try{
  const good=await createDestination(env,webhook),bad=await createDestination(env,{...webhook,name:'Unrelated'}),job=await testDestination(env,good.id);
  let signal,sends=0;const arrived=new Promise(resolve=>signal=resolve),held=new Promise(resolve=>resume=resolve);
  pending=dispatchNotifications(async(_p,input)=>{const result=await notificationRpc(env,input);if(input.operation==='recoverExpired'){signal();await held}return result},{async send(){sends++;return {status:202,headers:{},body:''}}});await arrived;
  await env.DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE destination_id=?').bind('unrelated-damage',bad.id).run();
  const original=await env.DB.prepare('SELECT * FROM notification_credentials WHERE destination_id=?').bind(bad.id).first();
  resume();await pending;assert.equal(sends,1);
  assert.deepEqual(await env.DB.prepare('SELECT * FROM notification_credentials WHERE destination_id=?').bind(bad.id).first(),original,'claim does not globally decrypt or mark other credentials');
  const result=await env.DB.prepare('SELECT state,attempts FROM integration_deliveries WHERE id=?').bind(job.deliveryId).first();assert.equal(result.state,'accepted');assert.equal(result.attempts,1);
 }finally{resume?.();await pending;env.DB.close()}
});
