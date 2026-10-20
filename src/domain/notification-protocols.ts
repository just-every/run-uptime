import {createWebhookProtocol,retryAfter} from '../base/modules/integrations/core/webhook.ts'
import {createSlackIncomingWebhookProtocol} from '../base/modules/integrations/slack/protocol.ts'
import {hmacBytes} from '../base/modules/integrations/core/crypto.ts'
// @ts-ignore Pure renderer shared with the Node dispatcher.
import {renderWebhookTemplate} from './webhook-template.mjs'
import type {NotificationCredential} from './notification-credentials.server.ts'
export function notificationProtocols(credential:NotificationCredential,credentialId:string,event?:any){
 const resolve=async(id:string)=>{if(id!==credentialId)throw Error('Destination version mismatch');return credential.endpoint};
 const base=createWebhookProtocol({resolveDestination:resolve,signingKey:async envelope=>{await resolve(envelope.destinationId);if(!credential.signing_secret)throw Error('Signing credential unavailable');return new TextEncoder().encode(credential.signing_secret)},timestampedBodySignature:{timestampHeader:'x-lamp-timestamp',signatureHeader:'x-lamp-signature'}});
 const legacy={...base,classify(response:any,now:number){
  const status=response.status;if(status>=400&&status<500&&status!==429)return {kind:'rejected' as const,code:'webhook_rejected',status};
  const delay=retryAfter(response,now);
  if(status===429&&delay!==undefined&&delay>86400000)return {kind:'rejected' as const,code:'retry_window_exhausted',status,retryAfterMs:delay};
  return {...base.classify(response,now),...(delay!==undefined&&(status===429||status>=500)?{retryAfterMs:delay}:{})};
 }};
 if(!credential.webhook)return [legacy,createSlackIncomingWebhookProtocol({resolveDestination:resolve})];
 const webhook=credential.webhook;
 const custom={id:'webhook',classify:legacy.classify,async prepare(envelope:any,now:number){
  await resolve(envelope.destinationId);if(!event||event.eventType!==envelope.event)throw Error('Immutable webhook event unavailable');
  const rendered=renderWebhookTemplate({config:webhook.config,event,baseUrl:credential.endpoint,headers:webhook.headers}),body=rendered.body??'';
  if(envelope.body!==body)throw Error('Webhook body differs from its immutable event and configuration');
  const protectedHeaders=webhook.signing?(await legacy.prepare(envelope,now)).headers:{'webhook-id':envelope.id,'webhook-tenant':envelope.tenant,'webhook-destination':envelope.destinationId,'webhook-event':envelope.event,'webhook-timestamp':String(Math.floor(now/1000))};
  const headers:Record<string,string>={...protectedHeaders,...rendered.headers};
  if(webhook.signing){
   headers['x-uptime-signature-input']=webhook.config.mode==='query'?'query':'body';
   if(webhook.config.mode==='query'){
    const bytes=await hmacBytes(new TextEncoder().encode(credential.signing_secret!),`${headers['x-lamp-timestamp']}.${new URL(rendered.url).search.slice(1)}`);
    headers['x-lamp-signature']=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
   }
  }
  if(webhook.config.mode==='query')delete headers['content-type'];
  return {method:rendered.method,url:rendered.url,body,headers};
 }};
 return [custom,createSlackIncomingWebhookProtocol({resolveDestination:resolve})];
}
