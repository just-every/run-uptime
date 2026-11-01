import type {Bindings} from '../domain/control.server.ts'
import type {Context} from './authority.server.ts'
import {authority,evidenceAuthority,visibleIds,unavailable} from './authority.server.ts'
import {monitoringMonitor} from '../domain/read-api/monitors.server.ts'
import {monitorReport} from '../domain/reports/index.server.ts'
import {get,revisions,sha} from '../domain/control.server.ts'
import {incidentDetail} from '../domain/incident-work/read.server.ts'
import {findIncident} from '../domain/incident-work/common.server.ts'
import {evidenceSelection} from '../domain/failure-evidence-access.server.ts'
import {readAlertRoute} from '../domain/alert-routes.server.ts'
import {destinations} from '../domain/notification-destinations.server.ts'
import {effectGrants} from '../domain/effect-grants.server.ts'
// Agent projections use allowlisted native metadata. Request definitions,
// target bodies, headers, signing material and provider endpoint URLs never
// enter ordinary reads. Protected snapshots use the separate evidence grant.
export function definitionView(d:any){
 return Object.fromEntries(['name','type','enabled','intervalMs','timeoutMs','retries','probes','failureQuorum','confirmSlots','recoverSlots','freshnessMs','maintenanceUntil','maintenanceWindows','service','group','tags','outcome','dependencies'].filter(key=>Object.hasOwn(d,key)).map(key=>[key,d[key]]))
}
export async function monitorRead(env:Bindings,ctx:Context,id:string){
 await authority(env,ctx,'read',[id]);const row=await monitoringMonitor(env,id);if(!row)throw unavailable()
 const native=await get(env,id);const source=await env.DB.prepare('SELECT principal FROM uptime_agent_revisions WHERE monitor_id=? AND revision=?').bind(id,row.revision).first<{principal:string}>();return {...row,definition:definitionView(native!.definition),...(source?{preparedBy:JSON.parse(source.principal).attribution}: {})}
}
export async function monitorList(env:Bindings,ctx:Context){const ids=await visibleIds(env,ctx);return {items:await Promise.all(ids.map(id=>monitorRead(env,ctx,id)))}}
export async function historyRead(env:Bindings,ctx:Context,id:string){
 await authority(env,ctx,'read',[id])
 const rows=await env.DB.prepare(`SELECT s.id,s.revision,s.due_at,s.manual,s.status,o.probe,o.attempt,o.evidence FROM slots s LEFT JOIN observations o ON o.slot_id=s.id WHERE s.monitor_id=? ORDER BY s.due_at DESC,s.id,o.probe,o.attempt LIMIT 200`).bind(id).all<any>()
 return {id,items:rows.results.map(({evidence,...row})=>{const e=evidence?JSON.parse(evidence):null;return {...row,observation:e?Object.fromEntries(['id','probe','attempt','startedAt','completedAt','durationMs','outcome','finishedAt','classification','ok','status','elapsedMs','reason','verdict'].filter(k=>Object.hasOwn(e,k)).map(k=>[k,e[k]])):null}})}
}
export async function revisionRead(env:Bindings,ctx:Context,id:string){await authority(env,ctx,'read',[id]);return {id,items:(await revisions(env,id)).map((row:any)=>({revision:row.revision,start:row.start,definition:definitionView(row.definition)}))}}
export async function incidentRead(env:Bindings,ctx:Context,id:string){
 const incident=await findIncident(env,id).catch(()=>{throw unavailable()});const access=await authority(env,ctx,'read',[incident.monitor_id]);
 const read=await incidentDetail({...env,...(access.kind==='credential'?{readCredential:access}:{})},id,access)
 // The coordination projection retains narratives as untrusted text, while
 // private snapshots and provider payloads remain under their own grant.
 return {id:read.id,monitorId:read.monitorId,version:read.version,status:read.status,machineState:read.machineState,startedAt:read.startedAt,endedAt:read.endedAt,owner:read.owner,acknowledgedAt:read.acknowledgedAt,stopReason:read.stopReason,nextDue:read.nextDue,nextDueKind:read.nextDueKind,comments:read.comments.map(({history,...comment}:any)=>comment),timeline:read.timeline.filter((row:any)=>!['sibling_handoff','notification_outcome'].includes(row.kind)).map((row:any)=>({id:row.id,at:row.at,actor:row.actor,kind:row.kind,data:Object.fromEntries(['preparedBy','approvers','version','ownerId','channel','revision'].filter(key=>Object.hasOwn(row.data,key)).map(key=>[key,row.data[key]]))}))}
}
export async function reportRead(env:Bindings,ctx:Context,id:string,params:any={}){await authority(env,ctx,'read',[id]);const report=await monitorReport(env,id,new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)])));if(!report)throw unavailable();return report}
export async function evidenceRead(env:Bindings,ctx:Context,id:string){await evidenceAuthority(env,ctx,id);return evidenceSelection(env,id)}
export async function routeRead(env:Bindings,ctx:Context,id:string){await authority(env,ctx,'settings_write',[id],undefined,true);return readAlertRoute(env,id,{readOnly:true})}
export async function destinationRead(env:Bindings,ctx:Context,id:string){await authority(env,ctx,'secret_write',[],undefined,true);const found=(await destinations(env,{readOnly:true})).find(row=>row.id===id);if(!found)throw unavailable();return {id:found.id,name:found.name,kind:found.kind,enabled:found.enabled,credentialsAvailable:found.credentialsAvailable,credentialError:found.credentialError}}
export async function grantsRead(env:Bindings,ctx:Context,id:string){await authority(env,ctx,'secret_write',[id],undefined,true);const [effects,evidence]=await Promise.all([effectGrants(env,id),env.DB.prepare('SELECT operator_id,granted_at FROM failure_evidence_grants WHERE monitor_id=? ORDER BY operator_id').bind(id).all()]);return {id,effects:effects.grants,evidence:evidence.results}}
export async function witnessRead(env:Bindings,ctx:Context){
 const access=await authority(env,ctx),ids=await visibleIds(env,ctx),selection=JSON.stringify(ids),workspace=access.kind!=='credential'&&!access.scopes.length&&['owner','admin'].includes(access.role)
 const result:Record<string,unknown>={}
 for(const [name,sql] of [
  ['monitors','SELECT id,revision,definition,next_due,state FROM monitors WHERE id IN(SELECT value FROM json_each(?)) ORDER BY id'],
  ['revisions','SELECT monitor_id,revision,definition FROM revisions WHERE monitor_id IN(SELECT value FROM json_each(?)) ORDER BY monitor_id,revision'],
  ['incidents','SELECT * FROM incident_work WHERE monitor_id IN(SELECT value FROM json_each(?)) ORDER BY incident_id'],
  ['comments','SELECT * FROM incident_comments WHERE monitor_id IN(SELECT value FROM json_each(?)) ORDER BY id'],
  ['routes','SELECT * FROM alert_routes WHERE scope_value IN(SELECT value FROM json_each(?)) ORDER BY scope_kind,scope_value'],
  ['evidenceGrants','SELECT monitor_id,operator_id,granted_at FROM failure_evidence_grants WHERE monitor_id IN(SELECT value FROM json_each(?)) ORDER BY monitor_id,operator_id'],
  ['effectGrants','SELECT * FROM effect_grants WHERE monitor_id IN(SELECT value FROM json_each(?)) ORDER BY id'],
  ['outbox','SELECT id,status,event FROM outbox WHERE monitor_id IN(SELECT value FROM json_each(?)) ORDER BY id'],
 ] as const){const rows=(await env.DB.prepare(sql).bind(selection).all<any>()).results;result[name]={count:rows.length,sha256:await sha(JSON.stringify(rows))}}
 if(workspace)for(const [name,sql] of [
  ['destinations','SELECT id,name,kind,enabled,credential_id,deleted_at FROM notification_destinations ORDER BY id'],
  ['notifications','SELECT id,destination_id,credential_id,event_id,state,code,attempts FROM notification_jobs ORDER BY id'],
  ['discoveries','SELECT id,status,result,error,initiator_id,runner_id FROM discovery_jobs ORDER BY id'],
  ['members','SELECT operator_id,role,base_role,base_version,revision FROM uptime_member_roles ORDER BY operator_id'],
  ['scopes','SELECT operator_id,kind,value FROM uptime_member_scopes ORDER BY operator_id,kind,value'],
  ['definitionBatches','SELECT id,counts,undone_at FROM definition_batches ORDER BY id'],
 ] as const){const rows=(await env.DB.prepare(sql).all<any>()).results;result[name]={count:rows.length,sha256:await sha(JSON.stringify(rows))}}
 return result
}
export async function discoveryRead(env:Bindings,ctx:Context,id:string){
 await authority(env,ctx,'discovery_write',[],undefined,true)
 const row=await env.DB.prepare('SELECT id,url,status,network_label,result,error,stopped_at,stop_reason FROM discovery_jobs WHERE id=?').bind(id).first<any>();if(!row)throw unavailable()
 return {id:row.id,url:row.url,status:row.status,networkLabel:row.network_label,result:row.result?JSON.parse(row.result):null,error:row.error,stoppedAt:row.stopped_at,stopReason:row.stop_reason}
}
export async function batchRead(env:Bindings,ctx:Context,id:string){
 await authority(env,ctx,'import',[],undefined,true)
 const {listBatches}=await import('../domain/definitions/index.server.ts');const row=(await listBatches(env)).find(row=>row.id===id);if(!row)throw unavailable();return row
}
