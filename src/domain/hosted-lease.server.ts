// The partial lease index covers only running slots, even after a monitor's
// hosted pointer moves to a newer check or its revision changes.
export function expireCheckLeases(db:D1Database,now:number){
 return db.prepare("UPDATE slots INDEXED BY slots_running_lease SET status='interrupted' WHERE status='running' AND lease_until<=?").bind(now)
}
