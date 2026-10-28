import {routeFilterSql} from './alert-route-filters.ts'
import {selectedTeamRecipientSql} from './alert-team-policy.ts'
import {selectedRouteSql} from './alert-routes-policy.ts'
import type {NotificationEvent} from './notification-content.ts'
import type {Bindings} from './control.server.ts'
/** All references are fixed SQL aliases supplied by this module's callers. */
export const recoveryAccepted=(job='j')=>`(NOT EXISTS(SELECT 1 FROM alert_recovery_matches rm WHERE rm.recovery_job_id=${job}.id) OR EXISTS(
 SELECT 1 FROM alert_recovery_matches rm JOIN notification_jobs t ON t.id=rm.trigger_job_id
 LEFT JOIN integration_deliveries td ON td.namespace='uptime-notifications' AND td.id=t.id
 WHERE rm.recovery_job_id=${job}.id AND t.credential_id=${job}.credential_id AND t.destination_id=${job}.destination_id
 AND (CASE WHEN t.kind='email' THEN t.state ELSE COALESCE(td.state,t.state) END)='accepted'))`;
export function incidentDeliveryStatements(env:Bindings,event:NotificationEvent,guard:string,values:unknown[],slowRoute?:any){
 const eventJson=JSON.stringify(event),openingKind=event.kind==='slow_recovery'?'slow':event.kind==='dependency_recovery'?'dependency':'trigger';
 const custom=event.kind==='slow'&&Array.isArray(slowRoute?.destinationIds),selection=custom?`SELECT 'selected' mode,? destination_ids,? contact_settings,'{}' fallback,'[]' team_ids,normal.filters,normal.quiet_hours,normal.business_hours FROM (SELECT 1) seed LEFT JOIN (${selectedRouteSql}) normal ON 1`:selectedRouteSql,selectionValues=custom?[JSON.stringify(slowRoute.destinationIds),JSON.stringify(slowRoute.contactSettings??{}),event.monitorId]:[event.monitorId];
 if(event.kind==='trigger'||event.kind==='slow'||event.kind==='dependency')return [env.DB.prepare(`WITH selected AS (${selection}), incoming AS (SELECT ? event)
 INSERT OR IGNORE INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at)
 SELECT ?||':'||d.id,?,d.id,d.name,d.kind,d.credential_id,?,? FROM notification_destinations d JOIN monitors m ON m.id=? CROSS JOIN incoming
 WHERE d.enabled=1 AND d.deleted_at IS NULL
 AND (COALESCE((SELECT mode FROM selected),'all')='all' OR d.id IN(SELECT value FROM json_each((SELECT destination_ids FROM selected))) OR ${selectedTeamRecipientSql('(SELECT team_ids FROM selected)')})
 AND ${routeFilterSql("COALESCE((SELECT filters FROM selected),'{}')",'incoming.event','m.definition')}
 AND EXISTS(SELECT 1 FROM notification_credentials c WHERE c.id=d.credential_id AND c.retired_at IS NULL AND c.unavailable_at IS NULL AND (c.ciphertext IS NOT NULL OR c.endpoint IS NOT NULL))
 AND EXISTS(SELECT 1 FROM outbox WHERE id=?) AND ${guard}`).bind(...selectionValues,eventJson,event.id,event.id,eventJson,event.observedAt,event.monitorId,event.id,...values),
  env.DB.prepare(`WITH selected AS (${selection}) INSERT OR IGNORE INTO alert_team_deliveries(trigger_job_id,operator_id,team_ids)
   SELECT j.id,rc.operator_id,(SELECT team_ids FROM selected) FROM notification_jobs j JOIN notification_destinations d ON d.id=j.destination_id JOIN alert_recipient_consents rc ON rc.destination_id=d.id JOIN monitors m ON m.id=?
   WHERE j.event_id=? AND COALESCE((SELECT mode FROM selected),'all')='selected' AND d.id NOT IN(SELECT value FROM json_each((SELECT destination_ids FROM selected))) AND ${selectedTeamRecipientSql('(SELECT team_ids FROM selected)')} AND ${guard}`).bind(...selectionValues,event.monitorId,event.id,...values),
  // DEPENDENCY-002: a dependency notice is sent once at its transition to every contact the route selects, and once more on recovery;
  // the contact's delay and repeat do not apply, but its quiet hours do.
  ...(event.kind==='dependency'?[env.DB.prepare(`WITH selected AS (${selection}) INSERT OR IGNORE INTO alert_contact_schedules(trigger_job_id,monitor_id,incident_key,due_at,repeat_ms,max_repeats,next_at,recovery,stop_on_ack,quiet_rules,route_quiet_rules,route_business_rules)
   SELECT j.id,?,?,?,0,NULL,NULL,1,0,json_extract(s.value,'$.quietHours'),(SELECT quiet_hours FROM selected),CASE WHEN (SELECT business_hours FROM selected) IS NOT NULL THEN json_object('policy',json((SELECT business_hours FROM selected)),'at',${event.observedAt}) ELSE NULL END
   FROM notification_jobs j LEFT JOIN json_each(COALESCE((SELECT contact_settings FROM selected),'{}')) s ON s.key=j.destination_id
   WHERE j.event_id=? AND ${guard}`).bind(...selectionValues,event.monitorId,event.incidentKey,event.observedAt,event.id,...values)]:[env.DB.prepare(`WITH selected AS (${selection}) INSERT OR IGNORE INTO alert_contact_schedules(trigger_job_id,monitor_id,incident_key,due_at,repeat_ms,max_repeats,next_at,recovery,stop_on_ack,quiet_rules,route_quiet_rules,route_business_rules)
   SELECT j.id,?,?,?+COALESCE(json_extract(s.value,'$.delayMinutes'),0)*60000,COALESCE(json_extract(s.value,'$.repeatMinutes'),0)*60000,json_extract(s.value,'$.maxRepeats'),
    CASE WHEN COALESCE(json_extract(s.value,'$.repeatMinutes'),0)>0 THEN ?+(COALESCE(json_extract(s.value,'$.delayMinutes'),0)+json_extract(s.value,'$.repeatMinutes'))*60000 ELSE NULL END,
    COALESCE(json_extract(s.value,'$.recovery'),1),COALESCE(json_extract(s.value,'$.stopOnAck'),0),json_extract(s.value,'$.quietHours'),(SELECT quiet_hours FROM selected),CASE WHEN (SELECT business_hours FROM selected) IS NOT NULL THEN json_object('policy',json((SELECT business_hours FROM selected)),'at',${event.observedAt}) ELSE NULL END
   FROM notification_jobs j LEFT JOIN json_each(COALESCE((SELECT contact_settings FROM selected),'{}')) s ON s.key=j.destination_id
   WHERE j.event_id=? AND ${guard}`).bind(...selectionValues,event.monitorId,event.incidentKey,event.observedAt,event.observedAt,event.id,...values)]),
  // DELIVERY-002: snapshot the route's fallback chain with the confirmed trigger or dependency notice; slow notices have none.
  ...((event.kind==='trigger'||event.kind==='dependency')&&!custom?[env.DB.prepare(`WITH selected AS (${selection}) INSERT OR IGNORE INTO alert_fallback_chains(event_id,monitor_id,incident_key,destination_ids,deadline_ms,contact_settings,created_at,route_quiet_rules,route_business_rules)
   SELECT ?,?,?,json_extract(s.fallback,'$.destinationIds'),json_extract(s.fallback,'$.deadlineSeconds')*1000,s.contact_settings,?,s.quiet_hours,CASE WHEN s.business_hours IS NOT NULL THEN json_object('policy',json(s.business_hours),'at',${event.observedAt}) ELSE NULL END FROM selected s
   WHERE EXISTS(SELECT 1 FROM notification_jobs WHERE event_id=?) AND s.mode='selected' AND json_array_length(json_extract(s.fallback,'$.destinationIds'))>0 AND EXISTS(SELECT 1 FROM outbox WHERE id=?) AND ${guard}`).bind(...selectionValues,event.id,event.monitorId,event.incidentKey,event.observedAt,event.id,event.id,...values)]:[])];
 return [
  env.DB.prepare(`INSERT OR IGNORE INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at)
   SELECT ?||':'||d.id,?,d.id,d.name,d.kind,t.credential_id,?,? FROM notification_jobs t
   JOIN notification_destinations d ON d.id=t.destination_id AND d.credential_id=t.credential_id
   WHERE json_extract(t.event,'$.kind')=? AND json_extract(t.event,'$.monitorId')=? AND json_extract(t.event,'$.incidentKey')=?
   AND d.enabled=1 AND d.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM alert_contact_schedules s WHERE s.trigger_job_id=t.id AND (s.recovery=0 OR s.due_at>=?)) AND EXISTS(SELECT 1 FROM outbox WHERE id=?) AND ${guard}`)
   .bind(event.id,event.id,eventJson,event.observedAt,openingKind,event.monitorId,event.incidentKey,event.observedAt,event.id,...values),
  env.DB.prepare(`INSERT OR IGNORE INTO alert_recovery_matches(recovery_job_id,trigger_job_id)
   SELECT r.id,t.id FROM notification_jobs r JOIN notification_jobs t ON t.destination_id=r.destination_id AND t.credential_id=r.credential_id
   WHERE r.event_id=? AND json_extract(t.event,'$.kind')=? AND json_extract(t.event,'$.monitorId')=? AND json_extract(t.event,'$.incidentKey')=? AND ${guard}`)
   .bind(event.id,openingKind,event.monitorId,event.incidentKey,...values),
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
