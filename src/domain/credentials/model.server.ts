import type {Scope} from '../access.server.ts'
export type Resources={mode:'workspace'|'selection';monitorIds:string[];tags:string[]}
export type CredentialAuthority={kind:'credential';id:string;namespace:string;tokenId:string;workspaceId:string;issuerId:string;issuerVersion:number;issuerRole:string;roleRevision:number;revision:number;resources:Resources;environment:string|null;tokenScopes:string[];requiredScope:string;scopes:Scope[];role:'read-only';action:string;monitorIds:string[]}
export type CredentialEnvironment={DB:D1Database;readCredential?:CredentialAuthority}
export class CredentialError extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status}}
export const credentialLimit=60
// A durable live ceiling, shared by allowed-use admission and later mutation fences.
export function credentialFence(authority:CredentialAuthority){return {sql:`EXISTS(SELECT 1 FROM uptime_credential_grants g JOIN uptime_credential_workspace w ON w.id=g.workspace_id AND w.singleton=1 JOIN integration_tokens t ON t.namespace=g.namespace JOIN oa_operators o ON o.id=g.issuer_id JOIN uptime_member_roles r ON r.operator_id=o.id
 WHERE g.id=? AND g.namespace=? AND g.workspace_id=? AND g.revision=? AND t.id=? AND ? IN(SELECT value FROM json_each(t.scopes)) AND g.environment IS ? AND t.revoked_at IS NULL AND t.expires_at>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 AND o.status='active' AND o.version=g.issuer_version AND o.version=? AND o.role=g.issuer_role AND o.role=? AND r.base_version=o.version AND r.base_role=o.role AND r.role=g.issuer_role AND r.revision=g.role_revision AND r.revision=?)`,params:[authority.id,authority.namespace,authority.workspaceId,authority.revision,authority.tokenId,authority.requiredScope,authority.environment,authority.issuerVersion,authority.issuerRole,authority.roleRevision]}}
// Alias is a source-code identifier, never request input. Selection=[] stays empty.
export function credentialMonitorFilter(env:CredentialEnvironment,alias='monitors'){
 const a=env.readCredential;if(!a)return {sql:'1',params:[] as (string|number)[]}
 const live=credentialFence(a),r=a.resources,conditions:string[]=[],values:string[]=[]
 if(r.mode==='selection'){
  if(r.monitorIds.length){conditions.push(`${alias}.id IN(SELECT value FROM json_each(?))`);values.push(JSON.stringify(r.monitorIds))}
  if(r.tags.length){conditions.push(`EXISTS(SELECT 1 FROM json_each(json_extract(${alias}.definition,'$.tags')) mt WHERE mt.value IN(SELECT value FROM json_each(?)))`);values.push(JSON.stringify(r.tags))}
  if(!conditions.length)conditions.push('0')
 }
 return {sql:`${live.sql} AND (${conditions.join(' AND ')||'1'}) AND NOT EXISTS(SELECT 1 FROM uptime_member_scopes s WHERE s.operator_id=? GROUP BY s.kind HAVING MAX(CASE WHEN s.kind='service' AND s.value=json_extract(${alias}.definition,'$.service') OR s.kind='team' AND s.value=json_extract(${alias}.definition,'$.group') THEN 1 ELSE 0 END)=0)`,params:[...live.params,...values,a.issuerId]}
}
export function monitoringCapability(request:Request){const p=new URL(request.url).pathname;return ['GET','HEAD'].includes(request.method)&&(/^\/api\/v1\/(?:monitors|uptime|incidents|metrics)$/.test(p)||/^\/api\/v1\/monitors\/[^/]+(?:\/(?:uptime|report|response-times))?$/.test(p)||/^\/api\/v1\/incidents\/[^/]+$/.test(p))}
