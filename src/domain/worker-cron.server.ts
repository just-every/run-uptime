import type {MinuteWork} from './minute-work.server.ts'
import type {Bindings} from './control.server.ts'
import {validateWorkerBindings,WORKER_ADMITTED,WORKER_NOT_ADMITTED} from './startup-config.mjs'
import {mutationGuard} from './audit.server.ts'
import {classifyStorage} from './storage-error.ts'
import {demoBindings} from './demo.server.ts'
import {recordCronRun} from './cron-run.server.ts'
import {expireCheckLeases,expireCheckClaims} from './hosted-lease.server.ts'
import {cleanupPublicRateLimits} from './public-rate-limits.server.ts'
import {scheduledPublicChecks,recordHostedContact} from './worker-checks.server.ts'
import {SubrequestBudget,CHECK_SUBREQUESTS,RUN_SUBREQUESTS,WATCH_SUBREQUESTS} from './worker-budget.ts'
import {retentionStatements} from './maintenance.server.ts'

// The scheduled run reads and writes D1 once: its housekeeping and the due monitors
// share a batch. Every check, result and the background work runs in its own invocation.
export async function runCron(input:Bindings,scheduledAt:number,work:MinuteWork){
 const env=await demoBindings(input);
 const unadmitted=validateWorkerBindings(env);
 const checks=new SubrequestBudget(CHECK_SUBREQUESTS);
 let contactAt=0;
 // One check and one result invocation per monitor, plus this Cron and background work.
 // Cloudflare allows 32 Worker invocations in the whole call chain.
 try{
  await scheduledPublicChecks(env,checks,work,{scheduledAt,limit:15,contact:at=>{contactAt=at},
   // A Worker whose setup token is retired writes nothing and runs no check without its owner
   // admission: the guard fails the whole transaction.
   refused:error=>unadmitted&&classifyStorage(error)?.class==='guard_conflict'?Error(WORKER_NOT_ADMITTED):error,first:now=>[
   ...(unadmitted?[mutationGuard(env,WORKER_ADMITTED)]:[]),
   recordCronRun(env.DB,now),
   expireCheckLeases(env.DB,now),
   ...expireCheckClaims(env.DB,now),
   ...cleanupPublicRateLimits(env.DB,now),
   ...retentionStatements(env.DB,now),
  ]});
 }catch(error){
  // Results accepted before a failed check still count as this Worker's contact.
  if(contactAt)await recordHostedContact(env.DB,contactAt).run();
  throw error;
 }

 const remaining=RUN_SUBREQUESTS-WATCH_SUBREQUESTS-(CHECK_SUBREQUESTS-checks.remaining);
 try{await work.background(scheduledAt,remaining,contactAt)}catch(error){
  // The background work writes the contact first; if it could not start, the run still records it.
  if(contactAt)await recordHostedContact(env.DB,contactAt).run();
  throw error;
 }
}
