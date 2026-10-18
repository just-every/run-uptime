import {mailSender} from './mail.server.ts'
// @ts-expect-error Maintained Base provider implementation performs validation.
import {createMailSender,MailValidationError} from '../base/modules/mail/index.mjs'
import {mailAuthority,mailAuthorityValues} from './operator-mail-authority.ts'
import {claimAuxiliary,submitAuxiliary,finishAuxiliary,latestAuxiliary} from './auxiliary-execution.server.ts'
import type {AuthBindings} from './operator-auth.server.ts'
export function operatorMailSender(env:AuthBindings,development:boolean){
 return {async send(message:any){
  const snapshot=structuredClone(message),deliveryId=snapshot.deliveryId,values=mailAuthorityValues(deliveryId);
  const attempt=await claimAuxiliary(env,'auth-mail',deliveryId,Date.now(),{authority:mailAuthority,values});
  if(!attempt){
   const prior=await latestAuxiliary(env,'auth-mail',deliveryId);
   if(!prior)throw Error('Authentication mail authority unavailable');
   return {provider:env.MAIL_PROVIDER??'sendgrid',status:['accepted','development','rejected','rate_limited'].includes(prior.outcome)?prior.outcome:'uncertain',providerMessageId:null,code:'previous_auxiliary_attempt'};
  }
  let submitted=false;
  const handoff=async()=>{await submitAuxiliary(env,attempt,Date.now(),mailAuthority,values);submitted=true};
  try{
   const sender=development?createMailSender({provider:'development',mode:'development'}):mailSender(env,{fetch:async(url:RequestInfo|URL,init?:RequestInit)=>{
    // Serialization is complete; erasure and lease authority are checked at
    // the one provider boundary, before any recipient or content can leave.
    await handoff();return fetch(url,init);
   }});
   if(!sender)throw Error('Authentication mail is not configured');
   if(development)await handoff();
   const result=await sender.send(snapshot);
   await finishAuxiliary(env,attempt,submitted?result.status:'expired',submitted?(result.code??`mail_${result.status}`):'submission_not_started');
   if(!submitted)throw Error('Authentication mail submission did not start');
   return result;
  }catch(error){
   await finishAuxiliary(env,attempt,submitted?'uncertain':error instanceof MailValidationError?'rejected':'expired',submitted?'mail_result_unknown':'submission_not_started');
   throw error;
  }
 }};
}
