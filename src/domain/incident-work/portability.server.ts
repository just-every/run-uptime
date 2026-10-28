import {mentionColumns,validateMentionArchive} from './mention-archive.ts'
import type {Bindings} from '../control.server.ts'
import {categories} from './settings.server.ts'
export const incidentArchiveColumns:Record<string,string[]>={
 incident_work:['incident_id','monitor_id','version','owner_id','status','stop_reason','acknowledged_at','resolved_at','root_version','root_category_id','root_category_label','root_text','root_updated_at','root_editor_id'],
 incident_comments:['id','incident_id','monitor_id','author_id','text','version','created_at','updated_at','deleted_at'],
 incident_comment_history:['id','comment_id','incident_id','monitor_id','version','text','editor_id','edited_at'],
 incident_timeline:['id','incident_id','monitor_id','occurred_at','actor_id','kind','data'],
 incident_settings:['singleton','version','categories'],
 incident_mentions:mentionColumns
}
export const incidentMonitorErasureTables=['incident_mention_authority','incident_mentions','incident_comment_history','incident_comments','incident_timeline','incident_work']
// Actor erasure retains the team account while removing the erased identity.
// Timeline assignment payloads carry only opaque IDs, which must also be removed.
export function incidentOperatorErasureStatements(env:Bindings,id:string){return [
 env.DB.prepare('UPDATE incident_comments SET author_id=NULL WHERE author_id=?').bind(id),
 env.DB.prepare('UPDATE incident_comment_history SET editor_id=NULL WHERE editor_id=?').bind(id),
 env.DB.prepare('UPDATE incident_timeline SET actor_id=NULL WHERE actor_id=?').bind(id),
 env.DB.prepare("UPDATE incident_timeline SET data=json_set(data,'$.preparedBy.for.id',NULL,'$.preparedBy.for.name','Former member','$.preparedBy.label',json_extract(data,'$.preparedBy.agent.name')||' for Former member') WHERE json_extract(data,'$.preparedBy.for.id')=?").bind(id),
 env.DB.prepare("UPDATE incident_timeline SET data=json_set(data,'$.approvers',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.id')=? THEN json_object('id',NULL,'name','Former member') ELSE value END)) FROM json_each(incident_timeline.data,'$.approvers')))) WHERE EXISTS(SELECT 1 FROM json_each(incident_timeline.data,'$.approvers') WHERE json_extract(value,'$.id')=?)").bind(id,id),
 env.DB.prepare("UPDATE incident_timeline SET data=json_set(data,'$.ownerId',NULL) WHERE kind='owner_assigned' AND json_extract(data,'$.ownerId')=?").bind(id),
 env.DB.prepare('UPDATE incident_work SET owner_id=NULL WHERE owner_id=?').bind(id),
 env.DB.prepare('UPDATE incident_work SET root_editor_id=NULL WHERE root_editor_id=?').bind(id)
]}
export function validateIncidentArchive(t:Record<string,any[]>){
 const fail=()=>{throw Error('Invalid incident collaboration archive')},object=(value:any)=>value&&typeof value==='object'&&!Array.isArray(value)
 const clock=(value:any)=>Number.isSafeInteger(value)&&value>=0,nullableClock=(value:any)=>value===null||clock(value),ref=(value:any)=>value===null||typeof value==='string'&&value.length>0&&value.length<=512
 const short=(value:any,max:number)=>typeof value==='string'&&[...value].length<=max&&!value.includes('\0')
 for(const [table,columns]of Object.entries(incidentArchiveColumns)){if(!Array.isArray(t[table]))fail();const seen=new Set();for(const row of t[table]){if(!object(row)||Object.keys(row).sort().join(',')!==columns.slice().sort().join(','))fail();const id=row.id??row.incident_id??row.singleton;if(seen.has(id))fail();seen.add(id)}}
 const triggers=new Map(t.outbox.filter(row=>row.kind==='trigger').map(row=>[row.id,row])),monitors=new Set(t.monitors.map(row=>row.id)),comments=new Map(t.incident_comments.map(row=>[row.id,row]))
 const linked=(row:any)=>{const incident=triggers.get(row.incident_id);if(!incident||incident.monitor_id!==row.monitor_id||!monitors.has(row.monitor_id))fail()}
 for(const row of t.incident_work){linked(row);if(!clock(row.version)||!clock(row.root_version)||!ref(row.owner_id)||!ref(row.root_editor_id)||!['open','acknowledged','resolved'].includes(row.status)||![null,'member_stop','manual_resolution'].includes(row.stop_reason)||![row.acknowledged_at,row.resolved_at,row.root_updated_at].every(nullableClock)||!short(row.root_text,2000)||!(row.root_category_id===null||short(row.root_category_id,80))||!(row.root_category_label===null||short(row.root_category_label,100)))fail()}
 for(const row of t.incident_comments){linked(row);if(!ref(row.id)||!ref(row.author_id)||!clock(row.version)||row.version<1||![row.created_at,row.updated_at].every(clock)||!nullableClock(row.deleted_at)||(row.deleted_at===null?!short(row.text,5000):row.text!==null))fail()}
 const versions=new Set<string>()
 for(const row of t.incident_comment_history){linked(row);const comment=comments.get(row.comment_id),key=`${row.comment_id}:${row.version}`;if(!ref(row.id)||!comment||comment.incident_id!==row.incident_id||comment.deleted_at!==null||!clock(row.version)||row.version<1||row.version>=comment.version||versions.has(key)||!short(row.text,5000)||!ref(row.editor_id)||!clock(row.edited_at))fail();versions.add(key)}
 const kinds=['comment_added','comment_edited','comment_deleted','root_cause_changed','owner_assigned','acknowledged','followup_stopped','manual_resolution','dependency_acknowledged','pause_applied','maintenance_applied']
 for(const row of t.incident_timeline){linked(row);if(!ref(row.id)||!clock(row.occurred_at)||!ref(row.actor_id)||!kinds.includes(row.kind))fail();let data:any;try{data=JSON.parse(row.data)}catch{fail()}if(!object(data))fail();const applied=['pause_applied','maintenance_applied'].includes(row.kind);const keys=applied?['revision','outcome','feature']:row.kind.startsWith('comment_')?['commentId','version']:row.kind==='root_cause_changed'?['version','categoryId','categoryLabel']:row.kind==='owner_assigned'?['ownerId']:row.kind==='dependency_acknowledged'?['noticeId']:['channel'];if(data.preparedBy!==undefined){
 const by=data.preparedBy,person=(p:any)=>object(p)&&Object.keys(p).sort().join(',')==='id,name'&&ref(p.id)&&short(p.name,300);
 if(!object(by)||Object.keys(by).sort().join(',')!=='agent,for,label'||!person(by.agent)||!person(by.for)||by.label!==`${by.agent.name} for ${by.for.name}`||!Array.isArray(data.approvers)||data.approvers.some((p:any)=>!person(p)))fail();keys.push('preparedBy','approvers')
 }if(Object.keys(data).sort().join(',')!==keys.sort().join(','))fail();if(applied){if(!clock(data.revision)||data.revision<1||data.outcome!=='applied'||!ref(data.feature))fail()}else if(row.kind.startsWith('comment_')){const comment=comments.get(data.commentId);if(!comment||comment.incident_id!==row.incident_id||!clock(data.version)||data.version<1||data.version>comment.version)fail()}else if(row.kind==='root_cause_changed'){if(!clock(data.version)||!(data.categoryId===null||short(data.categoryId,80))||!(data.categoryLabel===null||short(data.categoryLabel,100)))fail()}else if(row.kind==='owner_assigned'){if(!ref(data.ownerId))fail()}else if(row.kind==='dependency_acknowledged'){if(!t.outbox.some(notice=>notice.id===data.noticeId&&notice.kind==='dependency'))fail()}else if(!['console','group'].includes(data.channel))fail()}
 validateMentionArchive(t)
 if(t.incident_settings.length>1)fail();for(const row of t.incident_settings){if(row.singleton!==1||!clock(row.version))fail();categories(JSON.parse(row.categories))}
}
