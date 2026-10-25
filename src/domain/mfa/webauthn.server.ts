import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server'
import type {AuthBindings} from '../operator-auth.server.ts'
import {mutationGuard} from '../audit.server.ts'
import {checkSecondFactor,MfaError,type MfaSession} from './policy.server.ts'
import {protect,reveal,encode,decode} from './crypto.server.ts'
import {challenge,readChallenge,consumeChallenge,commit,enrollmentGuard,proof,recoveryCodes} from './store.server.ts'
import {sendNotice} from './notices.server.ts'
export function passkeysAvailable(env:AuthBindings){
 const origin=new URL(env.UPTIME_ORIGIN!)
 return origin.protocol==='https:'||origin.protocol==='http:'&&origin.hostname==='localhost'
}
function relyingParty(env:AuthBindings){
 const origin=new URL(env.UPTIME_ORIGIN!)
 if(!passkeysAvailable(env))throw new MfaError(400,'webauthn_requires_https_or_localhost')
 return {origin:origin.origin,rpID:origin.hostname}
}
async function factors(env:AuthBindings,session:MfaSession){return (await env.DB.prepare("SELECT id,credential_id,secret,counter FROM uptime_mfa_factors WHERE operator_id=? AND kind='webauthn'").bind(session.operator.id).all<{id:string;credential_id:string;secret:string;counter:number}>()).results}
export async function beginWebAuthn(env:AuthBindings,session:MfaSession,enroll:boolean){
 const {rpID}=relyingParty(env),keys=await factors(env,session)
 if(enroll){
  if(await env.DB.prepare('SELECT 1 FROM uptime_mfa_factors WHERE operator_id=?').bind(session.operator.id).first())await checkSecondFactor(env,session,true)
  if(keys.length>=10)throw new MfaError(409,'factor_limit')
  const options=await generateRegistrationOptions({rpName:'Uptime',rpID,userID:new TextEncoder().encode(session.operator.id),userName:session.operator.email,attestationType:'none',excludeCredentials:keys.map(k=>({id:k.credential_id})),authenticatorSelection:{residentKey:'preferred',userVerification:'required'},supportedAlgorithmIDs:[-7,-257]})
  const challengeId=await challenge(env,session,'webauthn-enroll',{challenge:options.challenge})
  return {challengeId,options}
 }
 if(!keys.length)throw new MfaError(400,'no_passkey_enrolled')
 const options=await generateAuthenticationOptions({rpID,userVerification:'required',allowCredentials:keys.map(k=>({id:k.credential_id}))})
 const challengeId=await challenge(env,session,'webauthn-verify',{challenge:options.challenge})
 return {challengeId,options}
}
export async function finishWebAuthn(env:AuthBindings,session:MfaSession,input:any,enroll:boolean){
 const {origin,rpID}=relyingParty(env),pending=await readChallenge(env,session,input.challengeId,enroll?'webauthn-enroll':'webauthn-verify')
 if(!input.credential||typeof input.credential!=='object')throw new MfaError(400,'invalid_factor_response')
 if(enroll){
  let verified;try{verified=await verifyRegistrationResponse({response:input.credential,expectedChallenge:pending.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true})}catch{throw new MfaError(400,'invalid_factor_response')}
  if(!verified.verified||!verified.registrationInfo)throw new MfaError(400,'invalid_factor_response')
  const credential=verified.registrationInfo.credential,id=crypto.randomUUID(),secret=await protect(env,session.operator.id,`factor:${id}`,{publicKey:encode(credential.publicKey),transports:credential.transports??[]})
  const first=!await env.DB.prepare('SELECT 1 FROM uptime_mfa_factors WHERE operator_id=?').bind(session.operator.id).first(),recovery=first?await recoveryCodes(env,session):null
  const notice=await commit(env,session,'enrolled_webauthn',[enrollmentGuard(env,session),mutationGuard(env,"(SELECT COUNT(*) FROM uptime_mfa_factors WHERE operator_id=? AND kind='webauthn')<10 AND NOT EXISTS(SELECT 1 FROM uptime_mfa_factors WHERE credential_id=?)",[session.operator.id,credential.id]),...consumeChallenge(env,session,input.challengeId),env.DB.prepare("INSERT INTO uptime_mfa_factors(id,operator_id,kind,secret,credential_id,counter,created_at) VALUES(?,?,'webauthn',?,?,?,?)").bind(id,session.operator.id,secret,credential.id,credential.counter,Date.now()),...(recovery?.statements??[]),proof(env,session,'webauthn')])
  await sendNotice(env,notice);return {id,kind:'webauthn',...(recovery?{recoveryCodes:recovery.codes}:{})}
 }
 const factor=(await factors(env,session)).find(key=>key.credential_id===input.credential.id)
 if(!factor)throw new MfaError(400,'invalid_factor_response')
 const material=await reveal(env,session.operator.id,`factor:${factor.id}`,factor.secret)
 let verified;try{verified=await verifyAuthenticationResponse({response:input.credential,expectedChallenge:pending.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,credential:{id:factor.credential_id,publicKey:decode(material.publicKey),counter:factor.counter,transports:material.transports}})}catch{throw new MfaError(400,'invalid_factor_response')}
 if(!verified.verified)throw new MfaError(400,'invalid_factor_response')
 const notice=await commit(env,session,'verified_webauthn',[...consumeChallenge(env,session,input.challengeId),mutationGuard(env,'EXISTS(SELECT 1 FROM uptime_mfa_factors WHERE id=? AND operator_id=? AND counter=?)',[factor.id,session.operator.id,factor.counter]),env.DB.prepare('UPDATE uptime_mfa_factors SET counter=? WHERE id=?').bind(verified.authenticationInfo.newCounter,factor.id),proof(env,session,'webauthn')])
 await sendNotice(env,notice);return {verified:true}
}
