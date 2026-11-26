import type {Bindings} from './control.server.ts'
import {hostedInstallation} from './hosted-runner.ts'
import {scheduledPublicChecks} from './worker-checks.server.ts'
import {dispatchDueNotifications} from './due-notifications.server.ts'
import {probeWorkerTask} from './worker-probe-task.server.ts'
import {completeWorkerCheck} from './minute-work.server.ts'
import {SubrequestBudget} from './worker-budget.ts'

// Owner activity starts real work before Cloudflare's first Cron invocation.
// A D1 lease bounds concurrent console polls across isolates; normal attempt and
// delivery claims still own every result/send, including races with Cron.
export async function kickHostedWork(env:Bindings,{bypassCooldown=false}={}){
 if(!hostedInstallation(env))return;
 const now=Date.now(),id='console-worker-kick';
 const claim=await env.DB.prepare(`INSERT INTO monitoring_watch(id,at,outcome) VALUES(?,?,'running')
 ON CONFLICT(id) DO UPDATE SET at=excluded.at,outcome='running'
 WHERE monitoring_watch.at<=?-CASE WHEN monitoring_watch.outcome='running' THEN 30000 ELSE ? END`).bind(id,now,now,bypassCooldown?0:5000).run();
 if(!claim.meta.changes)return;
 try{

  // Keep request work small enough for waitUntil's lifetime and leave room for
  // alerts. Larger installations continue oldest-first on subsequent polls/Cron.
  await dispatchDueNotifications(env,new SubrequestBudget(9));
  const checks=new SubrequestBudget(12);
  await scheduledPublicChecks(env,checks,{
   probe:(...args)=>probeWorkerTask(env,...args),
   complete:(...args)=>completeWorkerCheck(env,...args),
  });
  await dispatchDueNotifications(env,new SubrequestBudget(12+checks.remaining));
 }finally{
  await env.DB.prepare("UPDATE monitoring_watch SET outcome='complete' WHERE id=? AND at=?").bind(id,now).run();
 }
}
