import type {AuthBindings} from './operator-auth.server.ts'
export type AuditActor={kind:'operator'|'feature'|'anonymized';ref:string};
export const automated:AuditActor={kind:'feature',ref:'notification-dispatch'};
export function auditSql(actor:AuditActor,action:string,kind:string,reference:string=crypto.randomUUID(),guard='1',values:unknown[]=[],now=Date.now()):[string,unknown[]]{
 // The actor may be erased after authorization but before this batch runs.
 // Resolve its surviving identity at insertion time, never recreate a removed ID.
 return [`INSERT INTO uptime_audit(id,actor_kind,actor_ref,occurred_at,action,subject_kind,subject_ref)
 SELECT ?,CASE WHEN ?='operator' AND NOT EXISTS(SELECT 1 FROM oa_operators WHERE id=?) THEN 'anonymized' ELSE ? END,
 CASE WHEN ?='operator' AND NOT EXISTS(SELECT 1 FROM oa_operators WHERE id=?) THEN ? ELSE ? END,?,?,?,? WHERE ${guard}`,
 [reference,actor.kind,actor.ref,actor.kind,actor.kind,actor.ref,reference,actor.ref,now,action,kind,reference,...values]];
}
export function auditStatement(env:AuthBindings,...args:Parameters<typeof auditSql>){const [sql,values]=auditSql(...args);return env.DB.prepare(sql).bind(...values)}
// A failed guard aborts the containing D1 transaction, including its audit.
export function mutationGuard(env:AuthBindings,condition:string,values:unknown[]=[]){return env.DB.prepare(`INSERT INTO uptime_audit(id,actor_kind,actor_ref,occurred_at,action,subject_kind,subject_ref) SELECT NULL,'feature','cron-maintenance',0,'erase','monitor','' WHERE NOT (${condition})`).bind(...values)}
