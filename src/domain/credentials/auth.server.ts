import {loadCredential,admitCredential} from './admission.server.ts'
import type {AuthBindings} from '../operator-auth.server.ts'
import {credentialFence,credentialMonitorFilter,credentialLimit,CredentialError,monitoringCapability,type CredentialAuthority} from './model.server.ts'
export async function credentialPermission(env:AuthBindings,request:Request):Promise<CredentialAuthority|null>{
 if(!monitoringCapability(request))throw new CredentialError(403,'Credential does not authorize this method or path')
 const authority=await loadCredential(env,request,'monitoring:read');if(!authority)return null
 // Check explicit resources before any usage/counter write; identical absent/outside result.
 const url=new URL(request.url),monitor=/^\/api\/v1\/monitors\/([^/]+)/.exec(url.pathname),incident=/^\/api\/v1\/incidents\/([^/]+)/.exec(url.pathname)
 const ids=monitor?[decodeURIComponent(monitor[1])]:url.searchParams.getAll('monitor').flatMap(v=>v.split(','))
 if(incident){const found=await env.DB.prepare("SELECT monitor_id FROM outbox WHERE id=? AND kind='trigger'").bind(decodeURIComponent(incident[1])).first<{monitor_id:string}>();if(!found)throw new CredentialError(404,'Not found');ids.push(found.monitor_id)}
 if(ids.length>(url.pathname==='/api/v1/metrics'?100:500)||ids.some(id=>!id||id.length>512)||new Set(ids).size!==ids.length)throw new CredentialError(400,'Invalid monitor selection')
 const filter=credentialMonitorFilter({...env,readCredential:authority})
 for(const id of ids)if(!await env.DB.prepare(`SELECT id FROM monitors WHERE id=? AND ${filter.sql}`).bind(id,...filter.params).first())throw new CredentialError(404,'Not found')
 authority.monitorIds=ids
 await admitCredential(env,authority,'monitoring.read')
 return authority
}
