// A monitor's newest event of the given kinds. Each kind is one seek on
// outbox_monitor_kind, so a monitor's retained event history is never scanned.
export function latestOutboxEvent<T=Record<string,unknown>>(db:D1Database,monitorId:string,kinds:readonly string[]){
 const newest=kinds.map((_,index)=>`SELECT * FROM (SELECT rowid AS position,kind,event FROM outbox
  WHERE monitor_id=?1 AND kind=?${index+2} AND status<>'imported-inactive' ORDER BY rowid DESC LIMIT 1)`).join(' UNION ALL ')
 return db.prepare(`SELECT kind,event FROM (${newest}) ORDER BY position DESC LIMIT 1`).bind(monitorId,...kinds).first<T>()
}
