import type {Bindings} from '../domain/control.server.ts'
import {authenticatedSession} from '../domain/operator-auth.server.ts'
import {requireFreshSecondFactor,mfaCondition} from '../domain/mfa/policy.server.ts'
import type {AgentDoorOptions} from '../base/modules/agent-door/index.ts'
import {canonical} from '../base/modules/agent-door/policy/document.ts'
import {sha} from '../domain/control.server.ts'
export function nativeProof(env:Bindings):NonNullable<AgentDoorOptions['nativeProof']>{return {
 handoff:()=>'/app/settings',
 async verify({tool,args,principal,reference}){
  return !!await env.DB.prepare(`SELECT 1 FROM uptime_agent_native_proof p JOIN oa_sessions s ON s.id=p.session_id JOIN oa_operators o ON o.id=p.operator_id
   WHERE p.id=? AND p.operator_id=? AND p.agent_id=? AND p.tool=? AND p.arguments_sha256=? AND p.expires_at>? AND o.status='active' AND o.version=p.operator_version
   AND s.operator_id=o.id AND s.operator_version=o.version AND s.revoked_at IS NULL AND s.expires_at>? AND ${mfaCondition(true)}`)
   .bind(reference,principal.person.id,principal.agent.id,tool,await sha(canonical(args)),Date.now(),Date.now()).first()
 },
}}
export async function nativeProofResponse(env:Bindings,request:Request){
 if(new URL(request.url).pathname!=='/agents/native-proof')return null
 if(request.method!=='POST')return Response.json({code:'method_not_allowed'},{status:405})
 if(request.headers.get('origin')!==env.UPTIME_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({code:'same_origin_required'},{status:403})
 try{
  const session=await requireFreshSecondFactor(env,request),input=await request.json() as any
  if(!input||Object.keys(input).sort().join(',')!=='agent_id,arguments,tool'||typeof input.agent_id!=='string'||!input.agent_id||input.agent_id.length>512||typeof input.tool!=='string'||!input.tool.startsWith('uptime.')||!input.arguments||typeof input.arguments!=='object'||Array.isArray(input.arguments)||JSON.stringify(input.arguments).length>65536)return Response.json({code:'invalid_arguments'},{status:400})
  const reference=crypto.randomUUID(),expiresAt=Date.now()+300000
  await env.DB.prepare('INSERT INTO uptime_agent_native_proof(id,operator_id,operator_version,session_id,agent_id,tool,arguments_sha256,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(reference,session.operator.id,session.operator.version,session.id,input.agent_id,input.tool,await sha(canonical(input.arguments)),expiresAt).run()
  return Response.json({reference,expires_at:expiresAt},{headers:{'cache-control':'no-store'}})
 }catch{return Response.json({code:'fresh_second_factor_required'},{status:403,headers:{'cache-control':'no-store'}})}
}
