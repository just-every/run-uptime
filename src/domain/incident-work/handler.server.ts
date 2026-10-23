import type {Bindings} from '../control.server.ts'
import {permission,accessResponse} from '../access.server.ts'
import {authorizedDatabase} from '../access-database.server.ts'
import {IncidentWorkError,findIncident} from './common.server.ts'
import {incidentDetail} from './read.server.ts'
import {addComment,changeComment} from './comments.server.ts'
import {rootCause,incidentAction} from './actions.server.ts'
import {readSettings,saveSettings} from './settings.server.ts'
import {mentionMembers} from './mention-members.server.ts'
import {deliverCommentMentions} from './mention-delivery.server.ts'
export {incidentDetail,incidentDetail as readIncidentDetail} from './read.server.ts'
export {validateIncidentArchive,incidentArchiveColumns,incidentMonitorErasureTables,incidentOperatorErasureStatements} from './portability.server.ts'
// Direct callers and Hono use the same live Base/edition permission and write fence.
export async function incidentWorkRequest(system:Bindings,request:Request,input?:unknown):Promise<Response>{
 const headers={'cache-control':'no-store, private'}
 try{
  const access=await permission(system,request,input),env={...system,DB:authorizedDatabase(system,access)}
  const actor={id:access.session.operator.id,displayName:access.session.operator.displayName,access},url=new URL(request.url),path=url.pathname,method=request.method
  let result:any,status=200,notify=false
  if(path==='/api/incident-settings'){
   if(method==='GET')result=await readSettings(env)
   else if(method==='PATCH')result=await saveSettings(env,input,actor)
   else throw new IncidentWorkError('Method not allowed',405)
  }else{
   const match=/^\/api\/(?:v1\/)?incidents\/([^/]+)(?:\/(comments|root-cause|actions|mention-members)(?:\/([^/]+))?)?$/.exec(path)
   if(!match)throw new IncidentWorkError('Not found',404)
   const id=decodeURIComponent(match[1]),resource=match[2],commentId=match[3]?decodeURIComponent(match[3]):null
   if(method==='GET'&&!resource)result=await incidentDetail(env,id,access)
   else if(resource==='mention-members'&&method==='GET')result=await mentionMembers(env,(await findIncident(env,id)).monitor_id,url.searchParams.get('q')??'')
   else if(path.startsWith('/api/v1/'))throw new IncidentWorkError('Read-only API',405)
   else if(resource==='comments'&&!commentId&&method==='POST'){result=await addComment(env,id,input,actor);status=201;notify=true}
   else if(resource==='comments'&&commentId&&method==='PATCH'){result=await changeComment(env,id,commentId,input,actor);notify=true}
   else if(resource==='comments'&&commentId&&method==='DELETE'){const raw=url.searchParams.get('version');if(raw===null||!/^\d+$/.test(raw))throw new IncidentWorkError('Comment version is required');result=await changeComment(env,id,commentId,{version:Number(raw)},actor,true)}
   else if(resource==='root-cause'&&method==='PATCH')result=await rootCause(env,id,input,actor)
   else if(resource==='actions'&&method==='POST')result=await incidentAction(env,id,input,actor)
   else throw new IncidentWorkError('Method not allowed',405)
  }
  // The comment has committed. Each send independently rechecks recipient and
  // current comment authority; losing the actor's session cannot replay a send.
  if(notify)await deliverCommentMentions(system,result.id,result.version)
  return Response.json(result,{status,headers})
 }catch(error){const denied=accessResponse(error);if(denied)return denied;if(error instanceof IncidentWorkError)return Response.json({error:error.message},{status:error.status,headers});throw error}
}
