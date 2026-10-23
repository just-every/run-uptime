import {authenticatedSession,authFailure,type AuthBindings} from '../operator-auth.server.ts'
import {checkSecondFactor,MfaError,mfaResponse} from './policy.server.ts'
import {limited} from './store.server.ts'
import {beginTotp,finishTotp,verifyTotp} from './totp.server.ts'
import {beginWebAuthn,finishWebAuthn} from './webauthn.server.ts'
import {useRecovery,rotateRecovery,removeFactor,resetMember,changePolicy} from './manage.server.ts'
const prefix='/api/access/mfa'
const routes:Record<string,{method:string;fields:string[]}>= {
 '/status':{method:'GET',fields:[]},'/totp/enroll':{method:'POST',fields:[]},'/totp/confirm':{method:'POST',fields:['challengeId','code']},'/totp/verify':{method:'POST',fields:['code']},
 '/webauthn/enroll':{method:'POST',fields:[]},'/webauthn/confirm':{method:'POST',fields:['challengeId','credential']},'/webauthn/options':{method:'POST',fields:[]},'/webauthn/verify':{method:'POST',fields:['challengeId','credential']},
 '/recovery/verify':{method:'POST',fields:['code']},'/recovery/rotate':{method:'POST',fields:[]},'/policy':{method:'POST',fields:['required']},'/reset':{method:'POST',fields:['operatorId']},
}
export async function mfaDoor(env:AuthBindings,request:Request){
 const url=new URL(request.url);if(!url.pathname.startsWith(prefix+'/'))return null
 const headers={'cache-control':'no-store, private'}
 try{
  const path=url.pathname.slice(prefix.length),factor=/^\/factors\/([0-9a-f-]{36})$/.exec(path),route=routes[path]??(factor?{method:'DELETE',fields:[]}:null)
  if(!route)return Response.json({error:'Not found'},{status:404,headers})
  if(request.method!==route.method)return new Response(null,{status:405,headers:{...headers,allow:route.method}})
  if(url.search)throw new MfaError(400,'unexpected_query')
  if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==env.UPTIME_ORIGIN||route.method!=='GET'&&request.headers.get('origin')!==env.UPTIME_ORIGIN)throw new MfaError(403,'same_origin_required')
  const session=await authenticatedSession(env,request);if(!session)throw new MfaError(401,'session_required')
  if(path==='/status'){
   const factors=(await env.DB.prepare('SELECT id,kind,created_at AS createdAt FROM uptime_mfa_factors WHERE operator_id=? ORDER BY created_at,id').bind(session.operator.id).all()).results
   const policy=await env.DB.prepare('SELECT required,revision FROM uptime_mfa_policy WHERE singleton=1').first<any>(),proof=await env.DB.prepare('SELECT verified_at FROM uptime_mfa_proofs WHERE session_id=? AND operator_version=?').bind(session.id,session.operator.version).first<{verified_at:number}>()
   return Response.json({operatorId:session.operator.id,factors,required:policy.required===1,policyRevision:policy.revision,verified:!!proof,fresh:!!proof&&proof.verified_at>=Date.now()-300000},{headers})
  }
  // Read a bounded UTF-8 JSON body, including callers without Content-Length.
  if(route.method==='POST'&&request.headers.get('content-type')!=='application/json')throw new MfaError(415,'json_required')
  const reader=request.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text=''
  if(reader)try{while(true){const value=await reader.read();if(value.done)break;bytes+=value.value.byteLength;if(bytes>65536)throw new MfaError(413,'payload_too_large');text+=decoder.decode(value.value,{stream:true})}text+=decoder.decode()}finally{reader.releaseLock()}
  let input:any;try{input=JSON.parse(text||'{}')}catch{throw new MfaError(400,'invalid_json')}
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!route.fields.includes(key))||route.fields.some(key=>!Object.hasOwn(input,key)))throw new MfaError(400,'invalid_factor_fields')
  await limited(env,session)
  let result
  if(path==='/totp/enroll')result=await beginTotp(env,session)
  else if(path==='/totp/confirm')result=await finishTotp(env,session,input)
  else if(path==='/totp/verify')result=await verifyTotp(env,session,input)
  else if(path==='/webauthn/enroll'||path==='/webauthn/options')result=await beginWebAuthn(env,session,path==='/webauthn/enroll')
  else if(path==='/webauthn/confirm'||path==='/webauthn/verify')result=await finishWebAuthn(env,session,input,path==='/webauthn/confirm')
  else if(path==='/recovery/verify')result=await useRecovery(env,session,input)
  else if(path==='/recovery/rotate')result=await rotateRecovery(env,session)
  else if(path==='/policy')result=await changePolicy(env,session,input)
  else if(path==='/reset')result=await resetMember(env,session,input)
  else if(factor)result=await removeFactor(env,session,factor[1])
  else throw new MfaError(404,'not_found')
  return Response.json(result,{headers})
 }catch(error){return mfaResponse(error)??authFailure(error)}
}
// Early private dispatchers bypass the common Hono policy. Apply the identical
// session-bound factor gate before any of their private data/service handling.
export async function earlyMfaGate(env:AuthBindings,request:Request){
 const path=new URL(request.url).pathname
 if(!(path==='/setup'||path==='/api/editor/config'||path==='/alert-drill'||path.startsWith('/api/operator/import/')||/^\/app\/evidence\//.test(path)||/^\/auth\/(?:session|operators|sessions|invite|invite\/cancel|operator\/status|operator\/role|session\/revoke|setup-complete)$/.test(path)))return null
 try{const session=await authenticatedSession(env,request);if(session)await checkSecondFactor(env,session);return null}catch(error){return mfaResponse(error)??authFailure(error)}
}
