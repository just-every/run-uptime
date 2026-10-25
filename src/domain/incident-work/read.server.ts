import type {Access} from '../access.server.ts'
import {assignmentMembers} from './ownership.server.ts'
import {readSettings} from './settings.server.ts'
import {incidentSnapshots} from '../failure-snapshots.server.ts'
import {nextContactFollowupDetail} from '../contact-scheduler.server.ts'
import type {Bindings} from '../control.server.ts'
import {findIncident,defaultOwner} from './common.server.ts'
import {dependencyContext} from './dependencies.server.ts'
export async function incidentDetail(env:Bindings,id:string,access?:Pick<Access,'role'|'scopes'>){
 const incident=await findIncident(env,id)
 const [work,comments,histories,entries,operators,jobs,attempts,resolutions,fallbackOwner]=await Promise.all([
  env.DB.prepare('SELECT * FROM incident_work WHERE incident_id=?').bind(id).first<any>(),
  env.DB.prepare('SELECT * FROM incident_comments WHERE incident_id=? ORDER BY created_at,id').bind(id).all<any>(),
  env.DB.prepare('SELECT * FROM incident_comment_history WHERE incident_id=? ORDER BY version,id').bind(id).all<any>(),
  env.DB.prepare('SELECT * FROM incident_timeline WHERE incident_id=? ORDER BY occurred_at,id').bind(id).all<any>(),
  env.DB.prepare('SELECT id,display_name FROM oa_operators').all<{id:string;display_name:string}>(),
  env.DB.prepare(`SELECT j.id,j.kind,j.destination_id,j.destination_name,j.created_at,j.finished_at,j.state,j.code,j.attempts,
   d.state AS delivery_state FROM notification_jobs j LEFT JOIN integration_deliveries d ON d.namespace='uptime-notifications' AND d.id=j.id
   WHERE json_extract(j.event,'$.monitorId')=? AND json_extract(j.event,'$.incidentKey')=? ORDER BY j.created_at,j.id`).bind(incident.monitor_id,incident.trigger.incidentKey).all<any>(),
  env.DB.prepare(`SELECT a.* FROM integration_attempts a JOIN notification_jobs j ON j.id=a.delivery_id WHERE a.namespace='uptime-notifications'
   AND json_extract(j.event,'$.monitorId')=? AND json_extract(j.event,'$.incidentKey')=? ORDER BY a.started_at,a.id`).bind(incident.monitor_id,incident.trigger.incidentKey).all<any>(),
  env.DB.prepare(`SELECT a.* FROM integration_resolutions a JOIN notification_jobs j ON j.id=a.delivery_id WHERE a.namespace='uptime-notifications'
   AND json_extract(j.event,'$.monitorId')=? AND json_extract(j.event,'$.incidentKey')=? ORDER BY a.at,a.id`).bind(incident.monitor_id,incident.trigger.incidentKey).all<any>(),
  defaultOwner(env)
 ])
 const dependencies=await dependencyContext(env,incident,Date.now(),access?.scopes??[])
 const mentions=(await env.DB.prepare('SELECT * FROM incident_mentions WHERE incident_id=? ORDER BY created_at,id').bind(id).all<any>()).results
 const followup=incident.recovery?null:await nextContactFollowupDetail(env,id)
 const nextDue=followup?.due??null
 const people=new Map(operators.results.map(row=>[row.id,row.display_name]))
 const person=(id:string|null)=>({id:id&&people.has(id)?id:null,displayName:id&&people.has(id)?people.get(id)!:'Former member'})
 const feature=(displayName:string)=>({id:null,displayName,kind:'feature'})
 const timeline:any[]=[{id:`machine:${id}`,at:incident.trigger.observedAt,actor:feature('Scheduler'),kind:'confirmation',data:{cause:incident.trigger.explanation,eventId:id}}]
 if(incident.recovery)timeline.push({id:`machine:${incident.recovery.id}`,at:incident.recovery.observedAt,actor:feature('Scheduler'),kind:'recovery',data:{cause:incident.recovery.explanation,eventId:incident.recovery.id}})
 for(const entry of entries.results){const data=JSON.parse(entry.data);if((access?.scopes.length||env.readCredential)&&entry.kind==='dependency_acknowledged'&&![...dependencies.linked,...dependencies.coincident].some(notice=>notice.noticeId===data.noticeId))continue;if(entry.kind==='owner_assigned')data.owner=data.ownerId?person(data.ownerId):null;timeline.push({id:entry.id,at:entry.occurred_at,actor:{...person(entry.actor_id),kind:'member'},kind:entry.kind,data})}
 for(const job of jobs.results){timeline.push({id:`notification:${job.id}`,at:job.created_at,actor:feature('Router'),kind:'notification_queued',data:{deliveryId:job.id,channel:job.kind,destinationName:job.destination_name}})
  // Email has a single durable job outcome rather than integration_attempts.
  if(job.finished_at&&!attempts.results.some(attempt=>attempt.delivery_id===job.id))timeline.push({id:`notification-outcome:${job.id}`,at:job.finished_at,actor:feature('Router'),kind:'notification_outcome',data:{deliveryId:job.id,outcome:job.state,code:job.code,attempts:job.attempts}})
 }
 for(const attempt of attempts.results){timeline.push({id:`attempt:${attempt.id}`,at:attempt.started_at,actor:feature('Router'),kind:'notification_attempt',data:{deliveryId:attempt.delivery_id,number:attempt.number}});if(attempt.finished_at!==null)timeline.push({id:`outcome:${attempt.id}`,at:attempt.finished_at,actor:feature('Router'),kind:'notification_outcome',data:{deliveryId:attempt.delivery_id,number:attempt.number,outcome:attempt.outcome?JSON.parse(attempt.outcome):null}})}
 for(const resolution of resolutions.results)timeline.push({id:`delivery-resolution:${resolution.id}`,at:resolution.at,actor:feature('Router'),kind:'delivery_resolution',data:{deliveryId:resolution.delivery_id,outcome:JSON.parse(resolution.outcome)}})
 timeline.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))
 return {id,key:incident.trigger.incidentKey,monitorId:incident.monitor_id,startedAt:incident.trigger.observedAt,endedAt:incident.recovery?.observedAt??null,
  machineState:incident.recovery?'recovered':'open',trigger:incident.trigger,recovery:incident.recovery,imported:incident.status==='imported-inactive',
  version:work?.version??0,owner:work?work.owner_id?person(work.owner_id):null:fallbackOwner,
  status:incident.recovery?'resolved':work?.status??'open',stopReason:incident.recovery?'recovery':work?.stop_reason??null,
  acknowledgedAt:work?.acknowledged_at??null,resolvedAt:incident.recovery?.observedAt??work?.resolved_at??null,nextDue,nextDueKind:followup?.kind??null,
  nextDueReason:followup?followup.kind==='reminder'?'Next scheduled reminder':'Next scheduled contact notification':'No automatic follow-up scheduled',
  rootCause:{version:work?.root_version??0,categoryId:work?.root_category_id??null,categoryLabel:work?.root_category_label??null,text:work?.root_text??'',updatedAt:work?.root_updated_at??null,editor:work?.root_updated_at?person(work.root_editor_id):null},
  comments:comments.results.map(row=>({id:row.id,text:row.text,version:row.version,author:person(row.author_id),createdAt:row.created_at,updatedAt:row.updated_at,deletedAt:row.deleted_at,
   mentions:mentions.filter(mention=>mention.comment_id===row.id).map(mention=>({id:mention.id,version:mention.comment_version,recipient:person(mention.recipient_id),createdAt:mention.created_at,submittedAt:mention.submitted_at,finishedAt:mention.finished_at,outcome:mention.outcome==='submitting'?'uncertain':mention.outcome})),
   history:histories.results.filter(history=>history.comment_id===row.id).map(history=>({version:history.version,text:history.text,editor:person(history.editor_id),editedAt:history.edited_at}))})),
  rootCauseCategories:(await readSettings(env)).categories,
  failureSnapshots:access&&access.role!=='owner'?[]:await incidentSnapshots(env,id),timeline,deliveries:jobs.results.map(job=>({id:job.id,channel:job.kind,destinationName:job.destination_name,state:job.state==='queued'?job.delivery_state??job.state:job.state,code:job.code,attempts:job.attempts})),
  assignmentMembers:access?.role==='read-only'||env.readCredential?[]:await assignmentMembers(env,incident.monitor_id),
  dependencies,capabilities:{assignment:!env.readCredential&&(!access||access.role!=='read-only'),categoryAdministration:!env.readCredential&&(!access||access.role==='owner'),comments:!access||access.role!=='read-only',mentions:true,publication:false,responderRoles:true,scheduledFollowup:!access||access.role==='owner',dependencyCorrelation:true,failureSnapshots:!access||access.role==='owner'}}
}

export {incidentDetail as readIncidentDetail}
