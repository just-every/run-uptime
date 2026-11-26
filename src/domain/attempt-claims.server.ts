import {get} from './monitor-row.server.ts'
import {expireCheckLeases} from './hosted-lease.server.ts'
import {agentRunnerTask} from '../agent-door/work.server.ts'
import {runnerIdentity} from './runner-registration.server.ts'
import {externalCheck,liveExternalCheck} from './external-check.server.ts'
import {claimGrants} from './effect-grants.server.ts'
import type {Bindings} from './control.server.ts'
import {mutationGuard} from './audit.server.ts'
import {classifyStorage} from './storage-error.ts'
import {snapshotSettings} from './snapshot-policy.server.ts'
import {snapshotHeartbeat} from './heartbeat.server.ts'
import {claimDebt} from './cleanup-debt.server.ts'
import {acceptanceMs,missedSlots,nextDueAfter} from './schedule.ts'
import {HOSTED_RUNNER_ID} from './hosted-runner.ts'
// @ts-ignore Shared immutable maintenance calendar.
import {activeMaintenance,intervals} from './planned-maintenance.mjs'

// A vantage only ever runs its newest scheduled slot of a monitor. Once a newer scheduled slot is assigned to its runner (the runner
// fell behind: a long flow on its machine, a stalled machine), its part of an older slot is never delivered, and that slot keeps the
// part as missing evidence (coverage incomplete) rather than running it moments before the next one. Every scheduled slot is created
// at least one interval after each vantage's previous delivery (see the delivery below), so a vantage's own consecutive checks stay
// one interval apart however late it polls. `slot` is the slot about to be delivered and ?2 its runner.
const newest=(slot:string)=>`NOT EXISTS(SELECT 1 FROM slots c JOIN slots n ON n.monitor_id=c.monitor_id AND n.manual=0 AND n.due_at>c.due_at WHERE c.id=${slot} AND c.manual=0 AND (json_extract(n.hosted,'$.runnerId')=?2 OR EXISTS(SELECT 1 FROM runner_assignments na WHERE na.slot_id=n.id AND na.runner_id=?2)))`
export async function claimAttempt(env:Bindings,runnerId:string,{monitorId=null,dueThrough}:{monitorId?:string|null;dueThrough?:number}={}){
 const delegated=await agentRunnerTask(env,runnerId,monitorId);if(delegated)return delegated;
 return nativeClaimAttempt(env,runnerId,monitorId,false,dueThrough)
}
// Trusted shared-door executor only; public runner protocols never choose this.
export async function claimAdmittedAttempt(env:Bindings,runnerId:string,{monitorId=null}:{monitorId?:string|null}={}){return nativeClaimAttempt(env,runnerId,monitorId,true)}
async function nativeClaimAttempt(env:Bindings,runnerId:string,monitorId:string|null,admitted:boolean,dueThrough?:number){
 const now=Date.now();
 await expireCheckLeases(env.DB,now).run();
 const pendingRows=(await env.DB.prepare(`SELECT s.*,m.definition AS current_definition FROM slots s JOIN monitors m ON m.id=s.monitor_id JOIN runner_assignments a ON a.slot_id=s.id WHERE a.runner_id=?2 AND a.delivered_at IS NULL AND s.status='running' AND s.hosted IS NULL AND s.lease_until>?3 AND (?4 IS NULL OR s.monitor_id=?4) AND ${newest('s.id')} ORDER BY s.manual,s.due_at`).bind(null,runnerId,now,monitorId).all<any>()).results;
 const allowed=async(row:any)=>admitted||!await env.DB.prepare('SELECT 1 FROM uptime_agent_revisions WHERE monitor_id=? AND revision=? UNION ALL SELECT 1 FROM uptime_agent_manual WHERE slot_id=?').bind(row.monitor_id??row.id,row.current_revision??row.revision,row.id).first();
 const admittedPending=[];for(const row of pendingRows)if(await allowed(row))admittedPending.push(row);
 const pending=admittedPending.find(row=>activeMaintenance(JSON.parse(row.current_definition),now)?.mode!=='pause');
 let slot=pending;
 if(!slot){
  const queuedRows=(await env.DB.prepare("SELECT s.*,m.definition AS current_definition,m.revision AS current_revision FROM slots s JOIN monitors m ON m.id=s.monitor_id WHERE s.status='queued' AND s.manual=1 AND (? IS NULL OR s.monitor_id=?) AND (json_extract(s.definition,'$.assignments') IS NULL OR EXISTS(SELECT 1 FROM json_each(json_extract(s.definition,'$.assignments')) a WHERE json_extract(a.value,'$.runnerId')=?)) ORDER BY s.due_at").bind(monitorId,monitorId,runnerId).all<any>()).results;
  for(const queued of queuedRows){if(!await allowed(queued))continue;const definition=JSON.parse(queued.current_definition);if(!definition.enabled||queued.current_revision!==queued.revision){await env.DB.prepare("UPDATE slots SET status='interrupted' WHERE id=?").bind(queued.id).run()}else if(activeMaintenance(definition,now)?.mode!=='pause'){slot=queued;break}}
  if(!slot){
   const target=monitorId===null?'':'AND id=?3';
   const bindings=monitorId===null?[dueThrough??now,runnerId]:[dueThrough??now,runnerId,monitorId];
   const due=(await env.DB.prepare(`SELECT * FROM monitors WHERE next_due<=?1 AND json_extract(definition,'$.enabled')=1 ${target} AND (json_extract(definition,'$.assignments') IS NULL OR EXISTS(SELECT 1 FROM json_each(json_extract(monitors.definition,'$.assignments')) a WHERE json_extract(a.value,'$.runnerId')=?2)) ORDER BY next_due`).bind(...bindings).all<any>()).results;
   // Calendar filtering considers every due monitor: a paused first row must
   // never starve unrelated monitors, or move their configured schedule.
   const admittedDue=[];for(const row of due)if(await allowed(row))admittedDue.push(row);
   const row=admittedDue.find(row=>activeMaintenance(JSON.parse(row.definition),now)?.mode!=='pause');
   if(row){const definition=JSON.parse(row.definition),id=`${row.id}:${row.revision}:${row.next_due}`,until=now+acceptanceMs(definition);
    // The next scheduled check is due no sooner than one interval after this claim. Each vantage that takes its part of the check
    // later raises it to one interval after its own delivery, and completed results to one interval after the latest vantage's
    // reported start: a late check moves later due times back rather than running any vantage's checks closer.
    await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count) SELECT ?,id,revision,next_due,'running',definition,'',?,? FROM monitors WHERE id=? AND revision=? AND next_due=?").bind(id,until,missedSlots(row.next_due,now,definition.intervalMs),row.id,row.revision,row.next_due),env.DB.prepare('UPDATE monitors SET next_due=? WHERE id=? AND revision=? AND next_due=? AND EXISTS(SELECT 1 FROM slots WHERE id=?)').bind(Math.max(nextDueAfter(row.next_due,now,definition.intervalMs),now+definition.intervalMs),row.id,row.revision,row.next_due,id)]);
    slot=await env.DB.prepare('SELECT * FROM slots WHERE id=?').bind(id).first<any>()
   }
  }
 }
 if(!slot||slot.hosted!=null)return null;
 const definition=JSON.parse(slot.definition),legacy=definition.assignments?null:await runnerIdentity(env);
 const assignments=definition.assignments??Object.fromEntries(definition.probes.map((p:string)=>[p,{runnerId:legacy?.runner_id,networkLabel:legacy?.network_label}]));
 const until=slot.status==='queued'?now+acceptanceMs(definition):slot.lease_until;
 await env.DB.batch([...(slot.status==='queued'?[env.DB.prepare("UPDATE slots SET status='running',lease_owner='',lease_until=? WHERE id=? AND status='queued'").bind(until,slot.id)]:[]),...definition.probes.map((p:string)=>env.DB.prepare("INSERT OR IGNORE INTO runner_assignments(slot_id,probe,runner_id) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM slots WHERE id=? AND status='running' AND lease_until>?)").bind(slot.id,p,assignments[p].runnerId,slot.id,now))]);
 const mine=definition.probes.filter((p:string)=>assignments[p].runnerId===runnerId);
 if(!mine.length)return null;
 // Record delivery at the transaction, not request entry: a claim delayed past
 // an older slot's classification deadline must not retroactively skip it.
 const current=await get(env,slot.monitor_id);if(!current||activeMaintenance(current.definition,Date.now())?.mode==='pause')return null;
 const pauseRanges=intervals({...current.definition,maintenanceUntil:0,maintenanceWindows:(current.definition.maintenanceWindows??[]).filter((window:any)=>window.mode==='pause')},now,until);
 // A revision that follows Settings checks the External check URL Settings holds now, not the copy it was saved with; each
 // delivered part records the URL it was handed, so its history says what was checked.
 const task=Object.values(assignments).some((a:any)=>a.canaryUrl)?liveExternalCheck({...definition,assignments},await externalCheck(env)):{...definition,assignments};
 const deliveryTime="MAX(?3,CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER))";
 const maintenanceGuard=`EXISTS(SELECT 1 FROM monitors WHERE id=?5 AND revision=?6) AND NOT EXISTS(SELECT 1 FROM json_each(?7) w WHERE ${deliveryTime}>=json_extract(w.value,'$.startsAt') AND ${deliveryTime}<json_extract(w.value,'$.endsAt'))`;
 const changes=await env.DB.batch([...mine.map((p:string)=>env.DB.prepare(`UPDATE runner_assignments SET delivered_at=${deliveryTime},external_check_url=?8 WHERE slot_id=?1 AND probe=?4 AND runner_id=?2 AND delivered_at IS NULL AND ${newest('?1')} AND EXISTS(SELECT 1 FROM slots WHERE id=?1 AND lease_until>${deliveryTime}) AND ${maintenanceGuard}`).bind(slot.id,runnerId,now,p,current.id,current.revision,JSON.stringify(pauseRanges),task.assignments[p].canaryUrl??null)),
  // New delivery resolves older undelivered classifications. Fence snapshots
  // in the same transaction so a concurrent checkpoint cannot freeze an old
  // missing classification after this runner has demonstrably advanced.
  env.DB.prepare('UPDATE evidence_generation SET generation=generation+1 WHERE monitor_id=? AND EXISTS(SELECT 1 FROM runner_assignments WHERE slot_id=? AND runner_id=? AND delivered_at>=?)').bind(slot.monitor_id,slot.id,runnerId,now),
  // Also when the monitor was edited since this slot: by the shorter of the two intervals, as an edit itself schedules.
  ...(slot.manual?[]:[env.DB.prepare("UPDATE monitors SET next_due=MAX(next_due,(SELECT MAX(delivered_at) FROM runner_assignments WHERE slot_id=?4 AND runner_id=?5)+MIN(?2,json_extract(definition,'$.intervalMs'))) WHERE id=?3 AND EXISTS(SELECT 1 FROM runner_assignments WHERE slot_id=?4 AND runner_id=?5 AND delivered_at>=?1)").bind(now,definition.intervalMs,slot.monitor_id,slot.id,runnerId)])]);
 const probes=mine.filter((_:string,i:number)=>changes[i].meta.changes);
 if(!probes.length)return null;
 return snapshotHeartbeat(env,{...await claimDebt(env,slot.monitor_id,definition),...await claimGrants(env,slot.monitor_id,Date.now()),snapshotPolicy:await snapshotSettings(env,slot.monitor_id),id:slot.id,monitorId:slot.monitor_id,revision:slot.revision,dueAt:slot.due_at,definition:task,probes,acceptUntil:until})
}
