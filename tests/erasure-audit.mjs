import {proveHistoryErasure} from './source-history-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {retentionCleanup} from './retention-cleanup-proof.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {randomUUID,createHmac} from 'node:crypto';
import {probeHeartbeat} from '../runners/src/probes.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {runRunner} from '../runners/src/private-runner.mjs';
import {acceptanceReceiver,loopbackWireTransport} from './notify-acceptance-receivers.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,fixtureProcess,cleanupDirectory,ownerAPI,waitFor} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,deliveredLink,sessionCookie} from './auth-test-support.mjs';
import {restore,archive} from '../src/domain/archive.server.ts';
import {productPolicy} from '../scripts/local/transfer-policy.mjs';
import {createPortability,readArchive} from '@runeditrun/rer/modules/portability';
import {digest} from '../src/domain/archive-schema.ts';
import {assertRunnerAdmissionOnly} from './signed-runner-result-proof.mjs';

const directory=await runtimeDirectory(),[port,targetPort,webhookPort,freshPort]=await availablePorts(4),origin=`http://127.0.0.1:${port}`;
const bindings={...testAuthBindings,UPTIME_SYNTHETIC_PORT:String(targetPort),MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'erasure-test-network-edge-key'},persist=join(directory,'source'),grantPath=join(directory,'grant.json');
const canaries={monitor:'erase-monitor-canary',destination:'erase-destination-canary',operator:'erase-operator-canary@example.test',email:'erase-email-canary@example.test'};
const webhookUrl='https://erasure.example.com/receiver';
let worker,DB,fixture,receiver,freshWorker,beforeOperatorArchive;const mail=[],receipts=[],scan=[];
const owner=ownerAPI(origin),api=owner.api;
const ok=async(path,method='GET',body,headers)=>{const result=await api(path,method,body,headers);assert.ok(result.status>=200&&result.status<300,`${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};
const runner=async input=>(await api('/api/runner/notifications','POST',input,{'x-runner-key':bindings.UPTIME_RUNNER_KEY}));
async function snapshot(){const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA' ORDER BY name").all()).results;return Object.fromEntries(await Promise.all(names.map(async({name})=>[name,(await DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results])))}
async function exportedService(env){const service=await createPortability({db:env.DB,policy:productPolicy(env,()=>null)}),id=await service.exports.create();while((await service.exports.advance(id,{maxParts:16})).phase==='building'){}const records=[];for await(const record of readArchive(await service.exports.download(id)))records.push(record);return {service,id,records}}
try{
 ({worker,DB}=await migratedWorker({port,persist,bindings,outboundService:async request=>{assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');mail.push(await request.json());return new Response(null,{status:202})}}));
 const env={...bindings,UPTIME_ORIGIN:origin,DB};
 await owner.signIn(bindings);
 fixture=fixtureProcess(targetPort,grantPath,directory);await waitFor(async()=>{const grant=JSON.parse(await readFile(grantPath,'utf8')),response=await fetch(`http://127.0.0.1:${targetPort}/health`);return grant.pid===fixture.child.pid&&grant.port===targetPort&&response.ok&&response.headers.get('x-uptime-fixture')===grant.identity},'owned synthetic target and completed grant');
 receiver=await acceptanceReceiver(webhookPort,record=>assert.ok(record.headers.get('x-lamp-signature')));
 const transport=loopbackWireTransport(new Map([[webhookUrl,{port:webhookPort,path:'/receiver'}]]));
 const destination=await ok('/api/notifications/destinations','POST',{name:canaries.destination,kind:'webhook',url:webhookUrl});
 const email=await ok('/api/notifications/destinations','POST',{name:'Erase email canary',kind:'email',address:canaries.email});
 const retainedDestination=await ok('/api/notifications/destinations','POST',{name:'Retained endpoint',kind:'webhook',url:'https://retained.example.com/receiver',enabled:false});
 const secondRunner=await ok('/api/runners','POST',{networkLabel:'erasure-second-network'});
 const runChecks=async()=>{await runRunner({origin,key:bindings.UPTIME_RUNNER_KEY,grantPath,localReview:true,transport,once:true});await runRunner({origin,key:secondRunner.key,runnerId:secondRunner.runnerId,grantPath,localReview:true,transport,once:true})};
 const monitor=await ok('/api/monitors','POST',{name:canaries.monitor,probes:['local-a','local-b'],url:`http://127.0.0.1:${targetPort}/health`,intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1,freshnessMs:15000});
 const scheduledReport=await ok(`/api/monitors/${monitor.id}/report-schedules`,'POST',{destinationId:email.id,dueAt:Date.now()+3600000,period:{period:'24h',timeZone:'America/Chicago'}});
 const keep=await ok('/api/monitors','POST',{name:'Retained monitor',url:'https://example.com/health',enabled:false});
 await runChecks();
 const initialHistory=await ok(`/api/monitors/${monitor.id}/history`);assert.ok(initialHistory.some(slot=>slot.status==='complete'&&slot.manual===0&&slot.observations.some(o=>o.outcome==='pass')),'real scheduled observation: '+JSON.stringify(initialHistory.map(s=>({status:s.status,manual:s.manual,observations:s.observations.map(o=>({outcome:o.outcome,checks:o.checks.map(c=>({assertion:c.assertion,pass:c.pass}))}))}))));
 await fetch(`http://127.0.0.1:${targetPort}/control`,{method:'POST',body:JSON.stringify({mode:'failing'})});
 await DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.id).run();
 await runChecks();
 assert.ok(mail.length&&receiver.records.length,'real incident sends at network edges');
 await ok(`/api/notifications/destinations/${destination.id}/test`,'POST',{});await ok(`/api/notifications/destinations/${email.id}/test`,'POST',{});
 await runChecks();
 // Keep HTTP history, then obtain real heartbeat authority and a claimed
 // heartbeat slot on a later immutable revision of the same monitor.
 await ok(`/api/monitors/${monitor.id}`,'PATCH',{name:canaries.monitor,type:'heartbeat',probes:['local-a','local-b'],heartbeat:{maxAgeMs:60000},intervalMs:86400000,retries:0,confirmSlots:1,recoverSlots:1});
 const heartbeat=await ok(`/api/monitors/${monitor.id}/heartbeat-key`,'POST',{});
 // Edits and key issuance save revisions due no sooner than the shorter interval after the previous check started; bring this one forward.
 await DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.id).run();
 await ok(`/api/heartbeats/${monitor.id}`,'POST',{}, {authorization:`Bearer ${heartbeat.token}`,'x-heartbeat-sequence':'1'});
 await runChecks();
 assert.ok((await DB.prepare('SELECT COUNT(*) n FROM heartbeat_claims WHERE slot_id IN(SELECT id FROM slots WHERE monitor_id=?)').bind(monitor.id).first()).n>0);
 // Historical fixture records use real envelopes and real D1: there is no
 // owner-facing API to manufacture replay/history rows. Their deletion still
 // goes through the public owner erasure routes.
 const incidentDelivery=await DB.prepare("SELECT d.* FROM integration_deliveries d JOIN notification_jobs j ON j.id=d.id WHERE json_extract(j.event,'$.kind')<>'test' LIMIT 1").first();
 const testDelivery=await DB.prepare("SELECT d.* FROM integration_deliveries d JOIN notification_jobs j ON j.id=d.id WHERE json_extract(j.event,'$.kind')='test' AND j.destination_id=? LIMIT 1").bind(destination.id).first();
 for(const [label,row]of [['monitor',incidentDelivery],['destination',testDelivery]]){assert.ok(row);const id=randomUUID();await DB.prepare('INSERT INTO integration_replays VALUES(?,?,?,?,?)').bind('uptime-notifications',id,row.fingerprint,JSON.stringify({...JSON.parse(row.envelope),id}),Date.now()).run()}
 await DB.prepare('INSERT INTO integration_resolutions VALUES(?,?,?,?,?)').bind('uptime-notifications',randomUUID(),incidentDelivery.id,Date.now(),JSON.stringify({kind:'accepted',code:'owner_confirmed'})).run();
 const historicalRecord=JSON.stringify(await DB.prepare('SELECT * FROM monitors WHERE id=?').bind(monitor.id).first());
 await DB.prepare('INSERT INTO archive_history VALUES(?,?,?)').bind(await digest(`monitors\n${historicalRecord}`),'monitors',historicalRecord).run();
 const beforeAudit=(await DB.prepare('SELECT * FROM uptime_audit').all()).results;
 const securityNotices=mail.filter(message=>message.subject==='Uptime second-factor security change');assert.ok(securityNotices.length);assert.equal((await DB.prepare("SELECT COUNT(*) n FROM uptime_mfa_notices WHERE outcome='accepted'").first()).n,securityNotices.length,'every real security notice retains its separate delivery outcome');
 assert.equal(beforeAudit.filter(r=>r.action==='notification_send'&&r.actor_ref==='notification-dispatch').length,mail.filter(message=>message.subject!=='Uptime second-factor security change').length+receiver.records.length,'one permanent audit per actual notification attempt including tests');
 // The same selected adapter serves operator and notification mail. After
 // proving real sends, explicitly restart this local installation in capture
 // mode to prove permanent auth captures and their erasure as well.
 await worker.dispose();worker=null;bindings.MAIL_PROVIDER='development';env.MAIL_PROVIDER='development';
 ({worker,DB}=await migratedWorker({port,persist,bindings,outboundService:()=>{throw Error('Capture-mode erasure proof must not send provider mail')}}));env.DB=DB;
 // Real invitation, confirmation and owner action create personal account copies.
 await owner.freshSignIn(bindings);
 await ok('/auth/invite','POST',{email:canaries.operator,displayName:'erase-operator-name-canary',role:'owner'},{origin});
 const call=authRequest(origin),link=await deliveredLink(call,{email:canaries.operator,kind:'invite'}),erasedCookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
 await completeSecondFactor(origin,erasedCookie);
 const other=(await ok('/auth/operators')).find(o=>o.email===canaries.operator);assert.ok(other);
 await ok(`/api/notifications/destinations/${destination.id}/rotate`,'POST',{}, {cookie:erasedCookie});
 const otherSessions=await ok(`/auth/sessions?operatorId=${other.id}`);assert.ok(otherSessions.length);
 // Use the owner client to revoke; its native route returns an empty 204 body.
 const revoked=await api('/auth/session/revoke','POST',{sessionId:otherSessions[0].id},{origin});assert.equal(revoked.status,204);
 assert.ok((await DB.prepare("SELECT * FROM uptime_audit WHERE action='session_revoke'").all()).results.length);
 const auditBeforeRefused=await DB.prepare('SELECT COUNT(*) n FROM uptime_audit').first();
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM scheduled_reports WHERE id=?').bind(scheduledReport.id).first()).n,1);
 const unsigned=await fetch(origin+`/api/monitors/${monitor.id}/erase`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:canaries.monitor})});assert.equal(unsigned.status,401);
 assert.equal((await api(`/api/monitors/${monitor.id}/erase`,'POST',{name:'wrong current name'})).status,400);
 assert.deepEqual(await DB.prepare('SELECT COUNT(*) n FROM uptime_audit').first(),auditBeforeRefused,'unauthorized and refused erasures create no audit');
 const authCaptures=allDeliveredMessages().filter(({message})=>/^(Your sign-in link|You're invited)/.test(message.subject)).length,authAudits=Number((await DB.prepare("SELECT COUNT(*) n FROM uptime_audit WHERE action='notification_send' AND actor_ref='operator-auth-mail'").first()).n);assert.ok(authCaptures>0);assert.equal(authAudits,authCaptures,'one auth audit for each actual public-flow capture');
 const nativeBefore=await ok('/api/archive'),transferBefore=await exportedService(env);
 const captured=await ok(`/api/notifications/destinations/${destination.id}/test`,'POST',{});await runner({operation:'poll'});
 const reservation=randomUUID(),claimed=await runner({operation:'claim',id:captured.deliveryId,reservation});assert.equal(claimed.status,200);assert.ok(claimed.data);
 await ok(`/api/monitors/${monitor.id}/run`,'POST',{});const heldTask=(await ok('/api/runner/claim','POST',{}, {'x-runner-key':bindings.UPTIME_RUNNER_KEY})).task;assert.equal(heldTask.monitorId,monitor.id);assert.equal(heldTask.definition.type,'heartbeat');assert.ok(heldTask.acceptUntil>Date.now());
 const heldResult={slotId:heldTask.id,attempts:[{...probeHeartbeat(heldTask.definition,'local-a',heldTask.heartbeatReceipt),attempt:0}]},heldTimestamp=String(Date.now()),heldSignature=createHmac('sha256',bindings.UPTIME_RUNNER_KEY).update(`${heldTimestamp}.${JSON.stringify(heldResult)}`).digest('hex');
 const keeperBefore=await DB.prepare('SELECT * FROM monitors WHERE id=?').bind(keep.id).first();
 const destinationKeeper=await DB.prepare('SELECT * FROM notification_destinations WHERE id=?').bind(retainedDestination.id).first();
 for(const [kind,id,path,body] of [['monitor',monitor.id,`/api/monitors/${monitor.id}/erase`,{name:canaries.monitor}],['destination',destination.id,`/api/notifications/destinations/${destination.id}`,undefined],['destination',email.id,`/api/notifications/destinations/${email.id}`,undefined],['operator',other.id,`/api/operators/${other.id}/erase`,{}]]){
  if(kind==='operator')beforeOperatorArchive=await ok('/api/archive');
  const started=Date.now(),result=await ok(path,kind==='destination'?'DELETE':'POST',body);assert.equal(result.erased,true);assert.ok(Date.now()-started<300000);receipts.push({...result.receipt,elapsedMs:Date.now()-started});
  if(kind==='monitor')for(const table of ['runner_assignments','evidence_generation','notification_jobs','integration_deliveries','integration_attempts','integration_resolutions','integration_replays','heartbeat_authority','heartbeat_claims','archive_history'])assert.ok(result.receipt.counts[table]>0,`${table} populated and removed by monitor erasure`);
  if(kind==='operator')assert.ok(result.receipt.counts.auxiliary_attempts>0,'OPS-001 erasure removes authentication-mail attempts with their operator authority');
  if(id===destination.id)for(const table of ['notification_jobs','integration_deliveries','integration_replays','notification_credentials'])assert.ok(result.receipt.counts[table]>0,`${table} populated and removed by destination erasure`);
  const receipt=await DB.prepare('SELECT * FROM uptime_erasure_receipts WHERE id=?').bind(result.receipt.id).first();assert.deepEqual(JSON.parse(receipt.counts),result.receipt.counts);
  const audit=await DB.prepare('SELECT * FROM uptime_audit WHERE subject_ref=?').bind(result.receipt.id).first();assert.equal(audit.action,'erase');
 }
 const afterErase=await snapshot(),lateStart=Date.now();
 const signedRefusal=await api('/api/runner/results','POST',heldResult,{'x-runner-key':bindings.UPTIME_RUNNER_KEY,'x-sent-at':heldTimestamp,'x-runner-signature':heldSignature});assert.equal(signedRefusal.status,400);assert.match(signedRefusal.data.error,/acceptance window/);
 for(const operation of ['claim','start','finish','releaseUnstarted']){const result=await runner({operation,id:captured.deliveryId,claim:claimed.data,reservation,outcome:{kind:'accepted',code:'late'}});assert.equal(result.status,400)}
 assert.equal((await api(`/api/monitors/${monitor.id}`,'PATCH',monitor.definition)).status,400);
 assert.equal((await api(`/api/monitors/${monitor.id}/run`,'POST',{})).status,409);
 assert.equal((await api(`/api/notifications/destinations/${destination.id}/rotate`,'POST',{})).status,400);
 assert.equal((await api(`/api/notifications/destinations/${destination.id}/test`,'POST',{})).status,400);
 // The mandatory public limiter accounts for refused runner requests before
 // route admission. Every product, authority, fence, audit and receipt row stays exact.
 assertRunnerAdmissionOnly(Object.entries(afterErase),Object.entries(await snapshot()),{secret:bindings.SESSION_SECRET,client:'loopback',requests:5,start:lateStart});
 const stored=await snapshot();for(const [table,rows]of Object.entries(stored)){const text=JSON.stringify(rows);for(const canary of Object.values(canaries))assert.ok(!text.includes(canary),`${table} retains erased personal data`);scan.push({table,rows:rows.length,canaries:0})}
 assert.deepEqual(await DB.prepare('SELECT * FROM monitors WHERE id=?').bind(keep.id).first(),keeperBefore);
 assert.deepEqual(await DB.prepare('SELECT * FROM notification_destinations WHERE id=?').bind(retainedDestination.id).first(),destinationKeeper);
 assert.equal((await DB.prepare("SELECT COUNT(*) n FROM uptime_audit WHERE actor_ref=?").bind(other.id).first()).n,0);assert.ok((await DB.prepare("SELECT * FROM uptime_audit WHERE action='credential_rotate' AND actor_kind='anonymized'").all()).results.length);
 const ownerRow=(await ok('/auth/operators')).find(o=>o.role==='owner'&&o.status==='active');
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM scheduled_reports WHERE id=?').bind(scheduledReport.id).first()).n,0,'monitor erasure removes the scheduled snapshot');
 const beforeLast=await DB.prepare('SELECT COUNT(*) n FROM uptime_audit').first();const last=await api(`/api/operators/${ownerRow.id}/erase`,'POST',{});assert.equal(last.status,400);assert.match(last.data.error,/rer reset --yes/);assert.deepEqual(await DB.prepare('SELECT COUNT(*) n FROM uptime_audit').first(),beforeLast);
 ({worker,DB}=await retentionCleanup({worker,DB,port,persist,bindings,owner,runChecks,origin,secondRunner}));env.DB=DB;
 const afterArchive=await ok('/api/archive');for(const canary of Object.values(canaries))assert.ok(!JSON.stringify(afterArchive).includes(canary));
 await assert.rejects(transferBefore.service.exports.download(transferBefore.id),'all previous transfer snapshots invalidated');
 // The journal read is a later export with its own required authority receipt;
 // it cannot retroactively appear in the archive that preceded it.
 const journalStarted=Date.now(),later=await ok('/api/erasure-journal');
 const savedAudit=afterArchive.payload.productTables.uptime_audit,sourceAudit=(await DB.prepare('SELECT * FROM uptime_audit ORDER BY rowid').all()).results;
 const savedIds=new Set(savedAudit.map(row=>row.id)),journalReceipts=sourceAudit.filter(row=>!savedIds.has(row.id));
 assert.deepEqual(sourceAudit.filter(row=>savedIds.has(row.id)),savedAudit,'the exported audit snapshot keeps every source row unchanged');
 assert.equal(journalReceipts.length,1,'the later journal export adds exactly one permanent actor receipt');
 const [journalReceipt]=journalReceipts;assert.match(journalReceipt.id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
 assert.ok(journalReceipt.occurred_at>=journalStarted&&journalReceipt.occurred_at<=Date.now());
 assert.deepEqual(journalReceipt,{id:journalReceipt.id,actor_kind:'operator',actor_ref:ownerRow.id,occurred_at:journalReceipt.occurred_at,action:'access_export',subject_kind:'operator',subject_ref:journalReceipt.id});
 await proveHistoryErasure({origin,cookie:owner.cookie,db:DB});
 await worker.dispose();worker=null;
 ({worker:freshWorker,DB:globalThis.freshDB}=await migratedWorker({port:freshPort,persist:join(directory,'fresh'),bindings}));const fresh={...env,DB:globalThis.freshDB};
 await assert.rejects(restore(fresh,nativeBefore,undefined,{laterJournal:later}),/erased/);
 assert.equal((await fresh.DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n,0);
 await assert.rejects(restore(fresh,nativeBefore,undefined,{laterJournal:{...later,sourceIdentity:randomUUID()}}),/later_journal/);
 const freshOwner=ownerAPI(`http://127.0.0.1:${freshPort}`);await freshOwner.signIn(bindings);const freshAuditBefore=(await fresh.DB.prepare('SELECT * FROM uptime_audit ORDER BY rowid').all()).results;const refusedRoute=await freshOwner.api('/api/restore','POST',{archive:nativeBefore,laterJournal:later});assert.equal(refusedRoute.status,400);assert.match(refusedRoute.data.error,/erased/);assert.equal((await fresh.DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n,0);
 const auxiliaryRefusal=await freshOwner.api('/api/restore','POST',{archive:beforeOperatorArchive,laterJournal:later});assert.equal(auxiliaryRefusal.status,400);assert.match(auxiliaryRefusal.data.error,/erased auxiliary_attempts record/,'OPS-001 later erasure journal fences old auth-mail attempt history');
 // Remove the newly fenced auxiliary history in a separately rehashed fixture
 // so the existing erased-actor fence still has its own public-door proof.
 const actorArchive=structuredClone(beforeOperatorArchive);actorArchive.payload.productTables.auxiliary_attempts=[];actorArchive.sha256=await digest(JSON.stringify(actorArchive.payload));
 const operatorRefusal=await freshOwner.api('/api/restore','POST',{archive:actorArchive,laterJournal:later});assert.equal(operatorRefusal.status,400);assert.match(operatorRefusal.data.error,/erased operator/);assert.deepEqual((await fresh.DB.prepare('SELECT * FROM uptime_audit ORDER BY rowid').all()).results,freshAuditBefore,'old operator actor reference refused before audit writes');
 const forged=structuredClone(afterArchive);forged.payload.productTables.uptime_audit[0].subject_ref=canaries.operator;forged.sha256=await digest(JSON.stringify(forged.payload));await assert.rejects(restore(fresh,forged),/anonymized archive audit/);
 let importId;const manifest=transferBefore.records[0],service=await createPortability({db:fresh.DB,policy:productPolicy(fresh,()=>importId,()=>({manifest,laterJournal:later}))});
 importId=await service.imports.create(manifest);for(const record of transferBefore.records)if(record.kind==='part')await service.imports.uploadPart(importId,record.index,record);
 await assert.rejects(service.imports.finalize(importId,{contentHash:transferBefore.records.at(-1).contentHash,archiveHash:transferBefore.records.at(-1).archiveHash,laterJournal:later}),/erased/);
 assert.equal((await fresh.DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n,0,'native payload fence precedes product writes');await service.imports.abort(importId);
 await restore(fresh,afterArchive);const restoredAudit=(await fresh.DB.prepare('SELECT * FROM uptime_audit').all()).results;for(const row of savedAudit)assert.deepEqual(restoredAudit.find(item=>item.id===row.id),row,'portable audit rows survive import unchanged');for(const row of freshAuditBefore)assert.deepEqual(restoredAudit.find(item=>item.id===row.id),row,'receiving owner enrollment audit survives restore');assert.equal(restoredAudit.length,new Set([...savedAudit,...freshAuditBefore].map(row=>row.id)).size+1);const restoreAudit=restoredAudit.find(row=>row.action==='archive_restore');assert.ok(restoreAudit);
 const evidence={receipts,scan,audit:savedAudit,restoreAudit,signedResult:{realClaimedHeartbeat:true,validSignaturePassed:true,refusedStatus:signedRefusal.status,unchangedNonCounterTables:true,runnerAdmissions:5},notificationAttempts:{mail:mail.length,webhook:receiver.records.length,authCaptures,authAudits},erasedActorArchiveRefusedBeforeWrites:true,historicalFixtures:'Two replay envelopes cloned from actual deliveries, one delivery resolution, and an original monitor archive_history copy were inserted in real D1; owner and runner APIs populated all other dependents.',attachments:'No R2 buckets or uploads exist.'};
 if(process.env.UPTIME_ERASURE_EVIDENCE){await mkdir(process.env.UPTIME_ERASURE_EVIDENCE,{recursive:true});await writeFile(join(process.env.UPTIME_ERASURE_EVIDENCE,'erasure-audit.json'),JSON.stringify(evidence,null,2)+'\n')}
 console.log(`BASE-DATA-003 / BASE-OPS-005 PASS erasure public owner routes, ${scan.length} physical table canary scan, real scheduled probe and ${mail.length+receiver.records.length} network-edge sends, durable receipts/audit, last owner and late claims refused, native/custom payload later-journal fences.`);
}finally{if(freshWorker)await freshWorker.dispose();if(worker)await worker.dispose();if(fixture)await fixture.stop();if(receiver)await receiver.close();await cleanupDirectory(directory)}
