import {operatorAuth,type AuthBindings} from '../operator-auth.server.ts'
import {mutationGuard} from '../audit.server.ts'
import {MfaError,checkSecondFactor,proofCondition,type MfaSession} from './policy.server.ts'
import {recoveryDigest} from './crypto.server.ts'
import {commit,proof,recoveryCodes} from './store.server.ts'
import {sendNotice} from './notices.server.ts'
export async function useRecovery(env:AuthBindings,session:MfaSession,input:any){
 if(typeof input.code!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(input.code))throw new MfaError(400,'invalid_factor_response')
 const digest=await recoveryDigest(env,session.operator.id,input.code)
 if(!await env.DB.prepare('SELECT 1 FROM uptime_mfa_recovery WHERE operator_id=? AND digest=? AND used_at IS NULL').bind(session.operator.id,digest).first())throw new MfaError(400,'invalid_factor_response')
 const notice=await commit(env,session,'recovery_used',[mutationGuard(env,'EXISTS(SELECT 1 FROM uptime_mfa_recovery WHERE operator_id=? AND digest=? AND used_at IS NULL)',[session.operator.id,digest]),env.DB.prepare('UPDATE uptime_mfa_recovery SET used_at=? WHERE operator_id=? AND digest=?').bind(Date.now(),session.operator.id,digest),proof(env,session,'recovery')])
 await sendNotice(env,notice);return {verified:true}
}
export async function rotateRecovery(env:AuthBindings,session:MfaSession){
 await checkSecondFactor(env,session,true)
 const recovery=await recoveryCodes(env,session),notice=await commit(env,session,'recovery_rotated',[freshGuard(env,session),...recovery.statements])
 await sendNotice(env,notice);return {recoveryCodes:recovery.codes}
}
export function freshGuard(env:AuthBindings,session:MfaSession){return mutationGuard(env,`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND ${proofCondition(true)})`,[session.id])}
const authorityTables=['uptime_mfa_challenges','uptime_mfa_proofs','uptime_mfa_recovery','uptime_mfa_factors']
export async function removeFactor(env:AuthBindings,session:MfaSession,id:string){
 await checkSecondFactor(env,session,true)
 const own=await env.DB.prepare('SELECT 1 FROM uptime_mfa_factors WHERE operator_id=? AND id=?').bind(session.operator.id,id).first()
 if(!own)throw new MfaError(404,'factor_not_found')
 const statements=[freshGuard(env,session),env.DB.prepare('DELETE FROM uptime_mfa_factors WHERE operator_id=? AND id=?').bind(session.operator.id,id)]
 // Last-factor removal requires a new enrollment. Old challenges/proofs/codes
 // cannot reauthorize the account, whether or not require-all is enabled.
 statements.push(...authorityTables.filter(t=>t!=='uptime_mfa_factors').map(t=>env.DB.prepare(`DELETE FROM ${t} WHERE operator_id=? AND NOT EXISTS(SELECT 1 FROM uptime_mfa_factors WHERE operator_id=?)`).bind(session.operator.id,session.operator.id)))
 const notice=await commit(env,session,'factor_removed',statements);await sendNotice(env,notice);return {removed:true}
}
export async function resetMember(env:AuthBindings,session:MfaSession,input:any){
 await checkSecondFactor(env,session,true)
 if(session.operator.role!=='owner'||typeof input.operatorId!=='string'||input.operatorId===session.operator.id)throw new MfaError(403,'owner_reset_other_member_required')
 const target=await env.DB.prepare("SELECT id FROM oa_operators WHERE id=? AND status='active'").bind(input.operatorId).first<{id:string}>()
 if(!target)throw new MfaError(404,'member_not_found')
 const sessions=(await env.DB.prepare('SELECT id FROM oa_sessions WHERE operator_id=? AND revoked_at IS NULL').bind(target.id).all<{id:string}>()).results
 for(const row of sessions)await operatorAuth(env).accounts.revokeSession(row.id)
 const notice=await commit(env,session,'owner_reset',[freshGuard(env,session),mutationGuard(env,'NOT EXISTS(SELECT 1 FROM oa_sessions WHERE operator_id=? AND revoked_at IS NULL AND expires_at>unixepoch()*1000)',[target.id]),mutationGuard(env,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')",[session.operator.id]),...authorityTables.map(t=>env.DB.prepare(`DELETE FROM ${t} WHERE operator_id=?`).bind(target.id))],target.id)
 // Base owns revocation; a concurrent sign-in refuses reset rather than
 // letting an unrevoked old session become factorless after the wipe.
 await sendNotice(env,notice);return {reset:true}
}
export async function changePolicy(env:AuthBindings,session:MfaSession,input:any){
 await checkSecondFactor(env,session,true)
 if(session.operator.role!=='owner')throw new MfaError(403,'owner_policy_required')
 if(typeof input.required!=='boolean')throw new MfaError(400,'required_boolean')
 const notice=await commit(env,session,'policy_changed',[freshGuard(env,session),mutationGuard(env,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')",[session.operator.id]),env.DB.prepare('UPDATE uptime_mfa_policy SET required=?,revision=revision+1 WHERE singleton=1').bind(input.required?1:0)])
 let revoked=0
 if(input.required){
  const sessions=(await env.DB.prepare(`SELECT s.id FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.revoked_at IS NULL AND NOT (${proofCondition()})`).all<{id:string}>()).results
  for(const row of sessions){await operatorAuth(env).accounts.revokeSession(row.id);revoked++}
 }
 await sendNotice(env,notice);return {required:input.required,revokedSessions:revoked}
}
