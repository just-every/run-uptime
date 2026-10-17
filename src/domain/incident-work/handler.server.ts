import type {Bindings} from '../control.server.ts'
import {operatorSession} from '../operator-auth.server.ts'
import {IncidentWorkError} from './common.server.ts'
import {incidentDetail} from './read.server.ts'
import {addComment,changeComment} from './comments.server.ts'
import {rootCause,incidentAction} from './actions.server.ts'
import {readSettings,saveSettings} from './settings.server.ts'
export {incidentDetail,incidentDetail as readIncidentDetail} from './read.server.ts'
export {validateIncidentArchive,incidentArchiveColumns,incidentMonitorErasureTables,incidentOperatorErasureStatements} from './portability.server.ts'
// Parent uses the existing common origin, payload and schema admission before this
// handler. Authentication is also enforced here for direct/portable integration.
export async function incidentWorkRequest(env:Bindings,request:Request,input?:unknown):Promise<Response>{
 const headers={'cache-control':'no-store, private'}
 try{
  const session=await operatorSession(env,request);if(!session)return Response.json({error:'Owner session required'},{status:401,headers})
  const actor={id:session.operator.id,displayName:session.operator.displayName},url=new URL(request.url),path=url.pathname,method=request.method
  let result:unknown,status=200
  if(path==='/api/incident-settings'){
   if(method==='GET')result=await readSettings(env)
   else if(method==='PATCH')result=await saveSettings(env,input,actor)
   else throw new IncidentWorkError('Method not allowed',405)
  }else{
   const match=/^\/api\/(?:v1\/)?incidents\/([^/]+)(?:\/(comments|root-cause|actions)(?:\/([^/]+))?)?$/.exec(path)
   if(!match)throw new IncidentWorkError('Not found',404)
   const id=decodeURIComponent(match[1]),resource=match[2],commentId=match[3]?decodeURIComponent(match[3]):null
   if(method==='GET'&&!resource)result=await incidentDetail(env,id)
   else if(path.startsWith('/api/v1/'))throw new IncidentWorkError('Read-only API',405)
   else if(resource==='comments'&&!commentId&&method==='POST'){result=await addComment(env,id,input,actor);status=201}
   else if(resource==='comments'&&commentId&&method==='PATCH')result=await changeComment(env,id,commentId,input,actor)
   else if(resource==='comments'&&commentId&&method==='DELETE'){const raw=url.searchParams.get('version');if(raw===null||!/^\d+$/.test(raw))throw new IncidentWorkError('Comment version is required');result=await changeComment(env,id,commentId,{version:Number(raw)},actor,true)}
   else if(resource==='root-cause'&&method==='PATCH')result=await rootCause(env,id,input,actor)
   else if(resource==='actions'&&method==='POST')result=await incidentAction(env,id,input,actor)
   else throw new IncidentWorkError('Method not allowed',405)
  }
  return Response.json(result,{status,headers})
 }catch(error){if(error instanceof IncidentWorkError)return Response.json({error:error.message},{status:error.status,headers});throw error}
}
