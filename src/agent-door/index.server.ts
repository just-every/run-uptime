import {sha256} from '../base/modules/integrations/core/crypto.ts'
import {nativeProof,nativeProofResponse} from './proof.server.ts'
import {createAgentDoor,type ResourceDefinition,type Trust,type ClassAndFacts} from '../base/modules/agent-door/index.ts'
import type {Bindings} from '../domain/control.server.ts'
import {loadCredential,admitCredential} from '../domain/credentials/admission.server.ts'
import {peopleAdapter,businessSettings} from './people.server.ts'
import {localAuthority} from './authority.server.ts'
import {tools,notTools} from './registry.server.ts'
import * as reads from './reads.server.ts'
export function installationTrust(env:Bindings):Trust|null{
 const values=[env.RER_OWNER_CLAIM_ISSUER,env.RER_OWNER_CLAIM_INSTALLATION_ID,env.RER_OWNER_CLAIM_APP_ORIGIN,env.RER_OWNER_CLAIM_PUBLIC_KEYS]
 if(values.every(value=>!value))return null
 if(values.some(value=>!value)||env.RER_OWNER_CLAIM_APP_ORIGIN!==env.UPTIME_ORIGIN)throw Error('agent_trust_invalid')
 const publicKeys=JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS!)
 if(!publicKeys||Array.isArray(publicKeys)||!Object.keys(publicKeys).length)throw Error('agent_trust_invalid')
 return {issuer:env.RER_OWNER_CLAIM_ISSUER!,installationId:env.RER_OWNER_CLAIM_INSTALLATION_ID!,appOrigin:env.UPTIME_ORIGIN!,publicKeys}
}
export function resourceDefinitions(env:Bindings):ResourceDefinition[]{
 const sources:[string,string,(ctx:any,id:string)=>Promise<any>,boolean?][]=[
  ['monitors/{id}','Monitor',(c,id)=>reads.monitorRead(env,c,id)],
  ['monitors/{id}/history','Immutable observations',(c,id)=>reads.historyRead(env,c,id)],
  ['monitors/{id}/revisions','Immutable revisions',(c,id)=>reads.revisionRead(env,c,id)],
  ['monitors/{id}/uptime','Scheduled uptime evidence',(c,id)=>reads.reportRead(env,c,id)],
  ['monitors/{id}/response-times','Observed response times',(c,id)=>reads.reportRead(env,c,id)],
  ['monitors/{id}/failure-snapshots','Private failure snapshots',(c,id)=>reads.evidenceRead(env,c,id),true],
  ['incidents/{id}','Incident coordination',(c,id)=>reads.incidentRead(env,c,id)],
  ['discoveries/{id}','Discovery outcome',(c,id)=>reads.discoveryRead(env,c,id)],
  ['definition-batches/{id}','Definition batch outcome',(c,id)=>reads.batchRead(env,c,id)],
  ['routes/{id}','Alert route',(c,id)=>reads.routeRead(env,c,id)],
  ['destinations/{id}','Destination metadata',(c,id)=>reads.destinationRead(env,c,id)],
 ]
 return sources.map(([path,name,read,sensitive])=>({uriTemplate:'uptime://'+path,name,mimeType:'application/json',scope:sensitive?'uptime:evidence':'uptime:read',classes:sensitive?['sensitive']:['standard'],classify:()=>[{class:sensitive?'sensitive':'standard',facts:{measure:1,...(sensitive?{kind:'failure-evidence'}:{})}} as ClassAndFacts],async read(uri,ctx){
  const pattern=new RegExp('^uptime://'+path.replace('{id}','([^/]+)')+'$'),match=pattern.exec(uri);if(!match)return null
  try{return {json:await read(ctx,decodeURIComponent(match[1])),untrusted:true}}catch(error){if(error instanceof Error&&'code' in error&&['not_found','native_permission_required','insufficient_scope','sponsor_unavailable','credential_revoked','native_proof_required'].includes(String(error.code)))return null;throw error}
 }}))
}
export function uptimeAgentDoor(env:Bindings){
 const people=peopleAdapter(env)
 return createAgentDoor({seed:'uptime',name:'Uptime',specialist:'monitoring-operator',db:env.DB,origin:env.UPTIME_ORIGIN!,trust:installationTrust(env),people,nativeProof:nativeProof(env),tools:tools(env),resources:resourceDefinitions(env),notTools,
 prompts:[{name:'monitoring-shift',title:'Investigate evidence and coordinate a bounded repair',description:'Read immutable scoped evidence, keep target/network/check hypotheses distinct, coordinate the incident, preview the smallest native change, and inspect independent scheduled evidence. Acknowledgment does not establish recovery.',clauses:['AGENT-002','FOLLOWUP-001'],messages:()=>[{role:'user',content:{type:'text',text:'Read scoped immutable evidence and cite competing target, network and check hypotheses. Coordinate the incident without asserting recovery. Preview a minimal monitor or alert-route change; respect current native authority, exact revisions and company policy. After an allowed change inspect independently observed scheduled evidence. Missing evidence remains Unknown. Private evidence requires its separate native grant. No remediation, paging, SMS, voice, arbitrary payment or budget enforcement is provided.'}}]}],
 async localCredentials(request){
  if(!/^Bearer int_[a-f0-9]{64}$/.test(request.headers.get('authorization')??''))return null
  const issued=await env.DB.prepare('SELECT scopes FROM integration_tokens WHERE token_hash=?').bind(await sha256(request.headers.get('authorization')!.slice(7))).first<{scopes:string}>();if(!issued)return null
  const declared=JSON.parse(issued.scopes),required=declared.includes('monitoring:read')?'monitoring:read':declared.includes('definitions:preview')?'definitions:preview':null;if(!required)return null
  const a=await loadCredential(env,request,required);if(!a)return null
  if(a.environment&&request.headers.get('x-uptime-environment')!==a.environment)return null
  await admitCredential(env,a,'agent.monitoring.read')
  return {sponsor:{id:a.issuerId},agent:{id:'uptime-key:'+a.id,name:'Monitoring read client'},scopes:a.tokenScopes.includes('monitoring:read')?['uptime:read','events:read']:['definitions:preview'],clientId:'uptime-credential:'+a.id}
 },async currentScopes(principal){const a=await localAuthority(env,principal.clientId,principal.person.id);return a?(a.tokenScopes.includes('monitoring:read')?['uptime:read','events:read']:['definitions:preview']):principal.scopes},
 })
}
export async function agentDoorResponse(env:Bindings,request:Request):Promise<Response|null>{
 const path=new URL(request.url).pathname
 if(!['/mcp','/agents','/api/rer/agent-policy','/api/rer/business-settings','/rer-business-logo','/rer-business.css','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'].includes(path)&&!path.startsWith('/agents/'))return null
 try{
  const proof=await nativeProofResponse(env,request);if(proof)return proof
  const settings=await businessSettings(env).handle(request);if(settings)return settings
  return await uptimeAgentDoor(env).handle(request)
 }catch{return Response.json({code:'agent_door_unavailable'},{status:503,headers:{'cache-control':'no-store'}})}
}
