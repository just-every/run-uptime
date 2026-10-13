// DRILL-001: an alert drill is a labelled test send whose recipient can report receipt once, by POST, through a
// one-time link. Real Worker/D1 and the production runner; fakes only at the SendGrid, webhook and Slack edges.
import {testAuthBindings} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {runRunner} from '../runners/src/private-runner.mjs';
import {acceptanceReceiver,verifySendGrid,signedReceiverVerifier,verifySlack,loopbackWireTransport} from './notify-acceptance-receivers.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,fixtureProcess,cleanupDirectory,ownerAPI,waitFor} from './notify-acceptance-runtime.mjs';

const key='alert-drill-runner-local-only-20261012';
const webhookUrl='https://drills.example.com/receiver',slackUrl='https://hooks.slack.com/services/TDRILL/BDRILL/local-alert-drill';
const directory=await runtimeDirectory(),[controlPort,fixturePort,mailPort,webhookPort,slackPort,restorePort]=await availablePorts(6);
const origin=`http://127.0.0.1:${controlPort}`,grantPath=join(directory,'grant.json');
const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:key,UPTIME_SYNTHETIC_PORT:String(fixturePort),MAIL_PROVIDER:'sendgrid',MAIL_FROM:'qa-sender@example.com',SENDGRID_API_KEY:'alert-drill-provider-key-local-only'};
const secrets=[bindings.SETUP_TOKEN,bindings.SESSION_SECRET,key,bindings.SENDGRID_API_KEY,slackUrl],capabilities=[],runnerLogs=[],receivers=[];
const originalConsoleError=console.error;console.error=(...values)=>runnerLogs.push(values.map(String).join(' '));
const transport=loopbackWireTransport(new Map([[webhookUrl,{port:webhookPort,path:'/receiver'}],[slackUrl,{port:slackPort,path:'/slack'}]])),{api,signIn}=ownerAPI(origin);
let worker,DB,fixture,restoreWorker,webhookDestination;
const check=async(label,fn)=>{await fn();console.log('PASS '+label)};
const ok=async(path,method='GET',body)=>{const result=await api(path,method,body);assert.ok(result.status>=200&&result.status<300,`${method} ${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};
const destination=async id=>(await ok('/api/notifications')).destinations.find(d=>d.id===id);
const runOnce=()=>runRunner({origin,key,grantPath,localReview:true,transport,once:true});
const counts=()=>receivers.map(receiver=>receiver.records.length);
const page=(path,init={})=>fetch(origin+path,{redirect:'manual',...init});
const confirm=(token,headers={origin})=>page('/alert-drill',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams({token})});
const drillToken=link=>new URL(link).searchParams.get('token');
// Every product table except the notification and drill history that a test send is allowed to add to.
const evidenceTables=['monitors','revisions','slots','observations','outbox','attempt_checkpoints','evidence_generation','runner_assignments','heartbeat_authority','heartbeat_claims','archive_history','definition_batches','monitoring_watch'];
const evidence=async()=>Object.fromEntries(await Promise.all(evidenceTables.map(async name=>[name,(await DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results])));
// The public rate-limit counter is the one table a refused public request is meant to change.
const allRows=async(skip=[])=>{const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA'").all()).results.filter(({name})=>!skip.includes(name));return JSON.stringify(await Promise.all(names.map(async({name})=>(await DB.prepare(`SELECT * FROM "${name}"`).all()).results)))};
const drillRow=id=>DB.prepare('SELECT * FROM alert_drills WHERE id=?').bind(id).first();
function assertNoSecrets(value,label,allowed=null){const text=typeof value==='string'?value:JSON.stringify(value);for(const secret of [...secrets,...capabilities.filter(c=>c!==allowed)])assert.ok(!text.includes(secret),`${label}: credential, signing key or other capability absent`)}
async function drill(d,receiver){
 const before=receiver.records.length,started=await ok(`/api/notifications/destinations/${d.id}/drill`,'POST',{});
 await runOnce();await waitFor(async()=>(await destination(d.id)).latestDrill?.state==='accepted','drill accepted');
 const record=receiver.records[before];assert.ok(record,'one drill message reached the receiver');assert.equal(receiver.records.length,before+1);
 const text=d.kind==='email'?record.body.content.find(item=>item.type==='text/plain').value:d.kind==='slack'?record.body.blocks.map(block=>block.text.text).join(''):record.body.explanation;
 assert.match(text,/This is an alert drill, not an incident\. No monitor state or incident was changed\./);if(d.kind==='webhook')assert.ok(record.body.drill.startedBy&&record.body.drill.startedAt&&record.body.drill.expiresAt);else assert.match(text,/Started by: /);
 const link=d.kind==='webhook'?record.body.drill.confirmUrl:/Confirm you received it: (\S+)/.exec(text)[1];
 assert.ok(link.startsWith(origin+'/alert-drill?token='+started.drillId+'.'));capabilities.push(link.split('.').at(-1));
 return {...started,link,record};
}
try{
 const mail=await acceptanceReceiver(mailPort,verifySendGrid);
 const webhook=await acceptanceReceiver(webhookPort,record=>signedReceiverVerifier({secret:webhookDestination.signingSecret,tenant:'uptime-notifications',destinationId:()=>webhookDestination.credentialId})(record));
 const slack=await acceptanceReceiver(slackPort,verifySlack);receivers.push(mail,webhook,slack);
 ({worker,DB}=await migratedWorker({port:controlPort,persist:join(directory,'worker'),bindings,outboundService:async request=>{assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');return fetch(`http://127.0.0.1:${mailPort}/v3/mail/send`,{method:request.method,headers:request.headers,body:await request.arrayBuffer(),redirect:'error'})}}));
 fixture=fixtureProcess(fixturePort,grantPath,directory);await waitFor(async()=>(await fetch(`http://127.0.0.1:${fixturePort}/health`)).ok,'synthetic target');
 await signIn(bindings);
 const email=await ok('/api/notifications/destinations','POST',{name:'Drill inbox',kind:'email',address:'qa-inbox@example.test'});
 webhookDestination=await ok('/api/notifications/destinations','POST',{name:'Drill webhook',kind:'webhook',url:webhookUrl});secrets.push(webhookDestination.signingSecret);
 const credentialOf=async id=>(await DB.prepare('SELECT credential_id FROM notification_destinations WHERE id=?').bind(id).first()).credential_id;
 webhookDestination.credentialId=await credentialOf(webhookDestination.id);
 const slackDestination=await ok('/api/notifications/destinations','POST',{name:'Drill Slack',kind:'slack',url:slackUrl,enabled:false});
 const monitor=await ok('/api/monitors','POST',{name:'Drill isolation target',url:`http://127.0.0.1:${fixturePort}/health`,probes:['local-a'],intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1,freshnessMs:15000});
 await waitFor(async()=>{await runOnce();return (await ok('/api/overview')).monitors.find(m=>m.id===monitor.id)?.state.state==='Healthy'},'real scheduled Healthy');
 const drills={};

 await check('a destination starts never proven and a signed-out drill request is refused',async()=>{
  for(const d of [email,webhookDestination,slackDestination])assert.equal((await destination(d.id)).proof.state,'never');
  const signedOut=await fetch(`${origin}/api/notifications/destinations/${email.id}/drill`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(signedOut.status,401);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM alert_drills').first()).n,0);
 });
 await check('each destination kind gets one labelled drill with its link; monitor evidence, state and incidents are untouched',async()=>{
  const before=await evidence(),state=(await ok('/api/overview')).monitors.map(({state:{evaluatedAt,...state}})=>state);
  drills.email=await drill(email,mail);drills.webhook=await drill(webhookDestination,webhook);drills.slack=await drill(slackDestination,slack);
  assert.deepEqual(await evidence(),before,'a drill adds no slot, observation, outbox event or incident');
  assert.deepEqual((await ok('/api/overview')).monitors.map(({state:{evaluatedAt,...state}})=>state),state,'monitor state is unchanged (evaluatedAt is the read time)');
  assert.equal(drills.webhook.record.body.kind,'test');assert.equal(drills.webhook.record.body.eventType,'uptime.notification.drill');assert.equal(drills.webhook.record.body.incidentKey,null);
  const html=drills.email.record.body.content.find(item=>item.type==='text/html').value;assert.ok(html.includes(`href="${drills.email.link}"`),'email carries the link as a link');
  for(const d of [email,webhookDestination,slackDestination]){const row=await destination(d.id);assert.ok(row.latestDrill.submittedAt);assert.ok(row.latestDrill.finishedAt);assert.equal(row.latestDrill.confirmation,'pending');assert.equal(row.proof.state,'never')}
 });
 await check('no capability is stored in plaintext and the sealed copy is gone once the send is over',async()=>{
  const all=await allRows();for(const {link} of Object.values(drills))assert.ok(!all.includes(drillToken(link).split('.')[1]),'raw D1 holds no plaintext capability');
  for(const {drillId} of Object.values(drills)){const row=await drillRow(drillId);assert.match(row.token_hash,/^[0-9a-f]{64}$/);assert.equal(row.token_ciphertext,null)}
  const archive=await ok('/api/archive');assertNoSecrets(archive,'archive');const tables={...archive.payload.tables,...archive.payload.productTables};assert.ok(!('alert_drills' in tables),'drill history is installation-local');
  assert.ok(tables.notification_jobs.some(job=>JSON.parse(job.event).eventType==='uptime.notification.drill'),'drill delivery history travels like a test send');
 });
 await check('opening the link (GET or HEAD, as a scanner or prefetcher does) shows the page and confirms nothing',async()=>{
  for(const method of ['GET','HEAD']){const response=await page(new URL(drills.email.link).pathname+new URL(drills.email.link).search,{method});assert.equal(response.status,200);if(method==='GET'){const html=await response.text();assert.match(html,/<form method="post" action="\/alert-drill">/);assert.match(html,/email destination/);for(const value of ['Drill inbox','qa-inbox@example.test','Drill isolation target'])assert.ok(!html.includes(value),'page names no installation data');assertNoSecrets(html,'drill page',drillToken(drills.email.link).split('.')[1])}}
  assert.equal((await drillRow(drills.email.drillId)).confirmed_at,null);assert.equal((await destination(email.id)).proof.state,'never');
 });
 await check('cross-origin and origin-less POSTs are refused with no state change',async()=>{
  const before=await allRows(['public_rate_limits']);
  for(const headers of [{},{origin:'https://attacker.example'},{origin,'sec-fetch-site':'cross-site'}])assert.equal((await confirm(drillToken(drills.email.link),headers)).status,403);
  assert.equal(await allRows(['public_rate_limits']),before);
 });
 await check('a POST confirms once, as reported by the recipient, and proves only that destination',async()=>{
  const response=await confirm(drillToken(drills.email.link));assert.equal(response.status,200);assert.match(await response.text(),/Your confirmation was recorded/);
  const row=await destination(email.id);assert.equal(row.latestDrill.confirmation,'confirmed');assert.equal(row.proof.state,'proven');assert.equal(row.proof.lastProvenAt,row.latestDrill.confirmedAt);
  assert.equal((await destination(webhookDestination.id)).proof.state,'never');assert.equal((await destination(slackDestination.id)).proof.state,'never');
  const stored=await drillRow(drills.email.drillId);assert.equal(stored.token_hash,null);assert.equal(stored.token_ciphertext,null);
 });
 await check('replay, a foreign token, a wrong destination and an expired link all answer 404 with no state change',async()=>{
  const secretOf=link=>drillToken(link).split('.')[1];
  await DB.prepare('UPDATE alert_drills SET expires_at=? WHERE id=?').bind(Date.now()-1,drills.slack.drillId).run();
  const before=await allRows(['public_rate_limits']);
  for(const token of [drillToken(drills.email.link),`${drills.webhook.drillId}.${secretOf(drills.slack.link)}`,`${drills.slack.drillId}.${secretOf(drills.webhook.link)}`,drillToken(drills.slack.link),`${drills.webhook.drillId}.${'A'.repeat(43)}`,'not-a-token']){
   assert.equal((await page('/alert-drill?token='+encodeURIComponent(token))).status,404);assert.equal((await confirm(token)).status,404);
  }
  assert.equal(await allRows(['public_rate_limits']),before);
  const expired=(await destination(slackDestination.id)).latestDrill;assert.equal(expired.confirmation,'expired');
  const sent=counts();await runOnce();await runOnce();assert.deepEqual(counts(),sent,'expiry never sends anything again');
 });
 await check('an endpoint answering HTTP 500 leaves the drill Uncertain and it is never resent',async()=>{
  webhook.setDisposition('failed');const before=webhook.records.length;
  const started=await ok(`/api/notifications/destinations/${webhookDestination.id}/drill`,'POST',{});await runOnce();
  const row=await waitFor(async()=>{const d=await destination(webhookDestination.id);return d.latestDrill.id===started.drillId&&d.latestDrill.state==='uncertain'?d:null},'drill uncertain');
  assert.ok(row.latestDrill.submittedAt);assert.equal(row.latestDrill.confirmation,'pending');webhook.setDisposition('accepted');
  await runOnce();await runOnce();assert.equal(webhook.records.length,before+1,'one attempt only');
  assert.equal((await drillRow(started.drillId)).token_ciphertext,null);
  // The recipient may still have received it; their report still counts for this credential.
  const link=webhook.records[before].body.drill.confirmUrl;capabilities.push(link.split('.').at(-1));
  assert.equal((await confirm(drillToken(link))).status,200);assert.equal((await destination(webhookDestination.id)).proof.state,'proven');
 });
 await check('rotating a webhook or changing an email address resets the destination to never proven',async()=>{
  const rotated=await ok(`/api/notifications/destinations/${webhookDestination.id}/rotate`,'POST',{});secrets.push(rotated.signingSecret);
  webhookDestination.signingSecret=rotated.signingSecret;webhookDestination.credentialId=await credentialOf(webhookDestination.id);
  const row=await destination(webhookDestination.id);assert.equal(row.proof.state,'never');assert.equal(row.latestDrill.currentCredential,false);
  await ok(`/api/notifications/destinations/${email.id}`,'PATCH',{name:'Drill inbox renamed',enabled:true});assert.equal((await destination(email.id)).proof.state,'proven','renaming keeps proof');
  await ok(`/api/notifications/destinations/${email.id}`,'PATCH',{name:'Drill inbox',enabled:true,address:'qa-inbox-new@example.test'});assert.equal((await destination(email.id)).proof.state,'never');
 });
 await check('credentials, signing keys and links never reach the console reads, the drill page or logs',async()=>{
  assertNoSecrets(await ok('/api/notifications'),'notifications');assertNoSecrets(await ok('/api/overview'),'overview');
  assertNoSecrets(runnerLogs,'runner logs');assertNoSecrets(fixture.getLogs(),'fixture logs');
  for(const receiver of receivers)receiver.assertValid();
 });
 await check('a restored destination is never proven and its drill history does not replay',async()=>{
  const archive=await ok('/api/archive'),restoredOrigin=`http://127.0.0.1:${restorePort}`,restored=ownerAPI(restoredOrigin);
  ({worker:restoreWorker}=await migratedWorker({port:restorePort,persist:join(directory,'restored'),bindings:{...bindings,UPTIME_ORIGIN:restoredOrigin}}));
  await restored.signIn(bindings);assert.equal((await restored.api('/api/restore','POST',archive)).status,200);
  const notes=(await restored.api('/api/notifications')).data,inbox=notes.destinations.find(d=>d.kind==='email');
  assert.ok(inbox);assert.equal(inbox.proof.state,'never');assert.equal(inbox.latestDrill,null);
  const sent=counts();await runRunner({origin:restoredOrigin,key,grantPath,localReview:true,transport,once:true});assert.deepEqual(counts(),sent);
 });
 await check('erasing a destination removes its drill rows',async()=>{
  assert.ok((await DB.prepare('SELECT COUNT(*) n FROM alert_drills WHERE destination_id=?').bind(slackDestination.id).first()).n>0);
  await ok(`/api/notifications/destinations/${slackDestination.id}`,'DELETE');
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM alert_drills WHERE destination_id=?').bind(slackDestination.id).first()).n,0);
 });
 console.log('Alert drill passed: real Worker/D1, production runner, SendGrid, signed webhook and Slack receivers.');
}finally{
 if(restoreWorker)await restoreWorker.dispose();if(worker)await worker.dispose();if(fixture)await fixture.stop();
 await Promise.all(receivers.map(receiver=>receiver.close()));await cleanupDirectory(directory);console.error=originalConsoleError;
}
