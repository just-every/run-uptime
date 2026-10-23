import type {AuthBindings} from '../operator-auth.server.ts'
import {mutationGuard} from '../audit.server.ts'
import {checkSecondFactor,MfaError,type MfaSession} from './policy.server.ts'
import {newTotpSecret,protect,reveal,totpCounter} from './crypto.server.ts'
import {challenge,readChallenge,consumeChallenge,commit,enrollmentGuard,proof,recoveryCodes} from './store.server.ts'
import {sendNotice} from './notices.server.ts'
export async function beginTotp(env:AuthBindings,session:MfaSession){
 const existing=await env.DB.prepare('SELECT 1 FROM uptime_mfa_factors WHERE operator_id=?').bind(session.operator.id).first()
 if(existing)await checkSecondFactor(env,session,true)
 if(await env.DB.prepare("SELECT 1 FROM uptime_mfa_factors WHERE operator_id=? AND kind='totp'").bind(session.operator.id).first())throw new MfaError(409,'factor_already_enrolled')
 const secret=newTotpSecret(),challengeId=await challenge(env,session,'totp-enroll',{secret})
 return {challengeId,secret,uri:`otpauth://totp/${encodeURIComponent('Uptime:'+session.operator.email)}?secret=${secret}&issuer=Uptime&algorithm=SHA1&digits=6&period=30`}
}
export async function finishTotp(env:AuthBindings,session:MfaSession,input:any){
 const {secret}=await readChallenge(env,session,input.challengeId,'totp-enroll'),counter=await totpCounter(secret,input.code)
 if(counter===null)throw new MfaError(400,'invalid_factor_response')
 const id=crypto.randomUUID(),sealed=await protect(env,session.operator.id,`factor:${id}`,{secret}),first=!await env.DB.prepare('SELECT 1 FROM uptime_mfa_factors WHERE operator_id=?').bind(session.operator.id).first()
 const recovery=first?await recoveryCodes(env,session):null
 const notice=await commit(env,session,'enrolled_totp',[enrollmentGuard(env,session),mutationGuard(env,"NOT EXISTS(SELECT 1 FROM uptime_mfa_factors WHERE operator_id=? AND kind='totp')",[session.operator.id]),...consumeChallenge(env,session,input.challengeId),env.DB.prepare("INSERT INTO uptime_mfa_factors(id,operator_id,kind,secret,counter,created_at) VALUES(?,?,'totp',?,?,?)").bind(id,session.operator.id,sealed,counter,Date.now()),...(recovery?.statements??[]),proof(env,session,'totp')])
 await sendNotice(env,notice)
 return {id,kind:'totp',...(recovery?{recoveryCodes:recovery.codes}:{})}
}
export async function verifyTotp(env:AuthBindings,session:MfaSession,input:any){
 const factor=await env.DB.prepare("SELECT id,secret,counter FROM uptime_mfa_factors WHERE operator_id=? AND kind='totp'").bind(session.operator.id).first<{id:string;secret:string;counter:number}>()
 if(!factor)throw new MfaError(400,'invalid_factor_response')
 const {secret}=await reveal(env,session.operator.id,`factor:${factor.id}`,factor.secret),counter=await totpCounter(secret,input.code)
 if(counter===null||counter<=factor.counter)throw new MfaError(400,'invalid_factor_response')
 const notice=await commit(env,session,'verified_totp',[mutationGuard(env,'EXISTS(SELECT 1 FROM uptime_mfa_factors WHERE id=? AND operator_id=? AND counter<?)',[factor.id,session.operator.id,counter]),env.DB.prepare('UPDATE uptime_mfa_factors SET counter=? WHERE id=?').bind(counter,factor.id),proof(env,session,'totp')])
 await sendNotice(env,notice);return {verified:true}
}
