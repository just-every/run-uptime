import type {SubrequestBudget} from './worker-budget.ts'
import type {Bindings} from './control.server.ts'
import {storageOperation} from './storage-error.ts'

// Future report occurrences and reminders do not wake up the dispatcher.
// A live fallback can change as soon as its previous transport finishes.
export function notificationWork(env:Bindings,now:number){
 return env.DB.prepare(`SELECT 1 WHERE EXISTS(
   SELECT 1 FROM notification_jobs WHERE (state='queued' AND (claim_until IS NULL OR claim_until<=?1))
     OR (state='sending' AND claim_until<=?1))
  OR EXISTS(SELECT 1 FROM integration_deliveries WHERE namespace='uptime-notifications'
    AND ((state='queued' AND next_at<=?1) OR (state='sending' AND claim_until<=?1)))
  OR EXISTS(SELECT 1 FROM alert_contact_schedules WHERE next_at<=?1)
  OR EXISTS(SELECT 1 FROM alert_fallback_chains WHERE ended_at IS NULL)
  OR EXISTS(SELECT 1 FROM report_recurrences WHERE stopped_at IS NULL AND next_at<=?1)`).bind(now);
}

export function pendingMentions(env:Bindings){
 return env.DB.prepare(`SELECT 1 FROM incident_mentions
  WHERE outcome='pending' AND submitted_at IS NULL AND finished_at IS NULL LIMIT 1`);
}

export function notificationWorkDue(env:Bindings,now:number){
 return storageOperation('notifications.poll.pending',()=>notificationWork(env,now).first());
}

export async function dispatchDueNotifications(env:Bindings,budget:SubrequestBudget,work?:{jobs:boolean;mentions:boolean}){
 if(!work){
  const [jobs,mentions]=await env.DB.batch([notificationWork(env,Date.now()),pendingMentions(env)]);
  work={jobs:jobs.results.length>0,mentions:mentions.results.length>0};
 }
 if(work.jobs)await (await import('./notification-worker.server.ts')).scheduledNotifications(env,budget,{due:true});
 if(work.mentions)await (await import('./incident-work/mention-delivery.server.ts')).dispatchPendingMentions(env,budget);
}
