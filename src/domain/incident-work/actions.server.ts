import type {Bindings} from '../control.server.ts'
import {mutationGuard} from '../audit.server.ts'
import {type Actor,IncidentWorkError,exact,integer,text,findIncident,member,defaultOwner,actorGuard,workSeed,timeline,audit,commit} from './common.server.ts'
import {assignee,eligibleAssignee} from './ownership.server.ts'
import {readSettings} from './settings.server.ts'
import {groupAcknowledgeStatements} from './dependencies.server.ts'
export async function rootCause(env:Bindings,id:string,input:any,actor:Actor){
 exact(input,['version','categoryId','text']);const version=integer(input.version),value=text(input.text,2000,'Root-cause text',true),incident=await findIncident(env,id),settings=await readSettings(env)
 const category=input.categoryId===null?null:settings.categories.find(item=>item.id===input.categoryId);if(category===undefined)throw new IncidentWorkError('Choose an available root-cause category')
 const current=await env.DB.prepare('SELECT root_version FROM incident_work WHERE incident_id=?').bind(id).first<{root_version:number}>();if((current?.root_version??0)!==version)throw new IncidentWorkError('Root cause changed; refresh before saving',409)
 const now=Date.now(),owner=await defaultOwner(env)
 await commit(env,[actorGuard(env,actor,id),workSeed(env,id,incident.monitor_id,owner?.id??null),mutationGuard(env,'EXISTS(SELECT 1 FROM incident_work WHERE incident_id=? AND root_version=?) AND (EXISTS(SELECT 1 FROM incident_settings WHERE singleton=1 AND version=?) OR (?=0 AND NOT EXISTS(SELECT 1 FROM incident_settings WHERE singleton=1)))',[id,version,settings.version,settings.version]),env.DB.prepare('UPDATE incident_work SET root_version=root_version+1,root_category_id=?,root_category_label=?,root_text=?,root_updated_at=?,root_editor_id=? WHERE incident_id=?').bind(category?.id??null,category?.label??null,value,now,actor.id,id),timeline(env,id,incident.monitor_id,actor,'root_cause_changed',{version:version+1,categoryId:category?.id??null,categoryLabel:category?.label??null},now),audit(env,actor,'incident_root_cause_change',now)])
 return {version:version+1}
}
export async function incidentAction(env:Bindings,id:string,input:any,actor:Actor){
 exact(input,['kind','version','ownerId']);if(!['assign','acknowledge','stop','resolve'].includes(input.kind))throw new IncidentWorkError('Choose assign, acknowledge, stop or resolve');const version=integer(input.version),incident=await findIncident(env,id),owner=input.kind==='assign'?(input.ownerId===null?null:await assignee(env,incident.monitor_id,input.ownerId)):await defaultOwner(env)
 const current=await env.DB.prepare('SELECT * FROM incident_work WHERE incident_id=?').bind(id).first<any>();if((current?.version??0)!==version)throw new IncidentWorkError('Incident changed; refresh before saving',409)
 if(input.kind!=='assign'&&(incident.recovery||current?.status==='resolved'))throw new IncidentWorkError('Incident is already resolved',409)
 const now=Date.now(),statements=[actorGuard(env,actor,id),workSeed(env,id,incident.monitor_id,owner?.id??null),mutationGuard(env,'EXISTS(SELECT 1 FROM incident_work WHERE incident_id=? AND version=?)',[id,version])]
 if(input.kind==='assign'){if(owner)statements.push(mutationGuard(env,`EXISTS(SELECT 1 FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id JOIN monitors m ON m.id=? WHERE o.id=? AND ${eligibleAssignee})`,[incident.monitor_id,owner.id]));statements.push(env.DB.prepare('UPDATE incident_work SET owner_id=?,version=version+1 WHERE incident_id=?').bind(owner?.id??null,id))}
 else {statements.push(mutationGuard(env,"NOT EXISTS(SELECT 1 FROM outbox WHERE monitor_id=? AND kind='recovery' AND json_extract(event,'$.incidentKey')=?)",[incident.monitor_id,incident.trigger.incidentKey]));if(input.kind==='acknowledge')statements.push(env.DB.prepare("UPDATE incident_work SET status='acknowledged',acknowledged_at=?,version=version+1 WHERE incident_id=?").bind(now,id));else if(input.kind==='stop')statements.push(env.DB.prepare("UPDATE incident_work SET stop_reason='member_stop',version=version+1 WHERE incident_id=?").bind(id));else statements.push(env.DB.prepare("UPDATE incident_work SET status='resolved',resolved_at=?,stop_reason='manual_resolution',version=version+1 WHERE incident_id=?").bind(now,id))}
 const kind={assign:'owner_assigned',acknowledge:'acknowledged',stop:'followup_stopped',resolve:'manual_resolution'}[input.kind as 'assign'|'acknowledge'|'stop'|'resolve'];statements.push(timeline(env,id,incident.monitor_id,actor,kind,input.kind==='assign'?{ownerId:owner?.id??null}:{channel:'console'},now),audit(env,actor,`incident_${input.kind}`,now));
 // DEPENDENCY-002: acknowledging also acknowledges the linked provider notices and the other incidents linked to them (FOLLOWUP-001 grouped acknowledgment).
 if(input.kind==='acknowledge')statements.push(...await groupAcknowledgeStatements(env,incident,actor,now));
 await commit(env,statements);return {version:version+1}
}
