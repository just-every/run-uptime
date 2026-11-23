import type {Bindings} from './control.server.ts'
import {HOSTED_RUNNER_ID} from './hosted-runner.ts'
import {acceptanceMs,missedSlots,nextDueAfter} from './schedule.ts'
import {externalCheck,liveExternalCheck} from './external-check.server.ts'
import {snapshotSettings} from './failure-snapshots.server.ts'
// @ts-ignore Shared immutable maintenance calendar.
import {activeMaintenance,intervals} from './planned-maintenance.mjs'

export type HostedScheduleClaim=NonNullable<Awaited<ReturnType<typeof claimHostedSchedule>>>
type Candidate={id:string;revision:number;next_due:number;definition:any}

// An ordinary newly due check can create its slot and hand its probes to the Worker in
// one transaction. Queued work, delegated authority and shared slots use the runner
// dispatcher. A competing claim must win the immutable slot before any probe is sent.
export async function claimHostedSchedule(env:Bindings,row:Candidate){
 const {definition}=row,now=Date.now();
 if(row.next_due>now||activeMaintenance(definition,now)?.mode==='pause'||
    !definition.probes.every((p:string)=>definition.assignments?.[p]?.runnerId===HOSTED_RUNNER_ID))return null;
 const until=now+acceptanceMs(definition),id=`${row.id}:${row.revision}:${row.next_due}`;
 const pause=intervals({...definition,maintenanceUntil:0,maintenanceWindows:(definition.maintenanceWindows??[]).filter((w:any)=>w.mode==='pause')},now,until);
 const task=definition.probes.some((p:string)=>definition.assignments[p].canaryUrl)?liveExternalCheck(definition,await externalCheck(env)):definition;
 const deliveryAssignments=Object.fromEntries(definition.probes.map((p:string)=>[p,task.assignments[p]]));
 // Keep the lease predicate as the index lookup. Historical monitor indexes
 // also match monitor_id but would visit the monitor's entire slot history.
 const delivered="MAX(?3,CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER))";
 const results=await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count)
   SELECT ?1,id,revision,next_due,'running',definition,'',?4,?5 FROM monitors WHERE id=?2 AND revision=?6 AND next_due=?7
   AND NOT EXISTS(SELECT 1 FROM uptime_agent_revisions WHERE monitor_id=?2 AND revision=?6)
   AND NOT EXISTS(SELECT 1 FROM uptime_agent_handoffs WHERE monitor_id=?2 AND runner_id=?8 AND delivered_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM slots WHERE monitor_id=?2 AND manual=1 AND status='queued')
   AND NOT EXISTS(SELECT 1 FROM slots WHERE status='running' AND lease_until>?3 AND +monitor_id=?2)
   AND NOT EXISTS(SELECT 1 FROM slots n JOIN runner_assignments a ON a.slot_id=n.id
    WHERE n.monitor_id=?2 AND n.manual=0 AND n.due_at>?7 AND a.runner_id=?8)`)
   .bind(id,row.id,now,until,missedSlots(row.next_due,now,definition.intervalMs),row.revision,row.next_due,HOSTED_RUNNER_ID),
  env.DB.prepare(`INSERT INTO runner_assignments(slot_id,probe,runner_id,delivered_at,external_check_url)
   SELECT ?1,p.key,?2,${delivered},json_extract(p.value,'$.canaryUrl') FROM json_each(?4) p WHERE changes()=1
    AND ${delivered}<?5 AND NOT EXISTS(SELECT 1 FROM json_each(?6) w
     WHERE ${delivered}>=json_extract(w.value,'$.startsAt') AND ${delivered}<json_extract(w.value,'$.endsAt'))`)
   .bind(id,HOSTED_RUNNER_ID,now,JSON.stringify(deliveryAssignments),until,JSON.stringify(pause)),
  env.DB.prepare(`UPDATE monitors SET next_due=MAX(?2,(SELECT delivered_at FROM runner_assignments WHERE slot_id=?3 AND probe=?5)+?4)
   WHERE id=?1 AND changes()>0`).bind(row.id,nextDueAfter(row.next_due,now,definition.intervalMs),id,definition.intervalMs,definition.probes[0]),
  env.DB.prepare('UPDATE evidence_generation SET generation=generation+1 WHERE monitor_id=? AND changes()=1').bind(row.id),
 ]);
 if(!results[1].meta.changes)return null;
 return {id,monitorId:row.id,revision:row.revision,dueAt:row.next_due,definition:task,probes:definition.probes,acceptUntil:until,savedDefinition:definition,snapshotPolicy:await snapshotSettings(env,row.id)};
}
