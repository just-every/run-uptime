import type {Bindings} from '../control.server.ts'
import {mutationGuard} from '../audit.server.ts'
import {type Actor,IncidentWorkError,exact,integer,text,findIncident,actorGuard,timeline,audit,commit} from './common.server.ts'
export async function addComment(env:Bindings,id:string,input:any,actor:Actor){
 exact(input,['text']);const value=text(input.text,5000),incident=await findIncident(env,id),now=Date.now(),commentId=crypto.randomUUID()
 await commit(env,[actorGuard(env,actor,id),env.DB.prepare('INSERT INTO incident_comments(id,incident_id,monitor_id,author_id,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(commentId,id,incident.monitor_id,actor.id,value,now,now),timeline(env,id,incident.monitor_id,actor,'comment_added',{commentId,version:1},now),audit(env,actor,'incident_comment_add',now)])
 return {id:commentId,version:1}
}
export async function changeComment(env:Bindings,id:string,commentId:string,input:any,actor:Actor,deleting=false){
 exact(input,deleting?['version']:['text','version']);const version=integer(input.version),value=deleting?null:text(input.text,5000),incident=await findIncident(env,id)
 const row=await env.DB.prepare('SELECT * FROM incident_comments WHERE id=? AND incident_id=? AND deleted_at IS NULL').bind(commentId,id).first<any>()
 if(!row)throw new IncidentWorkError('Comment not found',404)
 // Every admitted owner is an installation administrator. Broader responder roles are not admitted.
 if(row.author_id!==actor.id){await env.DB.prepare("SELECT id FROM oa_operators WHERE id=? AND role='owner' AND status='active'").bind(actor.id).first()||(()=>{throw new IncidentWorkError('Comment author or administrator required',403)})()}
 if(row.version!==version)throw new IncidentWorkError('Comment changed; refresh before saving',409)
 const now=Date.now(),statements=[actorGuard(env,actor,id),mutationGuard(env,'EXISTS(SELECT 1 FROM incident_comments WHERE id=? AND incident_id=? AND version=? AND deleted_at IS NULL)',[commentId,id,version])]
 if(deleting)statements.push(env.DB.prepare('DELETE FROM incident_comment_history WHERE comment_id=?').bind(commentId),env.DB.prepare('UPDATE incident_comments SET text=NULL,deleted_at=?,updated_at=?,version=version+1 WHERE id=?').bind(now,now,commentId))
 else statements.push(env.DB.prepare('INSERT INTO incident_comment_history(id,comment_id,incident_id,monitor_id,version,text,editor_id,edited_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),commentId,id,incident.monitor_id,row.version,row.text,actor.id,now),env.DB.prepare('UPDATE incident_comments SET text=?,updated_at=?,version=version+1 WHERE id=?').bind(value,now,commentId))
 statements.push(timeline(env,id,incident.monitor_id,actor,deleting?'comment_deleted':'comment_edited',{commentId,version:version+1},now),audit(env,actor,deleting?'incident_comment_delete':'incident_comment_edit',now));await commit(env,statements)
 return {id:commentId,version:version+1,deleted:deleting}
}
