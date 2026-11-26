// SQL deletes only expired transient records. Durable authority ledgers,
// observations, definitions and outbox are retained.
export function retentionStatements(db:D1Database,now:number){
 return [
  db.prepare('DELETE FROM failure_snapshots WHERE expires_at<=?').bind(now),
  db.prepare('DELETE FROM oa_sessions WHERE expires_at<=?').bind(now),
  db.prepare('DELETE FROM oa_limits WHERE window<?').bind(Math.floor(now/900000)-2),
  db.prepare('DELETE FROM login_attempts WHERE at<?').bind(now-60000),
 ];
}
