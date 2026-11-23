import type {Bindings} from '../control.server.ts'
import {operatorSession} from '../operator-auth.server.ts'
import {TokenService} from '../../base/modules/integrations/core/tokens.ts'
import {IntegrationsRepository} from '../../base/modules/integrations/core/repository.ts'
import {D1SqlDatabase} from '../../base/modules/integrations/core/database.ts'
import {sha256} from '../../base/modules/integrations/core/crypto.ts'
import {storageOperation} from '../storage-error.ts'
import {InputError} from '../request-boundary.ts'
const namespace='uptime-metrics',scope='metrics:read'
type Owner={id:string;version:number}
function service(env:Bindings){
 return new TokenService<Owner>(new IntegrationsRepository(new D1SqlDatabase(env.DB),namespace),{
  async grant(owner){return {scopes:[scope],commitGuard:{sql:"SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active'",params:[owner.id,owner.version]}}},
  async administer(owner){const row=await env.DB.prepare("SELECT id FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active'").bind(owner.id,owner.version).first();if(!row)throw Error('Owner authority required')},
 })
}
async function actor(env:Bindings,request:Request){const session=await operatorSession(env,request);if(!session)throw Error('Owner authority required');return {id:session.operator.id,version:session.operator.version}}
export async function authorizeMetrics(env:Bindings,request:Request){
 const header=request.headers.get('authorization')??'';if(!/^Bearer int_[0-9a-f]{64}$/.test(header))return false
 const hash=await sha256(header.slice(7)),now=Date.now()
 // A single statement evaluates current authority and records its decision,
 // including an unknown, expired, revoked or insufficiently scoped key.
 const receipt=await storageOperation('metrics.authorize',()=>env.DB.prepare(`INSERT INTO metrics_scrape_usage(token_id,allowed,at,rowid,request_id)
  SELECT COALESCE(t.id,''), t.id IS NOT NULL AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>?3)
   AND EXISTS(SELECT 1 FROM json_each(t.scopes) WHERE value=?4), ?3, ?5, ?6
  FROM (SELECT 1) LEFT JOIN integration_tokens t ON t.namespace=?1 AND t.token_hash=?2
  RETURNING allowed`).bind(namespace,hash,now,scope,crypto.randomUUID(),crypto.randomUUID()).first<{allowed:number}>())
 return receipt?.allowed===1
}
export async function metricsKeys(env:Bindings,request:Request){
 const owner=await actor(env,request),keys=await service(env).list(owner)
 const usage=await env.DB.prepare(`SELECT token_id,MAX(at) at FROM (
  SELECT token_id,MAX(at) at FROM integration_token_usage WHERE namespace=?1 AND allowed=1 GROUP BY token_id
  UNION ALL
  SELECT t.id,(SELECT at FROM metrics_scrape_usage WHERE token_id=t.id AND allowed=1 ORDER BY at DESC LIMIT 1)
  FROM integration_tokens t WHERE t.namespace=?1
 ) GROUP BY token_id`).bind(namespace).all<{token_id:string;at:number|null}>()
 return keys.map(key=>({...key,lastUsedAt:usage.results.find(row=>row.token_id===key.id)?.at??null}))
}
export async function createMetricsKey(env:Bindings,request:Request,input:any){
 if(Object.keys(input).some(key=>!['name','expiresAt'].includes(key))||typeof input.name!=='string'||!input.name.trim()||input.name.length>100||/[\x00-\x1f\x7f]/.test(input.name))throw new InputError('Use a key name of 1–100 printable characters')
 const now=Date.now(),expiresAt=input.expiresAt??now+90*86400000
 if(!Number.isSafeInteger(expiresAt)||expiresAt<=now||expiresAt>now+366*86400000)throw new InputError('Key expiry must be in the future and within 366 days')
 return service(env).issue(await actor(env,request),{name:input.name.trim(),scopes:[scope],expiresAt})
}
export async function revokeMetricsKey(env:Bindings,request:Request,id:string){return service(env).revoke(await actor(env,request),id)}
