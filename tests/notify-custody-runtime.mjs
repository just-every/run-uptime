import {testAuthBindings} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {root,availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory,ownerAPI} from './notify-acceptance-runtime.mjs';
import {splitSql} from './migration-support.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
const directory=await runtimeDirectory(),[port]=await availablePorts(1),persist=join(directory,'worker'),origin=`http://127.0.0.1:${port}`;
const bindings={...testAuthBindings,SESSION_SECRET:randomBytes(32).toString('hex'),UPTIME_RUNNER_KEY:randomBytes(32).toString('hex')};
const owner=ownerAPI(origin),id=randomUUID(),current=randomUUID(),old=randomUUID(),secret=randomBytes(32).toString('hex'),oldSecret=randomBytes(32).toString('hex'),endpoint='https://receiver.example.com/'+randomUUID();
const slackId=randomUUID(),slackCredential=randomUUID(),slackURL='https://hooks.slack.com/services/TONE/BONE/'+randomUUID(),unusedSlackKey=randomBytes(32).toString('hex'),emailId=randomUUID(),emailCredential=randomUUID(),email='prior@example.com',deletedId=randomUUID(),deletedCredential=randomUUID(),deletedURL='https://receiver.example.com/'+randomUUID(),deletedKey=randomBytes(32).toString('hex');
let worker,DB;
const raw=async()=> (await DB.prepare('SELECT * FROM notification_credentials ORDER BY id').all()).results;
const noPlain=async()=>{const text=JSON.stringify(await raw());assert.ok([secret,oldSecret,endpoint,slackURL,unusedSlackKey,email,deletedURL,deletedKey].every(s=>!text.includes(s)),'raw D1 has no notification plaintext')};
const health=()=>fetch(origin+'/health');
const runner=async(_path,input)=>{const response=await fetch(origin+'/api/runner/notifications',{method:'POST',headers:{'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY},body:JSON.stringify(input)});assert.equal(response.status,200,'runner RPC remains authorized');return response.json()};
const apply=async lower=>{for(const name of (await readdir(join(root,'migrations'))).filter(n=>n.endsWith('.sql')&&Number(n.slice(0,4))>lower).sort())for(const sql of splitSql(await readFile(join(root,'migrations',name),'utf8')))await DB.prepare(sql).run()};
try{
 ({worker,DB}=await migratedWorker({port,persist,bindings,baselineOnly:true}));await owner.signIn(bindings);
 const monitor=await owner.api('/api/monitors','POST',{name:'Preserved upgrade monitor',url:'https://example.com'});assert.equal(monitor.status,201);
 for(const name of ['0007_integrations.sql','0008_notifications.sql']){
  // Locate the actual edition migration by immutable number.
  const actual=(await readdir(join(root,'migrations'))).find(n=>n.startsWith(name.slice(0,4)));
  for(const sql of splitSql(await readFile(join(root,'migrations',actual),'utf8')))await DB.prepare(sql).run();
 }
 const now=Date.now(),slot=randomUUID(),observationId=randomUUID(),eventId=randomUUID();
 // Populated prior-version rows are upgrade fixtures, never newly emitted work.
 const event={schemaVersion:2,id:eventId,kind:'trigger',eventType:'uptime.incident.firing',incidentKey:'incident:'+slot,monitorId:monitor.data.id,monitorRevision:1,monitorName:monitor.data.definition.name,url:monitor.data.definition.url,slotId:slot,observedAt:now,state:'firing',title:'Prior incident',visibility:'private',evidenceRef:'/api/monitors/'+monitor.data.id+'/history',explanation:'HTTP 500',probes:[{name:'local-a',outcome:'target_failure',reason:'HTTP 500'}],consoleUrl:origin};
 const observation={id:observationId,probe:'local-a',attempt:0,startedAt:now,completedAt:now,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'target_failure',status:500,bytes:0,checks:[{assertion:'status',pass:false,reason:'HTTP 500'}]};
 await DB.batch([
  DB.prepare('INSERT INTO slots VALUES(?,?,?,?,?,?,?,?,?,?)').bind(slot,monitor.data.id,1,now,'complete',JSON.stringify(monitor.data.definition),'prior-holder',now+30000,0,0),
  DB.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').bind(observationId,slot,'local-a',0,JSON.stringify(observation)),
  DB.prepare('INSERT INTO outbox VALUES(?,?,?,?,?,?,?,?)').bind(eventId,monitor.data.id,slot,'trigger',JSON.stringify(event),'accepted',0,JSON.stringify({acknowledged:true})),
  DB.prepare("INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at,state,code,attempts,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(eventId+':'+id,eventId,id,'Prior webhook','webhook',old,JSON.stringify(event),now,'accepted','webhook_accepted',1,now),
  DB.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').bind(slackCredential,slackId,slackURL,unusedSlackKey,now),
  DB.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').bind(emailCredential,emailId,email,null,now),
  DB.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').bind(deletedCredential,deletedId,deletedURL,deletedKey,now),
  DB.prepare('INSERT INTO notification_destinations VALUES(?,?,?,?,?,?,?)').bind(slackId,'Prior Slack','slack',1,slackCredential,now,null),
  DB.prepare('INSERT INTO notification_destinations VALUES(?,?,?,?,?,?,?)').bind(emailId,'Prior email','email',1,emailCredential,now,null),
  DB.prepare('INSERT INTO notification_destinations VALUES(?,?,?,?,?,?,?)').bind(deletedId,'Prior deleted','webhook',0,deletedCredential,now,now),
  DB.prepare('INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(eventId+':'+slackId,eventId,slackId,'Prior Slack','slack',slackCredential,JSON.stringify({...event,explanation:'Prior failure',consoleUrl:origin}),now),
  DB.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').bind(old,id,endpoint,oldSecret,now-1),
  DB.prepare('INSERT INTO notification_credentials VALUES(?,?,?,?,?)').bind(current,id,endpoint,secret,now),
  DB.prepare('INSERT INTO notification_destinations VALUES(?,?,?,?,?,?,NULL)').bind(id,'Prior webhook','webhook',1,current,now),
 ]);
 const tables=['migrations','monitors','revisions','slots','observations','outbox','oa_operators','oa_sessions','notification_destinations','notification_jobs','integration_deliveries','integration_attempts'];
 const before=Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await DB.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results])));
 assert.equal((await health()).status,503,'SQL-only plaintext notification schema must not advertise ready');
 await apply(8);assert.equal((await health()).status,200,'complete SQL schema establishes health readiness');await noPlain();assert.ok((await raw()).filter(r=>r.retired_at===null).every(r=>r.ciphertext),'the first health request seals current plaintext before any owner visit');assert.equal((await owner.api('/api/notifications')).status,200,'authorized notification read completes key-bearing upgrade');await noPlain();
 const protectedRows=await raw();assert.equal(protectedRows.length,5);assert.ok(protectedRows.filter(r=>r.destination_id!==deletedId&&r.id!==old).every(r=>r.ciphertext&&r.endpoint===null&&r.signing_secret===null),'only current usable credentials are encrypted');assert.ok(protectedRows.filter(r=>r.destination_id===deletedId||r.id===old).every(r=>r.ciphertext===null&&r.endpoint===null&&r.signing_secret===null&&r.retired_at!==null),'deleted and unused obsolete credentials are scrubbed');
 for(const table of tables)assert.ok(JSON.stringify((await DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results)===JSON.stringify(before[table]),`${table} survives key-bearing upgrade without replay`);
 await worker.dispose();({worker,DB}=await migratedWorker({port,persist,bindings}));assert.equal((await health()).status,200);assert.ok(JSON.stringify(await raw())===JSON.stringify(protectedRows),'restart does not reencrypt or replace identities');assert.equal((await owner.api('/api/notifications')).status,200,'prior session survives');
 const priorPoll=await runner('',{operation:'poll'});const priorSlack=priorPoll.jobs.find(j=>j.credentialId===slackCredential);
 assert.ok(priorSlack,'existing queued Slack job remains available without replaying completed history');assert.equal(priorSlack.credential.signing_secret,null,'obsolete Slack signing key was discarded');assert.ok(priorSlack.credential.endpoint===slackURL,'legacy capability decrypted correctly');
 assert.equal((await owner.api(`/api/notifications/destinations/${slackId}`,'DELETE')).status,200);assert.equal((await owner.api(`/api/notifications/destinations/${emailId}`,'DELETE')).status,200);
 let sends=0;const transport={async send(wire){sends++;assert.ok(wire.url===endpoint,'decrypted endpoint matches original');assert.ok(wire.headers['x-lamp-signature']===createHmac('sha256',secret).update(wire.headers['x-lamp-timestamp']+'.'+wire.body).digest('base64url'),'wire signature still authenticates the exact bytes');return {status:202,headers:{},body:''}}};
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
 assert.equal((await owner.api(`/api/notifications/destinations/${id}/rotate`,'POST',{})).status,200);
 let stored=await raw();assert.equal(stored.filter(r=>r.destination_id===id&&r.retired_at!==null).length,2);assert.ok(stored.filter(r=>r.retired_at!==null).every(r=>r.ciphertext===null&&r.endpoint===null&&r.signing_secret===null));
 await dispatchNotifications(runner,transport);assert.equal(sends,3);history=(await owner.api('/api/notifications')).data.deliveries.find(j=>j.id===queued.deliveryId);assert.equal(history.code,'credential_rotated');
 assert.equal((await owner.api(`/api/notifications/destinations/${id}`,'DELETE')).status,200);stored=await raw();assert.ok(stored.every(r=>r.ciphertext===null&&r.endpoint===null&&r.signing_secret===null&&r.retired_at!==null));await noPlain();
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
  const task=(await claimed.json()).task;assert.ok(task,'scheduled probe claimed');const stamp=Date.now();
  const attempts=task.definition.probes.map(probe=>({id:randomUUID(),probe,attempt:0,startedAt:stamp,completedAt:stamp,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'pass',status:200,bytes:0,checks:[{assertion:'status',pass:true,reason:'HTTP 200'}]}));
  const text=JSON.stringify({slotId:task.id,leaseOwner:task.leaseOwner,attempts}),timestamp=String(Date.now());
  const completed=await fetch(origin+'/api/runner/results',{method:'POST',headers:{'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY,'x-sent-at':timestamp,'x-runner-signature':createHmac('sha256',bindings.UPTIME_RUNNER_KEY).update(timestamp+'.'+text).digest('hex')},body:text});
  assert.equal(completed.status,200,'signed probe results remain available');assert.equal((await completed.json()).accepted,true);
 };
 await probeRoundTrip();
 assert.equal((await owner.api(`/api/notifications/destinations/${recoveryHook.id}/test`,'POST',{})).status,400);
 assert.equal((await owner.api(`/api/notifications/destinations/${recoveryHook.id}`,'PATCH',{name:'Recover webhook',enabled:true,url:endpoint})).status,200,'damaged record can be re-entered');
 const tampered=(await raw()).find(r=>r.destination_id===recoveryHook.id&&r.retired_at===null);
 await DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE id=?').bind(tampered.ciphertext.slice(0,-5)+'AAAAA',tampered.id).run();
 assert.equal((await health()).status,200,'changed ciphertext cannot disable health');
 await probeRoundTrip();
 assert.equal((await owner.api(`/api/notifications/destinations/${recoveryHook.id}`,'DELETE')).status,200,'damaged destination can be deleted');
 const retainedTables=['monitors','revisions','slots','observations','outbox','notification_jobs','integration_attempts'];
 const snapshot=Object.fromEntries(await Promise.all(retainedTables.map(async t=>[t,JSON.stringify((await DB.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results)])));
 // Change the actual Worker secret, invalidate the old cookie, then reauthenticate.
 await worker.dispose();({worker,DB}=await migratedWorker({port,persist,bindings:{...bindings,SESSION_SECRET:randomBytes(32).toString('hex')}}));
 assert.equal((await health()).status,200,'session-key rotation cannot disable monitoring readiness');
 assert.equal((await owner.api('/api/overview')).status,401,'old authentication no longer works');
 assert.equal((await fetch(origin+'/login')).status,200);assert.equal((await fetch(origin+'/auth/session')).status,401,'authentication route is available');
 await owner.signIn(bindings);
 overview=(await owner.api('/api/notifications')).data;assert.ok(overview.destinations.every(d=>!d.credentialsAvailable),'owner sees each invalidated credential');
 for(const table of retainedTables)assert.ok(JSON.stringify((await DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results)===snapshot[table],`${table} remains intact across secret rotation`);
 await probeRoundTrip();
 assert.equal((await runner('',{operation:'poll'})).jobs.length,0,'invalidated credentials never enter runner memory');
 assert.equal((await owner.api(`/api/notifications/destinations/${recoveryMail.id}`,'PATCH',{name:'Recovered inbox',enabled:true,address:'recovered@example.com'})).status,200);
 assert.equal((await owner.api(`/api/notifications/destinations/${recoverySlack.id}`,'PATCH',{name:'Recovered chat',enabled:true,url:slackURL})).status,200);
 overview=(await owner.api('/api/notifications')).data;assert.ok(overview.destinations.every(d=>d.credentialsAvailable));assert.equal(overview.destinations.find(d=>d.id===recoveryMail.id).address,'recovered@example.com');
 await noPlain();
 for(const destination of overview.destinations)assert.equal((await owner.api(`/api/notifications/destinations/${destination.id}`,'DELETE')).status,200);
 console.log('PASS emitted Worker populated upgrade retirement; raw tamper and secret rotation isolate credentials while auth/probe claim/results continue; reentry/deletion; clock bridge signatures and no replay');
}finally{if(worker)await worker.dispose();await cleanupDirectory(directory)}
