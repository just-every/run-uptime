import {demoEffect} from '@runeditrun/rer/modules/demo'
import type {Bindings} from './control.server.ts'
import {claimAuxiliary,submitAuxiliary,finishAuxiliary,reconcileAuxiliary} from './auxiliary-execution.server.ts'
import {mailSender} from './mail.server.ts'
import {hostedInstallation} from './hosted-runner.ts'
import {listRunners} from './runner-registration.server.ts'
import {legacyMonitoringWarning} from './legacy-monitoring.server.ts'
// @ts-ignore Edition-owned URL boundary.
import {publicTarget} from './public-target.mjs'
export function watchDuration(value:string|undefined,fallback:number){const number=value===undefined?fallback:Number(value);if(!Number.isSafeInteger(number)||number<=0)throw Error('Invalid monitoring watch interval');return number}
async function ownerNotice(env:Bindings,id:string,subject:string,text:string,now:number,retryMs:number){
 if(!mailSender(env)||!env.OWNER_EMAIL)return;
 const attempt=await claimAuxiliary(env,'watch',id,now,{retryMs});if(!attempt)return;
 let submitted=false,outcome='expired',code='submission_not_started';
 try{
  const sender=mailSender(env,{fetch:async(url:RequestInfo|URL,init?:RequestInit)=>{await submitAuxiliary(env,attempt);submitted=true;return fetch(url,init)}})!;
  // Development delivery has no network transport boundary.
  if(env.MAIL_PROVIDER==='development'){await submitAuxiliary(env,attempt);submitted=true}
  const result=await sender.send({deliveryId:id,from:env.MAIL_FROM,to:[env.OWNER_EMAIL],subject,text});
  if(submitted){outcome=result.status;code=result.code??`mail_${result.status}`}
 }catch{if(submitted){outcome='uncertain';code='mail_result_unknown'}}
 await finishAuxiliary(env,attempt,outcome,code);
}
export async function monitoringWatch(env:Bindings,selfCheck:()=>Promise<Response>,healthy:()=>Promise<boolean>,now=Date.now()){
 await reconcileAuxiliary(env,now);
 const staleMs=watchDuration(env.UPTIME_RUNNER_STALE_MS,120000),repeatMs=watchDuration(env.UPTIME_WATCH_REPEAT_MS,3600000),retryMs=10000,warning=await legacyMonitoringWarning(env);
 let runners=await listRunners(env);
 // A hosted install's dormant private-runner credential is optional. Watch the networks actually assigned to enabled checks.
 if(hostedInstallation(env)){const rows=await env.DB.prepare("SELECT definition FROM monitors WHERE json_extract(definition,'$.enabled')=1").all<{definition:string}>();const assigned=new Set(rows.results.flatMap(row=>Object.values(JSON.parse(row.definition).assignments??{}).map((a:any)=>a.runnerId)));runners=runners.filter((runner:any)=>assigned.has(runner.runnerId))}
 for(const row of runners as any[]){if(row.revokedAt!==null)continue;const contact=row.lastContactAt??row.registeredAt;
  if(contact>now||now-contact>staleMs)await ownerNotice(env,`runner-stale:${row.runnerId}:${Math.floor(now/repeatMs)}`,'Uptime runner contact is stale',`Runner ${row.runnerId} (${row.networkLabel}) has no recent authenticated contact. Missing checks are not evidence of target health. Review the runner on its own host.${warning?`\n\n${warning}`:''}`,now,retryMs)
 }
 const response=await selfCheck();if(!response.ok)return;
 const pingMs=watchDuration(env.UPTIME_HEARTBEAT_INTERVAL_MS,300000);
 if(env.UPTIME_HEARTBEAT_URL){
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
 const runnersHealthy=(runners as any[]).some(r=>r.revokedAt===null)&&(runners as any[]).filter(r=>r.revokedAt===null).every(r=>r.lastContactAt!==null&&r.lastContactAt<=now&&now-r.lastContactAt<=staleMs);
 const ping=(await env.DB.prepare("SELECT at,outcome FROM monitoring_watch WHERE id='external-heartbeat'").first<{at:number;outcome:string}>());
 // Array.every on an empty installation is true, but no enabled check is no evidence of health.
 const monitored=await env.DB.prepare("SELECT 1 AS present FROM monitors WHERE json_extract(definition,'$.enabled')=1 LIMIT 1").first();
 if(monitored&&runnersHealthy&&(!env.UPTIME_HEARTBEAT_URL||(ping?.outcome==='accepted'&&now-ping.at<=pingMs))&&await healthy())await ownerNotice(env,`healthy-digest:${Math.floor(now/digestMs)}`,warning?'Uptime: monitoring configuration needs attention':'Uptime: all healthy',`Scheduled monitoring and runner contact are healthy.${env.UPTIME_HEARTBEAT_URL?' The configured external heartbeat is healthy.':''} Keep the mailbox and phone receiving watcher notices independent of the hosting provider. A missing weekly digest is a signal to investigate.${warning?`\n\n${warning}`:''}`,now,retryMs)
}
