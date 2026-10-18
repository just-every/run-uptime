// RETENTION-001: real owner/runner/Cron doors; D1 time shifts only age records.
import assert from 'node:assert/strict';
import {retentionBrowser} from './retention-browser-proof.mjs';
import {fixture} from './resilience/support.mjs';
import {randomUUID} from 'node:crypto';
import {migratedWorker} from './notify-acceptance-runtime.mjs';
import {authRequest,deliveredLink,sessionCookie} from './auth-test-support.mjs';

export async function retentionCleanup({worker,DB,port,persist,bindings,owner,runChecks,origin,secondRunner}){
 const api=owner.api;
 const ok=async(path,method='GET',body,headers)=>{const r=await api(path,method,body,headers);assert.ok(r.status>=200&&r.status<300,`${method} ${path}: ${r.status}`);return r.data};
 const rpc=input=>ok('/api/runner/notifications','POST',input,{'x-runner-key':bindings.UPTIME_RUNNER_KEY});
 const rows=async table=>(await DB.prepare(`SELECT rowid AS _rowid,* FROM "${table}" ORDER BY rowid`).all()).results;
 const snapshot=async()=>{const tables=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA' ORDER BY name").all()).results;return Object.fromEntries(await Promise.all(tables.map(async({name})=>[name,await rows(name)])))};
 // Existing retained legacy captures have no creation door anymore. Their
 // authentic historical shape is populated directly, never by app fallback.
 const capture=randomUUID();await DB.prepare('INSERT INTO rer_mail_development_outbox(id,created_at,message) VALUES(?,?,?)').bind(capture,1,JSON.stringify({deliveryId:capture,to:['legacy-owner@example.test'],subject:'Historical sign-in record',text:'Historical capture'})).run();
 const legacySession=randomUUID();await DB.prepare('INSERT INTO sessions(hash,expires_at,revoked) VALUES(?,1,1)').bind(legacySession).run();
 const login=randomUUID();await DB.prepare('INSERT INTO login_attempts(id,at) VALUES(?,1)').bind(login).run();
 // Native auth supplies real sessions, token history and auth-limit windows.
 const call=authRequest(origin);assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL,returnTo:'/app'})).status,202);
 const link=await deliveredLink(call,{email:bindings.OWNER_EMAIL}),expiredCookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
 const expiredSession=(await rows('oa_sessions')).findLast(r=>r.source_token_id);assert.ok(expiredSession);
 await DB.prepare('UPDATE oa_sessions SET expires_at=1 WHERE id=?').bind(expiredSession.id).run();
 await DB.prepare('UPDATE oa_tokens SET expires_at=1 WHERE id=?').bind(expiredSession.source_token_id).run();
 await DB.prepare('UPDATE oa_limits SET window=1').run();
 await owner.freshSignIn(bindings);
 // A bounded real failed check stores redacted target content separately.
 const monitor=await ok('/api/monitors','POST',{name:'Retained checkout history',url:`http://127.0.0.1:${bindings.UPTIME_SYNTHETIC_PORT}/health`,probes:['local-a'],intervalMs:86400000,retries:0,confirmSlots:1,recoverSlots:1});
 await runChecks();
 const history=await ok(`/api/monitors/${monitor.id}/history`);assert.ok(history.some(s=>s.status==='complete'&&s.observations.some(o=>o.outcome==='target_failure')));
 await snapshotExpiry();
 // One held probe expires as Interrupted, never as Healthy.
 await ok(`/api/monitors/${monitor.id}/run`,'POST',{});
 const assigned=monitor.definition.assignments['local-a'].runnerId,runnerHeaders=assigned===secondRunner.runnerId?{'x-runner-key':secondRunner.key,'x-runner-id':secondRunner.runnerId}:{'x-runner-key':bindings.UPTIME_RUNNER_KEY};
 const held=(await ok('/api/runner/claim','POST',{},runnerHeaders)).task;assert.ok(held,'assigned runner receives the queued manual slot');assert.equal(held.monitorId,monitor.id);
 await DB.prepare('UPDATE slots SET lease_until=1 WHERE id=?').bind(held.id).run();
 // Discovery expires lazily while keeping its identity and original request.
 const discovery=await ok('/api/discoveries','POST',{url:'https://retention.example.com/health'});
 await DB.prepare('UPDATE discovery_jobs SET created_at=1 WHERE id=?').bind(discovery.id).run();
 // Old credential stays usable only while its already-started send is live.
 const destination=await ok('/api/notifications/destinations','POST',{name:'Retention webhook',kind:'webhook',url:'https://retention.example.com/receiver',enabled:false});
 const drill=await ok(`/api/notifications/destinations/${destination.id}/drill`,'POST',{});
 const beforeDrill=await DB.prepare('SELECT * FROM alert_drills WHERE id=?').bind(drill.drillId).first();assert.ok(beforeDrill.token_hash&&beforeDrill.token_ciphertext);
 await rpc({operation:'poll'});
 const reservation=randomUUID(),claim=await rpc({operation:'claim',id:drill.deliveryId,reservation});assert.ok(claim);
 assert.equal(await rpc({operation:'start',id:drill.deliveryId,claim,reservation}),true);
 await ok(`/api/notifications/destinations/${destination.id}/rotate`,'POST',{});
 const activeOld=await DB.prepare('SELECT * FROM notification_credentials WHERE id=?').bind(beforeDrill.credential_id).first();assert.ok(activeOld.ciphertext);assert.equal(activeOld.retired_at,null,'in-flight credential survives rotation');
 // A separate exact claim is provably unsent: release removes only its attempt.
 const unsent=await ok(`/api/notifications/destinations/${destination.id}/test`,'POST',{});await rpc({operation:'poll'});
 const unsentReservation=randomUUID(),unsentClaim=await rpc({operation:'claim',id:unsent.deliveryId,reservation:unsentReservation});assert.ok(unsentClaim);
 const before=await snapshot();
 assert.equal(await rpc({operation:'releaseUnstarted',id:unsent.deliveryId,claim:unsentClaim,reservation:unsentReservation}),true);
 assert.equal((await rows('integration_attempts')).some(r=>r.id===unsentClaim),false);
 const custody=await DB.prepare('SELECT * FROM notification_claim_custody WHERE claim=?').bind(unsentClaim).first();assert.ok(custody.released_at);assert.equal(custody.started_at,null);
 assert.ok(await DB.prepare('SELECT id FROM integration_deliveries WHERE id=?').bind(unsent.deliveryId).first());assert.ok(await DB.prepare('SELECT id FROM notification_jobs WHERE id=?').bind(unsent.deliveryId).first());
 // Prevent this deliberately unstarted test delivery being consumed by Cron.
 await ok(`/api/notifications/destinations/${destination.id}/rotate`,'POST',{});
 const finish=await rpc({operation:'finish',id:drill.deliveryId,claim,outcome:{kind:'accepted',code:'recipient_accepted',status:200}});assert.ok(finish);
 const old=await DB.prepare('SELECT * FROM notification_credentials WHERE id=?').bind(beforeDrill.credential_id).first();assert.ok(old.retired_at);assert.equal(old.ciphertext,null);assert.equal(old.endpoint,null);assert.equal(old.signing_secret,null);
 const submitted=await DB.prepare('SELECT * FROM alert_drills WHERE id=?').bind(drill.drillId).first();assert.equal(submitted.token_ciphertext,null);assert.ok(submitted.token_hash,'sent but unconfirmed hash remains until expiry');
 await DB.prepare('UPDATE alert_drills SET expires_at=1 WHERE id=?').bind(drill.drillId).run();
 await fetch(origin+'/health');await DB.prepare('UPDATE public_rate_limits SET expires_at=1').run();
 const aged=await snapshot(),reportPath=`/api/v1/monitors/${monitor.id}/report?period=custom&from=${Date.now()-3600000}&to=${Date.now()}`;
 const reportBefore=await ok(reportPath),overviewBefore=(await ok('/api/overview')).monitors.find(m=>m.id===monitor.id);
 assert.equal((await ok(`/api/discoveries/${discovery.id}`)).status,'expired');
 // Dispatch the same scheduled entry used by Cloudflare Cron, then restart.
 await (await worker.getWorker()).scheduled();
 await worker.dispose();
 ({worker,DB}=await migratedWorker({port,persist,bindings}));
 try{
  const after=await snapshot();
  const transient=new Set(['oa_sessions','oa_limits','login_attempts','public_rate_limits','failure_snapshots']);
  for(const [table,records]of Object.entries(before)){
   if(transient.has(table))continue;
   const surviving=new Set((after[table]??[]).map(r=>r._rowid));
   for(const row of records)if(!(table==='integration_attempts'&&row.id===unsentClaim))assert.ok(surviving.has(row._rowid),`RETENTION-001 ${table} original identity retained`);
  }
  for(const table of ['monitors','revisions','observations','outbox','uptime_erasure_receipts','archive_history','rer_mail_development_outbox','sessions'])for(const row of before[table]??[])assert.deepEqual(after[table].find(r=>r._rowid===row._rowid),row,`RETENTION-001 ${table} retained unchanged`);
  assert.ok(aged.public_rate_limits.length&&aged.oa_limits.some(r=>r.window===1));
  assert.ok(!after.public_rate_limits.some(r=>r.expires_at===1));assert.ok(!after.oa_limits.some(r=>r.window===1));assert.ok(!after.login_attempts.some(r=>r.id===login));assert.ok(!after.oa_sessions.some(r=>r.id===expiredSession.id));
  assert.ok(!after.failure_snapshots.some(r=>r.monitor_id===monitor.id));
  const token=after.alert_drills.find(r=>r.id===drill.drillId);assert.equal(token.token_hash,null);assert.equal(token.token_ciphertext,null);assert.ok(token.submitted_at);
  assert.equal(after.slots.find(r=>r.id===held.id).status,'interrupted');
  const retainedDiscovery=after.discovery_jobs.find(r=>r.id===discovery.id);assert.equal(retainedDiscovery.status,'expired');assert.equal(retainedDiscovery.url,'https://retention.example.com/health');
  assert.equal((await api('/auth/session','GET',undefined,{cookie:expiredCookie})).status,401);
  assert.equal((await call('/auth/confirm',{token:link.searchParams.get('token')})).status,400,'expired authentication authority is refused while its identity remains');
  assert.ok(after.oa_tokens.some(r=>r.id===expiredSession.source_token_id&&r.expires_at===1));
  const reportAfter=await ok(reportPath);assert.deepEqual(reportAfter.availability,reportBefore.availability,'RETENTION-001 cleanup leaves exact availability and fixed denominator');assert.deepEqual(reportAfter.latency,reportBefore.latency);assert.deepEqual(reportAfter.sla,reportBefore.sla);
  const overviewAfter=(await ok('/api/overview')).monitors.find(m=>m.id===monitor.id);assert.equal(overviewAfter.state.targetState,overviewBefore.state.targetState);assert.equal(overviewAfter.state.targetState,'Failing');
  await retentionBrowser(origin,bindings,monitor);
  console.log('RETENTION-001 PASS Cron + lazy expiry + restart retain every nontransient row identity, immutable history and uptime; auth/rate limits, drill capabilities, retired secrets, failure content and proven-unsent attempts follow declared custody.');
  return {worker,DB};
 }catch(error){await worker.dispose();throw error}
}

async function snapshotExpiry(){
 const f=await fixture();
 try{
  const monitor=await f.monitor({name:'Retained failed checkout',runners:[f.first],canary:true}),task=await f.claim(f.first),observation=await f.evidence(task);
  assert.ok(observation.failureSnapshot);assert.equal((await f.submit(f.first,task,[observation])).status,200);
  const row=await f.DB.prepare('SELECT * FROM failure_snapshots WHERE monitor_id=?').bind(monitor.id).first();assert.ok(row);
  const evidence=(await f.DB.prepare('SELECT * FROM observations ORDER BY id').all()).results,state=(await f.DB.prepare('SELECT state FROM monitors WHERE id=?').bind(monitor.id).first()).state;
  await f.DB.prepare('UPDATE failure_snapshots SET expires_at=1 WHERE monitor_id=?').bind(monitor.id).run();
  await (await f.worker.getWorker()).scheduled();
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM failure_snapshots').first()).n,0);
  assert.deepEqual((await f.DB.prepare('SELECT * FROM observations ORDER BY id').all()).results,evidence,'RETENTION-001 content expiry preserves the exact failure observation');
  assert.equal((await f.DB.prepare('SELECT state FROM monitors WHERE id=?').bind(monitor.id).first()).state,state);
 }finally{await f.close()}
}
