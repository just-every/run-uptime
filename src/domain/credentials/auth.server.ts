import {sha256} from '../../base/modules/integrations/core/crypto.ts'
import type {AuthBindings} from '../operator-auth.server.ts'
import {credentialFence,credentialMonitorFilter,credentialLimit,CredentialError,monitoringCapability,type CredentialAuthority} from './model.server.ts'
export async function credentialPermission(env:AuthBindings,request:Request):Promise<CredentialAuthority|null>{
 if(!monitoringCapability(request))throw new CredentialError(403,'Credential does not authorize this method or path')
 const header=request.headers.get('authorization')??'';if(!/^Bearer int_[a-f0-9]{64}$/.test(header))throw new CredentialError(401,'Credential required')
 const row=await env.DB.prepare(`SELECT g.*,t.id AS token_id,t.scopes FROM integration_tokens t JOIN uptime_credential_grants g ON g.namespace=t.namespace WHERE t.token_hash=?`).bind(await sha256(header.slice(7))).first<any>()
 if(!row)return null
 if(!JSON.parse(row.scopes).includes('monitoring:read'))throw new CredentialError(403,'Monitoring read scope required')
 const authority:CredentialAuthority={kind:'credential',id:row.id,namespace:row.namespace,tokenId:row.token_id,workspaceId:row.workspace_id,issuerId:row.issuer_id,issuerVersion:row.issuer_version,issuerRole:row.issuer_role,roleRevision:row.role_revision,revision:row.revision,resources:JSON.parse(row.resources),scopes:[],role:'read-only',action:'read',monitorIds:[]}
 const fence=credentialFence(authority)
 if(!await env.DB.prepare(`SELECT 1 WHERE ${fence.sql}`).bind(...fence.params).first())throw new CredentialError(401,'Credential required')
 authority.scopes=(await env.DB.prepare('SELECT kind,value FROM uptime_member_scopes WHERE operator_id=?').bind(authority.issuerId).all<any>()).results
 // Check explicit resources before any usage/counter write; identical absent/outside result.
 const url=new URL(request.url),monitor=/^\/api\/v1\/monitors\/([^/]+)/.exec(url.pathname),incident=/^\/api\/v1\/incidents\/([^/]+)/.exec(url.pathname)
 const ids=monitor?[decodeURIComponent(monitor[1])]:url.searchParams.getAll('monitor').flatMap(v=>v.split(','))
 if(incident){const found=await env.DB.prepare("SELECT monitor_id FROM outbox WHERE id=? AND kind='trigger'").bind(decodeURIComponent(incident[1])).first<{monitor_id:string}>();if(!found)throw new CredentialError(404,'Not found');ids.push(found.monitor_id)}
 if(ids.length>(url.pathname==='/api/v1/metrics'?100:500)||ids.some(id=>!id||id.length>512)||new Set(ids).size!==ids.length)throw new CredentialError(400,'Invalid monitor selection')
 const filter=credentialMonitorFilter({...env,readCredential:authority})
 for(const id of ids)if(!await env.DB.prepare(`SELECT id FROM monitors WHERE id=? AND ${filter.sql}`).bind(id,...filter.params).first())throw new CredentialError(404,'Not found')
 authority.monitorIds=ids
 const now=Date.now(),window=Math.floor(now/60000),receipt=crypto.randomUUID()
 const results=await env.DB.batch([
  env.DB.prepare(`INSERT INTO uptime_credential_limits(grant_id,window,count) SELECT ?,?,1 WHERE ${fence.sql} ON CONFLICT(grant_id) DO UPDATE SET window=excluded.window,count=CASE WHEN uptime_credential_limits.window=excluded.window THEN count+1 ELSE 1 END WHERE (uptime_credential_limits.window<>excluded.window OR count<?) AND ${fence.sql} RETURNING count`).bind(authority.id,window,...fence.params,credentialLimit,...fence.params),
  env.DB.prepare(`INSERT INTO integration_token_usage(namespace,id,token_id,at,required_scopes,request_id,resource,allowed) SELECT ?,?,?,?,?,?,?,1 WHERE changes()>0 AND ${fence.sql}`).bind(authority.namespace,receipt,authority.tokenId,now,'["monitoring:read"]',receipt,'monitoring.read',...fence.params)
 ])
 if(!results[0].results.length){if(!await env.DB.prepare(`SELECT 1 WHERE ${fence.sql}`).bind(...fence.params).first())throw new CredentialError(401,'Credential required');throw new CredentialError(429,'Credential rate limit exceeded')}
 return authority
}
