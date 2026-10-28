import type {Bindings} from '../domain/control.server.ts'
import {accessFence,inScope,type AgentAccess,type Scope} from '../domain/access.server.ts'
import {ToolRefusal,type Person,type Principal,type ResourceContext,type ToolContext} from '../base/modules/agent-door/index.ts'
import {credentialFence,credentialMonitorFilter,type CredentialAuthority} from '../domain/credentials/model.server.ts'
// @ts-ignore Shared native role vocabulary.
import {baseRole,permitted} from '../domain/role-permissions.mjs'
export type Context=Pick<Principal,'person'|'agent'|'scopes'|'clientId'|'nativeProof'>
export const unavailable=()=>new ToolRefusal('not_found')
export async function nativePerson(env:Bindings,id:string):Promise<Person|null>{
 const row=await env.DB.prepare(`SELECT o.id,o.email,o.display_name,o.role,o.status,o.version,r.role product_role,r.base_role,r.base_version
 FROM oa_operators o LEFT JOIN uptime_member_roles r ON r.operator_id=o.id WHERE o.id=?`).bind(id).first<any>()
 if(!row||row.status!=='active'||row.role!==row.base_role||row.version!==row.base_version||baseRole(row.product_role)!==row.role)return null
 return {id:row.id,email:row.email,name:row.display_name,role:row.product_role,active:true}
}
export async function localAuthority(env:Bindings,clientId:string|undefined,personId:string):Promise<CredentialAuthority|null>{
 if(!clientId?.startsWith('uptime-credential:'))return null
 const id=clientId.slice('uptime-credential:'.length)
 const row=await env.DB.prepare(`SELECT g.*,t.id token_id,t.scopes FROM uptime_credential_grants g JOIN integration_tokens t ON t.namespace=g.namespace WHERE g.id=? AND g.issuer_id=?`).bind(id,personId).first<any>()
 if(!row)throw new ToolRefusal('credential_revoked')
 const tokenScopes=JSON.parse(row.scopes),requiredScope=tokenScopes.includes('monitoring:read')?'monitoring:read':'definitions:preview'
 const a:CredentialAuthority={kind:'credential',id:row.id,namespace:row.namespace,tokenId:row.token_id,workspaceId:row.workspace_id,issuerId:row.issuer_id,issuerVersion:row.issuer_version,issuerRole:row.issuer_role,roleRevision:row.role_revision,revision:row.revision,resources:JSON.parse(row.resources),environment:row.environment,tokenScopes,requiredScope,scopes:[],role:'read-only',action:'read',monitorIds:[]}
 const fence=credentialFence(a)
 if(!await env.DB.prepare(`SELECT 1 WHERE ${fence.sql}`).bind(...fence.params).first())throw new ToolRefusal('credential_revoked')
 a.scopes=(await env.DB.prepare('SELECT kind,value FROM uptime_member_scopes WHERE operator_id=?').bind(personId).all<Scope>()).results
 return a
}
export async function authority(env:Bindings,ctx:Context,action='read',ids:string[]=[],definition?:any,workspace=false):Promise<AgentAccess|CredentialAuthority>{
 const person=await nativePerson(env,ctx.person.id);if(!person)throw new ToolRefusal('sponsor_unavailable')
 const credential=await localAuthority(env,ctx.clientId,person.id)
 if(credential){
  if(action!=='read')throw new ToolRefusal('insufficient_scope')
  const filter=credentialMonitorFilter({...env,readCredential:credential})
  for(const id of ids)if(!await env.DB.prepare(`SELECT 1 FROM monitors WHERE id=? AND ${filter.sql}`).bind(id,...filter.params).first())throw unavailable()
  credential.monitorIds=ids;return credential
 }
 const row=await env.DB.prepare('SELECT o.version,o.role native_role,r.role,r.revision FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id WHERE o.id=?').bind(person.id).first<any>()
 const scopes=(await env.DB.prepare('SELECT kind,value FROM uptime_member_scopes WHERE operator_id=? ORDER BY kind,value').bind(person.id).all<Scope>()).results
 if(!permitted(row.role,action)||workspace&&scopes.length)throw new ToolRefusal('native_permission_required')
 for(const id of ids){const m=await env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(id).first<{definition:string}>();if(!m||!inScope(JSON.parse(m.definition),scopes))throw unavailable()}
 if(definition&&!inScope(definition,scopes))throw new ToolRefusal('native_permission_required')
 if(definition&&!['owner','admin'].includes(row.role)&&(['private','synthetic'].includes(definition.network)||['flow','api','mail'].includes(definition.type)||definition.privateGrantRef||definition.request?.credentialRef))throw new ToolRefusal('native_permission_required')
 return {...(ctx.nativeProof?{proofReference:ctx.nativeProof.reference}:{}),kind:'agent',operatorId:person.id,operatorVersion:row.version,nativeRole:row.native_role,role:row.role,revision:row.revision,scopes,action,monitorIds:ids}
}
export async function visibleIds(env:Bindings,ctx:Context){
 const access=await authority(env,ctx),credential='kind' in access&&access.kind==='credential'?access:null
 const filter=credentialMonitorFilter({...env,...(credential?{readCredential:credential}:{})})
 const rows=(await env.DB.prepare(`SELECT id,definition FROM monitors WHERE ${filter.sql} ORDER BY id`).bind(...filter.params).all<{id:string;definition:string}>()).results
 return rows.filter(row=>inScope(JSON.parse(row.definition),access.scopes)).map(row=>row.id)
}
export async function evidenceAuthority(env:Bindings,ctx:Context,id:string){
 const a=await authority(env,ctx,'read',[id]);if(a.kind==='credential')throw unavailable()
 if(a.role!=='owner'&&!await env.DB.prepare('SELECT 1 FROM failure_evidence_grants WHERE monitor_id=? AND operator_id=?').bind(id,ctx.person.id).first())throw unavailable()
 return a
}
