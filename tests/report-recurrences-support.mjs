import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './resilience/support.mjs';
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
 const f=await fixture({MAIL_PROVIDER:'sendgrid',MAIL_FROM:'synthetic-uptime-901@example.test',SENDGRID_API_KEY:'synthetic-uptime-901'},outbound);let restarted;
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
  const dailyDst=await ok(path,{body:spec('daily',dstFirst)});assert.equal(dailyDst.followingAt,Date.parse('2026-11-01T09:15:00-05:00'));assert.equal(dailyDst.followingAt-dailyDst.nextDueAt,25*3600000);
  const weeklyDst=await ok(path,{body:spec('weekly',dstFirst,destination.id,true)});assert.equal(weeklyDst.followingAt,Date.parse('2026-11-07T09:15:00-05:00'));
  const monthlyDst=await ok(path,{body:spec('monthly',dstFirst,email.id,true)});assert.equal(monthlyDst.followingAt,Date.parse('2026-11-30T09:15:00-05:00'),'month-end clamp preserves the anchor day');
  for(const schedule of [dailyDst,weeklyDst,monthlyDst])assert.equal((await ok(path+'/'+schedule.id,{method:'DELETE'})).code,'report_cancelled');
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
   else {const same=await ok('/api/v1/monitors/'+id+'/report?'+params);assert.deepEqual(run.report.availability,same.availability);assert.deepEqual(run.report.latency,same.latency)}
   frozen.push(saved);
  }
  await restart();await dispatchNotifications(rpc,edge);for(let i=0;i<frozen.length;i++)assert.deepEqual(await read([daily,weekly,monthly][i]),frozen[i]);assert.equal(mail.length,2);assert.equal(slack.length,1,'restart never duplicates a failed run');
  await inspect({f,monitors,email,destination,schedules:frozen,phase:'frozen'});
  const cancelled=await ok(path,{body:spec('daily',Date.now()+1500)});await reportsCommand(['cancel','--origin',f.origin,'--monitor',id,'--id',cancelled.id],{UPTIME_REPORT_COOKIE:f.cookie});
  const revoked=await ok(path,{body:spec('weekly',Date.now()+1500,destination.id)});await ok('/api/notifications/destinations/'+destination.id,{method:'PATCH',body:{enabled:false}});
  const fresh=await emailSignIn(f.origin,{bindings:f.bindings}),other=await inviteDoorMember(f.origin,fresh,'owner','uptime-909');await completeSecondFactor(f.origin,other.cookie);
  const narrowed=await ok(path,{body:spec('monthly',Date.now()+1500),headers:{cookie:other.cookie}});await ok('/api/access/members/'+other.id,{body:{role:'read-only',scopes:[]}});
  await new Promise(resolve=>setTimeout(resolve,1600));await dispatchNotifications(rpc,edge);
  assert.equal((await read(cancelled)).code,'report_cancelled');assert.equal((await read(revoked)).code,'report_destination_revoked');const stopped=await read(narrowed);assert.equal(stopped.code,'report_initiator_revoked');assert.equal(stopped.ownerId,other.id);assert.ok(stopped.stoppedAt);assert.equal(stopped.runs.length,0);assert.equal(mail.length,2);assert.equal(slack.length,1);
  await restart();await dispatchNotifications(rpc,edge);assert.deepEqual(await read(narrowed),stopped);await inspect({f,monitors,email,destination,phase:'stopped',schedules:[await read(cancelled),await read(revoked),stopped]});
  const archive=await ok('/api/archive');assert.ok(!Object.hasOwn(archive.payload.productTables,'report_recurrences'));assert.ok(archive.payload.productTables.scheduled_reports.some(row=>row.id===frozen[0].runs[0].reportId),'frozen snapshots retain ordinary inactive archive history');
  console.log('REPORT-001 recurring API/CLI PASS: daily/weekly/monthly IANA DST and month-end times, per-monitor/service shared denominators and CSV/JSON reads, due snapshots, single sends across restart, durable failures, cancellation, destination revocation and initiating-owner narrowing.');
 }finally{await restarted?.dispose();await f.close()}
}
