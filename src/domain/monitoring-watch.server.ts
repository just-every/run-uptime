import type {Bindings} from './control.server.ts'
import {auditStatement,automated} from './audit.server.ts'
import {mailSender} from './mail.server.ts'
import {listRunners} from './runner-registration.server.ts'
import {legacyMonitoringWarning} from './legacy-monitoring.server.ts'
// @ts-ignore Edition-owned URL boundary.
import {publicTarget} from './public-target.mjs'
export function watchDuration(value:string|undefined,fallback:number){const number=value===undefined?fallback:Number(value);if(!Number.isSafeInteger(number)||number<=0)throw Error('Invalid monitoring watch interval');return number}
async function ownerNotice(env:Bindings,id:string,subject:string,text:string,now:number,retryMs:number){
 const sender=mailSender(env);if(!sender||!env.OWNER_EMAIL)return;
 const claims=await env.DB.batch([env.DB.prepare("INSERT INTO monitoring_watch(id,at,outcome) VALUES(?,?,'sending') ON CONFLICT(id) DO UPDATE SET at=excluded.at,outcome='sending' WHERE monitoring_watch.outcome='rejected' AND monitoring_watch.at<=?").bind(id,now,now-retryMs),auditStatement(env,automated,'notification_send','notification',crypto.randomUUID(),'changes()=1',[],now)]);if(!claims[0].meta.changes)return;
 let outcome='uncertain';try{const result=await sender.send({deliveryId:id,from:env.MAIL_FROM,to:[env.OWNER_EMAIL],subject,text});outcome=result.status}catch{}
 await env.DB.prepare("UPDATE monitoring_watch SET at=?,outcome=? WHERE id=? AND outcome='sending' AND at=?").bind(Date.now(),outcome,id,now).run()
}
export async function monitoringWatch(env:Bindings,selfCheck:()=>Promise<Response>,healthy:()=>Promise<boolean>,now=Date.now()){
 const staleMs=watchDuration(env.UPTIME_RUNNER_STALE_MS,120000),repeatMs=watchDuration(env.UPTIME_WATCH_REPEAT_MS,3600000),retryMs=10000,warning=await legacyMonitoringWarning(env);
 const runners=await listRunners(env);
 for(const row of runners as any[]){if(row.revokedAt!==null)continue;const contact=row.lastContactAt??row.registeredAt;
  if(contact>now||now-contact>staleMs)await ownerNotice(env,`runner-stale:${row.runnerId}:${Math.floor(now/repeatMs)}`,'Uptime runner contact is stale',`Runner ${row.runnerId} (${row.networkLabel}) has no recent authenticated contact. Missing checks are not evidence of target health. Review the runner on its own host.${warning?`\n\n${warning}`:''}`,now,retryMs)
 }
 const response=await selfCheck();if(!response.ok)return;
 const pingMs=watchDuration(env.UPTIME_HEARTBEAT_INTERVAL_MS,300000);
 if(env.UPTIME_HEARTBEAT_URL){
  const url=publicTarget(env.UPTIME_HEARTBEAT_URL);if(url.protocol!=='https:')throw Error('External heartbeat requires HTTPS');
  const id='external-heartbeat';
  const claim=await env.DB.prepare("INSERT INTO monitoring_watch(id,at,outcome) VALUES(?,?,'sending') ON CONFLICT(id) DO UPDATE SET at=excluded.at,outcome='sending' WHERE monitoring_watch.at<=?").bind(id,now,now-pingMs).run();
  if(claim.meta.changes){let outcome='failed';try{const result=await fetch(url.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000)});outcome=result.ok?'accepted':'rejected';await result.body?.cancel()}catch{}await env.DB.prepare('UPDATE monitoring_watch SET outcome=? WHERE id=? AND at=?').bind(outcome,id,now).run()}
 }
 const digestMs=watchDuration(env.UPTIME_DIGEST_INTERVAL_MS,604800000);
 const runnersHealthy=(runners as any[]).some(r=>r.revokedAt===null)&&(runners as any[]).filter(r=>r.revokedAt===null).every(r=>r.lastContactAt!==null&&r.lastContactAt<=now&&now-r.lastContactAt<=staleMs);
 const ping=(await env.DB.prepare("SELECT at,outcome FROM monitoring_watch WHERE id='external-heartbeat'").first<{at:number;outcome:string}>());
 if(runnersHealthy&&(!env.UPTIME_HEARTBEAT_URL||(ping?.outcome==='accepted'&&now-ping.at<=pingMs))&&await healthy())await ownerNotice(env,`healthy-digest:${Math.floor(now/digestMs)}`,warning?'Uptime: monitoring configuration needs attention':'Uptime: all healthy',`Scheduled monitoring, runner contact and the configured external heartbeat are healthy. Keep the mailbox and phone receiving watcher notices independent of the hosting provider. A missing weekly digest is a signal to investigate.${warning?`\n\n${warning}`:''}`,now,retryMs)
}
