import {TokenService} from '../../base/modules/integrations/core/tokens.ts'
import {IntegrationsRepository} from '../../base/modules/integrations/core/repository.ts'
import {D1SqlDatabase} from '../../base/modules/integrations/core/database.ts'
import type {Bindings} from '../control.server.ts'
import {permission,accessFence,AccessError} from '../access.server.ts'
import {authorizedDatabase} from '../access-database.server.ts'
import {requireFreshSecondFactor} from '../mfa/policy.server.ts'
import {CredentialError,type Resources} from './model.server.ts'
function resources(input:any):Resources{
 if(!input||!['workspace','selection'].includes(input.mode)||Object.keys(input).some(k=>!['mode','monitorIds','tags'].includes(k)))throw new CredentialError(400,'Choose workspace or explicit selection resources')
 for(const [key,max] of [['monitorIds',500],['tags',30]] as const){if(!Array.isArray(input[key])||input[key].length>max||input[key].some((v:any)=>typeof v!=='string'||!v||v.length>100||/[\x00-\x1f\x7f]/.test(v))||new Set(input[key]).size!==input[key].length)throw new CredentialError(400,'Use distinct bounded monitor IDs and tags')}
 if(input.mode==='workspace'&&(input.monitorIds.length||input.tags.length))throw new CredentialError(400,'Workspace resources cannot also name selections')
 return {mode:input.mode,monitorIds:input.monitorIds,tags:input.tags}
}
export async function credentialKeys(system:Bindings,request:Request,input?:any){
 const access=await permission(system,request,input);if(access.role!=='owner')throw new AccessError()
 const env={...system,DB:authorizedDatabase(system,access)},path=new URL(request.url).pathname
 if(request.method==='POST'){
  await requireFreshSecondFactor(system,request);access.fresh=true
  if(!input||Object.keys(input).some(k=>!['name','scopes','expiresAt','resources','environment'].includes(k))||typeof input.name!=='string'||!input.name.trim()||input.name.length>100||/[\x00-\x1f\x7f]/.test(input.name))throw new CredentialError(400,'Provide a printable credential name')
  const scopeKey=JSON.stringify(input.scopes),ci=['["definitions:preview"]','["definitions:preview","definitions:apply"]'].includes(scopeKey)
  if(!ci&&scopeKey!=='["monitoring:read"]')throw new CredentialError(400,'Choose monitoring:read or definitions:preview with optional definitions:apply')
  if(ci?(typeof input.environment!=='string'||!input.environment.trim()||input.environment!==input.environment.trim()||input.environment.length>100||/[\x00-\x1f\x7f]/.test(input.environment)):input.environment!==undefined)throw new CredentialError(400,'CI credentials require one explicit environment')
  if(!Number.isSafeInteger(input.expiresAt)||input.expiresAt<=Date.now()||input.expiresAt>Date.now()+366*86400000)throw new CredentialError(400,'Provide a future expiry within 366 days')
  const selection=resources(input.resources),id=crypto.randomUUID(),workspace=(await env.DB.prepare('SELECT id FROM uptime_credential_workspace WHERE singleton=1').first<{id:string}>())!.id,namespace='uptime-api:'+workspace+':'+id
  if(ci&&(selection.mode!=='selection'||!selection.tags.length||selection.monitorIds.length))throw new CredentialError(400,'CI credentials require selected tags and no monitor IDs')
  for(const monitor of selection.monitorIds)if(!await env.DB.prepare('SELECT id FROM monitors WHERE id=?').bind(monitor).first())throw new CredentialError(404,'Monitor not found')
  await env.DB.prepare('INSERT INTO uptime_credential_grants(id,namespace,workspace_id,issuer_id,issuer_version,issuer_role,role_revision,resources,environment,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,namespace,workspace,access.session.operator.id,access.session.operator.version,access.role,access.revision,JSON.stringify(selection),ci?input.environment:null,Date.now()).run()
  const service=new TokenService(new IntegrationsRepository(new D1SqlDatabase(env.DB),namespace),{async grant(){const fence=accessFence(access);return {scopes:input.scopes,commitGuard:{sql:`SELECT 1 WHERE ${fence.sql}`,params:fence.params}}},async administer(){}})
  const issued=await service.issue(access,{name:input.name.trim(),scopes:input.scopes,expiresAt:input.expiresAt});return Response.json({...issued,credential:{...issued.credential,id,workspaceId:workspace,resources:selection,environment:ci?input.environment:null}},{status:201})
 }
 if(request.method==='DELETE'){
  const id=decodeURIComponent(path.split('/').pop()!);const row=await env.DB.prepare('SELECT namespace FROM uptime_credential_grants WHERE id=?').bind(id).first<{namespace:string}>();if(!row)throw new CredentialError(404,'Key not found')
  await env.DB.prepare('UPDATE integration_tokens SET revoked_at=coalesce(revoked_at,?) WHERE namespace=?').bind(Date.now(),row.namespace).run();return Response.json({revoked:true})
 }
 const rows=(await env.DB.prepare(`SELECT g.id,g.workspace_id,g.resources,g.environment,g.issuer_id,t.name,t.scopes,t.created_at,t.expires_at,t.revoked_at,(SELECT MAX(at) FROM integration_token_usage u WHERE u.namespace=t.namespace AND u.token_id=t.id AND u.allowed=1) last_used FROM uptime_credential_grants g JOIN integration_tokens t ON t.namespace=g.namespace ORDER BY t.created_at,g.id`).all<any>()).results
 return Response.json(rows.map(r=>({id:r.id,workspaceId:r.workspace_id,issuerId:r.issuer_id,name:r.name,scopes:JSON.parse(r.scopes),resources:JSON.parse(r.resources),environment:r.environment,createdAt:r.created_at,expiresAt:r.expires_at,revokedAt:r.revoked_at,lastUsedAt:r.last_used})))
}
