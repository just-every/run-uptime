// @ts-expect-error Base mail adapters are portable JavaScript.
import {createMailSender,MailValidationError} from '../base/modules/mail/index.mjs'
import {relayMailSender} from './relay-mail.server.ts'
import type {AuthBindings} from './operator-auth.server.ts'
// MAIL_RECIPIENTS=owner: every message this installation sends goes to OWNER_EMAIL alone. Any other recipient is refused before
// a provider is called, so invitations, member notices and other destinations can never reach anyone else.
const mailbox=(value:string)=>{const text=value.trim(),open=text.lastIndexOf('<');return (text.endsWith('>')&&open>=0?text.slice(open+1,-1):text).trim().toLowerCase()};
function ownerOnly(env:AuthBindings,sender:any){
 if(env.MAIL_RECIPIENTS!=='owner')return sender;
 const owner=env.OWNER_EMAIL?mailbox(env.OWNER_EMAIL):'';
 return {...sender,async send(message:any){
  const recipients=[...(message.to??[]),...(message.cc??[]),...(message.bcc??[])];
  if(!owner||!recipients.length||recipients.some((value:string)=>mailbox(String(value))!==owner))throw new MailValidationError('recipient_not_owner');
  return sender.send(message)
 }}
}
export function mailSender(env:AuthBindings,dependencies:any={}){
 const sender=providerSender(env,dependencies);
 return sender&&ownerOnly(env,sender)
}
function providerSender(env:AuthBindings,dependencies:any={}){
 const provider=env.MAIL_PROVIDER??'sendgrid';
 if(provider==='none')return null;
 if(!env.MAIL_FROM)return null;
 if(provider==='development'){
  let url;try{url=new URL(env.UPTIME_ORIGIN!)}catch{return null}
  if(env.RER_DEMO!=='1'&&(env.UPTIME_LOCAL_REVIEW!=='true'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Development mail requires local runtime');
  return createMailSender({provider,mode:'development'})
 }
 if(!['resend','sendgrid','cloudflare','rer'].includes(provider))throw Error('Invalid MAIL_PROVIDER');
 const apiKey=provider==='rer'?env.MAIL_API_KEY:provider==='sendgrid'?env.SENDGRID_API_KEY??env.MAIL_PROVIDER_API_KEY:provider==='cloudflare'?env.CLOUDFLARE_MAIL_API_KEY:env.MAIL_PROVIDER_API_KEY;
 if(!apiKey)return null;
 if(provider==='rer')return relayMailSender({provider,mode:'production',apiKey,relayUrl:env.MAIL_RELAY_URL},dependencies);
 return createMailSender({provider,mode:'production',apiKey,...(provider==='cloudflare'?{accountId:env.MAIL_ACCOUNT_ID}:{})},dependencies)
}
export function mailConfigured(env:AuthBindings){try{return Boolean(mailSender(env))}catch{return false}}
