import {type Bindings} from './control.server.ts'
import {claimHostedSchedules} from './hosted-scheduled-claim.server.ts'
import type {MinuteWork} from './minute-work.server.ts'
import {HOSTED_RUNNER_ID,hostedInstallation} from './hosted-runner.ts'
import {protocolRequests} from './worker-protocol-budget.ts'
// @ts-ignore Shared protocol settings.
import {isProtocol} from './protocol/settings.mjs'
import type {Allowance,SubrequestBudget} from './worker-budget.ts'
import {CRON_MINUTE} from './schedule.ts'
import {settingsOf} from './snapshot-policy.server.ts'
// Worst case without redirects: per probe, A+AAAA and one canary read, then A+AAAA and every target attempt.
// Unspent reservation (cached DNS, a first attempt that passed) returns to the run for the next monitor.
function worstCase(definition:any,probes:string[],validated:Set<string>){
 const dns=(url:string)=>validated.has(new URL(url).hostname)?0:2;
 return probes.reduce((sum,probe)=>{
  const canary=definition.assignments?.[probe]?.canaryUrl;
  const target=isProtocol(definition.type)?
   protocolRequests(definition)*(definition.retries+1):dns(definition.url)+definition.retries+1;
  return sum+(canary?dns(canary)+1:0)+target;
 },0);
}
// The hostnames a check would look up: its external check's and its target's, less those this run has already resolved.
function lookups(definition:any,probes:string[],validated:Set<string>){
 const urls=[...probes.map(probe=>definition.assignments?.[probe]?.canaryUrl),isProtocol(definition.type)?undefined:definition.url];
 return urls.filter(Boolean).map(url=>new URL(url).hostname).filter(host=>!validated.has(host));
}
// Cron uses the same immutable claims, retries, canaries and evidence acceptance as private runners.
// Select only this Worker's assignments: it must never advance a private runner's schedule.
export async function scheduledPublicChecks(env:Bindings,budget:SubrequestBudget,work:Pick<MinuteWork,'probe'|'complete'>,scheduledAt?:number,limit=100){
 if(!hostedInstallation(env))return;
 const earlyBy=scheduledAt===undefined?0:scheduledAt-Date.now();
 // An early tick (within half a minute) still owns this minute. Wait until its boundary so
 // real probe evidence and acceptance windows keep their usual clock rules.
 if(earlyBy>0&&earlyBy<=CRON_MINUTE/2)await new Promise(resolve=>setTimeout(resolve,earlyBy+1));
 const now=Date.now();
 // An ordinary tick has a fixed due boundary regardless of delivery jitter.
 // If a tick arrives a minute or more late, advance past the missed windows once.
 const cronThrough=scheduledAt===undefined?undefined:Math.min(now,Math.max(scheduledAt,Math.floor(now/CRON_MINUTE)*CRON_MINUTE));
 // Bootstrap once both installation identities are known. The reads still
 // observe a restored database or a newly selected binding immediately.
 const ready=env.DB.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM runners WHERE runner_id=?)
  AND EXISTS(SELECT 1 FROM runners WHERE legacy_key=1)`).bind(HOSTED_RUNNER_ID);
 // Start the pending-assignment lookup at live leases. Unary + excludes the
 // retained monitor-history index; CROSS JOIN keeps the assignment lookup second.
 const candidates=env.DB.prepare(`SELECT m.id,m.revision,m.next_due,m.definition,p.version AS snapshot_version,p.retention_days,p.masks,p.safe_values,p.screenshot
  FROM monitors m LEFT JOIN failure_snapshot_settings p ON p.monitor_id=m.id
  WHERE json_extract(definition,'$.enabled')=1 AND json_extract(definition,'$.network')='public'
  AND COALESCE(json_extract(definition,'$.type'),'http') IN ('http','keyword','tcp','tls','dns','domain')
  AND COALESCE(json_type(definition,'$.request'),'null')='null'
  AND COALESCE(json_type(definition,'$.tlsTrust'),'null')='null'
  AND EXISTS(SELECT 1 FROM json_each(m.definition,'$.assignments') a WHERE json_extract(a.value,'$.runnerId')=?3)
  AND (next_due<=?1 OR EXISTS(SELECT 1 FROM slots WHERE monitor_id=m.id AND manual=1 AND status='queued') OR
   EXISTS(SELECT 1 FROM slots s CROSS JOIN runner_assignments a ON a.slot_id=s.id WHERE +s.monitor_id=m.id AND s.status='running' AND s.hosted IS NULL AND s.lease_until>?2 AND a.runner_id=?3 AND a.delivered_at IS NULL)) ORDER BY next_due LIMIT ?4`).bind(cronThrough??now,now,HOSTED_RUNNER_ID,limit);
 const [identity,{results:rows}]=await env.DB.batch<{
  id:string;revision:number;next_due:number;definition:string;snapshot_version:number|null;
  retention_days:number|null;masks:string|null;safe_values:string|null;screenshot:number|null;
 }>([ready,candidates]);
 if(!identity.results.length)await (await import('./runner-registration.server.ts')).ensureFirstRunner(env);

 const due=rows.map(({id,revision,next_due,definition,snapshot_version,...policy})=>({
  id,revision,next_due,definition:JSON.parse(definition),
  snapshotPolicy:settingsOf(snapshot_version===null?null:{...policy,version:snapshot_version}),
 }));
 const validated=new Set<string>(),asked=new Set<string>();
 let waiting=due,deferred=0,contactAt=0;
 // Two outbound probes at a time, within Workers' connection limit even with A+AAAA lookups.
 try{while(waiting.length){
  const group:{row:typeof due[number];allowance:Allowance}[]=[],later:typeof due=[],asking=new Set<string>();
  for(const row of waiting){
   const hosted=row.definition.probes.filter((probe:string)=>row.definition.assignments[probe]?.runnerId===HOSTED_RUNNER_ID);
   // Two checks never look up the same new hostname side by side: the second waits a turn and reuses the first's answer.
   const names=lookups(row.definition,hosted,validated).filter(host=>!asked.has(host));
   const allowance=group.length<2&&!names.some(host=>asking.has(host))?budget.reserve(worstCase(row.definition,hosted,validated)):null;
   if(!allowance){later.push(row);continue}
   for(const host of names)asking.add(host);
   group.push({row,allowance});
  }
  // A check that does not fit beside a running one is tried again once that one has returned what it did not spend.
  // One that fits in nothing the run has left stays due, oldest first, for the next minute.
  if(!group.length){deferred=later.length;break}
  waiting=later;
  for(const host of asking)asked.add(host);
  // Each probe invocation can spend its reservation on redirects and retries.
  const extra=Math.floor(budget.remaining/group.length);
  for(const {allowance} of group)allowance.expand(extra);
  try{
   const claims=await claimHostedSchedules(env,group.map(({row})=>row),cronThrough);
   const completed=await Promise.allSettled(group.map(async ({row,allowance},position)=>{
    try{
     const claimed=claims[position];
     const task=claimed??await (await import('./attempt-claims.server.ts')).claimAttempt(env,HOSTED_RUNNER_ID,{monitorId:row.id,dueThrough:cronThrough});if(!task)return;
     const result=await work.probe(row.id,task,allowance.reserved,[...validated]);
     allowance.spend(result.spent);
     for(const host of result.validated)validated.add(host);
     if(result.attempts.length){
      const seenAt=await work.complete(claimed,task.id,result.attempts);
      contactAt=Math.max(contactAt,seenAt);
     }
    }finally{allowance.release()}
   }));
   const failed=completed.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  }finally{for(const {allowance} of group)allowance.release()}
 }}finally{
  if(contactAt)await env.DB.prepare(`UPDATE runners SET last_contact_at=?1 WHERE runner_id=?2 AND revoked_at IS NULL
   AND (last_contact_at IS NULL OR last_contact_at<?1)`).bind(contactAt,HOSTED_RUNNER_ID).run();
 }
 if(deferred)console.warn(`Uptime deferred ${deferred} due public check(s) to the next scheduled run: this run's outbound request budget is spent.`);
}
