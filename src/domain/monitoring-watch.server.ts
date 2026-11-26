import {queueCheckerStopped} from './checker-alerts.server.ts'
import {ownerAccount} from './owner-account.server.ts'
import {demoEffect} from '@runeditrun/rer/modules/demo'
import type {Bindings} from './control.server.ts'
import {claimAuxiliary,submitAuxiliary,finishAuxiliary,reconcileAuxiliary} from './auxiliary-execution.server.ts'
import {mailSender} from './mail.server.ts'
import {hostedInstallation} from './hosted-runner.ts'
import {listRunners} from './runner-registration.server.ts'
import {legacyMonitoringWarning} from './legacy-monitoring.server.ts'
// @ts-ignore Edition-owned URL boundary.
import {publicTarget} from './public-target.mjs'
import {watchDuration,type DueWatch} from './due-watch.server.ts'
async function ownerNotice(env:Bindings,id:string,subject:string,text:string,now:number,retryMs:number){
 if(!mailSender(env))return;
 const owner=await ownerAccount(env);if(!owner)return;
 const attempt=await claimAuxiliary(env,'watch',id,now,{retryMs});if(!attempt)return;
 let submitted=false,outcome='expired',code='submission_not_started';
 try{
  const sender=mailSender(env,{fetch:async(url:RequestInfo|URL,init?:RequestInit)=>{await submitAuxiliary(env,attempt);submitted=true;return fetch(url,init)}})!;
  // Development delivery has no network transport boundary.
  if(env.MAIL_PROVIDER==='development'){await submitAuxiliary(env,attempt);submitted=true}
  const result=await sender.send({deliveryId:id,from:env.MAIL_FROM,to:[owner.email],subject,text});
  if(submitted){outcome=result.status;code=result.code??`mail_${result.status}`}
 }catch{if(submitted){outcome='uncertain';code='mail_result_unknown'}}
 await finishAuxiliary(env,attempt,outcome,code);
}
export async function monitoringWatch(env:Bindings,selfCheck:()=>Promise<Response>,healthy:()=>Promise<boolean>,now:number,due:DueWatch){
 await reconcileAuxiliary(env,now);
 const staleMs=watchDuration(env.UPTIME_RUNNER_STALE_MS,120000),repeatMs=watchDuration(env.UPTIME_WATCH_REPEAT_MS,3600000),retryMs=10000;
 const canMail=Boolean(mailSender(env));
 let warning:Promise<string>|undefined;
 const legacy=()=>warning??=legacyMonitoringWarning(env);
 let runners=due.stale||due.digest?await listRunners(env):[];
 // A hosted install's dormant private-runner credential is optional. Watch the networks actually assigned to enabled checks.
 const rows=runners.length?await env.DB.prepare("SELECT definition FROM monitors WHERE json_extract(definition,'$.enabled')=1").all<{definition:string}>():null;const assigned=new Set(rows?.results.flatMap(row=>Object.values(JSON.parse(row.definition).assignments??{}).map((a:any)=>a.runnerId)));
 if(hostedInstallation(env))runners=runners.filter((runner:any)=>assigned.has(runner.runnerId));
 if(due.stale)for(const row of runners as any[]){if(row.revokedAt!==null)continue;const contact=row.lastContactAt??row.registeredAt;
  if(contact>now||now-contact>staleMs){
   if(assigned.has(row.runnerId)&&!row.hosted)await queueCheckerStopped(env,row,staleMs,now);
   if(!canMail)continue;
   const warning=await legacy();
   await ownerNotice(env,`runner-stale:${row.runnerId}:${Math.floor(now/repeatMs)}`,'Uptime runner contact is stale',`Runner ${row.runnerId} (${row.networkLabel}) has no recent authenticated contact. Missing checks are not evidence of target health. Review the runner on its own host.${warning?`\n\n${warning}`:''}`,now,retryMs)}
 }
 const runnersHealthy=due.digest&&runners.some(r=>r.revokedAt===null)&&runners.filter(r=>r.revokedAt===null).every(r=>r.lastContactAt!==null&&r.lastContactAt<=now&&now-r.lastContactAt<=staleMs);
 if(!due.heartbeat&&(!runnersHealthy||!canMail))return;
 const response=await selfCheck();if(!response.ok)return;
 const pingMs=watchDuration(env.UPTIME_HEARTBEAT_INTERVAL_MS,300000);
 if(due.heartbeat&&env.UPTIME_HEARTBEAT_URL){
  const url=publicTarget(env.UPTIME_HEARTBEAT_URL);if(url.protocol!=='https:')throw Error('External heartbeat requires HTTPS');
  const id='external-heartbeat';
  const attempt=await claimAuxiliary(env,'watch',id,now,{repeatMs:pingMs});
  if(attempt){
   await submitAuxiliary(env,attempt);
   let outcome='uncertain',code='heartbeat_result_unknown';
   try{const result=await demoEffect(()=>fetch(url.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000)}),()=>new Response(null,{status:200}));outcome=result.ok?'accepted':'rejected';code=result.ok?'heartbeat_accepted':'heartbeat_rejected';await result.body?.cancel()}catch{}
   await finishAuxiliary(env,attempt,outcome,code);
  }
 }
 const digestMs=watchDuration(env.UPTIME_DIGEST_INTERVAL_MS,604800000);
 if(!runnersHealthy||!canMail)return;
 const digestId=`healthy-digest:${Math.floor(now/digestMs)}`;
 const sent=await env.DB.prepare("SELECT 1 FROM auxiliary_attempts WHERE scope='watch' AND job_id=? AND outcome IN ('accepted','uncertain')").bind(digestId).first();
 if(sent)return;
 if(env.UPTIME_HEARTBEAT_URL){
  const ping=await env.DB.prepare("SELECT at,outcome FROM monitoring_watch WHERE id='external-heartbeat'").first<{at:number;outcome:string}>();
  if(ping?.outcome!=='accepted'||now-ping.at>pingMs)return;
 }
 // Array.every on an empty installation is true, but no enabled check is no evidence of health.
 const monitored=await env.DB.prepare("SELECT 1 FROM monitors WHERE json_extract(definition,'$.enabled')=1 LIMIT 1").first();
 if(!monitored||!await healthy())return;
 const warningText=await legacy();
 await ownerNotice(env,digestId,warningText?'Uptime: monitoring configuration needs attention':'Uptime: all healthy',`Scheduled monitoring and runner contact are healthy.${env.UPTIME_HEARTBEAT_URL?' The configured external heartbeat is healthy.':''} Keep the mailbox and phone receiving watcher notices independent of the hosting provider. A missing weekly digest is a signal to investigate.${warningText?`\n\n${warningText}`:''}`,now,retryMs)
}
