import type {Bindings} from '../control.server.ts'
import {createImportDoorHandler} from '../../base/modules/import-kit/src/door/index.ts'
import {createImportOperatorHandler} from '../../base/modules/import-kit/src/door/operator.ts'
import {businessTargets} from './targets.server.ts'
import {businessClaim,businessOwner,ownerSessionPredicate,BUSINESS_DESTINATION,DOOR_KEY,REVERSAL_POLICY} from './context.server.ts'
import type {D1Sql} from '../../base/modules/import-kit/src/d1/types.ts'
import {importSource} from './mapping.server.ts'
import {afterCancel,bundleCarriesSecrets,dropAbandoned,otherDefinitionFiles,recordUndo,settleNamespace,uploadBytes,withdrawSecretUpload,withdrawUpload,DEFINITION_FILE_PREFIX} from './custody.server.ts'

const headers={'cache-control':'no-store'}
const limits={maxBytes:2*1024*1024,maxRecords:500}
// Finish bounded rejected requests too. Leaving their body unread can reset an
// HTTP keep-alive connection just as Business sends its next request.
export async function finishRequest(request:Request,response:Response){
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
const secretsWithheld=()=>Response.json({error:'source_secrets_withheld'},{status:400,headers})
const action=(request:Request)=>request.method==='POST'?new URL(request.url).pathname.split('/').pop()??'':''
const outcome=async(response:Response)=>await response.clone().json().catch(()=>null) as Record<string,any>|null
type Body=Record<string,unknown>|null
/** A door request's body read once, as far as the door itself reads (100 KB), and the same request rebuilt from those
 * bytes for the door: custody reads what the door reads without teeing the body. */
async function buffered(request:Request):Promise<{request:Request;body:Body}>{
 if(request.method!=='POST'||!request.body)return {request,body:null}
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0
 try{for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);size+=value.byteLength;if(size>100_000)break}}
 finally{await reader.cancel();reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 const forwarded=new Headers(request.headers);forwarded.delete('content-length')
 let body:Body=null
 try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));body=value&&typeof value==='object'&&!Array.isArray(value)?value:null}catch{body=null}
 return {request:new Request(request.url,{method:'POST',headers:forwarded,body:bytes}),body}
}

/** The upload or plan a door request names, and its namespace, read before the door answers. */
async function named(env:Bindings,request:Request,body:Body){
 const step=action(request)
 if(step==='plan'&&typeof body?.uploadId==='string')return {body,upload:await env.DB.prepare('SELECT id,namespace FROM ik_door_uploads WHERE id=? AND installation_id=?').bind(body.uploadId,DOOR_KEY).first<{id:string;namespace:string}>()}
 if(step==='undo'&&typeof body?.planId==='string')return {body,plan:await env.DB.prepare('SELECT id,namespace,bundle_sha256 FROM ik_door_plans WHERE id=? AND installation_id=?').bind(body.planId,DOOR_KEY).first<{id:string;namespace:string;bundle_sha256:string}>()}
 return {body}
}
/** The custody every door answer leaves behind, on either mount, once the door has authorised and answered. An upload
 * that completes still carrying a live request secret is withdrawn and refused; a plan settles its namespace; a cancel
 * withdraws the cancelled preview's upload; an undo records when it finished. */
async function custody(env:Bindings,request:Request,body:Body,answer:()=>Promise<Response>){
 const step=action(request),before=await named(env,request,body),response=await answer()
 if(!response.ok)return response
 const result=await outcome(response)
 if(step==='uploads'&&result?.complete===true&&typeof result.uploadId==='string'){
  const upload=await env.DB.prepare('SELECT namespace FROM ik_door_uploads WHERE id=? AND installation_id=?').bind(result.uploadId,DOOR_KEY).first<{namespace:string}>()
  const bytes=upload&&await uploadBytes(env,result.uploadId)
  if(upload&&bytes&&bundleCarriesSecrets(bytes)){await withdrawSecretUpload(env,result.uploadId,upload.namespace);return secretsWithheld()}
 }
 if(step==='plan'&&before.upload)await settleNamespace(env,before.upload.namespace)
 if(step==='undo'&&before.plan){
  if(result?.state==='cancelled')await afterCancel(env,before.plan.namespace,before.plan.bundle_sha256)
  if(['undone','rolled_back'].includes(result?.job?.state))await recordUndo(env,before.plan.id)
 }
 return response
}
/** Business grants at /api/rer/import/*: 404 until the owner opts in. The door
 * resolves each verified grant's namespace through the same allow-list. */
export async function businessImportDoor(env:Bindings,request:Request){
 const row=await env.DB.prepare('SELECT enabled FROM ik_door_settings WHERE installation_id=?').bind(DOOR_KEY).first<{enabled:number}>()
 if(row?.enabled!==1)return finishRequest(request,Response.json({error:'not_found'},{status:404,headers}))
 try{
  const owner=await businessOwner(env)
  const handler=createImportDoorHandler({database:env.DB,targets:businessTargets(env,owner),claim:businessClaim(env),
   installationId:DOOR_KEY,ownerPrincipalId:owner,destination:BUSINESS_DESTINATION,format:'ndjson',limits,reversalPolicy:REVERSAL_POLICY,
   source:namespace=>importSource(env,namespace)})
  const read=await buffered(request)
  return finishRequest(request,await custody(env,read.request,read.body,async()=>(await handler(read.request))!))
 }catch(error){return finishRequest(request,unavailable(error))}
}
/** The owner's own imports at /api/operator/import/*: the same pipeline under the
 * owner's session and exact Origin, with the source named on every call. */
export async function ownerImportDoor(env:Bindings,request:Request){
 // Nothing is read for a caller without an owner session; the door rechecks it inside every batch.
 if(!await ownerSessionPredicate(env,request))return finishRequest(request,Response.json({error:'owner_required'},{status:401,headers}))
 // The console's own request policy: no cross-site request, whatever Origin it claims.
 if(request.headers.get('sec-fetch-site')==='cross-site')return finishRequest(request,Response.json({error:'origin_required'},{status:403,headers}))
 return operatorImport(env,request,request=>ownerSessionPredicate(env,request))
}
type Authorize=(request:Request)=>Promise<D1Sql|null>
/** The owner, on this console's own Origin: what the door itself requires before anything is read. */
const admitted=async(env:Bindings,request:Request,authorize:Authorize)=>request.headers.get('Origin')===env.UPTIME_ORIGIN&&Boolean(await authorize(request))
async function ownerHandler(env:Bindings,namespace:string,authorize:Authorize){
 const source=await importSource(env,namespace)
 if(!source)return null
 const owner=await businessOwner(env)
 return createImportOperatorHandler({database:env.DB,targets:businessTargets(env,owner),ownerPrincipalId:owner,
  destination:BUSINESS_DESTINATION,format:'ndjson',limits,reversalPolicy:REVERSAL_POLICY,...source,installationId:DOOR_KEY,appOrigin:env.UPTIME_ORIGIN??'',
  ownerEmail:env.OWNER_EMAIL??'',namespace,authorize})
}
/** Cancels one unapplied plan through the door, as its owner, and withdraws what it held. */
async function cancel(env:Bindings,request:Request,namespace:string,planId:string,authorize:Authorize){
 const handler=await ownerHandler(env,namespace,authorize)
 const forwarded=new Headers(request.headers);forwarded.delete('content-length');forwarded.set('x-import-source',namespace)
 const cancelling=new Request(new URL('/api/operator/import/undo',request.url),{method:'POST',headers:forwarded,body:JSON.stringify({planId})})
 return custody(env,cancelling,{planId},async()=>(await handler!(cancelling))!)
}
/** One owner-authorised door request. A new plan of a source replaces that source's
 * plan nobody applied (an earlier preview, or a proposal still awaiting review): the
 * door's own cancel runs first, so a namespace never stays blocked by a stale preview.
 * Every definition file is one source: a new preview of one replaces any other unapplied
 * definition-file preview. An upload still carrying a live request secret is never planned. */
export async function operatorImport(env:Bindings,request:Request,authorize:Authorize){
 const namespace=request.headers.get('X-Import-Source')??''
 try{
  const handler=await ownerHandler(env,namespace,authorize)
  if(!handler)return finishRequest(request,Response.json({error:'unknown_import_source'},{status:400,headers}))
  const read=await buffered(request),step=action(request),body=read.body,uploadId=step==='plan'&&typeof body?.uploadId==='string'?body.uploadId:null
  if(step==='plan'&&uploadId&&await admitted(env,request,authorize)){
   const bytes=await uploadBytes(env,uploadId)
   if(bytes&&bundleCarriesSecrets(bytes)){await withdrawSecretUpload(env,uploadId,namespace);return finishRequest(request,secretsWithheld())}
   const stale=await env.DB.prepare(`SELECT p.id FROM ik_door_namespaces n JOIN ik_door_plans p ON p.id=n.pending_id
    WHERE n.installation_id=? AND n.namespace=? AND p.job_id IS NULL AND p.complete=1
    AND p.bundle_sha256<>(SELECT bundle_sha256 FROM ik_door_uploads WHERE id=? AND installation_id=? AND namespace=?)
    AND NOT EXISTS(SELECT 1 FROM ik_jobs j WHERE j.operation_key='door:'||p.id)`).bind(DOOR_KEY,namespace,uploadId,DOOR_KEY,namespace).first<{id:string}>()
   if(stale){const cancelled=await cancel(env,request,namespace,stale.id,authorize);if(!cancelled.ok)return finishRequest(request,cancelled)}
   if(namespace.startsWith(DEFINITION_FILE_PREFIX)){
    const others=await otherDefinitionFiles(env,namespace)
    for(const other of others.pending){const cancelled=await cancel(env,request,other.namespace,other.id,authorize);if(!cancelled.ok)return finishRequest(request,cancelled)}
    for(const other of others.orphans)await dropAbandoned(env,other)
   }
  }
  const response=await custody(env,read.request,body,async()=>(await handler(read.request))!)
  // A plan the door refused leaves its upload nothing reads (a catch-up is asked for again with the same upload).
  if(step==='plan'&&uploadId&&!response.ok&&(await outcome(response))?.error!=='catchup_required'&&await admitted(env,request,authorize))await withdrawUpload(env,uploadId,namespace)
  return finishRequest(request,response)
 }catch(error){return finishRequest(request,unavailable(error))}
}
