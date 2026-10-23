import type {Bindings} from '../control.server.ts'
import {accessResponse} from '../access.server.ts'
import {authorizedDatabase} from '../access-database.server.ts'
import {loadCredential,admitCredential} from '../credentials/admission.server.ts'
import {CredentialError,credentialFence,type CredentialAuthority} from '../credentials/model.server.ts'
import {createImportOperatorHandler} from '../../base/modules/import-kit/src/door/operator.ts'
import {importSource} from '../business-import/mapping.server.ts'
import {DOOR_KEY,BUSINESS_DESTINATION,REVERSAL_POLICY} from '../business-import/context.server.ts'
import {uploadBytes,bundleCarriesSecrets,withdrawSecretUpload,afterCancel,settleNamespace} from '../business-import/custody.server.ts'
import {doorPlanView} from '../business-import/plan-view.server.ts'
import {recogniseFile} from '../definitions/index.server.ts'
import {ciNamespace,assertCiFile,ciDefinition} from './scope.server.ts'
import {ciTargets} from './targets.server.ts'
const headers={'cache-control':'no-store, private'}
async function bodyText(request:Request,max:number){let text='',size=0;const reader=request.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});if(!reader)return '';try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new CredentialError(413,'Definition request is too large');text+=decoder.decode(value,{stream:true})}return text+decoder.decode()}finally{await reader.cancel();reader.releaseLock()}}
async function checkedUpload(env:Bindings,a:CredentialAuthority,id:string){
 const row=await env.DB.prepare('SELECT namespace FROM ik_door_uploads WHERE id=? AND installation_id=?').bind(id,DOOR_KEY).first<{namespace:string}>();if(row?.namespace!==ciNamespace(a))throw new CredentialError(404,'Import upload not found')
 const bytes=await uploadBytes(env,id);if(!bytes)throw new CredentialError(409,'Import upload is incomplete')
 if(bundleCarriesSecrets(bytes)){await withdrawSecretUpload(env,id,row.namespace);throw new CredentialError(400,'Source credentials are not permitted')}
 for(const line of new TextDecoder('utf-8',{fatal:true}).decode(bytes).split('\n').filter(v=>v.trim())){const value=JSON.parse(line);await assertCiFile(env,a,typeof value==='string'?value:JSON.stringify(value))}
}
async function checkedPlan(env:Bindings,a:CredentialAuthority,id:string){
 const row=await env.DB.prepare('SELECT namespace,bundle_sha256,job_id FROM ik_door_plans WHERE id=? AND installation_id=?').bind(id,DOOR_KEY).first<any>();if(row?.namespace!==ciNamespace(a))throw new CredentialError(404,'Import plan not found')
 const upload=await env.DB.prepare('SELECT id FROM ik_door_uploads WHERE namespace=? AND bundle_sha256=? AND installation_id=? LIMIT 1').bind(row.namespace,row.bundle_sha256,DOOR_KEY).first<{id:string}>();if(!upload)throw new CredentialError(410,'Import source is unavailable');await checkedUpload(env,a,upload.id)
 const view=await doorPlanView(env,id)
 for(const entry of view.kind==='definitions'?view.entries:[]){if(!entry.monitorId)continue;const current=await env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(entry.monitorId).first<{definition:string}>();if(current&&!ciDefinition(a,JSON.parse(current.definition)))throw new CredentialError(403,'Existing monitor is outside the credential selection')}
 return {row,view}
}
// Existing protected import/definition doors, a separate credential principal.
// Never mint an owner session or hand CI the general owner import adapter.
export async function ciDoor(system:Bindings,request:Request):Promise<Response|null>{
 if(!request.headers.get('authorization')?.toLowerCase().startsWith('bearer '))return null
 const url=new URL(request.url),path=url.pathname,recognise=path==='/api/definitions/recognise',planRead=/^\/api\/definitions\/plans\/([^/]+)$/.exec(path),step=path.startsWith('/api/operator/import/')?path.slice('/api/operator/import/'.length):null
 if(!recognise&&!planRead&&step===null)return null
 try{
  const required=step==='apply'||step==='reconcile'?'definitions:apply':'definitions:preview'
  if(recognise&&request.method!=='POST'||planRead&&!['GET','HEAD'].includes(request.method)||step!==null&&(request.method!=='POST'||!['uploads','plan','apply','reconcile','undo'].includes(step)))throw new CredentialError(403,'Credential does not authorize this import operation')
  if(request.headers.get('origin')!==system.UPTIME_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site')throw new CredentialError(403,'Same origin required')
  if([...url.searchParams.keys()].some(k=>!recognise||k!=='source')||recognise&&!['auto','uptime.monitors'].includes(url.searchParams.get('source')??'auto'))throw new CredentialError(400,'CI accepts native definition files only')
  const a=await loadCredential(system,request,required);if(!a)throw new CredentialError(401,'Credential required')
  if(!a.environment||request.headers.get('x-uptime-environment')!==a.environment)throw new CredentialError(403,'Choose the credential environment explicitly')
  const env={...system,DB:authorizedDatabase(system,a)},namespace=ciNamespace(a)
  if(planRead){const {view}=await checkedPlan(env,a,decodeURIComponent(planRead[1]));await admitCredential(system,a,'definitions.preview');return new Response(request.method==='HEAD'?null:JSON.stringify(view),{headers:{...headers,'content-type':'application/json'}})}
  if(request.headers.get('content-type')!=='application/json')throw new CredentialError(415,'JSON required')
  const text=await bodyText(request,recognise?2*1024*1024:100000)
  if(recognise){if(bundleCarriesSecrets(new TextEncoder().encode(JSON.stringify(text)+'\n')))throw new CredentialError(400,'Source credentials are not permitted');const file=recogniseFile(text,url.searchParams.get('source')??'auto');await assertCiFile(env,a,file.text);await admitCredential(system,a,'definitions.preview');return Response.json({...file,namespace},{headers})}
  if(request.headers.get('x-import-source')!==namespace)throw new CredentialError(403,'Credential import namespace required')
  const input=JSON.parse(text);if(!input||typeof input!=='object'||Array.isArray(input))throw new CredentialError(400,'Import object required')
  let cancellation:any
  if(step==='uploads'&&input.uploadId){const row=await env.DB.prepare('SELECT namespace FROM ik_door_uploads WHERE id=?').bind(input.uploadId).first<{namespace:string}>();if(row?.namespace!==namespace)throw new CredentialError(404,'Import upload not found')}
  if(step==='plan')await checkedUpload(env,a,input.uploadId)
  if(['apply','reconcile','undo'].includes(step!)){const checked=await checkedPlan(env,a,input.planId);if(step==='undo'){if(checked.view.applied)throw new CredentialError(403,'CI can cancel only unapplied previews');cancellation=checked.row}}
  const base=credentialFence(a),authorize=async()=>({sql:base.sql+(step==='undo'?" AND EXISTS(SELECT 1 FROM ik_door_plans p WHERE p.id=? AND p.namespace=? AND p.job_id IS NULL AND NOT EXISTS(SELECT 1 FROM ik_jobs j WHERE j.operation_key='door:'||p.id))":''),params:[...base.params,...(step==='undo'?[input.planId,namespace]:[])]})
  const source=await importSource(env,namespace);if(!source)throw new CredentialError(400,'Native import source required')
  const handler=createImportOperatorHandler({database:env.DB,targets:ciTargets(env,a),ownerPrincipalId:a.issuerId,destination:BUSINESS_DESTINATION,format:'ndjson',limits:{maxBytes:2*1024*1024,maxRecords:500},reversalPolicy:REVERSAL_POLICY,...source,installationId:DOOR_KEY,appOrigin:system.UPTIME_ORIGIN??'',ownerEmail:system.OWNER_EMAIL??'',namespace,authorize})
  await admitCredential(system,a,step==='apply'?'definitions.apply':'definitions.preview')
  const forwarded=new Headers(request.headers);forwarded.delete('content-length');const response=(await handler(new Request(request.url,{method:'POST',headers:forwarded,body:text})))!
  if(response.ok){const result=await response.clone().json() as any;if(step==='uploads'&&result.complete)await checkedUpload(env,a,result.uploadId);if(step==='plan')await settleNamespace(env,namespace);if(step==='undo'&&result.state==='cancelled')await afterCancel(env,namespace,cancellation.bundle_sha256)}
  return response
 }catch(error){return accessResponse(error)??Response.json({error:'CI definition operation refused'},{status:400,headers})}
}
