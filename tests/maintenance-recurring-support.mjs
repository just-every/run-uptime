import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import https from 'node:https';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,certificate,runChild,listen,close,request} from './signed-runner-runtime.mjs';

// A separate emitted Worker and durable database own this calendar clock. The
// production runner still signs real HTTPS observations; only its network edge
// and the two test processes' clocks are controlled, never product records.
export async function proveRecurringMaintenance(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-recurring-maintenance-'));
 const key='synthetic-uptime-3201-runner-authority',minute=60000;
 let worker,db,control,target,origin,cookie='',child,bridgeError,mode=200;
 let clock=Date.parse('2026-11-01T05:29:00Z');
 const advance=iso=>{const next=Date.parse(iso);assert.ok(next>=clock,'calendar moves forward');clock=next};
 try{
  const tls=await certificate(directory);
  target=https.createServer(tls,(req,res)=>{res.writeHead(req.url==='/canary'?200:mode,{'content-type':'text/plain'});res.end('synthetic-uptime-3202')});
  const targetPort=await listen(target);
  control=https.createServer(tls,async(req,res)=>{
   try{
    let body='';for await(const chunk of req)body+=chunk;
    const response=await worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{}),clock})});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch(error){bridgeError=error;res.writeHead(500);res.end('Emitted Worker request failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-3203',UPTIME_ORIGIN:origin,UPTIME_LOCAL_REVIEW:'false',UPTIME_RUNNER_KEY:key};
  worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers}});
  const good=async(path,body,status=200)=>{const response=await api(path,body);assert.equal(response.status,status,`${path}: ${JSON.stringify(response.data)}`);return response.data};
  const factor=()=>completeSecondFactor(origin,cookie,async(url,init)=>{
   const response=await api(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),init.headers,init.method);
   return new Response(JSON.stringify(response.data),{status:response.status});
  },clock);
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'synthetic-uptime-3204'});assert.equal(boot.status,303,JSON.stringify(boot.data));cookie=boot.headers['set-cookie'][0].split(';')[0];await factor();
  const enrollment={version:1},stamp=String(clock),signature=createHmac('sha256',key).update(`${stamp}.runner-enrolment.${JSON.stringify(enrollment)}`).digest('hex');
  const registered=await api('/api/runner/enroll',enrollment,{'x-runner-key':key,'x-sent-at':stamp,'x-runner-signature':signature});assert.equal(registered.status,200);
  const runner=async()=>{child=runChild({origin,key,caPath:tls.caPath,targetPort,clock});try{await child.finish()}catch(error){throw bridgeError??error}finally{await child.stop();child=undefined}};
  const created=await good('/api/monitors',{name:'synthetic-uptime-3205',url:'https://runner-target.test/recurring',network:'public',assignments:{'local-a':registered.data.runnerId},canaryUrl:'https://canary.runner-target.test/canary',intervalMs:minute,timeoutMs:10000,retries:0,confirmSlots:1,recoverSlots:1},201);
  const id=created.id,ids=[id];
  const current=async()=>(await good(`/api/overview?monitor=${id}`)).monitors[0];
  const history=()=>good(`/api/monitors/${id}/history`);
  const events=async()=>(await good('/api/overview')).alerts.filter(row=>row.monitor_id===id&&['trigger','recovery'].includes(row.kind));
  const observations=async()=>(await db.prepare('SELECT o.* FROM observations o JOIN slots s ON s.id=o.slot_id WHERE s.monitor_id=? ORDER BY o.id').bind(id).all()).results;
  const restart=async()=>{const kept=await observations();await worker.dispose();worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');assert.deepEqual(await observations(),kept,'restart preserves the signed observations')};
  await runner();assert.equal((await current()).state.state,'Healthy');

  // On fall-back Sunday 01:30 occurs twice. The reviewed first instant starts
  // before the rollback; 45 elapsed minutes end before the repeated 01:30.
  const window={id:'synthetic-uptime-3206',name:'synthetic-uptime-3207',timeZone:'America/New_York',mode:'suppress',weekly:{weekdays:[0],localTime:'01:30',durationMinutes:45,fromDate:'2026-10-25',untilDate:'2026-11-08'}};
  const input={monitorIds:ids,window},beforeReview=await good(`/api/monitors/${id}/revisions`),review=await good('/api/maintenance/preview',input);
  assert.equal(review.dstPolicy,'skip-gap-first-repeat');assert.equal(review.durationPolicy,'fixed-elapsed-minutes');
  const repeat=review.occurrences.find(row=>row.localDate==='2026-11-01');
  assert.equal(repeat.status,'first-repeat');assert.equal(repeat.startsAt,Date.parse('2026-11-01T05:30:00Z'));assert.equal(repeat.repeatedStartsAt,Date.parse('2026-11-01T06:30:00Z'));assert.equal(repeat.endsAt,Date.parse('2026-11-01T06:15:00Z'));
  assert.deepEqual(await good(`/api/monitors/${id}/revisions`),beforeReview,'preview creates no revision');
  const applied=await good('/api/maintenance/apply',{...input,digest:review.digest},201);
  assert.equal(applied.digest,review.digest);assert.deepEqual(applied.preview.occurrences,review.occurrences);
  assert.deepEqual((await current()).definition.maintenanceWindows,[review.window]);
  assert.equal((await current()).revision,created.revision+1);
  assert.equal((await current()).state.maintenance,false,'the saved recurrence is inactive before its first instant');
  const scheduledFailure=async()=>{
   const count=(await history()).length;await runner();const slots=await history();assert.equal(slots.length,count+1);
   const slot=slots[0];assert.equal(slot.manual,0);assert.equal(slot.status,'complete');assert.equal(slot.revision,applied.monitors[0].revision);
   assert.deepEqual(slot.definition.probes,['local-a']);assert.equal(slot.definition.assignments['local-a'].runnerId,registered.data.runnerId);assert.ok(slot.definition.assignments['local-a'].networkLabel);assert.equal(slot.definition.assignments['local-a'].canaryUrl,'https://canary.runner-target.test/canary');
   assert.equal(slot.observations.length,1);assert.equal(slot.observations[0].outcome,'target_failure');assert.equal(slot.observations[0].status,503);
   const view=await current();assert.equal(view.state.state,'Maintenance');assert.equal(view.state.targetState,'Failing');assert.equal(view.state.denominator,1);assert.equal(view.state.fails,1);assert.equal(view.state.unknown,0);assert.equal(view.maintenanceEndsAt,repeat.endsAt);
   assert.deepEqual(await events(),[],'a recurring suppressed failure creates no trigger or orphan recovery');
   return slot;
  };
  mode=503;advance('2026-11-01T05:30:00Z');const firstFailure=await scheduledFailure();
  const retained=await observations();await restart();
  assert.equal((await current()).state.state,'Maintenance');assert.deepEqual((await current()).definition.maintenanceWindows,[review.window]);
  // 06:00Z is the actual EDT to EST transition, while the same window is active.
  advance('2026-11-01T06:00:00Z');await scheduledFailure();
  assert.equal((await history()).find(row=>row.id===firstFailure.id).observations[0].id,firstFailure.observations[0].id);
  mode=200;advance('2026-11-01T06:14:00Z');await runner();
  assert.equal((await current()).state.targetState,'Healthy');assert.equal((await current()).state.state,'Maintenance');assert.deepEqual(await events(),[]);

  const beforeExpiry=await observations();advance('2026-11-01T06:15:00Z');
  assert.equal((await current()).state.maintenance,false);assert.equal((await current()).state.state,'Healthy');
  assert.deepEqual(await observations(),beforeExpiry,'expiry reads do not fabricate an observation');assert.deepEqual(await events(),[],'expiry cannot recover an incident whose trigger was suppressed');
  mode=503;await runner();assert.equal((await current()).state.state,'Failing');
  const [trigger]=await events();assert.equal(trigger.kind,'trigger');assert.ok(trigger.event.incidentKey);
  mode=200;advance('2026-11-01T06:16:00Z');await runner();assert.equal((await current()).state.state,'Healthy');
  let notices=await events();assert.equal(notices.length,2);assert.equal(notices.find(row=>row.kind==='recovery').event.incidentKey,trigger.event.incidentKey);
  advance('2026-11-01T06:30:00Z');await runner();assert.equal((await current()).state.maintenance,false,'the repeated wall time does not start a second window');assert.equal((await current()).state.state,'Healthy');assert.deepEqual(await events(),notices);

  const report=async(from,to,maintenanceMs)=>{
   const query=new URLSearchParams({period:'custom',from:String(Date.parse(from)),to:String(Date.parse(to)),timeZone:'America/New_York',sla:'99.9',bucket:'raw'}),path=`/api/v1/monitors/${id}/report?${query}`;
   const value=await good(path),csv=await good(path+'&format=csv'),a=value.availability;
   assert.equal(a.maintenanceMs,maintenanceMs);assert.equal(a.windowMs,Date.parse(to)-Date.parse(from));assert.equal(a.pausedMs,0);
   assert.equal(a.observedMs+a.unknownMs+a.maintenanceMs,a.windowMs,'maintenance stays separate from observed and unknown coverage');
   assert.equal(value.sla.denominatorMs,a.observedMs);assert.ok(a.observedMs>0);assert.ok(a.observedMs<=a.windowMs-maintenanceMs);
   for(const metric of ['maintenanceMs','windowMs','observedMs','unknownMs','upMs','notPassingMs'])assert.ok(csv.includes(`,${metric},${a[metric]},ms,`),`${metric}: CSV agrees with the actual scheduled report`);
   return {availability:a,csv};
  };
  advance('2026-11-01T06:32:00Z');const firstReport=await report('2026-11-01T05:29:00Z','2026-11-01T06:32:00Z',45*minute);

  // End the expired rule and review another first-repeat window still active
  // across this same rollback. Cancel it while active, without extending the
  // earlier immutable revision's maintenance or refreshing its old evidence.
  await factor();await good('/api/maintenance/cancel',{monitorIds:ids,windowId:window.id,revisions:{[id]:(await current()).revision}});
  const extended={monitorIds:ids,window:{...window,id:'synthetic-uptime-3208',weekly:{...window.weekly,localTime:'01:45',durationMinutes:120}}};
  const secondReview=await good('/api/maintenance/preview',extended);await good('/api/maintenance/apply',{...extended,digest:secondReview.digest},201);
  mode=503;await runner();
  assert.equal((await current()).state.state,'Maintenance');assert.equal((await current()).state.targetState,'Failing');assert.equal((await current()).state.denominator,1);assert.deepEqual(await events(),notices);
  await restart();advance('2026-11-01T06:34:00Z');await runner();assert.equal((await current()).state.state,'Maintenance');advance('2026-11-01T06:35:00Z');
  const beforeCancel=await observations(),revision=(await current()).revision;
  const cancelled=await good('/api/maintenance/cancel',{monitorIds:ids,windowId:extended.window.id,revisions:{[id]:revision}});
  assert.equal(cancelled.monitors[0].revision,revision+1);assert.deepEqual((await current()).definition.maintenanceWindows,[]);
  assert.equal((await current()).state.maintenance,false);assert.equal((await current()).state.targetState,'Unknown','the cancellation revision needs new scheduled evidence');assert.equal((await current()).state.denominator,1);assert.deepEqual(await observations(),beforeCancel);assert.deepEqual(await events(),notices);
  await runner();assert.equal((await current()).state.state,'Failing');assert.equal((await events()).filter(row=>row.kind==='trigger').length,2);
  mode=200;advance('2026-11-01T06:36:00Z');await runner();assert.equal((await current()).state.state,'Healthy');
  notices=await events();assert.equal(notices.length,4);assert.equal(new Set(notices.filter(row=>row.kind==='trigger').map(row=>row.event.incidentKey)).size,2);for(const event of notices.filter(row=>row.kind==='trigger'))assert.equal(notices.filter(row=>row.kind==='recovery'&&row.event.incidentKey===event.event.incidentKey).length,1);
  advance('2026-11-01T06:38:00Z');await report('2026-11-01T06:29:00Z','2026-11-01T06:38:00Z',3*minute);
  assert.deepEqual(await report('2026-11-01T05:29:00Z','2026-11-01T06:32:00Z',45*minute),firstReport,'cancellation preserves historical recurring report and CSV figures');
  const kept=await observations();for(const old of [...retained,...beforeCancel])assert.deepEqual(kept.find(row=>row.id===old.id),old,'signed evidence remains byte-identical after restart, expiry and cancellation');
  const revisions=await good(`/api/monitors/${id}/revisions`);assert.deepEqual(revisions.find(row=>row.revision===applied.monitors[0].revision).definition.maintenanceWindows,[review.window]);
  const audit=(await db.prepare("SELECT action FROM uptime_audit WHERE action IN ('maintenance_apply','maintenance_cancel') ORDER BY rowid").all()).results;assert.deepEqual(audit.map(row=>row.action),['maintenance_apply','maintenance_cancel','maintenance_apply','maintenance_cancel']);
  console.log('MAINT-001 recurring journey passed: applied New York fall-back recurrence, signed failures across rollback, fixed coverage, restart, suppression, first-repeat expiry, cancellation, ordinary incident pairs and immutable report and CSV maintenance figures.');
 }finally{
  await child?.stop();await close(control);await worker?.dispose();await close(target);await rm(directory,{recursive:true,force:true});
 }
}
