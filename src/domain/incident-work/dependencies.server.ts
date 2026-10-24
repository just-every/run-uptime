import {credentialMonitorFilter} from '../credentials/model.server.ts'
import {inScope,type Scope} from '../access.server.ts'
import type {Bindings} from '../control.server.ts'
import type {NotificationEvent} from '../notification-content.ts'
import {type Actor,workSeed,timeline} from './common.server.ts'
import {auditStatement} from '../audit.server.ts'
// DEPENDENCY-002 correlation (FOLLOWUP-001): a provider's dependency notice is shown beside an application incident whenever its
// non-operational window overlaps the incident's, across the whole installation. That overlap is provider-stated context and
// never proof of cause. Only a dependency the owner linked (MONITOR-001's `dependencies` field names it on the incident's
// monitor) is grouped: one acknowledgment of the incident then acknowledges that notice, and the other open incidents linked to
// the same provider notice. An unlinked overlap is labelled coincident and never groups acknowledgment.
export interface DependencyNotice{noticeId:string;monitorId:string;provider:string;component:string|null;stated:string;source:string;observedAt:number;recoveredAt:number|null;state:'open'|'recovered';acknowledgedAt:number|null}
async function notices(env:Bindings,exclude:string):Promise<DependencyNotice[]>{
 const rows=await env.DB.prepare(`SELECT o.id,o.monitor_id,o.event,(SELECT r.event FROM outbox r WHERE r.monitor_id=o.monitor_id AND r.kind='dependency_recovery' AND json_extract(r.event,'$.incidentKey')=json_extract(o.event,'$.incidentKey') ORDER BY r.rowid LIMIT 1) AS ended,a.acknowledged_at
  FROM outbox o LEFT JOIN dependency_acks a ON a.notice_id=o.id WHERE o.kind='dependency' AND o.status<>'imported-inactive' AND o.monitor_id<>? ORDER BY o.rowid DESC LIMIT 500`).bind(exclude).all<any>()
 return rows.results.map(row=>{const event=JSON.parse(row.event) as NotificationEvent,end=row.ended?JSON.parse(row.ended) as NotificationEvent:null
  return {noticeId:row.id,monitorId:row.monitor_id,provider:event.dependency!.provider,component:event.dependency!.component,stated:event.dependency!.stated,source:event.dependency!.source,observedAt:event.observedAt,recoveredAt:end?.observedAt??null,state:end?'recovered':'open',acknowledgedAt:row.acknowledged_at??null}})
}
const overlaps=(notice:DependencyNotice,from:number,to:number)=>notice.observedAt<=to&&(notice.recoveredAt??Infinity)>=from
type Found={id:string;monitor_id:string;trigger:NotificationEvent;recovery:NotificationEvent|null}
export async function dependencyContext(env:Bindings,incident:Found,now=Date.now(),scopes:Scope[]=[]){
 const from=incident.trigger.observedAt,to=incident.recovery?.observedAt??now
 const monitor=await env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(incident.monitor_id).first<{definition:string}>()
 const linkedIds=new Set<string>(monitor?(JSON.parse(monitor.definition).dependencies??[]):[])
 const filter=credentialMonitorFilter(env)
 const readable=new Set((await env.DB.prepare(`SELECT id,definition FROM monitors WHERE ${filter.sql}`).bind(...filter.params).all<{id:string;definition:string}>()).results.filter(row=>inScope(JSON.parse(row.definition),scopes)).map(row=>row.id))
 const all=(await notices(env,incident.monitor_id)).filter(notice=>readable.has(notice.monitorId)).filter(notice=>overlaps(notice,from,to))
 const linked=all.filter(notice=>linkedIds.has(notice.monitorId)),coincident=all.filter(notice=>!linkedIds.has(notice.monitorId))
 return {linked,coincident,group:await groupIncidents(env,incident,linked,readable,monitor?JSON.parse(monitor.definition):{})}
}
// Other open incidents whose monitors the owner linked to the same provider notices, still waiting for a response.
async function groupIncidents(env:Bindings,incident:Found,linked:DependencyNotice[],readable:Set<string>,definition:any){
 // Read the latest open incident per monitor in one bounded database call.
 // A shared service can contain every monitor; it must not require one remote
 // D1 query per child merely to read the incident or acknowledge its group.
 const members=(await env.DB.prepare(`WITH open AS (
  SELECT m.id,m.definition,m.rowid AS monitor_order,o.id AS incident_id,o.event,w.status,
   ROW_NUMBER() OVER(PARTITION BY m.id ORDER BY o.rowid DESC) AS rank
  FROM monitors m JOIN outbox o ON o.monitor_id=m.id LEFT JOIN incident_work w ON w.incident_id=o.id
  WHERE m.id<>? AND o.kind='trigger' AND o.status<>'imported-inactive'
   AND NOT EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=o.monitor_id AND r.kind='recovery' AND json_extract(r.event,'$.incidentKey')=json_extract(o.event,'$.incidentKey'))
 ) SELECT * FROM open WHERE rank=1 ORDER BY monitor_order`).bind(incident.monitor_id).all<any>()).results.map(row=>({...row,name:JSON.parse(row.definition).name as string,definition:JSON.parse(row.definition),dependencies:(JSON.parse(row.definition).dependencies??[]) as string[]}))
 const found:{incidentId:string;monitorId:string;monitorName:string;status:string}[]=[]
 for(const member of members){
  if(!readable.has(member.id))continue
  const notice=linked.filter(item=>member.dependencies.includes(item.monitorId));
  const shared=(definition.dependencies??[]).some((id:string)=>member.dependencies.includes(id))||['service','group'].some(key=>typeof definition[key]==='string'&&definition[key].trim()&&definition[key]===member.definition[key]);
  if(!notice.length&&!shared)continue
  const started=(JSON.parse(member.event) as NotificationEvent).observedAt
  // Simultaneous means within the larger of the two confirmation windows.
  // Matching labels/dependencies are owner links, never an inferred common cause.
  const window=Math.max(definition.intervalMs*definition.confirmSlots,member.definition.intervalMs*member.definition.confirmSlots);
  if(notice.some(item=>overlaps(item,started,Date.now()))||shared&&Math.abs(started-incident.trigger.observedAt)<=window)found.push({incidentId:member.incident_id,monitorId:member.id,monitorName:member.name,status:member.status??'open'})
 }
 return found
}
// One acknowledgment of the incident also acknowledges its linked provider notices and the other open incidents in the same group.
export async function groupAcknowledgeStatements(env:Bindings,incident:Found,actor:Actor,now:number){
 const context=await dependencyContext(env,incident,now,actor.access.scopes),statements:D1PreparedStatement[]=[]
 for(const notice of context.linked.filter(item=>item.acknowledgedAt===null))
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO dependency_acks(notice_id,monitor_id,acknowledged_at,actor_id,via_incident_id) VALUES(?,?,?,?,?)').bind(notice.noticeId,notice.monitorId,now,actor.id,incident.id),
   timeline(env,incident.id,incident.monitor_id,actor,'dependency_acknowledged',{noticeId:notice.noticeId},now))
 for(const member of context.group.filter(item=>item.status==='open')){
  const acknowledgedNow="EXISTS(SELECT 1 FROM incident_work WHERE incident_id=? AND status='acknowledged' AND acknowledged_at=?)"
  statements.push(workSeed(env,member.incidentId,member.monitorId,null),
   env.DB.prepare("UPDATE incident_work SET status='acknowledged',acknowledged_at=?,version=version+1 WHERE incident_id=? AND status='open'").bind(now,member.incidentId),
   env.DB.prepare(`INSERT INTO incident_timeline(id,incident_id,monitor_id,occurred_at,actor_id,kind,data) SELECT ?,?,?,?,?,?,? WHERE ${acknowledgedNow}`).bind(crypto.randomUUID(),member.incidentId,member.monitorId,now,actor.id,'acknowledged',JSON.stringify({channel:'group'}),member.incidentId,now),
   auditStatement(env,{kind:'operator',ref:actor.id},'incident_acknowledge','incident',crypto.randomUUID(),acknowledgedNow,[member.incidentId,now],now))
 }
 return statements
}
