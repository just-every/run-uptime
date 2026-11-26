import type {MinuteWork} from './minute-work.server.ts'
import type {Bindings} from './control.server.ts'
import {validateWorkerConfiguration} from './startup-config.mjs'
import {demoBindings} from './demo.server.ts'
import {recordCronRun} from './cron-run.server.ts'
import {expireCheckLeases} from './hosted-lease.server.ts'
import {cleanupPublicRateLimits} from './public-rate-limits.server.ts'
import {scheduledPublicChecks} from './worker-checks.server.ts'
import {SubrequestBudget,CHECK_SUBREQUESTS,RUN_SUBREQUESTS,WATCH_SUBREQUESTS} from './worker-budget.ts'
import {retentionStatements} from './maintenance.server.ts'

export async function runCron(input:Bindings,scheduledAt:number,work:MinuteWork){
 const env=await demoBindings(input);
 await validateWorkerConfiguration(env);
 const startedAt=Date.now();
 await env.DB.batch([
  recordCronRun(env.DB,startedAt),
  expireCheckLeases(env.DB,startedAt),
  ...cleanupPublicRateLimits(env.DB,startedAt),
  ...retentionStatements(env.DB,startedAt),
 ]);
 const checks=new SubrequestBudget(CHECK_SUBREQUESTS);
 // One probe and one result invocation per monitor, plus this Cron and background work.
 // Cloudflare allows 32 Worker invocations in the whole call chain.
 await scheduledPublicChecks(env,checks,work,scheduledAt,15);

 const remaining=RUN_SUBREQUESTS-WATCH_SUBREQUESTS-(CHECK_SUBREQUESTS-checks.remaining);
 await work.background(scheduledAt,remaining);
}
