import type {Bindings} from './control.server.ts'
import {auditStatement,automated} from './audit.server.ts'
import type {NotificationEvent} from './notification-content.ts'
// Every caller uses fixed module-owned SQL aliases. Check at claim AND at the
// transport boundary so a recovered incident cannot send a previously polled delay.
const active=`NOT EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=s.monitor_id AND r.kind='recovery' AND json_extract(r.event,'$.incidentKey')=s.incident_key)
 AND NOT EXISTS(SELECT 1 FROM incident_work w WHERE w.incident_id=t.event_id AND (w.stop_reason IS NOT NULL OR w.status='resolved' OR (s.stop_on_ack=1 AND w.status='acknowledged')))`;
export function contactReady(job='j',now='CAST((julianday(\'now\')-2440587.5)*86400000 AS INTEGER)'){
 return `NOT EXISTS(SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id
  WHERE t.destination_id=${job}.destination_id AND s.monitor_id=json_extract(${job}.event,'$.monitorId') AND s.incident_key=json_extract(${job}.event,'$.incidentKey')
  AND json_extract(${job}.event,'$.kind') IN ('trigger','reminder') AND (s.due_at>${now} OR EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=s.monitor_id AND r.kind='recovery' AND json_extract(r.event,'$.incidentKey')=s.incident_key) OR (json_extract(${job}.event,'$.kind')='reminder' AND NOT (${active}))))`;
}
export async function advanceContactSchedules(env:Bindings){
 const now=Date.now();
 // Settle only queued work. Started/uncertain transports keep their own outcome.
 await env.DB.batch([
  env.DB.prepare(`UPDATE notification_jobs AS j SET state='rejected',code='contact_schedule_stopped',finished_at=? WHERE state='queued' AND NOT ${contactReady('j',String(now))}
   AND EXISTS(SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id WHERE t.destination_id=j.destination_id AND s.monitor_id=json_extract(j.event,'$.monitorId') AND s.incident_key=json_extract(j.event,'$.incidentKey') AND (EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=s.monitor_id AND r.kind='recovery' AND json_extract(r.event,'$.incidentKey')=s.incident_key) OR (json_extract(j.event,'$.kind')='reminder' AND NOT (${active}))))
   AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=j.id AND d.state<>'queued')`).bind(now),
  env.DB.prepare(`UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace='uptime-notifications' AND state='queued' AND id IN(SELECT id FROM notification_jobs WHERE code='contact_schedule_stopped')`).bind(now),
  env.DB.prepare(`UPDATE alert_contact_schedules AS s SET next_at=NULL WHERE NOT EXISTS(SELECT 1 FROM notification_jobs t WHERE t.id=s.trigger_job_id AND ${active})`),
 ]);
 const rows=await env.DB.prepare(`SELECT s.*,t.event,t.event_id,t.destination_id,t.destination_name,t.kind,t.credential_id FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id
  WHERE s.next_at<=? AND s.repeat_ms>0 AND ${active} AND t.state<>'imported-inactive'
  AND EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=t.destination_id AND d.credential_id=t.credential_id AND d.enabled=1 AND d.deleted_at IS NULL)
  ORDER BY s.next_at LIMIT 100`).bind(now).all<any>();
 for(const row of rows.results){
  const number=row.emitted_repeats+1;
  const event:NotificationEvent={...JSON.parse(row.event),id:`reminder:${row.trigger_job_id}:${number}`,kind:'reminder',eventType:'uptime.incident.reminder',title:`Reminder ${number}: ${JSON.parse(row.event).monitorName}`,observedAt:now};
  // Continue on the confirmation-anchored cadence, skipping missed windows
  // after downtime instead of delivering a burst of obsolete reminders.
  const next=row.max_repeats!==null&&number>=row.max_repeats?null:row.due_at+(Math.floor((now-row.due_at)/row.repeat_ms)+1)*row.repeat_ms;
  const guard=`EXISTS(SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id WHERE s.trigger_job_id=? AND s.emitted_repeats=? AND s.next_at=? AND ${active})`;
  const values=[row.trigger_job_id,row.emitted_repeats,row.next_at];
  await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,monitor_id,slot_id,kind,event) SELECT ?,?,?,'reminder',? WHERE ${guard}`).bind(event.id,event.monitorId,event.slotId,JSON.stringify(event),...values),
   env.DB.prepare(`INSERT OR IGNORE INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE ${guard} AND EXISTS(SELECT 1 FROM outbox WHERE id=?)`).bind(`${event.id}:${row.destination_id}`,event.id,row.destination_id,row.destination_name,row.kind,row.credential_id,JSON.stringify(event),now,...values,event.id),
   auditStatement(env,automated,'reminder_schedule','notification',crypto.randomUUID(),guard,values,now),
   env.DB.prepare(`UPDATE alert_contact_schedules SET emitted_repeats=?,next_at=? WHERE trigger_job_id=? AND emitted_repeats=? AND next_at=? AND EXISTS(SELECT 1 FROM outbox WHERE id=?)`).bind(number,next,row.trigger_job_id,row.emitted_repeats,row.next_at,event.id),
  ]);
 }
}
export async function nextContactFollowup(env:Bindings,incidentId:string){
 const row=await env.DB.prepare(`SELECT MIN(CASE WHEN s.due_at>? AND t.state='queued' THEN s.due_at WHEN ${active} THEN s.next_at ELSE NULL END) due FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id WHERE t.event_id=? AND NOT EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=s.monitor_id AND r.kind='recovery' AND json_extract(r.event,'$.incidentKey')=s.incident_key)`).bind(Date.now(),incidentId).first<{due:number|null}>();
 return row?.due??null;
}
