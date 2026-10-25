import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {main as reportsCommand} from '../scripts/reports.mjs';

export async function proveScheduledReports({worker,persist,origin,cookie,id,params,report}){
 let resumed;const submitted=[],slack=[];
 const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',MAIL_FROM:'Uptime <synthetic-uptime-1@example.test>',SENDGRID_API_KEY:'synthetic-uptime-1'};
 const edge=async request=>{assert.equal(new URL(request.url).hostname,'api.sendgrid.com');const body=await request.json();submitted.push(body);return new Response(null,{status:500})};
 const restart=async()=>{await (resumed??worker).dispose();resumed=await startLocalWorker({persist,port:Number(new URL(origin).port),bindings,outboundService:edge});await resumed.ready};
 const call=async(path,method='GET',body,headers={})=>{const response=await fetch(origin+path,{method,headers:{cookie,origin,'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.ok(response.ok,`${path}: ${response.status} ${JSON.stringify(data)}`);return data};
 try{
  await restart();
  const email=await call('/api/notifications/destinations','POST',{name:'synthetic-uptime-report-email',kind:'email',address:'synthetic-uptime-1@example.test'});
  const destination=await call('/api/notifications/destinations','POST',{name:'synthetic-uptime-report-slack',kind:'slack',url:'https://hooks.slack.com/services/synthetic-uptime-1/synthetic-uptime-2/synthetic-uptime-3'});
  const disabled=await call('/api/notifications/destinations','POST',{name:'synthetic-uptime-report-disabled',kind:'email',address:'synthetic-uptime-disabled@example.test',enabled:false});
  const database=await resumed.getD1Database('DB'),queuedBefore=(await database.prepare('SELECT COUNT(*) n FROM notification_jobs').first()).n;
  for(const destinationId of [disabled.id,'synthetic-uptime-unavailable']){
   const refused=await fetch(origin+`/api/monitors/${id}/report-schedules`,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({destinationId,dueAt:Date.now()+10000,period:Object.fromEntries(params)})});assert.equal(refused.status,400,'unavailable or disabled recipient cannot receive a report');
  }
  assert.equal((await database.prepare('SELECT COUNT(*) n FROM notification_jobs').first()).n,queuedBefore,'refused recipient schedules no delivery');assert.equal((await database.prepare('SELECT COUNT(*) n FROM scheduled_reports').first()).n,0);
  const cancelled=await call(`/api/monitors/${id}/report-schedules`,'POST',{dueAt:Date.now()+1000,destinationId:email.id,period:Object.fromEntries(params)});
  const stopped=await reportsCommand(['cancel','--origin',origin,'--monitor',id,'--id',cancelled.id],{UPTIME_REPORT_COOKIE:cookie});
  assert.equal(stopped.code,'report_cancelled');assert.equal(stopped.state,'rejected');assert.equal(stopped.attempts,0);
  assert.deepEqual(await reportsCommand(['cancel','--origin',origin,'--monitor',id,'--id',cancelled.id],{UPTIME_REPORT_COOKIE:cookie}),stopped,'cancellation is idempotent');
  const dueAt=Date.now()+4000,input=join(persist,'report-schedule.json');await writeFile(input,JSON.stringify({dueAt,destinationId:email.id,period:Object.fromEntries(params)}));
  const scheduled=await reportsCommand(['schedule','--origin',origin,'--monitor',id,'--input',input],{UPTIME_REPORT_COOKIE:cookie});
  const slackReport=await call(`/api/monitors/${id}/report-schedules`,'POST',{dueAt,destinationId:destination.id,period:Object.fromEntries(params)});
  for(const run of [scheduled,slackReport]){
   assert.ok(run.ownerId);assert.equal(run.state,'queued');assert.equal(run.dueAt,dueAt);
   for(const key of ['period','availability','sla','latency','incidentSummary'])assert.deepEqual(run.report[key],report[key],`scheduled ${key} equals downloaded/API report`);
  }
  const rpc=(_path,body)=>call('/api/runner/notifications','POST',body,{'x-runner-key':bindings.UPTIME_RUNNER_KEY});
  const transport={async send(wire,beforeRequest){await beforeRequest();slack.push(JSON.parse(wire.body));return {status:400,headers:{},body:'invalid_payload'}}};
  await dispatchNotifications(rpc,transport);assert.equal(submitted.length,0,'future email is not submitted');assert.equal(slack.length,0,'future Slack is not submitted');
  await restart();await new Promise(resolve=>setTimeout(resolve,Math.max(0,dueAt-Date.now()+100)));
  assert.ok(Date.now()>=cancelled.dueAt,'cancelled report is now due after restart');
  await dispatchNotifications(rpc,transport);
  assert.equal(submitted.length,1);assert.equal(slack.length,1);assert.match(submitted[0].subject,/Scheduled report/);
  assert.ok(JSON.stringify(slack[0]).includes('uptimePercent'),'Slack uses the same retained report figures');
  const list=()=>reportsCommand(['list','--origin',origin,'--monitor',id],{UPTIME_REPORT_COOKIE:cookie});
  await assert.rejects(reportsCommand(['cancel','--origin',origin,'--monitor',id,'--id',scheduled.id],{UPTIME_REPORT_COOKIE:cookie}),/HTTP 409/,'a started delivery cannot be recalled');
  const before=await list();assert.equal(before.find(r=>r.id===cancelled.id).code,'report_cancelled');assert.ok(before.every(run=>!Object.hasOwn(run,'report')),'bounded list returns metadata, with snapshots available by identity');assert.equal(before.find(r=>r.id===scheduled.id).state,'uncertain','lost/5xx email response remains uncertain');assert.equal(before.find(r=>r.id===slackReport.id).state,'rejected','Slack 4xx remains failed');
  await restart();await dispatchNotifications(rpc,transport);await dispatchNotifications(rpc,transport);const retained=await reportsCommand(['show','--origin',origin,'--monitor',id,'--id',scheduled.id],{UPTIME_REPORT_COOKIE:cookie});assert.deepEqual(retained.report,scheduled.report,'immutable snapshot survives restart through its own read door');assert.deepEqual(await list(),before,'delivery failure and snapshot survive restart');assert.equal(submitted.length,1,'uncertain email never replays');assert.equal(slack.length,1,'failed Slack never replays');
  assert.equal((await reportsCommand(['show','--origin',origin,'--monitor',id,'--id',cancelled.id],{UPTIME_REPORT_COOKIE:cookie})).code,'report_cancelled','cancellation survives restart');
  console.log('REPORT-001 scheduled API/CLI PASS: same period/zone/denominator figures, authorized email/Slack, due gating across restart, durable uncertain/failed outcomes and no duplicate sends.');
  return resumed;
 }catch(error){await resumed?.dispose();throw error}
}
