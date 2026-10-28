import {businessHoursSelected} from './alert-business-hours.ts'
import {routeDrillAuthorityReady,routeDrillQuietReady,refreshRouteDrillQuiet} from './alert-route-drills.server.ts'
import {reportDeliveryReady} from './reports/recurring.server.ts'
import {teamDeliveryReady} from './alert-team-policy.ts'
import {contactQuietUntil,type ContactQuietHours} from './contact-quiet.ts'
import type {Bindings} from './control.server.ts'
import {auditStatement,automated} from './audit.server.ts'
import type {NotificationEvent} from './notification-content.ts'
// Every caller uses fixed module-owned SQL aliases. Check at claim AND at the
// transport boundary so a recovered incident cannot send a previously polled delay.
const closed=`EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=s.monitor_id AND r.kind=CASE WHEN json_extract(t.event,'$.kind')='slow' THEN 'slow_recovery' WHEN json_extract(t.event,'$.kind')='dependency' THEN 'dependency_recovery' ELSE 'recovery' END AND json_extract(r.event,'$.incidentKey')=s.incident_key)`;
const active=`NOT (${closed})
 AND NOT EXISTS(SELECT 1 FROM slow_acknowledgements a WHERE a.opening_event_id=t.event_id AND s.stop_on_ack=1)
 AND NOT EXISTS(SELECT 1 FROM incident_work w WHERE w.incident_id=t.event_id AND (w.stop_reason IS NOT NULL OR w.status='resolved' OR (s.stop_on_ack=1 AND w.status='acknowledged')))`;
const dependencyPrimaryAccepted=(job:string)=>`(json_extract(${job}.event,'$.kind')='dependency' AND json_extract(${job}.event,'$.fallbackContext') IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(${job}.event,'$.fallbackContext.previous')) p
  LEFT JOIN notification_jobs prior ON prior.id=json_extract(p.value,'$.deliveryId')
  LEFT JOIN integration_deliveries delivery ON delivery.namespace='uptime-notifications' AND delivery.id=prior.id
  WHERE COALESCE(CASE WHEN prior.state='queued' THEN delivery.state ELSE prior.state END,'queued')<>'accepted'))`;
const databaseNow="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const contactMatch=(job:string)=>`t.destination_id=${job}.destination_id AND s.monitor_id=json_extract(${job}.event,'$.monitorId') AND s.incident_key=json_extract(${job}.event,'$.incidentKey')`;
export function contactQuietReady(job='j',now=databaseNow){
 return `(${routeDrillQuietReady(job,now)} AND NOT EXISTS(SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id
  WHERE ${contactMatch(job)} AND (s.quiet_rules IS NOT NULL OR s.route_quiet_rules IS NOT NULL)
  AND (s.quiet_checked_until IS NULL OR s.quiet_checked_until<=${now} OR s.quiet_until>${now})))`;
}
export function contactReady(job='j',now=databaseNow){
 return `(NOT EXISTS(SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id WHERE ${contactMatch(job)} AND s.route_business_rules IS NOT NULL AND COALESCE(s.business_allowed,0)<>1) AND ${routeDrillAuthorityReady(job,now)} AND ${reportDeliveryReady(job)} AND NOT EXISTS(SELECT 1 FROM scheduled_reports report WHERE report.delivery_id=${job}.id AND report.due_at>${now}) AND ${teamDeliveryReady(job)} AND NOT ${dependencyPrimaryAccepted(job)} AND ${contactQuietReady(job,now)} AND NOT EXISTS(SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id
  WHERE ${contactMatch(job)}
  AND json_extract(${job}.event,'$.kind') IN ('trigger','reminder','slow','slow_reminder','dependency') AND (s.due_at>${now} OR ${closed} OR (json_extract(${job}.event,'$.kind') IN ('reminder','slow_reminder') AND NOT (${active})))))`;
}
/** Refresh only live dispatch authority. Persist a hold's exact end, reuse it
 * across restarts, and make each evaluation expire at the next real minute so
 * claims cannot reuse an earlier poll on the other side of a quiet boundary. */
export async function refreshContactQuiet(env:Bindings,id?:string){
 await refreshRouteDrillQuiet(env,id);
 await refreshRouteBusiness(env);
 const now=Date.now();
 const rows=(await env.DB.prepare(`SELECT s.trigger_job_id,s.quiet_rules,s.route_quiet_rules,s.quiet_until FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id
  WHERE (s.quiet_rules IS NOT NULL OR s.route_quiet_rules IS NOT NULL) AND (s.quiet_checked_until IS NULL OR s.quiet_checked_until<=?)
  AND (EXISTS(SELECT 1 FROM notification_jobs j WHERE ${contactMatch('j')} AND j.state IN ('queued','sending')
   ${id===undefined?'':'AND j.id=?'} AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=j.id AND d.state NOT IN ('queued','sending'))) ${id===undefined?`OR (s.next_at IS NOT NULL AND ${active})`:''})`)
  .bind(now,...(id===undefined?[]:[id])).all<{trigger_job_id:string;quiet_rules:string|null;route_quiet_rules:string|null;quiet_until:number|null}>()).results;
 if(!rows.length)return;
 const checkedUntil=Math.floor(now/60000)*60000+60000,ends=new Map<string,number|null>();
 await env.DB.batch(rows.map(row=>{
  const key=JSON.stringify([row.quiet_rules,row.route_quiet_rules]);
  if(!ends.has(key)){const holds=[row.quiet_rules,row.route_quiet_rules].filter((v):v is string=>v!==null).map(v=>contactQuietUntil(JSON.parse(v) as ContactQuietHours,now)).filter((v):v is number=>v!==null);ends.set(key,holds.length?Math.max(...holds):null)}
  const until=ends.get(key)!;
  return env.DB.prepare(`UPDATE alert_contact_schedules SET quiet_until=?,quiet_checked_until=? WHERE trigger_job_id=? AND quiet_rules IS ? AND route_quiet_rules IS ? AND (quiet_checked_until IS NULL OR quiet_checked_until<=?)`)
   .bind(until,checkedUntil,row.trigger_job_id,row.quiet_rules,row.route_quiet_rules,now);
 }));
}
async function refreshRouteBusiness(env:Bindings){
 const active=await env.DB.prepare(`SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs j ON j.id=s.trigger_job_id
  WHERE s.route_business_rules IS NOT NULL AND (s.business_allowed IS NULL OR (s.business_allowed=0 AND j.state='queued')) LIMIT 1`).first();
 if(!active)return;
 const rows=(await env.DB.prepare(`SELECT s.trigger_job_id,s.route_business_rules,t.event_id FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id
  WHERE s.route_business_rules IS NOT NULL AND s.business_allowed IS NULL`).all<{trigger_job_id:string;route_business_rules:string;event_id:string}>()).results;
 for(const row of rows){
  const snapshot=JSON.parse(row.route_business_rules),selected=typeof snapshot.selected==='boolean'?snapshot.selected:businessHoursSelected(snapshot.policy,snapshot.at);
  await env.DB.batch([
   env.DB.prepare('UPDATE alert_contact_schedules SET business_allowed=? WHERE trigger_job_id=? AND route_business_rules=? AND business_allowed IS NULL').bind(Number(selected),row.trigger_job_id,row.route_business_rules),
   env.DB.prepare("UPDATE alert_fallback_chains SET route_business_rules=json_set(route_business_rules,'$.selected',json(?)) WHERE event_id=? AND route_business_rules IS NOT NULL AND json_extract(route_business_rules,'$.at')=?").bind(JSON.stringify(selected),row.event_id,snapshot.at),
  ]);
 }
 const now=Date.now();
 await env.DB.batch([
  env.DB.prepare(`UPDATE notification_jobs AS j SET state='rejected',code='filter_business_hours',finished_at=? WHERE state='queued'
   AND EXISTS(SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id WHERE ${contactMatch('j')} AND s.business_allowed=0)
   AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=j.id AND d.state<>'queued')`).bind(now),
  env.DB.prepare("UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace='uptime-notifications' AND state='queued' AND id IN(SELECT id FROM notification_jobs WHERE state='rejected' AND code='filter_business_hours')").bind(now),
  env.DB.prepare('UPDATE alert_contact_schedules SET next_at=NULL WHERE business_allowed=0 AND next_at IS NOT NULL'),
 ]);
}
export async function advanceContactSchedules(env:Bindings){
 await refreshContactQuiet(env);
 const now=Date.now();
 // Settle only queued work. Started/uncertain transports keep their own outcome.
 await env.DB.batch([
  env.DB.prepare(`UPDATE notification_jobs AS j SET state='rejected',code='team_recipient_ineligible',finished_at=? WHERE state='queued' AND NOT ${teamDeliveryReady()} AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=j.id AND d.state<>'queued')`).bind(now),
  env.DB.prepare(`UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace='uptime-notifications' AND state='queued' AND id IN(SELECT id FROM notification_jobs WHERE code='team_recipient_ineligible')`).bind(now),
  env.DB.prepare(`UPDATE notification_jobs AS j SET state='rejected',code='contact_schedule_stopped',finished_at=? WHERE state='queued' AND json_extract(j.event,'$.kind') IN ('trigger','reminder','slow','slow_reminder','dependency') AND NOT ${contactReady('j',String(now))}
   AND EXISTS(SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id WHERE t.destination_id=j.destination_id AND s.monitor_id=json_extract(j.event,'$.monitorId') AND s.incident_key=json_extract(j.event,'$.incidentKey') AND (${closed} OR ${dependencyPrimaryAccepted('j')} OR (json_extract(j.event,'$.kind') IN ('reminder','slow_reminder') AND NOT (${active}))))
   AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=j.id AND d.state<>'queued')`).bind(now),
  env.DB.prepare(`UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace='uptime-notifications' AND state='queued' AND id IN(SELECT id FROM notification_jobs WHERE code='contact_schedule_stopped')`).bind(now),
  env.DB.prepare(`UPDATE alert_contact_schedules AS s SET next_at=NULL WHERE NOT EXISTS(SELECT 1 FROM notification_jobs t WHERE t.id=s.trigger_job_id AND ${active})`),
 ]);
 const rows=await env.DB.prepare(`SELECT s.*,t.event,t.event_id,t.destination_id,t.destination_name,t.kind,t.credential_id FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id
  WHERE s.next_at<=? AND s.repeat_ms>0 AND (s.route_business_rules IS NULL OR s.business_allowed=1) AND ((s.quiet_rules IS NULL AND s.route_quiet_rules IS NULL) OR (s.quiet_checked_until>? AND (s.quiet_until IS NULL OR s.quiet_until<=?))) AND ${active} AND t.state<>'imported-inactive'
  AND EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=t.destination_id AND d.credential_id=t.credential_id AND d.enabled=1 AND d.deleted_at IS NULL)
  ORDER BY s.next_at LIMIT 100`).bind(now,now,now).all<any>();
 for(const row of rows.results){
  const number=row.emitted_repeats+1;
  const slow=JSON.parse(row.event).kind==='slow';
  const event:NotificationEvent={...JSON.parse(row.event),id:`reminder:${row.trigger_job_id}:${number}`,kind:slow?'slow_reminder':'reminder',eventType:slow?'uptime.slow.reminder':'uptime.incident.reminder',title:`Reminder ${number}: ${JSON.parse(row.event).monitorName}`,observedAt:now};
  // Continue on the confirmation-anchored cadence, skipping missed windows
  // after downtime instead of delivering a burst of obsolete reminders.
  const next=row.max_repeats!==null&&number>=row.max_repeats?null:row.due_at+(Math.floor((now-row.due_at)/row.repeat_ms)+1)*row.repeat_ms;
  const guard=`EXISTS(SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id WHERE s.trigger_job_id=? AND s.emitted_repeats=? AND s.next_at=? AND ${active})`;
  const values=[row.trigger_job_id,row.emitted_repeats,row.next_at];
  await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,monitor_id,slot_id,kind,event) SELECT ?,?,?,?,? WHERE ${guard}`).bind(event.id,event.monitorId,event.slotId,event.kind,JSON.stringify(event),...values),
   env.DB.prepare(`INSERT OR IGNORE INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE ${guard} AND EXISTS(SELECT 1 FROM outbox WHERE id=?)`).bind(`${event.id}:${row.destination_id}`,event.id,row.destination_id,row.destination_name,row.kind,row.credential_id,JSON.stringify(event),now,...values,event.id),
   auditStatement(env,automated,'reminder_schedule','notification',crypto.randomUUID(),guard,values,now),
   env.DB.prepare(`UPDATE alert_contact_schedules SET emitted_repeats=?,next_at=? WHERE trigger_job_id=? AND emitted_repeats=? AND next_at=? AND EXISTS(SELECT 1 FROM outbox WHERE id=?)`).bind(number,next,row.trigger_job_id,row.emitted_repeats,row.next_at,event.id),
  ]);
 }
}
export async function nextContactFollowupDetail(env:Bindings,incidentId:string){
 const now=Date.now();
 const row=await env.DB.prepare(`SELECT t.id AS deliveryId,
  CASE WHEN t.state='queued' AND (s.due_at>? OR s.quiet_until>?) THEN MAX(s.due_at,COALESCE(s.quiet_until,s.due_at)) WHEN ${active} AND s.next_at IS NOT NULL THEN MAX(s.next_at,COALESCE(s.quiet_until,s.next_at)) ELSE NULL END AS due,
  CASE WHEN t.state='queued' AND (s.due_at>? OR s.quiet_until>?) THEN 'notification' ELSE 'reminder' END AS kind
  FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id WHERE t.event_id=? AND NOT ${closed} ORDER BY due IS NULL,due,t.id LIMIT 1`).bind(now,now,now,now,incidentId).first<{deliveryId:string;due:number|null;kind:'notification'|'reminder'}>();
 return row?.due===null||!row?null:row;
}
export async function nextContactFollowup(env:Bindings,incidentId:string){return (await nextContactFollowupDetail(env,incidentId))?.due??null}
