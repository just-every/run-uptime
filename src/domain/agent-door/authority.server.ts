import {ToolRefusal, type Person, type Principal, type ToolContext} from '../../base/modules/agent-door/index.ts'
import {inScope, type Scope} from '../access.server.ts'
import type {Bindings} from '../control.server.ts'
import {loadCredential} from '../credentials/admission.server.ts'
import {credentialMonitorFilter, type CredentialAuthority} from '../credentials/model.server.ts'
// @ts-ignore Native product role policy is also used by the browser and CLI.
import {baseRole, permitted} from '../role-permissions.mjs'

export interface AgentAccess {
 kind:'agent'; operator:{id:string;version:number;role:string}; role:string; revision:number; scopes:Scope[]; action:string; monitorIds:string[];
 attribution:{agent:{id:string;name:string};for:{id:string;name:string};label:string}; approvers:Array<{id:string;name:string}>
}
export const denied=()=>new ToolRefusal('not_found')
export async function localAuthority(env:Bindings,clientId:string):Promise<CredentialAuthority> {
 const row=await env.DB.prepare('SELECT t.scopes FROM integration_tokens t JOIN uptime_credential_grants g ON g.namespace=t.namespace WHERE g.id=?').bind(clientId).first<{scopes:string}>()
 if(!row)throw denied()
 // Re-read the native grant from its durable client ID. No bearer is retained.
 const {credentialFence}=await import('../credentials/model.server.ts')
 const r=await env.DB.prepare('SELECT g.*,t.id token_id,t.scopes FROM uptime_credential_grants g JOIN integration_tokens t ON t.namespace=g.namespace WHERE g.id=?').bind(clientId).first<any>()
 const a:CredentialAuthority={kind:'credential',id:r.id,namespace:r.namespace,tokenId:r.token_id,workspaceId:r.workspace_id,issuerId:r.issuer_id,issuerVersion:r.issuer_version,issuerRole:r.issuer_role,roleRevision:r.role_revision,revision:r.revision,resources:JSON.parse(r.resources),environment:r.environment,tokenScopes:JSON.parse(r.scopes),requiredScope:'monitoring:read',scopes:[],role:'read-only',action:'read',monitorIds:[]}
 const fence=credentialFence(a)
 if(!await env.DB.prepare(`SELECT 1 WHERE ${fence.sql}`).bind(...fence.params).first())throw denied()
 return a
}
export async function agentAccess(env:Bindings,ctx:Pick<Principal,'person'|'agent'|'clientId'> & Partial<Pick<ToolContext,'actor'|'approvers'>>,action:string,ids:string[]=[],definition?:any,workspace=false):Promise<AgentAccess> {
 const operator=await env.DB.prepare("SELECT id,version,role FROM oa_operators WHERE id=? AND status='active'").bind(ctx.person.id).first<AgentAccess['operator']>()
 const row=await env.DB.prepare('SELECT role,base_role,base_version,revision FROM uptime_member_roles WHERE operator_id=?').bind(ctx.person.id).first<any>()
 if(!operator||!row||row.base_role!==operator.role||row.base_version!==operator.version||baseRole(row.role)!==operator.role||!permitted(row.role,action))throw denied()
 const scopes=(await env.DB.prepare('SELECT kind,value FROM uptime_member_scopes WHERE operator_id=? ORDER BY kind,value').bind(operator.id).all<Scope>()).results
 if(workspace&&scopes.length)throw denied()
 const protectedDefinition=(d:any)=>d&&(['private','synthetic'].includes(d.network)||['flow','api','mail'].includes(d.type)||d.privateGrantRef||d.request?.credentialRef)
 for(const id of ids){
  const monitor=await env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(id).first<{definition:string}>()
  if(!monitor||!inScope(JSON.parse(monitor.definition),scopes))throw denied()
  if(action==='check_write'&&!['owner','admin'].includes(row.role)&&(protectedDefinition(JSON.parse(monitor.definition))||protectedDefinition(definition)))throw denied()
 }
 if(definition&&!inScope(definition,scopes))throw denied()
 if(scopes.length&&!workspace&&!ids.length&&action!=='read')throw denied()
 if(ctx.clientId?.startsWith('native-key:')){
  const a=await localAuthority(env,ctx.clientId.slice(11))
  if(a.issuerId!==operator.id||action!=='read')throw denied()
  const f=credentialMonitorFilter({...env,readCredential:a})
  for(const id of ids)if(!await env.DB.prepare(`SELECT 1 FROM monitors WHERE id=? AND ${f.sql}`).bind(id,...f.params).first())throw denied()
 }
 return {kind:'agent',operator,role:row.role,revision:row.revision,scopes,action,monitorIds:ids,attribution:ctx.actor??{agent:ctx.agent,for:{id:ctx.person.id,name:ctx.person.name},label:`${ctx.agent.name} for ${ctx.person.name}`},approvers:ctx.approvers??[]}
}
export function agentFence(a:AgentAccess){
 return {sql:`EXISTS(SELECT 1 FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id WHERE o.id=? AND o.status='active' AND o.version=? AND o.role=? AND r.base_version=o.version AND r.base_role=o.role AND r.role=? AND r.revision=?) AND NOT EXISTS(SELECT 1 FROM json_each(?) selected LEFT JOIN monitors m ON m.id=selected.value WHERE m.id IS NULL OR EXISTS(SELECT 1 FROM uptime_member_scopes s WHERE s.operator_id=? GROUP BY s.kind HAVING MAX(CASE WHEN s.kind='service' AND s.value=json_extract(m.definition,'$.service') OR s.kind='team' AND s.value=json_extract(m.definition,'$.group') THEN 1 ELSE 0 END)=0))`,params:[a.operator.id,a.operator.version,a.operator.role,a.role,a.revision,JSON.stringify(a.monitorIds),a.operator.id]}
}
export async function visibleIds(env:Bindings,ctx:Principal){
 const access=await agentAccess(env,ctx,'read'),all=(await env.DB.prepare('SELECT id,definition FROM monitors ORDER BY id').all<{id:string;definition:string}>()).results
 let ids=all.filter(r=>inScope(JSON.parse(r.definition),access.scopes)).map(r=>r.id)
 if(ctx.clientId?.startsWith('native-key:')){const f=credentialMonitorFilter({...env,readCredential:await localAuthority(env,ctx.clientId.slice(11))});const allowed=(await env.DB.prepare(`SELECT id FROM monitors WHERE ${f.sql}`).bind(...f.params).all<{id:string}>()).results;ids=ids.filter(id=>allowed.some(r=>r.id===id))}
 return ids
}
export const readScopes=['uptime:read']
export async function localCredentials(env:Bindings,request:Request){
 if(!/^Bearer int_[a-f0-9]{64}$/.test(request.headers.get('authorization')??''))return null
 const a=await loadCredential(env,request,'monitoring:read');if(!a)return null
 return {sponsor:{id:a.issuerId},agent:{id:`uptime-key:${a.id}`,name:'Monitoring read key'},scopes:readScopes,clientId:`native-key:${a.id}`}
}
export async function evidenceAccess(env:Bindings,ctx:Principal,id:string){
 const a=await agentAccess(env,ctx,'read',[id])
 // Machine monitoring keys never inherit the separate evidence grant.
 if(ctx.clientId?.startsWith('native-key:')||a.role!=='owner'&&!await env.DB.prepare('SELECT 1 FROM failure_evidence_grants WHERE monitor_id=? AND operator_id=?').bind(id,ctx.person.id).first())throw denied()
 return a
}
