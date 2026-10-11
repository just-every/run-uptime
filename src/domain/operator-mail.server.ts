import {mailSender} from './mail.server.ts'
// @ts-expect-error Maintained Base provider implementation performs validation.
import {createMailSender} from '../base/modules/mail/index.mjs'
import {auditStatement} from './audit.server.ts'
import {developmentOutbox} from './development-outbox.server.ts'
import {mailAuthority,mailAuthorityValues} from './operator-mail-authority.ts'
import type {AuthBindings} from './operator-auth.server.ts'
export function operatorMailSender(env:AuthBindings,development:boolean){
 if(development)return createMailSender({provider:'development',mode:'development'},{outbox:developmentOutbox(env.DB)});
 return {async send(message:any){
  const snapshot=structuredClone(message),deliveryId=snapshot.deliveryId;
  const sender=mailSender(env,{fetch:async(url:RequestInfo|URL,init?:RequestInit)=>{
   // Base validation completes before this edge. Per-message authority also
   // closes erasure races without depending on any provider's wire format.
   const result=await auditStatement(env,{kind:'feature',ref:'operator-auth-mail'},'notification_send','notification',undefined,mailAuthority,mailAuthorityValues(deliveryId)).run();
   if(!result.success||!result.meta.changes)throw Error('Authentication mail authority unavailable');
   return fetch(url,init);
  }});
  if(!sender)throw Error('Authentication mail is not configured');
  return sender.send(snapshot);
 }};
}
