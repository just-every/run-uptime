import type {Bindings} from './control.server.ts'
import {HOSTED_RUNNER_ID} from './hosted-runner.ts'
import {acceptanceMs,CRON_MINUTE,missedSlots,nextDueAfter} from './schedule.ts'
import {externalCheck,liveExternalCheck} from './external-check.server.ts'
import {attemptClock,type AttemptClockRow} from './attempt-checkpoint.server.ts'
import {settingsOf} from './snapshot-policy.server.ts'
// @ts-ignore Shared immutable maintenance calendar.
import {activeMaintenance,intervals} from './planned-maintenance.mjs'

export type HostedScheduleClaim=NonNullable<Awaited<ReturnType<typeof planHostedSchedule>>>['task']&{clock?:AttemptClockRow}
type Candidate={id:string;revision:number;next_due:number;definition:any;snapshotPolicy:ReturnType<typeof settingsOf>}

// An ordinary newly due check can create its slot and hand its probes to the Worker in
// one transaction. Queued work, delegated authority and shared slots use the runner
// dispatcher. A competing claim must win the immutable slot before any probe is sent.
async function planHostedSchedule(env:Bindings,row:Candidate,now:number,external:()=>ReturnType<typeof externalCheck>,cronThrough?:number){
 const {definition}=row,dueThrough=cronThrough??now;
 if(row.next_due>dueThrough||activeMaintenance(definition,now)?.mode==='pause'||
    !definition.probes.every((p:string)=>definition.assignments?.[p]?.runnerId===HOSTED_RUNNER_ID))return null;
 const nearestNext=nextDueAfter(row.next_due,dueThrough,definition.intervalMs);
 // A console kick that fills a slot Cron never delivered, late in its minute, must not
 // leave the next Cron probe seconds behind it: that slot goes to the following grid point.
 const gridNext=cronThrough===undefined&&definition.intervalMs%CRON_MINUTE===0&&nearestNext-now<definition.intervalMs/2?nearestNext+definition.intervalMs:nearestNext;
 // A console kick can win the same slot as Cron. Both advance whole-minute
 // checks to the same grid, even if the kick arrives before Cron's delivery.
 const cronNextDueAt=definition.intervalMs%CRON_MINUTE===0?
  Math.ceil(gridNext/CRON_MINUTE)*CRON_MINUTE:cronThrough===undefined?null:gridNext;
 const until=now+acceptanceMs(definition),id=`${row.id}:${row.revision}:${row.next_due}`;
 const pause=intervals({...definition,maintenanceUntil:0,maintenanceWindows:(definition.maintenanceWindows??[]).filter((w:any)=>w.mode==='pause')},now,until);
 const task=definition.probes.some((p:string)=>definition.assignments[p].canaryUrl)?liveExternalCheck(definition,await external()):definition;
 const deliveryAssignments=Object.fromEntries(definition.probes.map((p:string)=>[p,task.assignments[p]]));
 // Keep the lease predicate as the index lookup. Historical monitor indexes
 // also match monitor_id but would visit the monitor's entire slot history.
 const delivered="MAX(?3,CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER))";
 const statements=[
  env.DB.prepare(`INSERT OR IGNORE INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,hosted)
   SELECT ?1,id,revision,next_due,'running',definition,'',?4,?5,
    json_object('runnerId',?8,'deliveredAt',${delivered},'assignments',json(?9),'cronNextDueAt',?11)
   FROM monitors WHERE id=?2 AND revision=?6 AND next_due=?7
   AND NOT EXISTS(SELECT 1 FROM uptime_agent_revisions WHERE monitor_id=?2 AND revision=?6)
   AND NOT EXISTS(SELECT 1 FROM uptime_agent_handoffs WHERE monitor_id=?2 AND runner_id=?8 AND delivered_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM slots WHERE monitor_id=?2 AND manual=1 AND status='queued')
   AND NOT EXISTS(SELECT 1 FROM slots WHERE status='running' AND lease_until>?3 AND +monitor_id=?2 AND hosted IS NULL)
   AND NOT EXISTS(SELECT 1 FROM slots WHERE id=monitors.hosted_slot AND status='running' AND lease_until>?3)
   AND ${delivered}<?4 AND NOT EXISTS(SELECT 1 FROM json_each(?10) w
     WHERE ${delivered}>=json_extract(w.value,'$.startsAt') AND ${delivered}<json_extract(w.value,'$.endsAt'))
   AND NOT EXISTS(SELECT 1 FROM slots n WHERE n.monitor_id=?2 AND n.manual=0 AND n.due_at>?7
    AND (json_extract(n.hosted,'$.runnerId')=?8 OR EXISTS(SELECT 1 FROM runner_assignments a WHERE a.slot_id=n.id AND a.runner_id=?8)))`)
   .bind(id,row.id,now,until,missedSlots(row.next_due,dueThrough,definition.intervalMs),row.revision,row.next_due,
    HOSTED_RUNNER_ID,JSON.stringify(deliveryAssignments),JSON.stringify(pause),cronNextDueAt),
  env.DB.prepare(`UPDATE monitors SET (next_due,hosted_slot)=(
    SELECT COALESCE(?5,MAX(?2,json_extract(hosted,'$.deliveredAt')+?4)),id FROM slots WHERE id=?3
   ),hosted_generation=hosted_generation+1 WHERE id=?1 AND changes()=1`)
   .bind(row.id,gridNext,id,definition.intervalMs,cronNextDueAt),
  attemptClock(env,row.id,row.revision,true),
 ];
 return {statements,task:{id,monitorId:row.id,revision:row.revision,dueAt:row.next_due,definition:task,
  probes:definition.probes,acceptUntil:until,cronNextDueAt,savedDefinition:definition,snapshotPolicy:row.snapshotPolicy}};
}

export async function claimHostedSchedules(env:Bindings,rows:Candidate[],cronThrough?:number):Promise<(HostedScheduleClaim|null)[]>{
 let independentCheck:ReturnType<typeof externalCheck>|undefined;
 const external=()=>independentCheck??=externalCheck(env),now=Date.now();
 const plans=await Promise.all(rows.map(row=>planHostedSchedule(env,row,now,external,cronThrough)));
 const statements=plans.flatMap(plan=>plan?.statements??[]);
 if(!statements.length)return plans.map(()=>null);
 const results=await env.DB.batch<AttemptClockRow>(statements);
 let index=0;
 return plans.map(plan=>{
  if(!plan)return null;
  const claimed=results[index].meta.changes,clock=results[index+2].results[0];
  index+=plan.statements.length;
  return claimed?{...plan.task,clock}:null;
 });
}
