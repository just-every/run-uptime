import {testAuthBindings,authRequest,signInOwner} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {root,availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory,fixtureProcess,waitFor} from './notify-acceptance-runtime.mjs';
import {eraseAndAssert} from './notify-custody-fixture.mjs';
import {populateLegacy} from './notify-upgrade-fixture.mjs';
import {readGrant} from '../runners/src/grants.mjs';
import {probeHttp} from '../runners/src/engine.mjs';
import {splitSql} from './migration-support.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
const [port,fixturePort]=await availablePorts(2),directory=await runtimeDirectory(),persist=join(directory,'worker'),grantPath=join(directory,'grant.json'),origin=`http://127.0.0.1:${port}`;
const bindings={...testAuthBindings,UPTIME_SYNTHETIC_PORT:String(fixturePort),SESSION_SECRET:randomBytes(32).toString('hex'),UPTIME_RUNNER_KEY:randomBytes(32).toString('hex')};
let cookie;
const call=authRequest(origin),owner={
 async api(path,method='GET',value){const response=await fetch(origin+path,{method,headers:{'content-type':'application/json',origin,cookie},body:value===undefined?undefined:JSON.stringify(value)});const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:response.status,headers:response.headers,data}},
 async signIn(settings){cookie=await signInOwner(origin,{bindings:settings})},
};
const id=randomUUID(),current=randomUUID(),old=randomUUID(),secret=randomBytes(32).toString('hex'),oldSecret=randomBytes(32).toString('hex'),endpoint='https://receiver.example.com/'+randomUUID();
const slackId=randomUUID(),slackCredential=randomUUID(),slackURL='https://hooks.slack.com/services/TONE/BONE/'+randomUUID(),unusedSlackKey=randomBytes(32).toString('hex'),emailId=randomUUID(),emailCredential=randomUUID(),email='prior@example.com',deletedId=randomUUID(),deletedCredential=randomUUID(),deletedURL='https://receiver.example.com/'+randomUUID(),deletedKey=randomBytes(32).toString('hex');
let worker,DB,fixture;
const rows=async table=>(await DB.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results;
const snapshot=async tables=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await rows(table)])));
const raw=async()=> (await DB.prepare('SELECT * FROM notification_credentials ORDER BY id').all()).results;
const noPlain=async()=>{const credentials=await raw(),text=JSON.stringify(credentials);assert.ok(credentials.every(row=>row.endpoint===null&&row.signing_secret===null),'every version has scrubbed plaintext columns');assert.ok([secret,oldSecret,endpoint,slackURL,unusedSlackKey,email,deletedURL,deletedKey,'recovered@example.com'].every(s=>!text.includes(s)),'raw D1 has no notification plaintext')};
const health=()=>fetch(origin+'/health');
const runner=async(_path,input)=>{const response=await fetch(origin+'/api/runner/notifications',{method:'POST',headers:{'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY},body:JSON.stringify(input)});assert.equal(response.status,200,'runner RPC remains authorized');return response.json()};
const apply=async lower=>{for(const name of (await readdir(join(root,'migrations'))).filter(n=>n.endsWith('.sql')&&Number(n.slice(0,4))>lower).sort())for(const sql of splitSql(await readFile(join(root,'migrations',name),'utf8')))await DB.prepare(sql).run()};
try{
 ({worker,DB}=await migratedWorker({port,persist,bindings,baselineOnly:true}));
 fixture=fixtureProcess(fixturePort,grantPath,directory);
 const grant=await waitFor(async()=>{
  const grant=await readGrant(grantPath,port),response=await fetch(`http://127.0.0.1:${fixturePort}/health`);
  assert.equal(grant.pid,fixture.child.pid);assert.equal(grant.port,fixturePort);
  return response.ok&&response.headers.get('x-uptime-fixture')===grant.identity?grant:false;
 },'custody fixture and owned grant ready');
 ({cookie}=await populateLegacy(DB,{bindings,origin,fixturePort,grant}));
 const [legacyMonitor]=await rows('monitors'),[legacyEvent]=await rows('outbox');
 const monitor={data:{id:legacyMonitor.id,definition:JSON.parse(legacyMonitor.definition)}};
 for(const name of ['0007_integrations.sql','0008_notifications.sql']){
  // Locate the actual edition migration by immutable number.
  const actual=(await readdir(join(root,'migrations'))).find(n=>n.startsWith(name.slice(0,4)));
  for(const sql of splitSql(await readFile(join(root,'migrations',actual),'utf8')))await DB.prepare(sql).run();
 }
 const now=Date.now(),eventId=legacyEvent.id,incident=JSON.parse(legacyEvent.event);
 const evidence=(await rows('observations')).map(row=>JSON.parse(row.evidence));
 const event={schemaVersion:2,id:eventId,kind:'trigger',eventType:'uptime.incident.firing',incidentKey:'incident:'+incident.slotId,monitorId:monitor.data.id,monitorRevision:1,monitorName:monitor.data.definition.name,url:monitor.data.definition.url,slotId:incident.slotId,observedAt:incident.observedAt,state:'firing',title:'Prior incident',visibility:'private',evidenceRef:'/api/monitors/'+monitor.data.id+'/history',explanation:JSON.parse(legacyMonitor.state).reason,probes:evidence.map(observation=>({name:observation.probe,outcome:observation.outcome,reason:observation.checks.filter(check=>!check.pass).map(check=>check.reason).join('; ')})),consoleUrl:origin};
 // Notification records belonged to this actual scheduled incident before upgrade.
 await DB.batch([
  DB.prepare("INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at,state,code,attempts,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(eventId+':'+id,eventId,id,'Prior webhook','webhook',old,JSON.stringify(event),now,'accepted','webhook_accepted',1,now),
  DB.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').bind(slackCredential,slackId,slackURL,unusedSlackKey,now),
  DB.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').bind(emailCredential,emailId,email,null,now),
  DB.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').bind(deletedCredential,deletedId,deletedURL,deletedKey,now),
  DB.prepare('INSERT INTO notification_destinations(id,name,kind,enabled,credential_id,created_at,deleted_at) VALUES(?,?,?,?,?,?,?)').bind(slackId,'Prior Slack','slack',1,slackCredential,now,null),
  DB.prepare('INSERT INTO notification_destinations(id,name,kind,enabled,credential_id,created_at,deleted_at) VALUES(?,?,?,?,?,?,?)').bind(emailId,'Prior email','email',1,emailCredential,now,null),
  DB.prepare('INSERT INTO notification_destinations(id,name,kind,enabled,credential_id,created_at,deleted_at) VALUES(?,?,?,?,?,?,?)').bind(deletedId,'Prior deleted','webhook',0,deletedCredential,now,now),
  DB.prepare('INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(eventId+':'+slackId,eventId,slackId,'Prior Slack','slack',slackCredential,JSON.stringify({...event,explanation:'Prior failure',consoleUrl:origin}),now),
  DB.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').bind(old,id,endpoint,oldSecret,now-1),
  DB.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').bind(current,id,endpoint,secret,now),
  DB.prepare('INSERT INTO notification_destinations(id,name,kind,enabled,credential_id,created_at,deleted_at) VALUES(?,?,?,?,?,?,NULL)').bind(id,'Prior webhook','webhook',1,current,now),
 ]);
 const tables=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'notification_credentials' ORDER BY name").all()).results.map(row=>row.name);
 const before=await snapshot(tables),credentialsBefore=await raw();
 // The additive template migration preserves every old value and adds only empty configuration.
 const upgradedBefore={...before,notification_destinations:before.notification_destinations.map(row=>({...row,webhook_template:null})),notification_jobs:before.notification_jobs.map(row=>({...row,webhook_template:null}))};
 assert.equal(credentialsBefore.length,5);
 assert.deepEqual(Object.keys(credentialsBefore[0]).sort(),['id','destination_id','endpoint','signing_secret','created_at'].sort(),'genuine 0008 credentials are plaintext');
 assert.ok(credentialsBefore.every(row=>row.endpoint),'all five historical versions have plaintext endpoints');
 for(const table of ['notification_claim_custody','uptime_audit','public_rate_limits'])assert.equal(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first(),null,`${table} is absent at 0008`);
 for(const response of [await health(),await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Test owner',returnTo:'/app'})]){
  assert.equal(response.status,503,'public limiter refuses current routes against historical storage');
  assert.equal(response.headers.get('set-cookie'),null);
  assert.deepEqual(await response.json(),{error:'Public request limiter unavailable',code:'storage_unavailable',retryable:true,class:'schema',operation:'publicRateLimit.count'},'refusal is typed, names its operation and exposes no SQL detail or authority');
  assert.equal(response.headers.get('retry-after'),'5');
 }
 assert.equal((await call('/api/overview')).status,401,'unsigned private read remains unauthorized');
 assert.deepEqual(await snapshot(tables),before,'denied current requests cannot change historical authority or business data');
 assert.deepEqual(await raw(),credentialsBefore);
 console.log('PASS authentic 0008 plaintext history: limiter 503 masks /health notification readiness; no cookie, capability, SQL detail or historical writes');
 await apply(8);assert.equal((await health()).status,200,'all additive migrations establish health readiness');await noPlain();
 const protectedRows=await raw();assert.equal(protectedRows.length,5);
 assert.deepEqual(protectedRows.map(({id,destination_id,created_at})=>({id,destination_id,created_at})),credentialsBefore.map(({id,destination_id,created_at})=>({id,destination_id,created_at})),'five credential identities survive');
 const usable=protectedRows.filter(r=>r.destination_id!==deletedId&&r.id!==old),retired=protectedRows.filter(r=>r.destination_id===deletedId||r.id===old);
 assert.equal(usable.length,3);assert.ok(usable.every(r=>r.ciphertext&&r.endpoint===null&&r.signing_secret===null&&r.retired_at===null),'first health seals current credentials before owner visits');
 assert.equal(retired.length,2);assert.ok(retired.every(r=>r.ciphertext===null&&r.endpoint===null&&r.signing_secret===null&&r.retired_at!==null),'obsolete and soft-deleted plaintext is scrubbed');
 const [native]=before.oa_sessions,[operator]=before.oa_operators;
 assert.equal(operator.role,'owner');assert.equal(operator.status,'active');assert.equal(before.oa_bootstrap[0].claim_id,operator.id);assert.ok(native.expires_at>Date.now(),'historical native session retains its fixed valid expiry');
 const nativeSession=async()=>{const result=await owner.api('/auth/session');assert.equal(result.status,200);assert.deepEqual(result.data,{id:native.id,operatorId:operator.id,createdAt:native.created_at,expiresAt:native.expires_at,kind:'native',issuer:null,subject:null,sid:null,operator:{id:operator.id,email:operator.email,displayName:operator.display_name,role:operator.role,status:operator.status,version:operator.version,createdAt:operator.created_at}})};
 await nativeSession();
 const overviewRead=await owner.api('/api/overview');assert.equal(overviewRead.status,200);assert.equal(overviewRead.data.monitors.length,1);
 const retainedMonitor=overviewRead.data.monitors[0];
 assert.deepEqual({id:retainedMonitor.id,revision:retainedMonitor.revision,definition:retainedMonitor.definition,nextDue:retainedMonitor.nextDue,storedState:retainedMonitor.storedState},{id:legacyMonitor.id,revision:legacyMonitor.revision,definition:JSON.parse(legacyMonitor.definition),nextDue:legacyMonitor.next_due,storedState:JSON.parse(legacyMonitor.state)});
 assert.deepEqual(overviewRead.data.alerts,before.outbox.map(row=>({...row,event:JSON.parse(row.event)})));
 const historyRead=await owner.api(`/api/monitors/${monitor.data.id}/history`);assert.equal(historyRead.status,200);
 assert.deepEqual(historyRead.data,before.slots.map(row=>({...row,definition:JSON.parse(row.definition),observations:before.observations.filter(observation=>observation.slot_id===row.id).map(observation=>JSON.parse(observation.evidence))})),'owner history exposes the exact original scheduled evidence');
 assert.equal((await owner.api('/api/notifications')).status,200);
 assert.equal((await call('/api/overview')).status,401);
 assert.deepEqual(await snapshot(tables),upgradedBefore,'complete historical authority and business snapshot survives encryption and owner reads without replay');
 assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);assert.deepEqual((await DB.prepare('PRAGMA quick_check').all()).results,[{quick_check:'ok'}]);
 await worker.dispose();({worker,DB}=await migratedWorker({port,persist,bindings}));assert.equal((await health()).status,200);
 assert.deepEqual(await raw(),protectedRows,'restart preserves ciphertext and identities');await nativeSession();
 assert.deepEqual(await snapshot(tables),upgradedBefore,'restart preserves historical rows and fixed native expiry');
 console.log('PASS complete additive upgrade and same-key restart preserve history, native authority and five credential identities without sending');
 const priorPoll=await runner('',{operation:'poll'});const priorSlack=priorPoll.jobs.find(j=>j.credentialId===slackCredential);
 assert.equal(priorPoll.jobs.length,1,'accepted webhook history is never polled again');
 assert.ok(priorSlack,'existing queued Slack job remains available without replaying completed history');assert.equal(priorSlack.credential.signing_secret,null,'obsolete Slack signing key was discarded');assert.ok(priorSlack.credential.endpoint===slackURL,'legacy capability decrypted correctly');
 await eraseAndAssert(DB,owner,slackId,{expectedCredentials:1});await eraseAndAssert(DB,owner,emailId,{expectedCredentials:1});
 let sends=0;const transport={async send(wire,beforeRequest){await beforeRequest();sends++;assert.ok(wire.url===endpoint,'decrypted endpoint matches original');assert.ok(wire.headers['x-lamp-signature']===createHmac('sha256',secret).update(wire.headers['x-lamp-timestamp']+'.'+wire.body).digest('base64url'),'wire signature still authenticates the exact bytes');return {status:202,headers:{},body:''}}};
 const ahead=(await owner.api(`/api/notifications/destinations/${id}/test`,'POST',{})).data;
 await dispatchNotifications(runner,transport,{now:()=>Date.now()+61000});let history=(await owner.api('/api/notifications')).data.deliveries.find(j=>j.id===ahead.deliveryId);assert.equal(history.state,'queued');assert.equal(history.attempts,0);assert.equal(sends,0);
 await dispatchNotifications(runner,transport);assert.equal(sends,1,'correct runner can send the unsent job once');
 // 59 seconds ahead remains inside the unchanged 60-second claim, and a
 // runner behind uses the durable Worker clock for claims and completion.
 for(const offset of [59000,-61000]){await owner.api(`/api/notifications/destinations/${id}/test`,'POST',{});await dispatchNotifications(runner,transport,{now:()=>Date.now()+offset})}assert.equal(sends,3);
 await Promise.all([dispatchNotifications(runner,transport),dispatchNotifications(runner,transport)]);assert.equal(sends,3);
 const slow=(await owner.api(`/api/notifications/destinations/${id}/test`,'POST',{})).data;let reads=0;
 await dispatchNotifications(async(path,input)=>{const value=await runner(path,input);if(input.operation==='get'&&input.id===slow.deliveryId&&++reads===1)await DB.prepare('UPDATE integration_deliveries SET claim_until=0 WHERE id=?').bind(slow.deliveryId).run();return value},transport,{now:()=>Date.now()-61000});
 history=(await owner.api('/api/notifications')).data.deliveries.find(j=>j.id===slow.deliveryId);assert.equal(history.code,'claim_expired');assert.equal(history.state,'uncertain');assert.equal(sends,3);
 await dispatchNotifications(runner,transport);assert.equal(sends,3);
 const queued=(await owner.api(`/api/notifications/destinations/${id}/test`,'POST',{})).data;await runner('',{operation:'poll'});
 const scheduled=(await owner.api('/api/notifications')).data.deliveries.flatMap(row=>row.attemptHistory);
 assert.ok(scheduled.length>0);assert.ok(!JSON.stringify(scheduled).includes(secret));assert.ok(scheduled.every(row=>row.phase==='retry'&&row.key_reference));
 assert.equal((await owner.api(`/api/notifications/destinations/${id}/rotate`,'POST',{})).status,200);
 let stored=await raw();assert.equal(stored.filter(r=>r.destination_id===id&&r.retired_at!==null).length,2);assert.ok(stored.filter(r=>r.retired_at!==null).every(r=>r.ciphertext===null&&r.endpoint===null&&r.signing_secret===null));
 await dispatchNotifications(runner,transport);assert.equal(sends,3);history=(await owner.api('/api/notifications')).data.deliveries.find(j=>j.id===queued.deliveryId);assert.equal(history.code,'credential_rotated');
 await eraseAndAssert(DB,owner,id,{expectedCredentials:3,exerciseHistory:true});
 stored=await raw();assert.equal(stored.length,1,'only the historical soft-deleted credential remains');assert.equal(stored[0].id,deletedCredential);assert.ok(stored[0].ciphertext===null&&stored[0].endpoint===null&&stored[0].signing_secret===null&&stored[0].retired_at!==null);await noPlain();
 console.log('PASS clock bounds, exact HMAC, no replay, expiry, rotation and full destination erasure with receipt/audit');
 // Raw D1 damage is isolated from health, sign-in and authenticated probes.
 const recoveryHook=(await owner.api('/api/notifications/destinations','POST',{kind:'webhook',name:'Recover webhook',url:endpoint})).data;
 const recoveryMail=(await owner.api('/api/notifications/destinations','POST',{kind:'email',name:'Recover inbox',address:email})).data;
 const recoverySlack=(await owner.api('/api/notifications/destinations','POST',{kind:'slack',name:'Recover chat',url:slackURL})).data;
 const goodCipher=(await raw()).find(r=>r.destination_id===recoveryHook.id);
 const foreignCipher=(await raw()).find(r=>r.destination_id===recoverySlack.id);
 await DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE id=?').bind(foreignCipher.ciphertext,goodCipher.id).run();
 assert.equal((await health()).status,200,'swapped ciphertext cannot disable health');
 let overview=(await owner.api('/api/notifications')).data;
 assert.equal(overview.destinations.find(d=>d.id===recoveryHook.id).credentialsAvailable,false);
 assert.equal(overview.destinations.find(d=>d.id===recoveryMail.id).address,email);
 await owner.signIn(bindings);
 const probeRoundTrip=async()=>{
  assert.equal((await owner.api('/api/overview')).status,200,'monitoring remains readable');
  await DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.data.id).run();
  const claimed=await fetch(origin+'/api/runner/claim',{method:'POST',headers:{'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY},body:'{}'});assert.equal(claimed.status,200,'probe claims remain available');
  const task=(await claimed.json()).task;assert.ok(task,'scheduled probe claimed');
  // Continue the existing real failing incident: a fabricated pass would create
  // an unrelated recovery notification and contaminate this custody journey.
  const attempts=await Promise.all(task.definition.probes.map(async probe=>({...await probeHttp({...task.definition,fixtureIdentity:grant.identity},probe,[fixturePort]),attempt:0})));
  assert.ok(attempts.every(attempt=>attempt.outcome==='target_failure'&&attempt.status===503));
  const text=JSON.stringify({slotId:task.id,leaseOwner:task.leaseOwner,attempts}),timestamp=String(Date.now());
  const completed=await fetch(origin+'/api/runner/results',{method:'POST',headers:{'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY,'x-sent-at':timestamp,'x-runner-signature':createHmac('sha256',bindings.UPTIME_RUNNER_KEY).update(timestamp+'.'+text).digest('hex')},body:text});
  assert.equal(completed.status,200,'signed probe results remain available');assert.equal((await completed.json()).accepted,true);
  assert.deepEqual(await rows('outbox'),before.outbox,'continuing the historical incident cannot manufacture another notification');
 };
 await probeRoundTrip();
 assert.equal((await owner.api(`/api/notifications/destinations/${recoveryHook.id}/test`,'POST',{})).status,400);
 assert.equal((await owner.api(`/api/notifications/destinations/${recoveryHook.id}`,'PATCH',{name:'Recover webhook',enabled:true,url:endpoint})).status,200,'damaged record can be re-entered');
 const tampered=(await raw()).find(r=>r.destination_id===recoveryHook.id&&r.retired_at===null);
 await DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE id=?').bind(tampered.ciphertext.slice(0,-5)+'AAAAA',tampered.id).run();
 assert.equal((await health()).status,200,'changed ciphertext cannot disable health');
 await probeRoundTrip();
 await eraseAndAssert(DB,owner,recoveryHook.id,{expectedCredentials:2});
 const retainedTables=['monitors','revisions','slots','observations','outbox','notification_jobs','integration_attempts','uptime_erasure_receipts'];
 const retainedSnapshot=await snapshot(retainedTables);
 // Change the actual Worker secret, invalidate the old cookie, then reauthenticate.
 await worker.dispose();({worker,DB}=await migratedWorker({port,persist,bindings:{...bindings,SESSION_SECRET:randomBytes(32).toString('hex')}}));
 assert.equal((await health()).status,200,'session-key rotation cannot disable monitoring readiness');
 assert.equal((await owner.api('/api/overview')).status,401,'old authentication no longer works');
 assert.equal((await fetch(origin+'/login')).status,200);assert.equal((await fetch(origin+'/auth/session')).status,401,'authentication route is available');
 await owner.signIn(bindings);
 overview=(await owner.api('/api/notifications')).data;assert.equal(overview.destinations.length,2);assert.ok(overview.destinations.every(d=>!d.credentialsAvailable),'owner sees each invalidated credential');
 assert.deepEqual(await snapshot(retainedTables),retainedSnapshot,'business tables remain intact across session-secret rotation');
 await probeRoundTrip();
 assert.equal((await runner('',{operation:'poll'})).jobs.length,0,'invalidated credentials never enter runner memory');
 assert.equal((await owner.api(`/api/notifications/destinations/${recoveryMail.id}`,'PATCH',{name:'Recovered inbox',enabled:true,address:'recovered@example.com'})).status,200);
 assert.equal((await owner.api(`/api/notifications/destinations/${recoverySlack.id}`,'PATCH',{name:'Recovered chat',enabled:true,url:slackURL})).status,200);
 overview=(await owner.api('/api/notifications')).data;assert.equal(overview.destinations.length,2);assert.ok(overview.destinations.every(d=>d.credentialsAvailable));assert.equal(overview.destinations.find(d=>d.id===recoveryMail.id).address,'recovered@example.com');
 await noPlain();
 for(const destination of overview.destinations)await eraseAndAssert(DB,owner,destination.id,{expectedCredentials:2});
 console.log('PASS emitted Worker populated upgrade retirement; raw tamper and secret rotation isolate credentials while auth/probe claim/results continue; reentry/deletion; clock bridge signatures and no replay');
}finally{try{if(worker)await worker.dispose()}finally{try{if(fixture)await fixture.stop()}finally{await cleanupDirectory(directory)}}}
