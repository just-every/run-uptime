import type {AuthBindings} from '../operator-auth.server.ts'
import {auditStatement,mutationGuard} from '../audit.server.ts'
import {MfaError,proofCondition,type MfaSession} from './policy.server.ts'
import {protect,reveal,randomToken,recoveryDigest} from './crypto.server.ts'
// @ts-ignore Shared audit vocabulary is also used by archive validation.
import {MFA_ACTIONS} from './actions.mjs'
export function liveFence(session:MfaSession){return {sql:`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND o.id=? AND o.version=? AND s.operator_version=o.version AND o.status='active' AND s.revoked_at IS NULL AND s.expires_at>unixepoch()*1000)`,values:[session.id,session.operator.id,session.operator.version]}}
export function liveGuard(env:AuthBindings,session:MfaSession){const f=liveFence(session);return mutationGuard(env,f.sql,f.values)}
export function enrollmentGuard(env:AuthBindings,session:MfaSession){return mutationGuard(env,`NOT EXISTS(SELECT 1 FROM uptime_mfa_factors WHERE operator_id=?) OR EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND ${proofCondition(true)})`,[session.operator.id,session.id])}
export async function limited(env:AuthBindings,session:MfaSession){
 const now=Date.now(),window=600000
 const result=await env.DB.batch([liveGuard(env,session),env.DB.prepare(`INSERT INTO uptime_mfa_limits(operator_id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(operator_id) DO UPDATE SET window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END, attempts=CASE WHEN window_start<=? THEN 1 ELSE attempts+1 END RETURNING attempts`).bind(session.operator.id,now,now-window,now-window)])
 if((result[1].results[0] as any).attempts>30)throw new MfaError(429,'mfa_rate_limited')
}
export function proof(env:AuthBindings,session:MfaSession,method:string){return env.DB.prepare(`INSERT INTO uptime_mfa_proofs(session_id,operator_id,operator_version,verified_at,method) VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET operator_version=excluded.operator_version,verified_at=excluded.verified_at,method=excluded.method`).bind(session.id,session.operator.id,session.operator.version,Date.now(),method)}
export async function commit(env:AuthBindings,session:MfaSession,action:string,statements:D1PreparedStatement[],noticeOperator=session.operator.id){
 if(!MFA_ACTIONS.includes(action))throw Error('Unknown second-factor audit action')
 const notice=crypto.randomUUID()
 try{await env.DB.batch([liveGuard(env,session),...statements,auditStatement(env,{kind:'operator',ref:session.operator.id},`mfa_${action}`,'operator'),env.DB.prepare('INSERT INTO uptime_mfa_notices(id,operator_id,action,created_at,outcome) VALUES(?,?,?,?,?)').bind(notice,noticeOperator,action,Date.now(),'pending')])}
 catch(error){if(/NOT NULL constraint failed: uptime_audit\.id/.test(String(error)))throw new MfaError(409,'mfa_authority_changed');throw error}
 return notice
}
export async function challenge(env:AuthBindings,session:MfaSession,kind:string,data:any){
 const id=randomToken(),secret=await protect(env,session.operator.id,`challenge:${id}`,data)
 await env.DB.batch([liveGuard(env,session),env.DB.prepare('DELETE FROM uptime_mfa_challenges WHERE operator_id=? AND (expires_at<? OR consumed_at IS NOT NULL)').bind(session.operator.id,Date.now()),env.DB.prepare('INSERT INTO uptime_mfa_challenges(id,operator_id,session_id,operator_version,kind,secret,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,session.operator.id,session.id,session.operator.version,kind,secret,Date.now()+300000)])
 return id
}
export async function readChallenge(env:AuthBindings,session:MfaSession,id:unknown,kind:string){
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(id))throw new MfaError(400,'invalid_factor_response')
 const row=await env.DB.prepare('SELECT secret FROM uptime_mfa_challenges WHERE id=? AND operator_id=? AND session_id=? AND operator_version=? AND kind=? AND expires_at>? AND consumed_at IS NULL').bind(id,session.operator.id,session.id,session.operator.version,kind,Date.now()).first<{secret:string}>()
 if(!row)throw new MfaError(400,'invalid_factor_response')
 return reveal(env,session.operator.id,`challenge:${id}`,row.secret)
}
export function consumeChallenge(env:AuthBindings,session:MfaSession,id:string){return [mutationGuard(env,'EXISTS(SELECT 1 FROM uptime_mfa_challenges WHERE id=? AND session_id=? AND operator_id=? AND operator_version=? AND consumed_at IS NULL AND expires_at>unixepoch()*1000)',[id,session.id,session.operator.id,session.operator.version]),env.DB.prepare('UPDATE uptime_mfa_challenges SET consumed_at=? WHERE id=?').bind(Date.now(),id)]}
export async function recoveryCodes(env:AuthBindings,session:MfaSession){
 const codes=Array.from({length:10},()=>randomToken()),digests=await Promise.all(codes.map(code=>recoveryDigest(env,session.operator.id,code)))
 return {codes,statements:[env.DB.prepare('DELETE FROM uptime_mfa_recovery WHERE operator_id=?').bind(session.operator.id),...digests.map((digest:string)=>env.DB.prepare('INSERT INTO uptime_mfa_recovery(operator_id,digest) VALUES(?,?)').bind(session.operator.id,digest))]}
}
