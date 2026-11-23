/** A compact lease is reachable from its monitor even after a revision edit.
 * Sweep these pointers and the indexed native leases without scanning history. */
export function expireCheckLeases(db:D1Database,now:number){
 return [
  db.prepare("UPDATE slots SET status='interrupted' WHERE status='running' AND lease_until<=? AND hosted IS NULL").bind(now),
  db.prepare(`UPDATE slots SET status='interrupted' WHERE rowid IN (
   SELECT hosted_slot FROM monitors WHERE hosted_slot IS NOT NULL
  ) AND status='running' AND lease_until<=?`).bind(now),
 ]
}
