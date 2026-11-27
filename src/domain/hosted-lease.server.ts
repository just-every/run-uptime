// The partial lease index covers only running slots, even after a monitor's
// hosted pointer moves to a newer check or its revision changes.
export function expireCheckLeases(db:D1Database,now:number){
 return db.prepare("UPDATE slots INDEXED BY slots_running_lease SET status='interrupted' WHERE status='running' AND lease_until<=?").bind(now)
}

// A Worker check that never returned leaves only its claim on the monitor.
// Its slot is recorded as interrupted, with the claim's delivery envelope,
// once the acceptance window has passed. ?1 is the clock; `scope` narrows the monitors.
const abandoned="hosted_claim IS NOT NULL AND json_extract(hosted_claim,'$.leaseUntil')<=?1";
export function interruptedClaimSlots(db:D1Database,now:number,monitorId?:string){
 return db.prepare(`INSERT OR IGNORE INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,hosted)
  SELECT json_extract(hosted_claim,'$.id'),id,json_extract(hosted_claim,'$.revision'),json_extract(hosted_claim,'$.dueAt'),'interrupted',
   COALESCE((SELECT r.definition FROM revisions r WHERE r.monitor_id=monitors.id AND r.revision=json_extract(monitors.hosted_claim,'$.revision')),definition),
   '',json_extract(hosted_claim,'$.leaseUntil'),json_extract(hosted_claim,'$.missedCount'),json_extract(hosted_claim,'$.hosted')
  FROM monitors WHERE ${abandoned}${monitorId===undefined?'':' AND id=?2'}`).bind(now,...(monitorId===undefined?[]:[monitorId]))
}
export function expireCheckClaims(db:D1Database,now:number){
 return [
  interruptedClaimSlots(db,now),
  db.prepare(`UPDATE monitors SET hosted_claim=NULL WHERE ${abandoned}`).bind(now),
 ]
}
