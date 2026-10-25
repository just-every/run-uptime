import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './resilience/support.mjs';
import {migratedWorker} from './notify-acceptance-runtime.mjs';
import {signInOwner} from './auth-test-support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {main as reportsCommand} from '../scripts/reports.mjs';
import {inviteDoorMember} from './access-door-support.mjs';
import {emailSignIn} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';

// Part of the existing reporting registration, also shared with its browser
// registration. Real scheduled probes and report/CLI/runner doors; only provider
// edges supply email 500 and Slack 400 outcomes.
export async function proveRecurringReports(inspect=async()=>{}){
 const mail=[],slack=[];const outbound=async request=>{if(new URL(request.url).hostname==='api.sendgrid.com'){const body=await request.json();if(body.subject.startsWith('Scheduled report:')){mail.push(body);return new Response(null,{status:500})}return new Response(null,{status:202})}assert.match(new URL(request.url).hostname,/^(watch|heartbeat)\.example\.test$/);return new Response('',{status:200})};
 const f=await fixture({MAIL_PROVIDER:'sendgrid',MAIL_FROM:'synthetic-uptime-901@example.test',SENDGRID_API_KEY:'synthetic-uptime-901'},outbound);let restarted,restored;
 const ok=async(path,options={})=>{const r=await f.request(path,options);assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
 const restart=async()=>{await(restarted??f.worker).dispose();restarted=await startLocalWorker({persist:f.directory,port:Number(new URL(f.origin).port),bindings:f.bindings,outboundService:outbound});await restarted.ready;f.DB=await restarted.getD1Database('DB')};
 try{
  const monitors=[];
  for(const n of [903,904]){const m=await f.monitor({name:`synthetic-uptime-${n}`,service:'synthetic-uptime-902',runners:[f.first],canary:true});f.modes.target=n===903?200:503;const task=await f.claim(f.first);assert.equal(task.monitorId,m.id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);await f.pause(m);monitors.push(m)}
  const id=monitors[0].id,path=`/api/monitors/${id}/report-schedules`,zone='America/New_York';
  const email=await ok('/api/notifications/destinations',{body:{name:'synthetic-uptime-905',kind:'email',address:'synthetic-uptime-905@example.test'}}),destination=await ok('/api/notifications/destinations',{body:{name:'synthetic-uptime-906',kind:'slack',url:'https://hooks.slack.com/services/synthetic-uptime-906/synthetic-uptime-907/synthetic-uptime-908'}});
  const spec=(frequency,dueAt,destinationId=email.id,aggregate=false)=>({dueAt,destinationId,period:{period:'24h',timeZone:zone},recurrence:{frequency,timeZone:zone},...(aggregate?{service:'synthetic-uptime-902'}:{})});
  // Calendar observations are public returned schedule times; no test clock.
  const dstFirst=Date.parse('2026-10-31T09:15:00-04:00');
  const dailyDst=await ok(path+'/preview',{body:{dueAt:dstFirst,recurrence:{frequency:'daily',timeZone:zone}}});assert.equal(dailyDst.times[1],Date.parse('2026-11-01T09:15:00-05:00'));assert.equal(dailyDst.times[1]-dailyDst.times[0],25*3600000);
  const weeklyDst=await ok(path+'/preview',{body:{dueAt:dstFirst,recurrence:{frequency:'weekly',timeZone:zone}}});assert.equal(weeklyDst.times[1],Date.parse('2026-11-07T09:15:00-05:00'));
  const calendarInput=join(f.directory,'report-calendar.json');await writeFile(calendarInput,JSON.stringify({dueAt:dstFirst,recurrence:{frequency:'monthly',timeZone:zone}}));const monthlyDst=await reportsCommand(['preview','--origin',f.origin,'--monitor',id,'--input',calendarInput],{UPTIME_REPORT_COOKIE:f.cookie});assert.equal(monthlyDst.times[1],Date.parse('2026-11-30T09:15:00-05:00'));assert.equal(monthlyDst.times[2],Date.parse('2026-12-31T09:15:00-05:00'),'month-end clamp keeps the original anchor day');
  const gap=await ok(path+'/preview',{body:{dueAt:Date.parse('2027-03-13T02:30:00-05:00'),recurrence:{frequency:'daily',timeZone:zone}}});assert.equal(gap.times[1],Date.parse('2027-03-15T02:30:00-04:00'),'nonexistent DST wall time is skipped');
  const repeat=await ok(path+'/preview',{body:{dueAt:Date.parse('2026-10-31T01:30:00-04:00'),recurrence:{frequency:'daily',timeZone:zone}}});assert.equal(repeat.times[1],Date.parse('2026-11-01T01:30:00-04:00'),'repeated wall time sends on its first instant');
  for(const change of [{recurrence:{frequency:'hourly',timeZone:zone}},{recurrence:{frequency:'daily',timeZone:'not-a-zone'}},{period:{from:'1',to:'2'}}])assert.equal((await f.request(path,{body:{...spec('daily',Date.now()+10000),...change}})).status,400);
  const due=Date.now()+5000,input=join(f.directory,'recurring-report.json');await writeFile(input,JSON.stringify(spec('daily',due)));
  const daily=await reportsCommand(['schedule','--origin',f.origin,'--monitor',id,'--input',input],{UPTIME_REPORT_COOKIE:f.cookie}),weekly=await ok(path,{body:spec('weekly',due,destination.id,true)}),monthly=await ok(path,{body:spec('monthly',due,email.id,true)});
  const rpc=async(_path,body)=>{const r=await f.request('/api/runner/notifications',{runner:f.first,body});assert.equal(r.status,200);return r.data};
  const edge={async send(wire,beforeRequest){await beforeRequest();slack.push(JSON.parse(wire.body));return {status:400,headers:{},body:'invalid_payload'}}};
  await dispatchNotifications(rpc,edge);assert.equal(mail.length,0);assert.equal(slack.length,0);
  await restart();assert.ok(Date.now()<due,'Worker restarted before due');await new Promise(resolve=>setTimeout(resolve,Math.max(0,due-Date.now()+100)));await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
  assert.equal(mail.length,2);assert.equal(slack.length,1);
  const read=schedule=>reportsCommand(['show','--origin',f.origin,'--monitor',id,'--id',schedule.id],{UPTIME_REPORT_COOKIE:f.cookie});
  const frozen=[];
  for(const schedule of [daily,weekly,monthly]){
   const saved=await read(schedule);assert.equal(saved.runs.length,1);const run=saved.runs[0];assert.equal(run.dueAt,due);assert.equal(run.attempts,1);assert.ok(['uncertain','rejected'].includes(run.state));assert.equal(run.report.period.to,due,'figures freeze at the due instant, not creation or send time');
   const params=new URLSearchParams({from:String(run.report.period.from),to:String(run.report.period.to),timeZone:zone});
   if(run.report.service){const same=await ok('/api/v1/services/report?'+params+'&service=synthetic-uptime-902');assert.deepEqual(run.report.availability,same.availability);assert.deepEqual(run.report.service,same.service);assert.equal(same.members.length,2);for(const member of same.members){const direct=await ok('/api/v1/monitors/'+member.monitor.id+'/report?'+params);assert.deepEqual(member.availability,direct.availability)}assert.equal(same.availability.observedMs,same.members.reduce((n,m)=>n+m.availability.observedMs,0));const csv=await fetch(f.origin+'/api/v1/services/report?'+params+'&service=synthetic-uptime-902&format=csv',{headers:{cookie:f.cookie}});assert.equal(csv.status,200);const text=await csv.text();assert.ok(text.includes('"observedMs","'+same.availability.observedMs+'"'));for(const monitor of monitors)assert.ok(text.includes(monitor.definition.name))}
   else {const same=await ok('/api/v1/monitors/'+id+'/report?'+params);assert.deepEqual(run.report.availability,same.availability);assert.deepEqual(run.report.latency.statistics,same.latency.statistics);assert.deepEqual(run.report.latency.series,same.latency.series)}
   frozen.push(saved);
  }
  await restart();await dispatchNotifications(rpc,edge);for(let i=0;i<frozen.length;i++)assert.deepEqual(await read([daily,weekly,monthly][i]),frozen[i]);assert.equal(mail.length,2);assert.equal(slack.length,1,'restart never duplicates a failed run');
  await inspect({f,monitors,email,destination,schedules:frozen,phase:'frozen'});
  const cancelled=await ok(path,{body:spec('daily',Date.now()+1500)});await reportsCommand(['cancel','--origin',f.origin,'--monitor',id,'--id',cancelled.id],{UPTIME_REPORT_COOKIE:f.cookie});
  const revoked=await ok(path,{body:spec('weekly',Date.now()+1500,destination.id)});await ok('/api/notifications/destinations/'+destination.id,{method:'PATCH',body:{name:destination.name,enabled:false}});
  const fresh=await emailSignIn(f.origin,{bindings:f.bindings}),other=await inviteDoorMember(f.origin,fresh,'owner','uptime-909');await completeSecondFactor(f.origin,other.cookie);
  const narrowed=await ok(path,{body:spec('monthly',Date.now()+1500),headers:{cookie:other.cookie}});await ok('/api/access/members/'+other.id,{body:{role:'read-only',scopes:[]},headers:{cookie:fresh}});
  await new Promise(resolve=>setTimeout(resolve,1600));await dispatchNotifications(rpc,edge);
  assert.equal((await read(cancelled)).code,'report_cancelled');assert.equal((await read(revoked)).code,'report_destination_revoked');const stopped=await read(narrowed);assert.equal(stopped.code,'report_initiator_revoked');assert.equal(stopped.ownerId,other.id);assert.ok(stopped.stoppedAt);assert.equal(stopped.runs.length,0);assert.equal(mail.length,2);assert.equal(slack.length,1);
  await restart();await dispatchNotifications(rpc,edge);assert.deepEqual(await read(narrowed),stopped);await inspect({f,monitors,email,destination,phase:'stopped',schedules:[await read(cancelled),await read(revoked),stopped]});
  const archive=await ok('/api/archive');assert.ok(!Object.hasOwn(archive.payload.productTables,'report_recurrences'));assert.ok(archive.payload.productTables.scheduled_reports.some(row=>row.id===frozen[0].runs[0].reportId),'frozen snapshots retain ordinary inactive archive history');
  const key=await ok('/api/credentials',{body:{name:'synthetic-uptime-910',scopes:['monitoring:read'],expiresAt:Date.now()+3600000,resources:{mode:'selection',monitorIds:[id],tags:[]}}});const selection=await fetch(f.origin+'/api/v1/services/report?service=synthetic-uptime-902&period=24h&timeZone='+zone,{headers:{authorization:'Bearer '+key.token}});assert.equal(selection.status,200);assert.deepEqual((await selection.json()).service.monitors.map(m=>m.id),[id],'service reads never disclose a monitor outside a read-key selection');
  ({worker:restored}=await migratedWorker({persist:join(f.directory,'restore'),bindings:f.bindings,outboundService:outbound}));const restoredOrigin=(await restored.ready).origin,restoredCookie=await signInOwner(restoredOrigin,{bindings:f.bindings});const imported=await fetch(restoredOrigin+'/api/restore',{method:'POST',headers:{origin:restoredOrigin,cookie:restoredCookie,'content-type':'application/json'},body:JSON.stringify({archive})});assert.equal(imported.status,200);const importedRun=await(await fetch(restoredOrigin+path+'/'+frozen[1].runs[0].reportId,{headers:{cookie:restoredCookie}})).json();assert.equal(importedRun.state,'imported-inactive');assert.deepEqual(importedRun.report,frozen[1].runs[0].report);assert.equal((await(await restored.getD1Database('DB')).prepare('SELECT COUNT(*) n FROM report_recurrences').first()).n,0,'restore carries frozen history without recurring send authority');await restored.dispose();restored=null;
  const erased=await ok('/api/monitors/'+monitors[1].id+'/erase',{body:{name:monitors[1].definition.name}});assert.ok(erased.receipt.counts.scheduled_reports>=2,'erasing a service member removes every aggregate snapshot that names it');const afterErase=await ok('/api/archive');assert.ok(!afterErase.payload.productTables.scheduled_reports.some(row=>JSON.parse(row.report).service?.monitors?.some(member=>member.id===monitors[1].id)));
  console.log('REPORT-001 recurring API/CLI PASS: daily/weekly/monthly IANA DST and month-end times, per-monitor/service shared denominators and CSV/JSON reads, due snapshots, single sends across restart, durable failures, cancellation, destination revocation and initiating-owner narrowing.');
 }finally{await restored?.dispose();await restarted?.dispose();await f.close()}
}
