import type {Bindings} from './control.server.ts'
import {dueDrills} from './due-drills.server.ts'
import {watchDue,readDueWatch,type DueWatchRow} from './due-watch.server.ts'
import {dispatchDueNotifications,notificationWork,pendingMentions} from './due-notifications.server.ts'
import {CRON_MINUTE} from './schedule.ts'
import {SubrequestBudget} from './worker-budget.ts'
import {recordHostedContact} from './worker-checks.server.ts'

// `contactAt` is the latest result this run's checks had accepted: the Worker's own contact,
// written ahead of the reads that judge whether a checker has gone quiet.
export async function runWorkerBackground(env:Bindings,scheduledAt:number,remaining:number,contactAt=0){
 const now=Date.now();
 const custodySweep=Math.floor(scheduledAt/CRON_MINUTE)%15===7;
 const [auxiliary,tokens,drills,watchFlag,jobs,mentions]=(await env.DB.batch([
  ...(contactAt?[recordHostedContact(env.DB,contactAt)]:[]),
  env.DB.prepare('SELECT 1 FROM auxiliary_attempts WHERE finished_at IS NULL AND lease_until<=? LIMIT 1').bind(now),
  env.DB.prepare(`SELECT 1 FROM alert_drills WHERE
   (expires_at<=?1 AND token_hash IS NOT NULL) OR
   (token_ciphertext IS NOT NULL AND (expires_at<=?1 OR ?2)) LIMIT 1`).bind(now,Number(custodySweep)),
  dueDrills(env,now),
  watchDue(env,now),
  notificationWork(env,now),
  pendingMentions(env),
 ])).slice(contactAt?1:0);
 if(auxiliary.results.length){
  await (await import('./auxiliary-execution.server.ts')).reconcileAuxiliary(env,now);
 }
 // Expired drill links are refused at read time and removed from custody here.
 if(tokens.results.length){
  await (await import('./alert-drills.server.ts')).retireDrillTokens(env,now);
 }
 if(drills.results.length)await (await import('./alert-drill-scheduler.server.ts')).scheduledDrills(env,drills.results);
 const watch=readDueWatch(watchFlag.results[0] as DueWatchRow|undefined);
 if(watch){
  const {monitoringWatch}=await import('./monitoring-watch.server.ts');
  await monitoringWatch(env,async()=>{
   const {boundedHealth,health}=await import('./health.server.ts');
   return boundedHealth(()=>health(env));
  },async()=>(await import('./control.server.ts')).currentTargetsHealthy(env),now,watch);
 }
 const alerts=new SubrequestBudget(remaining);
 if(drills.results.length||watch?.stale||auxiliary.results.length){
  // These preceding steps can enqueue work or advance custody.
  await dispatchDueNotifications(env,alerts);
 }else{
  await dispatchDueNotifications(env,alerts,{jobs:jobs.results.length>0,mentions:mentions.results.length>0});
 }

 // Legacy custody and expired agent replays are also handled on their
 // public doors. A periodic sweep handles installations with no activity.
 if(custodySweep)await sweepCustody(env,now);
}

async function sweepCustody(env:Bindings,now:number){
 const due=await env.DB.prepare(`SELECT
   EXISTS(SELECT 1 FROM agent_door_calls WHERE expires_at<=?) AS replay,
   (EXISTS(SELECT 1 FROM notification_credentials WHERE retired_at IS NULL AND ciphertext IS NULL AND unavailable_at IS NULL)
    OR EXISTS(SELECT 1 FROM integration_deliveries WHERE namespace='uptime-notifications'
      AND lower(substr(destination_hash,1,8))<>'hmac-v1:' AND lower(substr(destination_hash,1,12))<>'unavailable:')) AS custody`)
  .bind(now).first<{replay:number;custody:number}>();
 if(due?.replay){
  const {expireReplayCalls}=await import('../base/modules/agent-door/erasure.ts');
  await expireReplayCalls({options:{db:env.DB},now:()=>now});
 }
 if(due?.custody){
  const {ensureNotificationCustody}=await import('./notification-credentials.server.ts');
  await ensureNotificationCustody(env,{validate:false});
 }
}
