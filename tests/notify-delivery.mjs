import {testAuthBindings} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {NodePinnedTransport} from '../src/base/modules/integrations/core/node-transport.ts';
import {runRunner} from '../runners/src/private-runner.mjs';
import {acceptanceReceiver,verifySendGrid,signedReceiverVerifier,verifySlack,loopbackWireTransport} from './notify-acceptance-receivers.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,fixtureProcess,cleanupDirectory,ownerAPI,waitFor} from './notify-acceptance-runtime.mjs';

const key='notification-acceptance-runner-local-only-20261007';
const name='Notification café 日本語 <!channel> <script>alert(1)</script>';
const webhookUrl='https://notifications.example.com/incident';
const slackUrl='https://hooks.slack.com/services/TACCEPT/BACCEPT/local-notification-acceptance';
const directory=await runtimeDirectory(),ports=await availablePorts(6);
const [controlPort,fixturePort,mailPort,webhookPort,slackPort,restorePort]=ports;
const origin=`http://127.0.0.1:${controlPort}`,persist=join(directory,'worker'),grantPath=join(directory,'grant.json');
const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:key,UPTIME_SYNTHETIC_PORT:String(fixturePort),MAIL_PROVIDER:'sendgrid',MAIL_FROM:'qa-sender@example.com',SENDGRID_API_KEY:'synthetic-notification-acceptance-provider-key-local-only'};
let worker,DB,fixture,runnerAbort,runnerPromise,restoreWorker,secondRunner;
const receivers=[],credentials=[bindings.SETUP_TOKEN,bindings.SESSION_SECRET,key,bindings.SENDGRID_API_KEY],runnerLogs=[];let webhookDestination;
const originalConsoleError=console.error;console.error=(...values)=>runnerLogs.push(values.map(value=>String(value)).join(' '));
const routes=new Map([[webhookUrl,{port:webhookPort,path:'/incident'}],[slackUrl,{port:slackPort,path:'/slack'}]]);
const transport=loopbackWireTransport(routes),{api,signIn}=ownerAPI(origin);
const check=async(label,fn)=>{await fn();console.log('PASS '+label)};
const notifications=async()=>{const result=await api('/api/notifications');assert.equal(result.status,200);return result.data};
const overview=async()=>{const result=await api('/api/overview');assert.equal(result.status,200);return result.data};
const setFixture=async mode=>{assert.equal((await fetch(`http://127.0.0.1:${fixturePort}/control`,{method:'POST',body:JSON.stringify({mode})})).status,200)};
async function startWorker(){({worker,DB}=await migratedWorker({port:controlPort,persist,bindings,outboundService:async request=>{
 assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send','only Base SendGrid endpoint uses Worker outbound');
 // The provider edge is a new HTTP hop: let fetch frame the unchanged bytes.
 const headers=new Headers(request.headers);for(const name of ['host','connection','transfer-encoding','content-length'])headers.delete(name);
 const response=await fetch(`http://127.0.0.1:${mailPort}/v3/mail/send`,{method:request.method,headers,body:await request.arrayBuffer(),redirect:'error'});
 console.log('MAIL_EDGE '+JSON.stringify({status:response.status,received:receivers[0].records.length,invalid:receivers[0].errors.length}));return response;
 }}))}
const runnerOptions=()=>[{origin,key,grantPath,localReview:true,transport},{origin,key:secondRunner.key,runnerId:secondRunner.runnerId,grantPath,localReview:true,transport}];
async function runOnce(){const [first,second]=runnerOptions();await Promise.all([runRunner({...first,once:true}),runRunner({...first,once:true}),runRunner({...second,once:true})])}
async function startRunner(){runnerAbort=new AbortController();runnerPromise=Promise.all(runnerOptions().map(options=>runRunner({...options,signal:runnerAbort.signal})))}
async function stopRunner(){if(runnerAbort){runnerAbort.abort();await runnerPromise;runnerAbort=null}}
async function restart(){await stopRunner();await worker.dispose();worker=null;await startWorker();await startRunner()}
async function testDestination(destination){const result=await api(`/api/notifications/destinations/${destination.id}/test`,'POST',{});assert.equal(result.status,202);assert.equal(result.data.queued,true);return result.data.deliveryId}
async function settle(id,state){let last;try{return await waitFor(async()=>{const row=(await notifications()).deliveries.find(row=>row.id===id);last=row;return row?.state===state?row:null},`delivery reaches ${state}`)}catch(error){throw Error(`${error.message}; observed ${JSON.stringify({kind:last?.kind,state:last?.state,code:last?.code,attempts:last?.attempts,status:last?.status})}`)}}
function assertNoSecrets(value){const text=typeof value==='string'?value:JSON.stringify(value);for(const credential of credentials)assert.ok(!text.includes(credential),'private notification credential cannot enter operator reads or archive');assert.ok(!text.includes(slackUrl),'Slack capability URL cannot enter operator reads or archive')}
try{
 const mail=await acceptanceReceiver(mailPort,verifySendGrid);receivers.push(mail);
 const webhook=await acceptanceReceiver(webhookPort,record=>signedReceiverVerifier({secret:webhookDestination.signingSecret,tenant:'uptime-notifications',destinationId:webhookDestination.credentialId})(record));receivers.push(webhook);
 const slack=await acceptanceReceiver(slackPort,verifySlack);receivers.push(slack);
 await startWorker();fixture=fixtureProcess(fixturePort,grantPath,directory);
 await waitFor(async()=> (await fetch(`http://127.0.0.1:${fixturePort}/health`)).ok,'live custody fixture');
 await signIn(bindings);
 assert.equal((await api('/api/notifications/preferences','PATCH',{timeZone:'America/New_York'})).status,200);
 assert.equal((await api('/api/notifications/preferences','PATCH',{timeZone:'not-a-zone'})).status,400);
 const added=await api('/api/runners','POST',{networkLabel:'notification-second-network'});assert.equal(added.status,201);secondRunner=added.data;credentials.push(secondRunner.key);
 const destinations=[];
 for(const value of[{name:'Acceptance email',kind:'email',address:'qa-inbox@example.test'},{name:'Acceptance signed JSON',kind:'webhook',url:webhookUrl},{name:'Acceptance Slack',kind:'slack',url:slackUrl}]){
  const result=await api('/api/notifications/destinations','POST',value);assert.equal(result.status,201);destinations.push(result.data);
  if(result.data.signingSecret)credentials.push(result.data.signingSecret);
  if(value.kind==='webhook'){webhookDestination=result.data;webhookDestination.credentialId=(await DB.prepare('SELECT credential_id FROM notification_destinations WHERE id=?').bind(result.data.id).first()).credential_id;}
 }
 await check('destination save and actual pinned connect reject unsafe routing without a network request',async()=>{
  for(const url of['http://notifications.example.com/incident','https://user:password@notifications.example.com/incident','https://127.0.0.1/incident','https://10.0.0.1/incident','https://172.16.0.1/incident','https://192.168.0.1/incident','https://169.254.169.254/latest/meta-data/','https://[::1]/incident','https://[fe80::1]/incident']){
   const result=await api('/api/notifications/destinations','POST',{name:'Refused destination',kind:'webhook',url});assert.equal(result.status,400);
   await assert.rejects(new NodePinnedTransport().send({url,headers:{},body:'{}'}));
  }
  assert.equal((await notifications()).destinations.length,3,'refusals do not save destination rows');
  await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./notify-acceptance-dns.mjs',import.meta.url))]);
 });
 const created=await api('/api/monitors','POST',{name,url:`http://127.0.0.1:${fixturePort}/health`,probes:['local-a','local-b'],intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1,freshnessMs:15000});assert.equal(created.status,201);const monitorId=created.data.id;
 await startRunner();
 await waitFor(async()=> (await overview()).monitors.find(m=>m.id===monitorId)?.state.state==='Healthy','real scheduled Healthy');
 await check('each destination test is visibly labelled and cannot open an incident or alter target evidence',async()=>{
  const before=await overview();await stopRunner();const beforeCount=receivers.map(receiver=>receiver.records.length);
  for(const destination of destinations){const id=await testDestination(destination);await runOnce();const delivery=await settle(id,'accepted');assert.equal(delivery.event.kind,'test');assert.equal(delivery.event.state,'test');assert.equal(delivery.event.incidentKey,null);assert.match(delivery.event.title,/Test notification/)}
  assert.deepEqual(receivers.map(receiver=>receiver.records.length),beforeCount.map(count=>count+1),'concurrent real runner dispatch claims each test once');await startRunner();
  const after=await overview();assert.equal(after.monitors.find(m=>m.id===monitorId).state.state,'Healthy');assert.deepEqual(after.alerts,before.alerts,'test delivery never adds incident outbox rows');
 });
 const beforeTrigger=receivers.map(receiver=>receiver.records.length);
 await setFixture('failing');
 await waitFor(async()=> (await overview()).monitors.find(m=>m.id===monitorId)?.state.state==='Failing','real scheduled Failing');
 await check('automatic failing delivery reaches Base email signed JSON and inert Slack once',async()=>{
  await waitFor(async()=> (await notifications()).deliveries.filter(row=>row.event.monitorId===monitorId&&row.event.kind==='trigger'&&row.state==='accepted').length===3,'all automatic trigger deliveries');
  receivers.forEach((receiver,index)=>{receiver.assertValid();assert.equal(receiver.records.length,beforeTrigger[index]+1)});
  assert.match(mail.records.at(-1).body.content.find(content=>content.type==='text/html').value,/&lt;script&gt;/);
  assert.match(mail.records.at(-1).body.content.find(content=>content.type==='text/html').value,/&lt;!channel&gt;/);assert.equal(webhook.records.at(-1).body.monitorName,name);assert.ok(webhook.records.at(-1).raw.includes(Buffer.from('café 日本語','utf8')));
  assert.match(slack.records.at(-1).body.text,/&lt;!channel&gt;/);assert.match(slack.records.at(-1).body.text,/&lt;script&gt;/);
 });
 const triggerRows=(await notifications()).deliveries.filter(row=>row.event.monitorId===monitorId&&row.event.kind==='trigger');
 assert.equal(new Set(triggerRows.map(row=>row.event.incidentKey)).size,1);assert.ok(triggerRows[0].event.incidentKey);
 const triggerEvent=triggerRows[0].event,triggerContext=triggerEvent.incidentContext;
 const triggerHistory=await api(`/api/monitors/${monitorId}/history`);assert.equal(triggerHistory.status,200);
 const failedSlot=triggerHistory.data.find(slot=>slot.id===triggerEvent.slotId),assignments=(await overview()).monitors.find(m=>m.id===monitorId).definition.assignments;
 assert.ok(failedSlot,'trigger names retained signed failure evidence');
 assert.deepEqual(triggerContext.failedLocations,failedSlot.observations.filter(observation=>observation.outcome==='target_failure').map(observation=>({probe:observation.probe,name:assignments[observation.probe].networkLabel,reason:observation.checks.filter(check=>!check.pass).map(check=>check.reason).join('; ')})));
 assert.match(triggerContext.originalReason,/HTTP 503/);assert.equal(triggerContext.originalReason,triggerEvent.explanation);
 assert.equal(triggerContext.confirmedStartedAt,triggerEvent.observedAt);assert.equal(triggerContext.confirmedRecoveredAt,null);assert.equal(triggerContext.downtimeSeconds,null);assert.equal(triggerContext.downtimeHuman,null);
 const incidentUrl=`${origin}/app/monitors/${monitorId}#incident-${encodeURIComponent(triggerEvent.incidentKey)}`;
 assert.equal(triggerContext.incidentUrl,incidentUrl);assert.equal(triggerContext.timeZone,'America/New_York');assert.equal(triggerEvent.consoleUrl,origin);
 const signedOut=await fetch(incidentUrl,{redirect:'manual'});assert.ok([302,303,307].includes(signedOut.status),'incident link requires sign-in');assert.match(signedOut.headers.get('location'),/\/login/);
 await stopRunner();
 const changedZone=await api('/api/notifications/preferences','PATCH',{timeZone:'America/Los_Angeles'});assert.equal(changedZone.status,200,JSON.stringify(changedZone.data));
 await restart();await setFixture('healthy');
 await waitFor(async()=> (await overview()).monitors.find(m=>m.id===monitorId)?.state.state==='Healthy','real scheduled recovery after both runtime restarts');
 await check('NOTICE-001 restart retains original failure locations and exact confirmed downtime in email Slack and signed JSON',async()=>{
  await waitFor(async()=> (await notifications()).deliveries.filter(row=>row.event.monitorId===monitorId&&row.event.kind==='recovery'&&row.state==='accepted').length===3,'all automatic recovery deliveries');
  const rows=(await notifications()).deliveries.filter(row=>row.event.monitorId===monitorId);
  const recoveryEvent=rows.find(row=>row.event.kind==='recovery').event,recoveryContext=recoveryEvent.incidentContext;
  const elapsed=recoveryEvent.observedAt-triggerEvent.observedAt;
  assert.ok(elapsed>0);assert.deepEqual(recoveryContext,{...triggerContext,confirmedRecoveredAt:recoveryEvent.observedAt,confirmedRecoveredLocal:recoveryContext.confirmedRecoveredLocal,downtimeSeconds:elapsed/1000,downtimeHuman:recoveryContext.downtimeHuman});
  // Parse the human units independently against the two durable confirmed transitions, including milliseconds.
  const units={day:86400000,hour:3600000,minute:60000,second:1000};
  const durationParts=[...recoveryContext.downtimeHuman.matchAll(/(\d+(?:\.\d+)?) (day|hour|minute|second)s?/g)];
  assert.ok(durationParts.length);assert.equal(Math.round(durationParts.reduce((total,part)=>total+Number(part[1])*units[part[2]],0)),elapsed);
  assert.ok(recoveryEvent.probes.every(probe=>probe.outcome==='pass'),'current passing observations cannot supply the original failure context');
  const local=at=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'longOffset'}).format(at);
  for(const row of rows){
   const context=row.event.kind==='trigger'?triggerContext:recoveryContext;assert.deepEqual(row.event.incidentContext,context);
   if(row.kind==='webhook'){const record=webhook.records.find(record=>record.body.id===row.eventId);assert.ok(record,'signed JSON carries this actual event');assert.equal(record.body.monitorId,monitorId);assert.equal(record.body.incidentKey,row.event.incidentKey);assert.equal(record.body.state,row.event.state);assert.deepEqual(record.body.incidentContext,context)}
   else{
    const records=row.kind==='email'?mail.records:slack.records;const record=records.find(record=>row.kind==='email'?record.body.custom_args.rer_delivery_id===row.id:record.body.text.includes(row.event.title.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')));assert.ok(record,'provider wire carries this actual incident');const text=row.kind==='email'?record.body.content.find(item=>item.type==='text/plain').value:record.body.blocks.map(block=>block.text.text).join('\n');assert.ok(text.includes(`Monitor: ${monitorId}`));assert.ok(text.includes(`Incident: ${row.event.incidentKey}`));assert.ok(text.includes(`State: ${row.event.state}`));
    for(const value of [`Original down reason: ${context.originalReason}`,`Confirmed start (America/New_York): ${local(triggerEvent.observedAt)}`,`Incident details: ${incidentUrl}`,...context.failedLocations.map(location=>`Failed location ${location.name} (${location.probe}): ${location.reason}`),...(row.event.kind==='recovery'?[`Confirmed recovery (America/New_York): ${local(recoveryEvent.observedAt)}`,`Confirmed downtime: ${context.downtimeHuman} (${elapsed/1000} seconds)`]:['Recovery: not confirmed','Downtime: ongoing since confirmed start'])])assert.ok(text.includes(value),'wire text retains exact incident context');
    if(row.kind==='email')assert.ok(record.body.content.find(item=>item.type==='text/html').value.includes(`href="${incidentUrl}"`),'email links directly to the authenticated incident');
   }
  }
  assert.equal(rows.length,6);assert.equal(new Set(rows.map(row=>row.event.incidentKey)).size,1);
  assert.equal(rows[0].event.incidentKey,triggerRows[0].event.incidentKey);
  for(const destination of destinations)assert.deepEqual(rows.filter(row=>row.destinationId===destination.id).map(row=>row.event.kind).sort(),['recovery','trigger']);
  for(const row of rows.filter(row=>row.kind!=='email')){const claim=await api('/api/runner/notifications','POST',{operation:'claim',id:row.id},{'x-runner-key':key});assert.equal(claim.status,200);assert.equal(claim.data,null,'completed delivery cannot be claimed twice')}
  const count=receivers.map(receiver=>receiver.records.length);await restart();
  await new Promise(resolve=>setTimeout(resolve,2500));assert.deepEqual(receivers.map(receiver=>receiver.records.length),count,'redispatch after restart cannot duplicate accepted delivery');
 });
 await check('500, 4xx and single-attempt 429 outcomes remain visible without false acceptance',async()=>{
  for(let index=0;index<destinations.length;index++){
   const receiver=receivers[index],destination=destinations[index];receiver.setDisposition('failed');
   const failed=await settle(await testDestination(destination),'uncertain');assert.ok(failed.code);assert.ok(failed.attempts>0);
   receiver.setDisposition('rejected');const rejected=await settle(await testDestination(destination),'rejected');assert.ok(rejected.code);assert.ok(rejected.attempts>0);
   receiver.setDisposition('rate_limited');const limited=await settle(await testDestination(destination),'rejected');assert.equal(limited.attempts,1,'non-deduplicating test sends never requeue a 429');receiver.setDisposition('accepted');
  }
 });
 await check('lost responses including mail stay uncertain and never automatically resend after restart',async()=>{
  const ids=[];
  for(let index=0;index<destinations.length;index++){receivers[index].setDisposition('lost');ids.push(await testDestination(destinations[index]));await settle(ids.at(-1),'uncertain');receivers[index].setDisposition('accepted')}
  const counts=receivers.map(receiver=>receiver.records.length);await restart();await new Promise(resolve=>setTimeout(resolve,2500));
  assert.deepEqual(receivers.map(receiver=>receiver.records.length),counts,'unknown provider acceptance is never retried automatically');
  for(const id of ids)assert.equal((await notifications()).deliveries.find(row=>row.id===id).state,'uncertain');
 });
 // A socket loss cannot prove deadline handling: hold validated requests until the real mail and injected wire deadlines expire.
 await check('stalled email webhook and Slack responses time out once and remain uncertain after both runtimes restart',async()=>{
  const ids=[];
  for(let index=0;index<destinations.length;index++){
   const receiver=receivers[index],before=receiver.records.length,timeoutsBefore=transport.timeouts.length;
   receiver.setDisposition('stalled');const id=await testDestination(destinations[index]);ids.push(id);
   const record=await waitFor(()=>receiver.records[before],'receiver validates the stalled request');receiver.assertValid();assert.equal(record.stalled,true);
   const sending=(await notifications()).deliveries.find(row=>row.id===id);assert.equal(sending.state,'sending');assert.equal(sending.attempts,1);
   const row=await settle(id,'uncertain');
   assert.equal(row.attempts,1);assert.equal(row.code,index===0?'transport_uncertain':'response_unknown');assert.equal(record.safetyTimeout,false,'client deadline fires before receiver cleanup');
   assert.ok(performance.now()-record.receivedAt>=(index===0?14000:2500),'uncertainty follows a real elapsed transport deadline');
   assert.equal(receiver.records.length,before+1,'the stalled delivery is submitted exactly once');
   if(index>0){assert.equal(transport.timeouts.length,timeoutsBefore+1,'wire fetch fails specifically through its timeout signal');assert.ok(transport.timeouts.at(-1).elapsedMs>=3000)}
   console.log('TIMEOUT '+JSON.stringify({kind:destinations[index].kind,observedStallMs:performance.now()-record.receivedAt,...(index>0?{transportElapsedMs:transport.timeouts.at(-1).elapsedMs}:{})}));
   receiver.releaseStalled();receiver.setDisposition('accepted');
  }
  const counts=receivers.map(receiver=>receiver.records.length);await restart();await stopRunner();
  for(let repeat=0;repeat<2;repeat++)await runOnce();
  assert.deepEqual(receivers.map(receiver=>receiver.records.length),counts,'repeat dispatch after Worker and runner restart cannot resend a timed out delivery');
  for(const id of ids){const row=(await notifications()).deliveries.find(row=>row.id===id);assert.equal(row.state,'uncertain');assert.equal(row.attempts,1)}
  await startRunner();
 });
 await check('credential custody excludes delivery rows operator reads console and exported archives',async()=>{
  assertNoSecrets(await notifications());assertNoSecrets(await overview());assertNoSecrets((await api('/api/archive')).data);
  for(const table of ['notification_jobs','integration_deliveries','integration_attempts']){const rows=await DB.prepare(`SELECT * FROM ${table}`).all();assertNoSecrets(rows.results)}
  assertNoSecrets((await api('/')).data);assertNoSecrets(fixture.getLogs());assertNoSecrets(runnerLogs);
 });
 await check('archive restoration leaves monitors paused events inactive and destinations unauthorised without replay',async()=>{
  await stopRunner();const exported=await api('/api/archive');assert.equal(exported.status,200,JSON.stringify(exported.data?.error));const archive=exported.data;
  const contextOrigin=`http://127.0.0.1:${restorePort}`,contextRestored=ownerAPI(contextOrigin);
  ({worker:restoreWorker}=await migratedWorker({port:restorePort,persist:join(directory,'restored-context'),bindings:{...bindings,UPTIME_ORIGIN:contextOrigin}}));
  await contextRestored.signIn(bindings);const imported=await contextRestored.api('/api/restore','POST',archive);assert.equal(imported.status,200,JSON.stringify(imported.data));
  const restoredIncidents=await contextRestored.api(`/api/monitors/${monitorId}/incidents`);assert.equal(restoredIncidents.status,200);
  const originalIncidents=await api(`/api/monitors/${monitorId}/incidents`);
  assert.deepEqual(restoredIncidents.data.map(row=>[row.trigger.incidentContext,row.recovery?.incidentContext]),originalIncidents.data.map(row=>[row.trigger.incidentContext,row.recovery?.incidentContext]),'exact original failure and confirmed duration survive inactive archive restore');
  const restoredNotifications=(await contextRestored.api('/api/notifications')).data;assert.ok(restoredNotifications.deliveries.every(row=>row.state==='imported-inactive'));
  await restoreWorker.dispose();restoreWorker=null;
  // Genuine pre-notification archives have no product extension or erasure fence; historical event values remain unchanged on restore.
  delete archive.payload.extensionVersion;delete archive.payload.productTables;delete archive.payload.erasureFence;
  for(const row of archive.payload.tables.outbox){const event=JSON.parse(row.event);row.event=JSON.stringify({id:event.id,kind:event.kind,monitorId:event.monitorId,monitorName:event.monitorName,state:event.state,slotId:event.slotId,observedAt:event.observedAt,visibility:'private',effect:['task','owned','handoff'].join('-'),peoplePaged:false});row.status='accepted';row.receipt=JSON.stringify({effect:['stored','task','owned','receiver'].join('-'),peoplePaged:false})}
  archive.sha256=createHash('sha256').update(JSON.stringify(archive.payload)).digest('hex');
  assert.ok(!('notification_credentials' in archive.payload.tables));assert.ok(!('notification_destinations' in archive.payload.tables));
  const restoredOrigin=`http://127.0.0.1:${restorePort}`,restored=ownerAPI(restoredOrigin);
  ({worker:restoreWorker}=await migratedWorker({port:restorePort,persist:join(directory,'restored'),bindings:{...bindings,UPTIME_ORIGIN:restoredOrigin}}));
  await restored.signIn(bindings);assert.equal((await restored.api('/api/restore','POST',archive)).status,200);
  const overview=(await restored.api('/api/overview')).data;assert.ok(overview.monitors.every(m=>!m.definition.enabled&&m.state.state==='Paused'));assert.ok(overview.alerts.every(row=>row.status==='imported-inactive'&&row.receipt===null));
  for(const row of overview.alerts)assert.deepEqual(row.event,JSON.parse(archive.payload.tables.outbox.find(old=>old.id===row.id).event),'historical event contents survive inactive restore');
  const history=(await restored.api('/api/notifications')).data;assert.deepEqual(history.destinations,[]);assert.deepEqual(history.deliveries,[]);
  const counts=receivers.map(receiver=>receiver.records.length);
  await runRunner({origin:restoredOrigin,key,grantPath,localReview:true,transport,once:true});
  assert.deepEqual(receivers.map(receiver=>receiver.records.length),counts,'inactive restore cannot transmit historical notifications');
 });
 receivers.forEach(receiver=>receiver.assertValid());
 console.log('Notification acceptance passed: emitted Worker/D1, production private runner, real synthetic probes, independent receivers and restart-safe delivery history.');
}finally{
 await stopRunner();if(restoreWorker)await restoreWorker.dispose();if(worker)await worker.dispose();if(fixture)await fixture.stop();
 await Promise.all(receivers.map(receiver=>receiver.close()));await cleanupDirectory(directory);console.error=originalConsoleError;
}

// One additional public-door journey; provider-edge responses are the only fake.
const {test}=await import('node:test');
const {proveNotificationRetry}=await import('./notify-retry-fixture.mjs');
test('DELIVERY-002 deduplicated retry honors Retry-After and stops on 4xx across restart; fallback contacts remain a contract gap',{timeout:120000},proveNotificationRetry);
