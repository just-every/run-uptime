import {authenticatedSession,type AuthBindings} from '../operator-auth.server.ts'
export type MfaSession=NonNullable<Awaited<ReturnType<typeof authenticatedSession>>>
export class MfaError extends Error {
 status:number;code:string
 constructor(status:number,code:string){super(code==='second_factor_required'?'Second-factor verification required':code==='fresh_second_factor_required'?'Verify a second factor within the last five minutes':code==='mfa_rate_limited'?'Too many second-factor attempts':code==='session_required'?'Owner session required':'Second-factor operation refused');this.status=status;this.code=code}
}
export function mfaResponse(error:unknown){return error instanceof MfaError?Response.json({error:error.message,code:error.code},{status:error.status,headers:{'cache-control':'no-store, private',...(error.status===429?{'retry-after':'600'}:{})}}):null}
export function proofCondition(fresh=false){return `EXISTS(SELECT 1 FROM uptime_mfa_proofs mp WHERE mp.session_id=s.id AND mp.operator_id=o.id AND mp.operator_version=o.version${fresh?` AND mp.verified_at>=${Date.now()-300000}`:''})`}
export function mfaCondition(fresh=false){return fresh?proofCondition(true):`((SELECT required FROM uptime_mfa_policy WHERE singleton=1)=0 AND NOT EXISTS(SELECT 1 FROM uptime_mfa_factors mf WHERE mf.operator_id=o.id) OR ${proofCondition()})`}
export async function checkSecondFactor(env:AuthBindings,session:MfaSession,fresh=false){
 const sql=`SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND o.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND o.status='active' AND s.operator_version=o.version AND o.version=? AND ${mfaCondition(fresh)}`
 if(!await env.DB.prepare(sql).bind(session.id,session.operator.id,Date.now(),session.operator.version).first())throw new MfaError(403,fresh?'fresh_second_factor_required':'second_factor_required')
}
// For new credential doors as well as ordinary request policy. Always re-read
// Base first: a proof cannot resurrect a revoked session or inactive identity.
export async function requireFreshSecondFactor(env:AuthBindings,request:Request){const session=await authenticatedSession(env,request);if(!session)throw new MfaError(401,'session_required');await checkSecondFactor(env,session,true);return session}
export function requestNeedsStepUp(request:Request,input?:any){
 const path=new URL(request.url).pathname,write=!['GET','HEAD'].includes(request.method)
 if(path==='/api/archive'||path==='/api/restore')return true
 if(path.startsWith('/api/operator/import/')&&write)return true
 if(!write)return false
 if(request.method==='DELETE'&&/^\/api\/notifications\/destinations\/[^/]+$/.test(path))return true
 if(/\/erase$/.test(path)||path==='/api/notifications/destinations'||/^\/api\/notifications\/destinations\/[^/]+\/(?:rotate|credentials)$/.test(path))return true
 if(path==='/api/routing/teams')return true
 if(path.startsWith('/api/access/')||/^\/auth\/(?:invite|operator\/role|operator\/status)/.test(path))return true
 if(/^\/api\/(?:metrics\/keys|runners|private-|synthetic-|credentials|tokens|ci\/)/.test(path))return true
 if(/\/(?:effect-grants|heartbeat-key)(?:\/|$)/.test(path))return true
 if(input&&(input.privateGrantRef||input.network==='private'||input.network==='synthetic'||input.request?.credentialRef||['flow','api','mail'].includes(input.type)))return true
 return false
}
