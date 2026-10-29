import {checkInput,InputError} from './request-boundary.ts'
import {credentialFence,CredentialError,type CredentialAuthority} from './credentials/model.server.ts'
export {credentialPermission} from './credentials/auth.server.ts'
import {checkSecondFactor,requestNeedsStepUp,mfaCondition,mfaResponse} from './mfa/policy.server.ts'
import {authenticatedSession,type AuthBindings} from './operator-auth.server.ts'
// @ts-ignore Edition role vocabulary is shared with command helpers.
import {baseRole,permitted,requestPermission} from './role-permissions.mjs'
export type Scope={kind:'service'|'team';value:string}
export type Access={session:NonNullable<Awaited<ReturnType<typeof authenticatedSession>>>;role:string;revision:number;scopes:Scope[];action:string;monitorIds:string[];fresh?:boolean}
// A delegated person has native account authority, never a manufactured browser session.
export type AgentAccess={proofReference?:string;kind:'agent';operatorId:string;operatorVersion:number;nativeRole:string;role:string;revision:number;scopes:Scope[];action:string;monitorIds:string[]}
export class AccessError extends Error {status:number;constructor(status=403){super(status===401?'Owner session required':'Product permission required');this.status=status}}
// One product authorization door. Base re-reads status, role, version and session
// revocation on every call; edition authority never comes from request claims.
export async function permission(env:AuthBindings,request:Request,input?:unknown,override?:{action:string;workspace:boolean;monitorIds?:string[]}) :Promise<Access>{
 const session=await authenticatedSession(env,request);if(!session)throw new AccessError(401)
 await checkSecondFactor(env,session)
 const row=await env.DB.prepare('SELECT role,base_role,base_version,revision FROM uptime_member_roles WHERE operator_id=?').bind(session.operator.id).first<any>()
 if(override?.action==='evidence'){
  if(!['owner','admin','member'].includes(session.operator.role))throw new AccessError()
  const id=override.monitorIds?.[0]
  if(!id)throw new AccessError()
  if(session.operator.role==='owner')return {session,role:'owner',revision:row?.revision??0,scopes:[],action:'evidence',monitorIds:[id]}
  const grant=await env.DB.prepare('SELECT 1 FROM failure_evidence_grants WHERE monitor_id=? AND operator_id=?').bind(id,session.operator.id).first()
  if(!grant)throw new AccessError()
  // A legacy explicit grant remains usable by its active Base member. A
  // current product narrowing, when present, also restricts the viewer.
  if(!row&&session.operator.role==='member')return {session,role:'read-only',revision:0,scopes:[],action:'evidence',monitorIds:[id]}
 }
 if(!row||row.base_role!==session.operator.role||row.base_version!==session.operator.version||baseRole(row.role)!==session.operator.role)throw new AccessError(401)
 const scopes=(await env.DB.prepare('SELECT kind,value FROM uptime_member_scopes WHERE operator_id=? ORDER BY kind,value').bind(session.operator.id).all<Scope>()).results
 const wanted=override??requestPermission(request,input)
 if((wanted as any).incidentId){
  // Resolve resource scope only after the shared input schema has refused bad
  // identities, query values and bodies; malformed input cannot become a lookup.
  checkInput(request.method==='HEAD'?'GET':request.method,new URL(request.url),input===undefined?'':JSON.stringify(input),request.body!==null)
  const incident=await env.DB.prepare("SELECT o.monitor_id FROM outbox o JOIN monitors m ON m.id=o.monitor_id WHERE o.id=? AND o.kind='trigger'").bind((wanted as any).incidentId).first<{monitor_id:string}>()
  if(!incident)throw new AccessError(404)
  wanted.monitorIds=[incident.monitor_id]
 }
 if(!(wanted.action==='evidence'||permitted(row.role,wanted.action))||(scopes.length&&wanted.workspace))throw new AccessError()
 const ids=[...(wanted.monitorIds??[])]
 if(!['owner','admin'].includes(row.role)&&wanted.action==='check_write'){
  const definition=(wanted as any).definition
  const current=ids[0]?await env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(ids[0]).first<{definition:string}>():null
  const secretBearing=(value:any)=>value&&(['private','synthetic'].includes(value.network)||['flow','api','mail'].includes(value.type)||value.privateGrantRef||value.request?.credentialRef)
  if(secretBearing(definition)||current&&secretBearing(JSON.parse(current.definition)))throw new AccessError()
 }
 if(scopes.length&&!wanted.workspace&&wanted.action==='maintenance_write'&&!ids.length)throw new AccessError()
 if(ids.some((id:unknown)=>typeof id!=='string'||!id||id.length>512)||ids.length>100)throw new AccessError()
 if(scopes.length){
  if(!ids.length&&!['read','receive'].includes(wanted.action))throw new AccessError()
  for(const id of ids){const row=await env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(id).first<{definition:string}>();if(!row||!inScope(JSON.parse(row.definition),scopes))throw new AccessError()}
  const definition=(wanted as any).definition
  if(definition){
   const current=ids.length?await env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(ids[0]).first<{definition:string}>():null
   if(!inScope({...(current?JSON.parse(current.definition):{}),...definition},scopes))throw new AccessError()
   // Cross-monitor dependencies would disclose or confer authority outside scope.
   const dependencies=definition.dependencies??(current?JSON.parse(current.definition).dependencies:[])??[]
   if(!Array.isArray(dependencies)||dependencies.length>100)throw new AccessError()
   for(const id of dependencies){const target=await env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(id).first<{definition:string}>();if(!target||!inScope(JSON.parse(target.definition),scopes))throw new AccessError();if(!ids.includes(id))ids.push(id)}
  }
 }
 const fresh=requestNeedsStepUp(request,input);if(fresh)await checkSecondFactor(env,session,true)
 return {session,role:row.role,revision:row.revision,scopes,action:wanted.action,monitorIds:ids,fresh}
}
export function inScope(definition:any,scopes:Scope[]){
 // Team scope uses the existing monitor group label. Different scope kinds
 // intersect; alternatives within a kind are a union. No rows means workspace.
 return (['service','team'] as const).every(kind=>{const values=scopes.filter(s=>s.kind===kind);return !values.length||values.some(s=>s.value===definition[kind==='team'?'group':'service'])})
}
export function accessFence(access:Access|AgentAccess|CredentialAuthority){
 if('kind' in access&&access.kind==='credential')return credentialFence(access)

 if('kind' in access&&access.kind==='agent')return {sql:`EXISTS(SELECT 1 FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id
 WHERE o.id=? AND o.version=? AND o.status='active' AND o.role=? AND r.base_version=o.version AND r.base_role=o.role AND r.role=? AND r.revision=?)
 AND NOT EXISTS(SELECT 1 FROM json_each(?) selected LEFT JOIN monitors m ON m.id=selected.value
 WHERE m.id IS NULL OR EXISTS(SELECT 1 FROM uptime_member_scopes p WHERE p.operator_id=? GROUP BY p.kind
 HAVING MAX(CASE WHEN (p.kind='service' AND p.value=json_extract(m.definition,'$.service'))
 OR (p.kind='team' AND p.value=json_extract(m.definition,'$.group')) THEN 1 ELSE 0 END)=0))${access.proofReference?` AND EXISTS(SELECT 1 FROM uptime_agent_native_proof p JOIN oa_sessions s ON s.id=p.session_id JOIN oa_operators o ON o.id=p.operator_id WHERE p.id=? AND p.operator_id=? AND p.operator_version=o.version AND p.expires_at>unixepoch()*1000 AND s.operator_id=o.id AND s.operator_version=o.version AND s.revoked_at IS NULL AND s.expires_at>unixepoch()*1000 AND ${mfaCondition(true)})`:''}`,params:[access.operatorId,access.operatorVersion,access.nativeRole,access.role,access.revision,JSON.stringify(access.monitorIds),access.operatorId,...(access.proofReference?[access.proofReference,access.operatorId]:[])]}

 const {session,revision}=access as Access
 const sql=`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN uptime_member_roles r ON r.operator_id=o.id
 WHERE s.id=? AND o.id=? AND s.revoked_at IS NULL AND s.expires_at>unixepoch()*1000 AND o.status='active'
 AND s.operator_version=o.version AND o.version=? AND o.role=? AND r.base_version=o.version AND r.base_role=o.role AND r.role=? AND r.revision=? AND ${mfaCondition((access as Access).fresh)})`
 const params:any[]=[session.id,session.operator.id,session.operator.version,session.operator.role,access.role,revision]
 // One bound selection avoids a parameter per monitor/scope on D1's bounded
 // statement interface, while checking the whole bulk set at the write point.
 const monitors=`NOT EXISTS(SELECT 1 FROM json_each(?) selected LEFT JOIN monitors m ON m.id=selected.value
 WHERE m.id IS NULL OR EXISTS(SELECT 1 FROM uptime_member_scopes p WHERE p.operator_id=? GROUP BY p.kind
 HAVING MAX(CASE WHEN (p.kind='service' AND p.value=json_extract(m.definition,'$.service'))
 OR (p.kind='team' AND p.value=json_extract(m.definition,'$.group')) THEN 1 ELSE 0 END)=0))`
 return {sql:`${sql} AND ${monitors}`,params:[...params,JSON.stringify(access.monitorIds),session.operator.id]}
}
export const accessResponse=(error:unknown)=>error instanceof InputError?Response.json({error:error.message},{status:400,headers:{'cache-control':'no-store'}}):error instanceof CredentialError?Response.json({error:error.message},{status:error.status,headers:{'cache-control':'no-store',...(error.status===429?{'retry-after':String(60-Math.floor(Date.now()/1000)%60),'ratelimit':'limit=60, remaining=0, reset=60'}:{})}}):error instanceof AccessError?Response.json({error:error.message},{status:error.status,headers:{'cache-control':'no-store'}}):mfaResponse(error)
