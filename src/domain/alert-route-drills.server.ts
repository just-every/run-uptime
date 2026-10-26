import {contactQuietUntil,type ContactQuietHours} from './contact-quiet.ts'
import {liveRecipientAssignmentSql} from './alert-team-policy.ts'
import type {Bindings} from './control.server.ts'

// Fixed aliases only. Direct destination drills keep DRILL-001's explicit test
// semantics; route drills also require the original route recipient's authority.
export function routeDrillAuthorityReady(job='j',now="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)"){
 return `NOT EXISTS(WITH live_route_teams AS MATERIALIZED (
  SELECT DISTINCT a.delivery_id FROM alert_drills a JOIN monitors m ON m.id=json_extract(a.route_context,'$.monitorId')
  JOIN notification_destinations d ON d.id=a.destination_id
  JOIN alert_recipient_consents rc ON rc.destination_id=d.id AND rc.credential_id=d.credential_id
  JOIN alert_team_members tm ON tm.operator_id=rc.operator_id
  JOIN alert_teams team ON team.id=tm.team_id AND team.enabled=1
  JOIN oa_operators o ON o.id=rc.operator_id JOIN uptime_member_roles r ON r.operator_id=o.id
  WHERE a.route_context IS NOT NULL AND team.id IN(SELECT value FROM json_each(json_extract(a.route_context,'$.teamIds'))) AND ${liveRecipientAssignmentSql()}
 ), live_route_drills AS MATERIALIZED (
  SELECT a.delivery_id FROM alert_drills a JOIN monitors m ON m.id=json_extract(a.route_context,'$.monitorId')
  JOIN notification_destinations d ON d.id=a.destination_id
  WHERE a.route_context IS NOT NULL AND d.enabled=1 AND d.deleted_at IS NULL AND d.credential_id=a.credential_id AND a.expires_at>${now}
   AND (json_extract(a.route_context,'$.viaTeam')=0 OR a.delivery_id IN(SELECT delivery_id FROM live_route_teams)))
  SELECT 1 FROM alert_drills a LEFT JOIN live_route_drills live ON live.delivery_id=a.delivery_id
  WHERE a.delivery_id=${job}.id AND a.route_context IS NOT NULL AND live.delivery_id IS NULL)`;
}
export function routeDrillQuietReady(job='j',now="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)"){
 return `NOT EXISTS(SELECT 1 FROM alert_drills a WHERE a.delivery_id=${job}.id AND a.route_context IS NOT NULL
  AND (a.quiet_checked_until IS NULL OR a.quiet_checked_until<=${now} OR a.quiet_until>${now}))`
}
export async function refreshRouteDrillQuiet(env:Bindings,id?:string){
 const active=await env.DB.prepare(`SELECT 1 FROM alert_drills a JOIN notification_jobs j ON j.id=a.delivery_id LEFT JOIN integration_deliveries d ON d.namespace='uptime-notifications' AND d.id=j.id
  WHERE a.route_context IS NOT NULL AND (CASE WHEN j.state<>'queued' THEN j.state ELSE COALESCE(d.state,j.state) END) IN ('queued','sending') LIMIT 1`).first();
 if(!active)return;
 const now=Date.now(),checkedUntil=Math.floor(now/60000)*60000+60000;
 const rows=(await env.DB.prepare(`SELECT a.id,a.route_context FROM alert_drills a JOIN notification_jobs j ON j.id=a.delivery_id
  WHERE a.route_context IS NOT NULL AND j.state IN ('queued','sending') AND (a.quiet_checked_until IS NULL OR a.quiet_checked_until<=?) ${id===undefined?'':'AND j.id=?'}`)
  .bind(now,...(id===undefined?[]:[id])).all<{id:string;route_context:string}>()).results;
 if(rows.length)await env.DB.batch(rows.map(row=>{
  const context=JSON.parse(row.route_context),holds=[context.quietHours,context.contactQuietHours].filter(Boolean).map(p=>contactQuietUntil(p as ContactQuietHours,now)).filter((v):v is number=>v!==null);
  return env.DB.prepare('UPDATE alert_drills SET quiet_until=?,quiet_checked_until=? WHERE id=? AND route_context=?').bind(holds.length?Math.max(...holds):null,checkedUntil,row.id,row.route_context);
 }));
 await env.DB.batch([
  env.DB.prepare(`UPDATE notification_jobs AS j SET state='rejected',finished_at=?,code=CASE WHEN EXISTS(SELECT 1 FROM alert_drills a WHERE a.delivery_id=j.id AND a.expires_at<=?) THEN 'drill_expired' ELSE 'route_recipient_ineligible' END
   WHERE j.state='queued' AND NOT ${routeDrillAuthorityReady('j',String(now))}
   AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=j.id AND d.state<>'queued')`).bind(now,now),
  env.DB.prepare(`UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace='uptime-notifications' AND state='queued'
   AND id IN(SELECT id FROM notification_jobs WHERE state='rejected' AND code IN ('drill_expired','route_recipient_ineligible'))`).bind(now),
 ]);
}
export async function routeDrillHistory(env:Bindings,monitorId:string,{readOnly=false}={}){
 if(!readOnly)await refreshRouteDrillQuiet(env);
 const receipts=(await env.DB.prepare("SELECT id,drill,changed_at FROM alert_route_changes WHERE scope_kind='monitor' AND scope_value=? AND drill IS NOT NULL ORDER BY changed_at DESC,rowid DESC LIMIT 30").bind(monitorId).all<any>()).results;
 const rows=(await env.DB.prepare(`SELECT a.*,j.state job_state,j.code,COALESCE(d.state,j.state) delivery_state,
  (SELECT outcome FROM integration_attempts t WHERE t.namespace='uptime-notifications' AND t.delivery_id=j.id ORDER BY number DESC LIMIT 1) outcome
  FROM alert_drills a JOIN notification_jobs j ON j.id=a.delivery_id LEFT JOIN integration_deliveries d ON d.namespace='uptime-notifications' AND d.id=j.id
  WHERE json_extract(a.route_context,'$.monitorId')=?`).bind(monitorId).all<any>()).results;
 return receipts.map(receipt=>{
  const drill=JSON.parse(receipt.drill);
  return {id:receipt.id,startedAt:receipt.changed_at,...drill,recipients:drill.recipients.map((recipient:any)=>{
   const row=rows.find(r=>JSON.parse(r.route_context).routeDrillId===receipt.id&&r.destination_id===recipient.id);
   if(!row)return recipient;
   const state=row.job_state==='queued'?row.delivery_state:row.job_state;
   return {...recipient,drillId:row.id,deliveryId:row.delivery_id,state,code:row.outcome?JSON.parse(row.outcome).code:row.code,
    quietUntil:state==='queued'?row.quiet_until:null,confirmedAt:row.confirmed_at,expiresAt:row.expires_at};
  })};
 });
}
