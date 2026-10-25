import type {Bindings} from '../control.server.ts'
import {mutationGuard} from '../audit.server.ts'
import {ReportInputError,reportPeriod} from './period.ts'
import {recurrenceZone,nextReportOccurrence} from './recurrence.ts'
import {scheduleReport,readScheduledReport} from './schedules.server.ts'
import {monitorReport} from './index.server.ts'
import {serviceReport} from './service.server.ts'

// Fixed aliases r/o/p/d; request input never becomes SQL.
const authority=`EXISTS(SELECT 1 FROM oa_operators o JOIN uptime_member_roles p ON p.operator_id=o.id WHERE o.id=r.actor_id AND o.status='active' AND o.role='owner' AND o.version=r.actor_version AND p.base_version=o.version AND p.base_role=o.role AND p.role='owner' AND p.revision=r.role_revision AND NOT EXISTS(SELECT 1 FROM uptime_member_scopes s WHERE s.operator_id=o.id))`
const destination=`EXISTS(SELECT 1 FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=r.destination_id AND d.enabled=1 AND d.deleted_at IS NULL AND d.credential_id=r.credential_id AND c.retired_at IS NULL AND c.unavailable_at IS NULL)`
export function reportDeliveryReady(job='j'){
 return `NOT EXISTS(SELECT 1 FROM scheduled_reports sr WHERE sr.delivery_id=${job}.id AND (NOT EXISTS(SELECT 1 FROM oa_operators o JOIN uptime_member_roles p ON p.operator_id=o.id WHERE o.id=sr.actor_id AND o.status='active' AND o.role='owner' AND p.role='owner' AND p.base_role=o.role AND p.base_version=o.version AND NOT EXISTS(SELECT 1 FROM uptime_member_scopes s WHERE s.operator_id=o.id)) OR EXISTS(SELECT 1 FROM report_occurrences ro JOIN report_recurrences r ON r.id=ro.recurrence_id WHERE ro.report_id=sr.id AND (r.stopped_at IS NOT NULL OR NOT ${authority} OR NOT ${destination}))))`
}
export function previewReportRecurrence(input:any){
 const rule=input?.recurrence
 if(!input||Object.keys(input).some(key=>!['dueAt','recurrence'].includes(key))||!Number.isSafeInteger(input.dueAt)||input.dueAt<0||input.dueAt>Date.UTC(2100,0,1)||!rule||Object.keys(rule).some(key=>!['frequency','timeZone'].includes(key))||!['daily','weekly','monthly'].includes(rule.frequency))throw new ReportInputError('Choose a first calendar instant, an IANA zone and daily, weekly or monthly')
 const zone=recurrenceZone(rule.timeZone),times=[input.dueAt]
 for(let i=0;i<3;i++)times.push(nextReportOccurrence(input.dueAt,rule.frequency,zone,times.at(-1)!))
 return {frequency:rule.frequency,timeZone:zone,policy:'skip-gap-first-repeat-clamp-month-end',times}
}
export async function createRecurringReport(env:Bindings,monitorId:string,input:any,actorId:string){
 const rule=input?.recurrence,now=Date.now()
 if(!input||Object.keys(input).some(key=>!['dueAt','destinationId','period','recurrence','service'].includes(key))||!rule||Object.keys(rule).some(key=>!['frequency','timeZone'].includes(key))||!['daily','weekly','monthly'].includes(rule.frequency)||!Number.isSafeInteger(input.dueAt)||input.dueAt<=now||input.dueAt>now+31*86400000||!input.period||typeof input.period!=='object'||Array.isArray(input.period)||Object.entries(input.period).some(([key,value])=>!['period','timeZone','sla','slaTarget','bucket','location','rootCause'].includes(key)||typeof value!=='string'))throw new ReportInputError('Choose daily, weekly or monthly, a named report period and a first occurrence within 31 days')
 const zone=recurrenceZone(rule.timeZone),period={...input.period,timeZone:zone};reportPeriod(new URLSearchParams(period),now)
 const monitor=await monitorReport(env,monitorId,new URLSearchParams(period));if(!monitor)throw Object.assign(Error('Monitor not found'),{status:404})
 if(input.service!==undefined&&(!input.service||typeof input.service!=='string'||input.service.length>100||!await env.DB.prepare("SELECT 1 FROM monitors WHERE id=? AND json_extract(definition,'$.service')=?").bind(monitorId,input.service).first()))throw new ReportInputError('Choose the selected monitor’s current service')
 if(input.service)await serviceReport(env,input.service,new URLSearchParams(period))
 const owner=await env.DB.prepare("SELECT o.version,p.revision FROM oa_operators o JOIN uptime_member_roles p ON p.operator_id=o.id WHERE o.id=? AND o.role='owner' AND o.status='active' AND p.role='owner' AND p.base_version=o.version AND p.base_role=o.role AND NOT EXISTS(SELECT 1 FROM uptime_member_scopes s WHERE s.operator_id=o.id)").bind(actorId).first<{version:number;revision:number}>()
 const recipient=await env.DB.prepare("SELECT d.credential_id FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=? AND d.kind IN ('email','slack') AND d.enabled=1 AND d.deleted_at IS NULL AND c.retired_at IS NULL AND c.unavailable_at IS NULL").bind(input.destinationId).first<{credential_id:string}>()
 if(!owner||!recipient)throw new ReportInputError('An active workspace owner and enabled email or Slack destination are required')
 const id=crypto.randomUUID()
 await env.DB.batch([mutationGuard(env,'(SELECT COUNT(*) FROM report_recurrences)<1000'),env.DB.prepare(`INSERT INTO report_recurrences(id,monitor_id,service,destination_id,credential_id,actor_id,actor_version,role_revision,frequency,time_zone,anchor_at,next_at,period,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,monitorId,input.service??null,input.destinationId,recipient.credential_id,actorId,owner.version,owner.revision,rule.frequency,zone,input.dueAt,input.dueAt,JSON.stringify(period),now)])
 return readRecurringReport(env,monitorId,id)
}
export async function readRecurringReport(env:Bindings,monitorId:string,id?:string){
 const rows=(await env.DB.prepare(`SELECT report_recurrences.*,(SELECT display_name FROM oa_operators WHERE id=report_recurrences.actor_id) AS owner_name FROM report_recurrences WHERE monitor_id=?${id?' AND id=?':''} ORDER BY created_at DESC,id LIMIT 100`).bind(monitorId,...(id?[id]:[])).all<any>()).results,result=[]
 for(const row of rows){const runs=id?(await env.DB.prepare('SELECT due_at,report_id FROM report_occurrences WHERE recurrence_id=? ORDER BY due_at DESC LIMIT 10').bind(row.id).all<{due_at:number;report_id:string}>()).results:[];result.push({id:row.id,kind:'recurring',monitorId:row.monitor_id,service:row.service,destinationId:row.destination_id,ownerId:row.actor_id,ownerName:row.owner_name??'Former member',frequency:row.frequency,timeZone:row.time_zone,anchorAt:row.anchor_at,nextDueAt:row.stopped_at?null:row.next_at,followingAt:row.stopped_at?null:nextReportOccurrence(row.anchor_at,row.frequency,row.time_zone,row.next_at),period:JSON.parse(row.period),createdAt:row.created_at,state:row.stopped_at?'stopped':'active',code:row.stop_reason,stoppedAt:row.stopped_at,runs:await Promise.all(runs.map(async run=>({dueAt:run.due_at,reportId:run.report_id,...await readScheduledReport(env,monitorId,run.report_id)})))})}
 return id?result[0]??null:result
}
export async function stopRevokedReports(env:Bindings){
 const now=Date.now()
 await env.DB.batch([
  env.DB.prepare(`UPDATE report_recurrences AS r SET stopped_at=?,stop_reason=CASE WHEN NOT ${authority} THEN 'report_initiator_revoked' ELSE 'report_destination_revoked' END WHERE stopped_at IS NULL AND (NOT ${authority} OR NOT ${destination})`).bind(now),
  env.DB.prepare(`UPDATE notification_jobs AS j SET state='rejected',code=COALESCE((SELECT r.stop_reason FROM report_occurrences ro JOIN report_recurrences r ON r.id=ro.recurrence_id WHERE ro.report_id IN(SELECT id FROM scheduled_reports WHERE delivery_id=j.id)),'report_initiator_revoked'),finished_at=? WHERE state='queued' AND NOT ${reportDeliveryReady()} AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=j.id AND (d.state<>'queued' OR d.attempts>0))`).bind(now),
  env.DB.prepare("UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace='uptime-notifications' AND state='queued' AND attempts=0 AND id IN(SELECT id FROM notification_jobs WHERE code IN ('report_cancelled','report_initiator_revoked','report_destination_revoked'))").bind(now),
 ])
}
export async function cancelRecurringReport(env:Bindings,monitorId:string,id:string){
 await env.DB.prepare("UPDATE report_recurrences SET stopped_at=COALESCE(stopped_at,?),stop_reason=COALESCE(stop_reason,'report_cancelled') WHERE id=? AND monitor_id=?").bind(Date.now(),id,monitorId).run();await stopRevokedReports(env);return readRecurringReport(env,monitorId,id)
}
export async function advanceRecurringReports(env:Bindings){
 await stopRevokedReports(env)
 const now=Date.now(),rows=(await env.DB.prepare('SELECT * FROM report_recurrences WHERE stopped_at IS NULL AND next_at<=? ORDER BY next_at,id LIMIT 100').bind(now).all<any>()).results
 for(const row of rows){
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`recurring:${row.id}:${row.next_at}`)));digest[6]=(digest[6]&15)|80;digest[8]=(digest[8]&63)|128;const hex=[...digest.slice(0,16)].map(n=>n.toString(16).padStart(2,'0')).join('');const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`,next=nextReportOccurrence(row.anchor_at,row.frequency,row.time_zone,Math.max(now,row.next_at)),guard=`EXISTS(SELECT 1 FROM report_recurrences r WHERE r.id=? AND r.next_at=? AND r.stopped_at IS NULL AND ${authority} AND ${destination})`
  try{await scheduleReport(env,row.monitor_id,{dueAt:row.next_at,destinationId:row.destination_id,period:JSON.parse(row.period),...(row.service?{service:row.service}:{})},row.actor_id,{id,snapshotAt:row.next_at,guard:{sql:guard,params:[row.id,row.next_at]},tail:[env.DB.prepare('INSERT INTO report_occurrences(recurrence_id,due_at,report_id) VALUES(?,?,?)').bind(row.id,row.next_at,id),env.DB.prepare('UPDATE report_recurrences SET next_at=? WHERE id=? AND next_at=?').bind(next,row.id,row.next_at)]})}
  catch(error){if(await env.DB.prepare('SELECT 1 FROM report_occurrences WHERE recurrence_id=? AND due_at=?').bind(row.id,row.next_at).first())continue;throw error}
 }
}
