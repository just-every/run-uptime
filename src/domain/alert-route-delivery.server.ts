import {selectedRouteSql} from './alert-routes-policy.ts'
import type {NotificationEvent} from './notification-content.ts'
import type {Bindings} from './control.server.ts'
/** All references are fixed SQL aliases supplied by this module's callers. */
export const recoveryAccepted=(job='j')=>`(NOT EXISTS(SELECT 1 FROM alert_recovery_matches rm WHERE rm.recovery_job_id=${job}.id) OR EXISTS(
 SELECT 1 FROM alert_recovery_matches rm JOIN notification_jobs t ON t.id=rm.trigger_job_id
 LEFT JOIN integration_deliveries td ON td.namespace='uptime-notifications' AND td.id=t.id
 WHERE rm.recovery_job_id=${job}.id AND t.credential_id=${job}.credential_id AND t.destination_id=${job}.destination_id
 AND (CASE WHEN t.kind='email' THEN t.state ELSE COALESCE(td.state,t.state) END)='accepted'))`;
export function incidentDeliveryStatements(env:Bindings,event:NotificationEvent,guard:string,values:unknown[]){
 const eventJson=JSON.stringify(event);
 if(event.kind==='trigger')return [env.DB.prepare(`WITH selected AS (${selectedRouteSql})
 INSERT OR IGNORE INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at)
 SELECT ?||':'||d.id,?,d.id,d.name,d.kind,d.credential_id,?,? FROM notification_destinations d
 WHERE d.enabled=1 AND d.deleted_at IS NULL
 AND (COALESCE((SELECT mode FROM selected),'all')='all' OR d.id IN(SELECT value FROM json_each((SELECT destination_ids FROM selected))))
 AND EXISTS(SELECT 1 FROM notification_credentials c WHERE c.id=d.credential_id AND c.retired_at IS NULL AND c.unavailable_at IS NULL AND (c.ciphertext IS NOT NULL OR c.endpoint IS NOT NULL))
 AND EXISTS(SELECT 1 FROM outbox WHERE id=?) AND ${guard}`).bind(event.monitorId,event.id,event.id,eventJson,event.observedAt,event.id,...values)];
 return [
  env.DB.prepare(`INSERT OR IGNORE INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at)
   SELECT ?||':'||d.id,?,d.id,d.name,d.kind,t.credential_id,?,? FROM notification_jobs t
   JOIN notification_destinations d ON d.id=t.destination_id AND d.credential_id=t.credential_id
   WHERE json_extract(t.event,'$.kind')='trigger' AND json_extract(t.event,'$.monitorId')=? AND json_extract(t.event,'$.incidentKey')=?
   AND d.enabled=1 AND d.deleted_at IS NULL AND EXISTS(SELECT 1 FROM outbox WHERE id=?) AND ${guard}`)
   .bind(event.id,event.id,eventJson,event.observedAt,event.monitorId,event.incidentKey,event.id,...values),
  env.DB.prepare(`INSERT OR IGNORE INTO alert_recovery_matches(recovery_job_id,trigger_job_id)
   SELECT r.id,t.id FROM notification_jobs r JOIN notification_jobs t ON t.destination_id=r.destination_id AND t.credential_id=r.credential_id
   WHERE r.event_id=? AND json_extract(t.event,'$.kind')='trigger' AND json_extract(t.event,'$.monitorId')=? AND json_extract(t.event,'$.incidentKey')=? AND ${guard}`)
   .bind(event.id,event.monitorId,event.incidentKey,...values),
 ];
}
/** A terminal unsuccessful trigger can never authorize its recovery. Pending
 * triggers leave recoveries queued, including when acceptance arrives later. */
export async function settleUnmatchedRecoveries(env:Bindings){
 const now=Date.now();
 await env.DB.batch([
  env.DB.prepare(`UPDATE notification_jobs SET state='rejected',code='trigger_not_accepted',finished_at=? WHERE state='queued'
   AND id IN(SELECT rm.recovery_job_id FROM alert_recovery_matches rm JOIN notification_jobs t ON t.id=rm.trigger_job_id
    LEFT JOIN integration_deliveries td ON td.namespace='uptime-notifications' AND td.id=t.id
    WHERE (CASE WHEN t.kind='email' THEN t.state ELSE COALESCE(td.state,t.state) END) IN ('rejected','uncertain','imported-inactive'))`).bind(now),
  env.DB.prepare(`UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace='uptime-notifications' AND state='queued'
   AND id IN(SELECT id FROM notification_jobs WHERE state='rejected' AND code='trigger_not_accepted')`).bind(now),
 ]);
}
