import type {Bindings} from '../control.server.ts'
import {createImportDoorHandler} from '../../base/modules/import-kit/src/door/index.ts'
import {createImportOperatorHandler} from '../../base/modules/import-kit/src/door/operator.ts'
import {businessTargets} from './targets.server.ts'
import {businessClaim,businessOwner,ownerSessionPredicate,BUSINESS_DESTINATION,DOOR_KEY} from './context.server.ts'
import {importSource} from './mapping.server.ts'

const headers={'cache-control':'no-store'}
const limits={maxBytes:2*1024*1024,maxRecords:500}
// Finish bounded rejected requests too. Leaving their body unread can reset an
// HTTP keep-alive connection just as Business sends its next request.
async function finishRequest(request:Request,response:Response){
 if(request.body&&!request.bodyUsed){
  const reader=request.body.getReader();let bytes=0
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>100_000){await reader.cancel();break}}}
  finally{reader.releaseLock()}
 }
 return response
}
const unavailable=(error:unknown)=>{
 const status=error&&typeof error==='object'&&'status' in error?Number(error.status):503
 return Response.json({error:status===403?'owner_unavailable':'import_door_unavailable'},{status,headers})
}
/** Business grants at /api/rer/import/*: 404 until the owner opts in. The door
 * resolves each verified grant's namespace through the same allow-list. */
export async function businessImportDoor(env:Bindings,request:Request){
 const row=await env.DB.prepare('SELECT enabled FROM ik_door_settings WHERE installation_id=?').bind(DOOR_KEY).first<{enabled:number}>()
 if(row?.enabled!==1)return finishRequest(request,Response.json({error:'not_found'},{status:404,headers}))
 try{
  const owner=await businessOwner(env)
  return finishRequest(request,(await createImportDoorHandler({database:env.DB,targets:businessTargets(env,owner),claim:businessClaim(env),
   installationId:DOOR_KEY,ownerPrincipalId:owner,destination:BUSINESS_DESTINATION,format:'ndjson',limits,
   source:namespace=>importSource(env,namespace)})(request))!)
 }catch(error){return finishRequest(request,unavailable(error))}
}
/** The owner's own imports at /api/operator/import/*: the same pipeline under the
 * owner's session and exact Origin, with the source named on every call. */
export async function ownerImportDoor(env:Bindings,request:Request){
 // Nothing is read for a caller without an owner session; the door rechecks it inside every batch.
 if(!await ownerSessionPredicate(env,request))return finishRequest(request,Response.json({error:'owner_required'},{status:401,headers}))
 const namespace=request.headers.get('X-Import-Source')??'',source=await importSource(env,namespace)
 if(!source)return finishRequest(request,Response.json({error:'unknown_import_source'},{status:400,headers}))
 try{
  const owner=await businessOwner(env)
  return finishRequest(request,(await createImportOperatorHandler({database:env.DB,targets:businessTargets(env,owner),ownerPrincipalId:owner,
   destination:BUSINESS_DESTINATION,format:'ndjson',limits,...source,installationId:DOOR_KEY,appOrigin:env.UPTIME_ORIGIN??'',
   ownerEmail:env.OWNER_EMAIL??'',namespace,authorize:request=>ownerSessionPredicate(env,request)})(request))!)
 }catch(error){return finishRequest(request,unavailable(error))}
}
