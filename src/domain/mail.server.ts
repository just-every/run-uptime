// @ts-expect-error Base mail adapters are portable JavaScript.
import {createMailSender} from '../base/modules/mail/index.mjs'
import {relayMailSender} from './relay-mail.server.ts'
import {developmentOutbox} from './development-outbox.server.ts'
import type {AuthBindings} from './operator-auth.server.ts'
export function mailSender(env:AuthBindings,dependencies:any={}){
 const provider=env.MAIL_PROVIDER??'sendgrid';
 if(!env.MAIL_FROM)return null;
 if(provider==='development'){
  let url;try{url=new URL(env.UPTIME_ORIGIN!)}catch{return null}
  if(env.RER_DEMO!=='1'&&(env.UPTIME_LOCAL_REVIEW!=='true'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Development mail requires local runtime');
  return createMailSender({provider,mode:'development'},{outbox:developmentOutbox(env.DB,'notification')})
 }
 if(!['resend','sendgrid','cloudflare','rer'].includes(provider))throw Error('Invalid MAIL_PROVIDER');
 const apiKey=provider==='rer'?env.MAIL_API_KEY:provider==='sendgrid'?env.SENDGRID_API_KEY??env.MAIL_PROVIDER_API_KEY:provider==='cloudflare'?env.CLOUDFLARE_MAIL_API_KEY:env.MAIL_PROVIDER_API_KEY;
 if(!apiKey)return null;
 if(provider==='rer')return relayMailSender({provider,mode:'production',apiKey,relayUrl:env.MAIL_RELAY_URL},dependencies);
 return createMailSender({provider,mode:'production',apiKey,...(provider==='cloudflare'?{accountId:env.MAIL_ACCOUNT_ID}:{})},dependencies)
}
export function mailConfigured(env:AuthBindings){try{return Boolean(mailSender(env))}catch{return false}}
