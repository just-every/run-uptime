import {type Bindings} from './control.server.ts'
import {claimHostedSchedule} from './hosted-scheduled-claim.server.ts'
import {claimAttempt,completeAttempts,completeHostedAttempts} from './attempts.server.ts'
import {ensureFirstRunner} from './runner-registration.server.ts'
import {HOSTED_RUNNER_ID,hostedHttp,hostedInstallation} from './hosted-runner.ts'
import {workerProbe} from './worker-http.server.ts'
import {hostedProbeUserAgent} from './probe-identification.ts'
import {workerProtocolProbe,protocolRequests} from './worker-protocol-diagnostics.server.ts'
// @ts-ignore Shared protocol settings.
import {isProtocol} from './protocol/settings.mjs'
import {dnsCache} from './worker-dns.server.ts'
import type {SubrequestBudget} from './worker-budget.ts'
import {CRON_MINUTE} from './schedule.ts'
// Worst case without redirects: per probe, A+AAAA and one canary read, then A+AAAA and every target attempt.
// Unspent reservation (cached DNS, a first attempt that passed) returns to the run for the next monitor.
const worstCase=(definition:any,probes:string[])=>probes.reduce((sum,probe)=>sum+(definition.assignments?.[probe]?.canaryUrl?3:0)+(isProtocol(definition.type)?protocolRequests(definition)*(definition.retries+1):2+definition.retries+1),0)
// Cron uses the same immutable claims, retries, canaries and evidence acceptance as private runners.
// Select only this Worker's assignments: it must never advance a private runner's schedule.
export async function scheduledPublicChecks(env:Bindings,budget:SubrequestBudget,scheduledAt?:number){
 if(!hostedInstallation(env))return;
 const now=Date.now();
 // An ordinary tick has a fixed due boundary regardless of delivery jitter.
 // If a tick arrives a minute or more late, advance past the missed windows once.
 const cronThrough=scheduledAt===undefined?undefined:Math.min(now,Math.max(scheduledAt,Math.floor(now/CRON_MINUTE)*CRON_MINUTE));
 // Bootstrap once both installation identities are known. The reads still
 // observe a restored database or a newly selected binding immediately.
 const ready=await env.DB.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM runners WHERE runner_id=?)
  AND EXISTS(SELECT 1 FROM runners WHERE legacy_key=1)`).bind(HOSTED_RUNNER_ID).first();
 if(!ready)await ensureFirstRunner(env);
 // Start the pending-assignment lookup at live leases. Unary + excludes the
 // retained monitor-history index; CROSS JOIN keeps the assignment lookup second.
 const rows=(await env.DB.prepare(`SELECT id,revision,next_due,definition FROM monitors WHERE json_extract(definition,'$.enabled')=1 AND
  (next_due<=? OR EXISTS(SELECT 1 FROM slots WHERE monitor_id=monitors.id AND manual=1 AND status='queued') OR
   EXISTS(SELECT 1 FROM slots s CROSS JOIN runner_assignments a ON a.slot_id=s.id WHERE +s.monitor_id=monitors.id AND s.status='running' AND s.hosted IS NULL AND s.lease_until>? AND a.runner_id=? AND a.delivered_at IS NULL)) ORDER BY next_due LIMIT 100`).bind(cronThrough??now,now,HOSTED_RUNNER_ID).all<{id:string;revision:number;next_due:number;definition:string}>()).results;
 const due=rows.map(row=>({...row,definition:JSON.parse(row.definition)})).filter(({definition})=>hostedHttp(definition)&&Object.values(definition.assignments??{}).some((assignment:any)=>assignment.runnerId===HOSTED_RUNNER_ID));
 const dns=dnsCache();let deferred=0,contactAt=0;
 // Two outbound probes at a time, within Workers' connection limit even with A+AAAA lookups.
 try{for(let index=0;index<due.length;index+=2){const completed=await Promise.allSettled(due.slice(index,index+2).map(async row=>{
  // A monitor that does not fit is not claimed: it stays due, oldest first, for the next minute's run.
  const hosted=Object.entries(row.definition.assignments??{}).filter(([,assignment]:any)=>assignment.runnerId===HOSTED_RUNNER_ID).map(([probe])=>probe);
  const allowance=budget.reserve(worstCase(row.definition,hosted));if(!allowance){deferred++;return}
  try{
   const claimed=await claimHostedSchedule(env,row,cronThrough);
   const task=claimed??await claimAttempt(env,HOSTED_RUNNER_ID,{monitorId:row.id,dueThrough:cronThrough});if(!task)return;
   const attempts=[],userAgent=['http','keyword'].includes(task.definition.type??'http')&&!task.definition.catalog?await hostedProbeUserAgent(row.id,env.UPTIME_ORIGIN):undefined;
   for(const probe of task.probes){
    const canaryUrl=task.definition.assignments[probe].canaryUrl,context={dns,allowance,appOrigin:env.UPTIME_ORIGIN,snapshotPolicy:task.snapshotPolicy};
    const canary=canaryUrl?{...await workerProbe({...task.definition,type:'http',tlsTrust:undefined,catalog:undefined,url:canaryUrl,method:'GET',assertions:{status:200}},probe,{...context,statusOnly:true}),attempt:0}:undefined;
    for(let attempt=0;attempt<=task.definition.retries;attempt++){
     const observation=isProtocol(task.definition.type)?await workerProtocolProbe(task.definition,probe,allowance,task.snapshotPolicy):await workerProbe(task.definition,probe,{...context,userAgent});attempts.push({...observation,attempt,...(canary?{canary}:{})});
     if(observation.outcome!=='target_failure')break;
    }
   }
   if(attempts.length){
    if(claimed){
     const result=await completeHostedAttempts(env,claimed,attempts);
     if('contactAt' in result&&typeof result.contactAt==='number')contactAt=Math.max(contactAt,result.contactAt);
    }else await completeAttempts(env,{slotId:task.id,attempts},HOSTED_RUNNER_ID);
   }
  }finally{allowance.release()}
 }));
  const failed=completed.find(result=>result.status==='rejected');if(failed)throw failed.reason;
 }}finally{
  if(contactAt)await env.DB.prepare(`UPDATE runners SET last_contact_at=?1 WHERE runner_id=?2 AND revoked_at IS NULL
   AND (last_contact_at IS NULL OR last_contact_at<?1)`).bind(contactAt,HOSTED_RUNNER_ID).run();
 }
 if(deferred)console.warn(`Uptime deferred ${deferred} due public check(s) to the next scheduled run: this run's outbound request budget is spent.`);
}
