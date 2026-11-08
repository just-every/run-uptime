import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {autonomousPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {migratedWorker,ownerAPI} from './notify-acceptance-runtime.mjs';
import {authRequest,deliveredLink,sessionCookie,emailSignIn} from './auth-test-support.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// One company-consent-to-decline journey. Real signed MCP, owner API, Cron,
// delivery and browser doors; the existing fixture substitutes only mail's network edge.
export async function proveScheduledDrills({c,native,worker,db,origin,cookie,sponsorId,directory}){
 await completeSecondFactor(origin,cookie);
 const recipient=n=>['synthetic-uptime-'+n,'recipient.example.test'].join(String.fromCharCode(64));
 const create=async(name,n)=>native('/api/notifications/destinations',{name,kind:'email',address:recipient(n)});
 const path=d=>'/api/notifications/destinations/'+d.id+'/drill-schedule';
 const read=d=>native(path(d));
 const tool=async(name,args)=>{const answer=await c.tool('uptime.destinations.'+name,args);assert.equal(answer.result?.isError,false,errorCode(answer));return answer.result.structuredContent};
 const tick=async()=>assert.equal((await(await worker.getWorker()).scheduled()).outcome,'ok');
 const mailFor=d=>allDeliveredMessages().filter(({message})=>message.personalizations.some(p=>p.to.some(to=>to.email===recipient(d))));
 const first=await create('Checkout primary alert route',71),expired=await create('Expired backup alert route',72),replacement=await create('Reviewed replacement inbox',74);
 const route=await native('/api/alert-route'),routeInput={mode:'selected',destinationIds:[first.id,expired.id],expectedRevision:route.revision};
 const preview=await native('/api/alert-route/preview',routeInput);await native('/api/alert-route/apply',{...routeInput,digest:preview.digest});
 const policy=(extra={})=>({consent:true,windowStart:Date.now()-1000,windowEnd:Date.now()+180000,intervalMs:60000,maxDrills:1,credentialExpiresAt:null,confirmationWaitMs:60000,reminderIntervalMs:60000,maxReminders:1,phoneBudgetUsd:0,ownerId:sponsorId,...extra});
 const beforeJobs=(await db.prepare('SELECT COUNT(*) n FROM notification_jobs').first()).n;
 const unsigned=await fetch(origin+path(first),{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(policy())});assert.equal(unsigned.status,401);
 const noConsent=await fetch(origin+path(first),{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(policy({consent:false}))});assert.equal(noConsent.status,400);
 assert.equal((await read(first)).consent,null);assert.equal((await db.prepare('SELECT COUNT(*) n FROM notification_jobs').first()).n,beforeJobs);
 const wrong=await c.tool('uptime.destinations.schedule_drills',{id:first.id,consent_id:randomUUID()});assert.equal(wrong.result?.isError,true);
 const consent=await native(path(first),policy()),expiry=Date.now()+1000;
 const earlyArchive=await fetch(origin+'/api/archive',{headers:{cookie,origin}});if(!earlyArchive.ok){const error=await earlyArchive.json();assert.fail('Consented drill archive: '+error.error)}
 const expiredConsent=await native(path(expired),policy({windowStart:expiry+1000,credentialExpiresAt:expiry}));
 const args={id:first.id,consent_id:consent.id,idempotency_key:randomUUID()},scheduled=await tool('schedule_drills',args);
 assert.equal((await tool('schedule_drills',args)).id,scheduled.id,'exact replay preserves the one consented schedule');
 await tool('schedule_drills',{id:expired.id,consent_id:expiredConsent.id});
 // Pause reaches the ordinary Cron entry point before any queue or send.
 await c.adopt(autonomousPolicy(),{paused:true});await tick();assert.equal((await read(first)).runs.length,0);assert.equal(mailFor(71).length,0);
 await c.adopt(autonomousPolicy());await tick();
 let view=await read(first);assert.equal(view.runs.length,1);assert.equal(view.schedule.drills,1);assert.equal(view.schedule.state,'complete');
 assert.equal(view.runs[0].providerState,'accepted');assert.equal(view.runs[0].confirmation,'pending','provider acceptance is not recipient confirmation');
 assert.equal(mailFor(71).length,1);assert.match(mailFor(71)[0].text,/This is an alert drill/);
 const due=(await db.prepare('SELECT next_reminder FROM alert_drill_runs WHERE id=?').bind(view.runs[0].id).first()).next_reminder;
 await tick();assert.equal((await read(first)).runs.length,1);assert.equal(mailFor(71).length,1,'repeated Cron never resends a one-shot occurrence');
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,expiry+1100-Date.now())));await tick();
 let expiredView=await read(expired);assert.equal(expiredView.runs.length,1);assert.equal(expiredView.runs[0].code,'credential_expired');assert.equal(expiredView.runs[0].drillId,null);assert.equal(expiredView.runs[0].providerState,'not_sent');assert.equal(mailFor(72).length,0);
 assert.equal(expiredView.runs[0].proposedRoute.credentialDiagnosis,'credential_expired');assert.equal(expiredView.runs[0].proposedRoute.action,'replace_destination');assert.equal(expiredView.runs[0].proposedRoute.replacementDestinationId,first.id);assert.equal(expiredView.runs[0].proposedRoute.requiresReview,true);assert.deepEqual(expiredView.runs[0].proposedRoute.routes.map(r=>r.scope),['installation']);assert.match(expiredView.runs[0].proposedOncall,/Oncall/);
 // Spend the real reminder interval in browser inspection, then finish any remaining wait.
 await completeSecondFactor(origin,cookie);
 assert.equal((await fetch(origin+'/setup',{method:'POST',redirect:'manual',headers:{origin,cookie}})).status,303);
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext(),[name,...value]=cookie.split('=');await context.addCookies([{name,value:value.join('='),url:origin}]);
 const page=await context.newPage(),output=process.env.UPTIME_AGENT_DRILL_PROOF_DIR??join(directory,'drill-screens');await mkdir(output,{recursive:true});
 const axe=await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'),'utf8');
 async function open(d){await page.goto(origin+'/app/settings/alerts',{waitUntil:'networkidle'});await page.locator(`[data-edit-destination="${d.id}"]`).first().click();await page.getByText('Scheduled drills',{exact:true}).click();await page.locator('[data-status]').getByText(/Consent active/).waitFor()}
 async function capture(label){
  if(label.startsWith('declined')||label.startsWith('expired'))await page.locator('[data-runs]').scrollIntoViewIfNeeded();
  await page.screenshot({path:join(output,label+'.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Settings reflows at both widths');
  assert.equal(await page.locator('dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false,'every changed dialog control stays inside the card');
  assert.ok(await page.locator('[data-fields]').evaluate(el=>Math.min(...[...el.querySelectorAll('input,select,label,p,button')].map(e=>parseFloat(getComputedStyle(e).fontSize))))>=13,'inherited field typography stays readable');
 }
 try{
  await page.setViewportSize({width:1440,height:1000});await open(first);
  await page.locator('[data-save]').click();await page.locator('[data-error]').getByText(/Explicit company consent/).waitFor();assert.equal((await read(first)).consent.id,consent.id);
  await page.evaluate(axe);const violations=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(violations.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);
  await page.locator('[data-refresh]').click();await capture('consented-drill-1440');
  await page.setViewportSize({width:390,height:1000});await capture('consented-drill-390');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,due+100-Date.now())));await tick();await tick();
  view=await read(first);assert.equal(view.runs[0].confirmation,'missing');assert.equal(view.runs[0].proposedRoute.replacementDestinationId,replacement.id);assert.equal(view.runs[0].reminders.length,1);assert.equal(view.runs[0].reminders[0].ownerId,sponsorId);assert.ok(view.runs[0].reminders[0].at>=due);assert.equal(mailFor(71).length,1);
  const agentRead=await tool('drill_schedule',{id:first.id});assert.deepEqual(agentRead.runs,view.runs,'agent sees the same failed-channel and internal chase evidence as the company');
  const jobs=(await db.prepare('SELECT id FROM notification_jobs ORDER BY id').all()).results,credentials=(await db.prepare('SELECT id FROM notification_credentials ORDER BY id').all()).results;
  await open(first);await page.getByRole('button',{name:'Decline proposal',exact:true}).click();await page.getByText('Proposal declined.',{exact:true}).first().waitFor();
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await capture('declined-route-'+width)}
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await open(expired);for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await capture('expired-route-'+width)}
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await tick();await tick();
  assert.equal((await read(first)).runs[0].proposal,'declined');assert.equal((await read(first)).runs[0].reminders.length,1);
  assert.deepEqual((await db.prepare('SELECT id FROM notification_jobs ORDER BY id').all()).results,jobs,'declining creates no outbound job or new recipient');assert.deepEqual((await db.prepare('SELECT id FROM notification_credentials ORDER BY id').all()).results,credentials,'declining rotates no secret');assert.equal(mailFor(71).length,1);assert.equal(mailFor(72).length,0);assert.equal(mailFor(74).length,0,'the proposed replacement recipient is never contacted');
  const declinedReplay=await fetch(origin+path(first)+'/runs/'+view.runs[0].id+'/decline',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:'{}'});assert.equal(declinedReplay.status,404);
  console.log('PROBE AGENT-004 1: company consent API, signed MCP schedule, real Cron and Settings -> one accepted drill without recipient confirmation, expired destination unsent, due internal owner reminder and route plus Oncall proposals');
  console.log('PROBE AGENT-004 2: Settings decline and repeated Cron -> declined proposal, no new recipient jobs, no credential rotation, no phone charge or outbound phone path');
 }finally{await context.close();await browser.close()}
 // Revocation and erasure close both delayed execution and captured replay.
 const revoked=await create('Revoked route consent',73),revokedConsent=await native(path(revoked),policy({windowStart:Date.now()+60000}));
 const revokedArgs={id:revoked.id,consent_id:revokedConsent.id,idempotency_key:randomUUID()};await tool('schedule_drills',revokedArgs);await native(path(revoked),undefined,'DELETE');await tick();assert.equal((await read(revoked)).schedule.state,'cancelled');assert.equal((await read(revoked)).runs.length,0);
 await native('/api/notifications/destinations/'+revoked.id,undefined,'DELETE');const erased=await c.tool('uptime.destinations.schedule_drills',revokedArgs);assert.equal(erased.result?.isError,true);await tick();assert.equal(mailFor(73).length,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM alert_drill_consents WHERE destination_id=?').bind(revoked.id).first()).n,0);
 const archiveResponse=await fetch(origin+'/api/archive',{headers:{cookie,origin}});if(!archiveResponse.ok){const error=await archiveResponse.json();assert.fail('Completed drill archive: '+error.error)}const archive=await archiveResponse.json();for(const table of ['alert_drill_consents','alert_drill_schedules','alert_drill_runs','alert_drill_reminders'])assert.equal(Object.hasOwn(archive.payload.productTables,table),false,'local drill execution authority never travels');
 const restored=await migratedWorker({persist:join(directory,'drill-restore')});
 try{
  const restoredOrigin=(await restored.worker.ready).origin,owner=ownerAPI(restoredOrigin);await owner.signIn();
  const bad=structuredClone(archive),audit=bad.payload.productTables.uptime_audit.find(row=>row.action==='drill_consent');assert.ok(audit);audit.subject_kind='monitor';bad.sha256=createHash('sha256').update(JSON.stringify(bad.payload)).digest('hex');
  assert.equal((await owner.api('/api/restore','POST',bad,{origin:restoredOrigin})).status,400,'wrong-subject drill audit is refused before any restore writes');
  assert.equal((await restored.DB.prepare('SELECT COUNT(*) n FROM notification_destinations').first()).n,0);
  const forged=structuredClone(archive),attributed=forged.payload.productTables.notification_jobs.find(row=>JSON.parse(row.event).preparedBy);assert.ok(attributed);const event=JSON.parse(attributed.event);event.preparedBy.grant='invented';attributed.event=JSON.stringify(event);forged.sha256=createHash('sha256').update(JSON.stringify(forged.payload)).digest('hex');
  assert.equal((await owner.api('/api/restore','POST',forged,{origin:restoredOrigin})).status,400,'extra attribution fields never grant restore authority');
  assert.equal((await owner.api('/api/restore','POST',archive,{origin:restoredOrigin})).status,200,'drill consent and refusal audits travel without execution authority');
  const restoredSchedule=await owner.api(path(first));assert.equal(restoredSchedule.status,200);assert.equal(restoredSchedule.data.consent,null);assert.deepEqual(restoredSchedule.data.runs,[]);
  assert.equal((await(await restored.worker.getWorker()).scheduled()).outcome,'ok');assert.equal(mailFor(71).length,1);assert.equal(mailFor(74).length,0,'restored history cannot contact the proposed recipient');
 }finally{await restored.worker.dispose()}
 return {archive,first,scheduledArgs:args};
}
export async function proveDrillSponsorErasure({native,origin,cookie,sponsorId,directory,bindings,proof}){
 const call=authRequest(origin),email=['synthetic-uptime-continuity','recipient.example.test'].join(String.fromCharCode(64));
 await completeSecondFactor(origin,cookie);await native('/auth/invite',{email,displayName:'Continuity owner',role:'owner'});
 const invite=await deliveredLink(call,{email,kind:'invite'});let successorCookie=sessionCookie(await call('/auth/confirm',{token:invite.searchParams.get('token')}));await completeSecondFactor(origin,successorCookie);
 const api=async(path,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(origin+path,{method,headers:{origin,cookie:successorCookie,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert.ok(response.ok,path+' HTTP '+response.status);return value};
 await api('/api/operators/'+sponsorId+'/erase',{});
 const retiredSession=await fetch(origin+'/api/notifications',{headers:{origin,cookie:successorCookie}});assert.equal(retiredSession.status,401,'erasing the invitation issuer also revokes the derived owner session');
 successorCookie=await emailSignIn(origin,{bindings:{...bindings,OWNER_EMAIL:email}});
 const current=await api('/api/notifications');assert.ok(!current.deliveries.some(row=>row.event.preparedBy?.for?.id===sponsorId),'erased drill sponsor is absent from retained delivery reads');
 const journal=await api('/api/erasure-journal');const restored=await migratedWorker({persist:join(directory,'drill-erasure-restore')});
 try{const target=(await restored.worker.ready).origin,owner=ownerAPI(target);await owner.signIn();assert.equal((await owner.api('/api/restore','POST',{archive:proof.archive,laterJournal:journal},{origin:target})).status,400,'captured drill attribution cannot resurrect an erased person');assert.equal((await restored.DB.prepare('SELECT COUNT(*) n FROM notification_jobs').first()).n,0)}finally{await restored.worker.dispose()}
 console.log('PASS AGENT-004 scheduledDrills: consent, bounded current-policy execution, expiry, provider and recipient separation, internal owner chase, decline, revocation, erasure, inactive archive and Settings at 1440 and 390');
}
