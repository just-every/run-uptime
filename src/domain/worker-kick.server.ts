import type {Bindings} from './control.server.ts'
import {hostedInstallation} from './hosted-runner.ts'
import {maintenance} from './maintenance.server.ts'
import {scheduledPublicChecks} from './worker-checks.server.ts'
import {scheduledNotifications} from './notification-worker.server.ts'
import {SubrequestBudget} from './worker-budget.ts'

// Owner activity starts real work before Cloudflare's first Cron invocation.
// A D1 lease bounds concurrent console polls across isolates; normal attempt and
// delivery claims still own every result/send, including races with Cron.
export async function kickHostedWork(env:Bindings){
 if(!hostedInstallation(env))return;
 const now=Date.now(),id='console-worker-kick';
 const claim=await env.DB.prepare(`INSERT INTO monitoring_watch(id,at,outcome) VALUES(?,?,'running')
 ON CONFLICT(id) DO UPDATE SET at=excluded.at,outcome='running'
 WHERE monitoring_watch.at<=?-CASE WHEN monitoring_watch.outcome='running' THEN 30000 ELSE 5000 END`).bind(id,now,now).run();
 if(!claim.meta.changes)return;
 try{
  await maintenance(env);
  // Keep request work small enough for waitUntil's lifetime and leave room for
  // alerts. Larger installations continue oldest-first on subsequent polls/Cron.
  await scheduledNotifications(env,new SubrequestBudget(9));
  const checks=new SubrequestBudget(12);
  await scheduledPublicChecks(env,checks);
  await scheduledNotifications(env,new SubrequestBudget(12+checks.remaining));
 }finally{
  await env.DB.prepare("UPDATE monitoring_watch SET outcome='complete' WHERE id=? AND at=?").bind(id,now).run();
 }
}
