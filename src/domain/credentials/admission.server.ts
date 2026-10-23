import {sha256} from '../../base/modules/integrations/core/crypto.ts'
import type {AuthBindings} from '../operator-auth.server.ts'
import {credentialFence,credentialLimit,CredentialError,type CredentialAuthority} from './model.server.ts'
export async function loadCredential(env:AuthBindings,request:Request,required:string):Promise<CredentialAuthority|null>{
 const header=request.headers.get('authorization')??'';if(!/^Bearer int_[a-f0-9]{64}$/.test(header))throw new CredentialError(401,'Credential required')
 const row=await env.DB.prepare(`SELECT g.*,t.id AS token_id,t.scopes FROM integration_tokens t JOIN uptime_credential_grants g ON g.namespace=t.namespace WHERE t.token_hash=?`).bind(await sha256(header.slice(7))).first<any>()
 if(!row)return null
 const tokenScopes=JSON.parse(row.scopes);if(!tokenScopes.includes(required))throw new CredentialError(403,'Credential scope required')
 const authority:CredentialAuthority={kind:'credential',id:row.id,namespace:row.namespace,tokenId:row.token_id,workspaceId:row.workspace_id,issuerId:row.issuer_id,issuerVersion:row.issuer_version,issuerRole:row.issuer_role,roleRevision:row.role_revision,revision:row.revision,resources:JSON.parse(row.resources),environment:row.environment,tokenScopes,requiredScope:required,scopes:[],role:'read-only',action:required==='monitoring:read'?'read':'import',monitorIds:[]}
 const fence=credentialFence(authority)
 if(!await env.DB.prepare(`SELECT 1 WHERE ${fence.sql}`).bind(...fence.params).first())throw new CredentialError(401,'Credential required')
 authority.scopes=(await env.DB.prepare('SELECT kind,value FROM uptime_member_scopes WHERE operator_id=?').bind(authority.issuerId).all<any>()).results
 return authority
}
export async function admitCredential(env:AuthBindings,authority:CredentialAuthority,resource:string){
 const fence=credentialFence(authority),now=Date.now(),window=Math.floor(now/60000),receipt=crypto.randomUUID()
 const results=await env.DB.batch([
  env.DB.prepare(`INSERT INTO uptime_credential_limits(grant_id,window,count) SELECT ?,?,1 WHERE ${fence.sql} ON CONFLICT(grant_id) DO UPDATE SET window=excluded.window,count=CASE WHEN uptime_credential_limits.window=excluded.window THEN count+1 ELSE 1 END WHERE (uptime_credential_limits.window<>excluded.window OR count<?) AND ${fence.sql} RETURNING count`).bind(authority.id,window,...fence.params,credentialLimit,...fence.params),
  env.DB.prepare(`INSERT INTO integration_token_usage(namespace,id,token_id,at,required_scopes,request_id,resource,allowed) SELECT ?,?,?,?,?,?,?,1 WHERE changes()>0 AND ${fence.sql}`).bind(authority.namespace,receipt,authority.tokenId,now,JSON.stringify([authority.requiredScope]),receipt,resource,...fence.params)
 ])
 if(!results[0].results.length){if(!await env.DB.prepare(`SELECT 1 WHERE ${fence.sql}`).bind(...fence.params).first())throw new CredentialError(401,'Credential required');throw new CredentialError(429,'Credential rate limit exceeded')}
}
