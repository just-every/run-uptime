import {createRecurringReport,readRecurringReport,cancelRecurringReport} from './recurring.server.ts'
import {serviceReport} from './service.server.ts'
import {mutationGuard} from '../audit.server.ts'
import type {Bindings} from '../control.server.ts'
import {monitorReport} from './index.server.ts'
import {ensureNotificationCustody,readCredential} from '../notification-credentials.server.ts'
import type {NotificationEvent} from '../notification-content.ts'

export const scheduledReportColumns=['id','monitor_id','destination_id','actor_id','due_at','created_at','delivery_id','report']
const fail=(message:string,status=400)=>Object.assign(Error(message),{status})
export async function scheduleReport(env:Bindings,monitorId:string,input:any,actorId:string,options:{id?:string;snapshotAt?:number;guard?:{sql:string;params:any[]};tail?:D1PreparedStatement[]}={}){
 if(input?.recurrence)return createRecurringReport(env,monitorId,input,actorId)
 if(!input||Object.keys(input).some(key=>!['dueAt','destinationId','period','service'].includes(key))||!Number.isSafeInteger(input.dueAt)||(options.snapshotAt===undefined&&input.dueAt<Date.now())||input.dueAt>Date.now()+31*86400000||typeof input.destinationId!=='string'||!input.period||typeof input.period!=='object'||Array.isArray(input.period))throw fail('Choose a destination, a report period and a time within the next 31 days')
 if(Object.entries(input.period).some(([key,value])=>!['period','from','to','timeZone','zone','sla','slaTarget','bucket','location','rootCause'].includes(key)||typeof value!=='string'))throw fail('Invalid report period')
 await ensureNotificationCustody(env)
 const destination=await env.DB.prepare("SELECT d.*,c.id AS credential_record_id,c.destination_id AS credential_destination_id,c.created_at AS credential_created_at,c.endpoint,c.signing_secret,c.ciphertext,c.retired_at,c.unavailable_at FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=? AND d.enabled=1 AND d.deleted_at IS NULL AND d.kind IN ('email','slack')").bind(input.destinationId).first<any>()
 if(!destination)throw fail('Choose an enabled email or Slack destination')
 await readCredential(env,{...destination,id:destination.credential_record_id,destination_id:destination.credential_destination_id,created_at:destination.credential_created_at})
 const base=await monitorReport(env,monitorId,new URLSearchParams(input.period),options.snapshotAt??Date.now());
 if(input.service!==undefined&&(typeof input.service!=='string'||!input.service||input.service.length>100||!await env.DB.prepare("SELECT 1 FROM monitors WHERE id=? AND json_extract(definition,'$.service')=?").bind(monitorId,input.service).first()))throw fail('Choose the selected monitor’s current service')
 const aggregate=input.service?await serviceReport(env,input.service,new URLSearchParams(input.period),options.snapshotAt??Date.now()):null;
 if(input.service&&!aggregate)throw fail('Service not found',404)
 const report=base&&aggregate?{...aggregate,monitor:base.monitor}:base;if(!report)throw fail('Monitor not found',404)
 const now=Date.now(),id=options.id??crypto.randomUUID(),eventId=`report:${id}`,deliveryId=`${eventId}:${destination.id}`
 const event:NotificationEvent={schemaVersion:2,id:eventId,kind:'report',eventType:'uptime.report.scheduled',incidentKey:null,state:'report',title:`Scheduled report: ${report.monitor.name}`,monitorId,monitorRevision:report.monitor.revision,monitorName:report.monitor.name,url:'',slotId:null,observedAt:now,visibility:'private',evidenceRef:`/api/monitors/${encodeURIComponent(monitorId)}/report-schedules/${id}`,explanation:JSON.stringify({period:report.period,availability:report.availability,sla:report.sla,...('latency' in report?{latency:report.latency.statistics}:{service:report.service.name,monitorCount:report.members.length}),incidents:report.incidentSummary}),probes:[],consoleUrl:env.UPTIME_ORIGIN??''}
 if(event.explanation.length>4096||new TextEncoder().encode(JSON.stringify(report)).byteLength>524288)throw fail('Report exceeds the scheduled snapshot bound; choose a shorter period')
 // Snapshot, due condition and the ordinary transport job commit together. There
 // is no separate scheduler handover that a restart could perform twice.
 await env.DB.batch([
  ...(options.guard?[mutationGuard(env,options.guard.sql,options.guard.params)]:[]),
  mutationGuard(env,"EXISTS(SELECT 1 FROM monitors WHERE id=?) AND EXISTS(SELECT 1 FROM notification_destinations WHERE id=? AND credential_id=? AND enabled=1 AND deleted_at IS NULL) AND (SELECT COUNT(*) FROM scheduled_reports)<1000",[monitorId,destination.id,destination.credential_id]),
  env.DB.prepare(`INSERT INTO scheduled_reports(id,monitor_id,destination_id,actor_id,due_at,created_at,delivery_id,report) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM scheduled_reports)<1000`).bind(id,monitorId,destination.id,actorId,input.dueAt,now,deliveryId,JSON.stringify(report)),
  env.DB.prepare(`INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at) SELECT ?,?,d.id,d.name,d.kind,d.credential_id,?,? FROM notification_destinations d WHERE d.id=? AND d.credential_id=? AND d.enabled=1 AND d.deleted_at IS NULL AND EXISTS(SELECT 1 FROM scheduled_reports WHERE id=?)`).bind(deliveryId,eventId,JSON.stringify(event),now,destination.id,destination.credential_id,id),
  ...(options.tail??[]),
 ])
 const saved=await readScheduledReport(env,monitorId,id);if(!saved)throw fail('Scheduled report limit reached',409);return saved
}
export async function readScheduledReport(env:Bindings,monitorId:string,id?:string):Promise<any>{
 if(id){const recurring=await readRecurringReport(env,monitorId,id);if(recurring)return recurring}
 const rows=(await env.DB.prepare(`SELECT s.id,s.monitor_id,s.destination_id,s.actor_id,s.due_at,s.created_at,s.delivery_id,json_extract(s.report,'$.period.timeZone') AS time_zone,json_extract(s.report,'$.service.name') AS service,${id?'s.report,':''}j.state,j.code,COALESCE(d.attempts,j.attempts) AS attempts,COALESCE(j.finished_at,(SELECT MAX(a.finished_at) FROM integration_attempts a WHERE a.namespace='uptime-notifications' AND a.delivery_id=j.id)) AS finished_at,d.state AS transport_state,(SELECT a.outcome FROM integration_attempts a WHERE a.namespace='uptime-notifications' AND a.delivery_id=j.id AND a.outcome IS NOT NULL ORDER BY a.number DESC LIMIT 1) AS transport_outcome FROM scheduled_reports s JOIN notification_jobs j ON j.id=s.delivery_id LEFT JOIN integration_deliveries d ON d.namespace='uptime-notifications' AND d.id=j.id WHERE s.monitor_id=?${id?' AND s.id=?':''} ORDER BY s.created_at DESC,s.id LIMIT 100`).bind(monitorId,...(id?[id]:[])).all<any>()).results
 const result=rows.map(row=>({id:row.id,monitorId:row.monitor_id,destinationId:row.destination_id,ownerId:row.actor_id,timeZone:row.time_zone,service:row.service,dueAt:row.due_at,createdAt:row.created_at,deliveryId:row.delivery_id,state:row.state==='queued'?row.transport_state??row.state:row.state,code:row.transport_outcome?JSON.parse(row.transport_outcome).code:row.code,outcome:row.transport_outcome?((value:any)=>({kind:value.kind,code:value.code,...(value.status===undefined?{}:{status:value.status})}))(JSON.parse(row.transport_outcome)):null,attempts:row.attempts,finishedAt:row.finished_at,...(id?{report:JSON.parse(row.report)}:{})}))
 return id?result[0]??null:[...await readRecurringReport(env,monitorId) as any[],...result]
}

// Cancellation withdraws queued work atomically with its ordinary transport.
// Once handed to a provider, the retained outcome cannot be recalled.
export async function cancelScheduledReport(env:Bindings,monitorId:string,id:string){
 const recurring=await readRecurringReport(env,monitorId,id);if(recurring)return cancelRecurringReport(env,monitorId,id)
 const saved=await readScheduledReport(env,monitorId,id);if(!saved||Array.isArray(saved))throw fail('Report not found',404)
 const now=Date.now()
 await env.DB.batch([
  env.DB.prepare("UPDATE notification_jobs SET state='rejected',code='report_cancelled',finished_at=? WHERE id=? AND state='queued' AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=notification_jobs.id AND (d.state<>'queued' OR d.attempts>0))").bind(now,saved.deliveryId),
  env.DB.prepare("UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace='uptime-notifications' AND id=? AND state='queued' AND EXISTS(SELECT 1 FROM notification_jobs j WHERE j.id=integration_deliveries.id AND j.code='report_cancelled')").bind(now,saved.deliveryId),
 ])
 const result=await readScheduledReport(env,monitorId,id)
 if(!result||Array.isArray(result)||result.code!=='report_cancelled')throw fail('Report delivery has already started; its outcome is retained',409)
 return result
}
