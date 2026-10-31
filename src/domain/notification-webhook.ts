// @ts-ignore Shared versioned renderer also runs on the Node dispatcher.
import {normalizeWebhookTemplate,renderWebhookTemplate,webhookTemplateWarnings,webhookTemplateSamples,webhookSampleKind,oncallReceipt} from './webhook-template.mjs'
import {validateDestination} from '../base/modules/integrations/core/destination.ts'
// @ts-expect-error Maintained Base sealed-context primitive.
import {keyedHash,seal,unseal} from '../base/modules/operator-auth/identity/oidc/crypto.mjs'
import {testEvent} from './notification-content.ts'
import type {Bindings} from './control.server.ts'
import type {NotificationCredential} from './notification-credentials.server.ts'
export type WebhookSnapshot={config:any;headers:Record<string,string>;signing:boolean};
export function portableWebhookConfig(value:any){return value===null?null:normalizeWebhookTemplate(value)}
export function webhookConfigText(credential:NotificationCredential){return credential.webhook?JSON.stringify(credential.webhook.config):null}
export function normalizeWebhookSnapshot(value:any):WebhookSnapshot{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='config,headers,signing'||typeof value.signing!=='boolean')throw Error('Invalid webhook credential configuration');
 const config=normalizeWebhookTemplate(value.config);
 if(config.mode==='oncall'&&(!value.signing||!/^Bearer [A-Za-z0-9._~-]{32,200}$/.test(value.headers?.authorization??'')))throw Error('Oncall requires signing enabled and a scoped bearer token');
 // Rendering validates exact header names, values and the total byte bound;
 // its sample contains no installation or customer authority.
 renderWebhookTemplate({config,event:webhookTemplateSamples()[0],baseUrl:'https://example.com/',headers:value.headers});
 const headers=Object.fromEntries(Object.entries(value.headers).map(([name,value])=>[name.toLowerCase(),value])) as Record<string,string>;
 return {config,headers,signing:value.signing};
}
export function webhookInput(input:any,current?:NotificationCredential):WebhookSnapshot|undefined{
 const hasConfig=Object.hasOwn(input,'webhookTemplate'),config=hasConfig?portableWebhookConfig(input.webhookTemplate):current?.webhook?.config??null;
 if(config===null){
  if(input.webhookSigning===false||input.webhookHeaders!==undefined&&(!input.webhookHeaders||typeof input.webhookHeaders!=='object'||Array.isArray(input.webhookHeaders)||Object.keys(input.webhookHeaders).length))throw Error('Custom headers and optional signing require a webhook template');
  return undefined;
 }
 const sameNames=current?.webhook&&JSON.stringify([...config.headerNames].sort())===JSON.stringify([...current.webhook.config.headerNames].sort());
 const headers=input.webhookHeaders!==undefined?input.webhookHeaders:sameNames?current!.webhook!.headers:config.headerNames.length?undefined:{};
 if(headers===undefined)throw Error('Re-enter custom header values when the configured header names change');
 const signing=input.webhookSigning===undefined?current?.webhook?.signing??true:input.webhookSigning;
 return normalizeWebhookSnapshot({config,headers,signing});
}
export function notificationEnvelopeBody(credential:NotificationCredential,event:any){
 if(!credential.webhook)return JSON.stringify(event);
 return renderWebhookTemplate({config:credential.webhook.config,event,baseUrl:credential.endpoint,headers:credential.webhook.headers}).body??'';
}
export function checkedNotificationEndpoint(credential:NotificationCredential,event:any,url:string){
 const expected=credential.webhook?renderWebhookTemplate({config:credential.webhook.config,event,baseUrl:credential.endpoint,headers:credential.webhook.headers}).url:credential.endpoint;
 if(url!==expected)throw Error('Destination version mismatch');return credential.endpoint;
}
export function webhookMetadata(credential:NotificationCredential|undefined,stored:string|null){
 const config=stored===null?null:normalizeWebhookTemplate(JSON.parse(stored));
 return {webhookTemplate:config,webhookSigning:credential?credential.webhook?.signing??true:null,
  webhookHeaderAvailability:config?config.headerNames.map((name:string)=>({name,available:Boolean(credential?.webhook&&Object.hasOwn(credential.webhook.headers,name))})):[],
  webhookWarnings:config?webhookTemplateWarnings(config,credential?.webhook?.headers??{}):[]};
}
function html(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
// At most eight UTF-16 code units of any request-derived substring may remain.
// Short bodies are removed in full. Index fixed-size windows, then merge their
// overlapping matches: full, prefix, interior and JSON-escaped echoes all use
// the same rule, without a quadratic scan of every possible substring.
function requestEchoes(wireBody:string,headers:Record<string,string>){
 const values=[wireBody,JSON.stringify(wireBody).slice(1,-1)];
 if(headers['webhook-id'])values.push(JSON.stringify(['integrations.webhook.v1',headers['webhook-tenant'],headers['webhook-destination'],headers['webhook-event'],headers['webhook-id'],headers['webhook-timestamp'],wireBody]));
 const windows=new Map<number,Set<string>>();
 for(const value of values){const size=Math.min(9,value.length);if(!size)continue;let set=windows.get(size);if(!set)windows.set(size,set=new Set());for(let i=0;i<=value.length-size;i++)set.add(value.slice(i,i+size))}
 return (text:string,redact:boolean)=>{
  const spans:Array<[number,number]>=[];
  for(let i=0;i<text.length;i++)for(const [size,set] of windows){
   if(!set.has(text.slice(i,i+size)))continue;
   if(!redact)return '';
   const previous=spans.at(-1);if(previous&&i<=previous[1])previous[1]=Math.max(previous[1],i+size);else spans.push([i,i+size]);
  }
  let result='',end=0;for(const [start,stop] of spans){result+=text.slice(end,start)+'[redacted: echoed request]';end=stop}return result+text.slice(end);
 };
}
/** Scrub before escaping/cutting, including receiver echoes of encoded local
 * credentials and request-body windows. If even the marker or escaped output
 * would reproduce a protected window, omit the excerpt instead. */
export function notificationResponseExcerpt(body:unknown,credential:NotificationCredential,wireHeaders:Record<string,string>={},wireBody?:string):string{
 if(typeof body!=='string')return '';
 if(credential.webhook?.config.mode==='oncall'){
  let expected;try{expected=wireBody?JSON.parse(wireBody):undefined}catch{return ''}
  const receipt=oncallReceipt(body,expected);if(!receipt)return '';
  const endpoint=new URL(credential.endpoint),text=JSON.stringify(receipt),authority=[credential.endpoint,...endpoint.searchParams.values(),...endpoint.pathname.split('/').filter(Boolean),credential.signing_secret,...Object.values(credential.webhook.headers).flatMap(v=>[v,v.replace(/^Bearer /,'')])].filter(Boolean);
  return authority.some(value=>text.includes(value!))?'':text;
 }
 const endpoint=new URL(credential.endpoint),values=[credential.endpoint,credential.signing_secret??'',...Object.values(credential.webhook?.headers??{}),...Object.entries(wireHeaders).filter(([name])=>!/^(content-type|webhook-id|webhook-tenant|webhook-destination|webhook-event|webhook-timestamp|x-lamp-timestamp)$/.test(name.toLowerCase())).map(([,value])=>value),...endpoint.searchParams.values(),...endpoint.pathname.split('/').filter(Boolean)];
 if(wireBody){try{const drill=JSON.parse(wireBody).drill;if(typeof drill?.confirmUrl==='string'){values.push(drill.confirmUrl);values.push(new URL(drill.confirmUrl).searchParams.get('token')??'')}}catch{/* Ordinary form/template text has no JSON drill capability. */}}
 let text=body.slice(0,65536);
 const variants=new Set<string>();
 for(const value of values.filter(Boolean)){
  variants.add(value);variants.add(encodeURIComponent(value));variants.add(JSON.stringify(value).slice(1,-1));variants.add(html(value));
  const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(value)));variants.add(encoded);variants.add(encoded.replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''));
 }
 for(const value of [...variants].sort((a,b)=>b.length-a.length)){const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');text=text.replace(new RegExp(escaped,'gi'),'[redacted]')}
 text=text.replace(/\b(?:bearer|basic)\s+[^\s<>"']+/gi,'[redacted]').replace(/\b(?:authorization|cookie|set-cookie|api[-_]?key|token|secret|password)["']?\s*[:=]\s*["']?[^\s<>]+/gi,'[redacted]').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');
 const echoes=wireBody?requestEchoes(wireBody,wireHeaders):undefined;
 if(echoes){text=echoes(text,true);if(echoes(text,false)!==text)return ''}
 let output='';for(const character of text){const escaped=html(character);if(output.length+escaped.length>512)break;output+=escaped}return echoes?echoes(output,false):output;
}
function maskedRequest(wire:any,secretNames:string[]){return {method:wire.method??'POST',url:wire.url,headers:Object.fromEntries(Object.entries(wire.headers).map(([name,value])=>[name,secretNames.includes(name)||['x-lamp-signature','webhook-signature'].includes(name)?'[masked]':value])),...(wire.body===undefined?{}:{body:wire.body})}}
const samplePurpose=(id:string)=>`uptime-webhook-sample-v1:${id}`;
async function sampleKey(env:Bindings){
 if(typeof env.SESSION_SECRET!=='string'||env.SESSION_SECRET.length<32)throw Error('Webhook sample custody unavailable');
 return keyedHash(env.SESSION_SECRET,'uptime-webhook-sample','sealed-context-v1');
}
/** Only an authenticated owner request may exchange this context for a test job.
 * The token grants no route authority and contains no destination secrets. */
export async function webhookSampleSend(env:Bindings,id:string,token:unknown){
 if(typeof token!=='string'||token.length>8192)throw Error('Invalid webhook sample context');
 let context;try{context=await unseal(await sampleKey(env),samplePurpose(id),token)}catch{throw Error('Invalid webhook sample context')}
 const event=context?.event,now=Date.now();
 if(!webhookSampleKind(event)||!/^test:[a-f0-9-]{36}$/.test(event.id)||event.state!=='test'||event.monitorId!==null||event.incidentKey!==null||event.slotId!==null||
  !Number.isSafeInteger(event.observedAt)||event.observedAt>now||context.expiresAt!==event.observedAt+300000||context.expiresAt<=now||typeof context.credentialId!=='string')throw Error('Webhook sample expired or invalid; preview again');
 return {event,credentialId:context.credentialId as string};
}
async function previewCredential(credential:NotificationCredential,saved?:{env:Bindings;id:string;credentialId:string}){
 const {notificationProtocols}=await import('./notification-protocols.ts');
 const samples=[];
 for(const source of webhookTemplateSamples().filter((e:any)=>credential.webhook?.config.mode!=='oncall'||['trigger','recovery'].includes(e.kind))){
  // Native Oncall needs real incident semantics and has no sample-send door.
  const sample=Boolean(credential.webhook&&credential.webhook.config.mode!=='oncall'),event=sample?{...testEvent(''),eventType:`uptime.notification.sample.v1.${source.kind}`}:{...source,eventType:`uptime.preview.${source.kind}`};
  const credentialId=saved?.credentialId??'preview-credential',deliveryId=saved?`${event.id}:${saved.id}`:event.id;
  const body=notificationEnvelopeBody(credential,event),protocol=notificationProtocols(credential,credentialId,event)[0];
  const request=await protocol.prepare({id:deliveryId,tenant:'uptime-notifications',destinationId:credentialId,event:event.eventType,protocol:'webhook',body},event.observedAt);
  const test=sample&&saved?{sample:await seal(await sampleKey(saved.env),samplePurpose(saved.id),{event,credentialId,expiresAt:event.observedAt+300000})}:undefined;
  samples.push({kind:source.kind,request:maskedRequest(request,credential.webhook?.config.headerNames??[]),...(test?{test}:{})});
 }
 return {webhookTemplate:credential.webhook?.config??null,webhookSigning:credential.webhook?.signing??true,warnings:credential.webhook?webhookTemplateWarnings(credential.webhook.config,credential.webhook.headers):[],samples};
}
export async function proposedWebhookPreview(input:any){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['url','webhookTemplate','webhookHeaders','webhookSigning'].includes(k)))throw Error('Invalid webhook preview fields');
 const endpoint=validateDestination(input.url).href,webhook=webhookInput(input),signing=webhook?.signing??true;
 const signing_secret=signing?Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''):null;
 return previewCredential({endpoint,signing_secret,...(webhook?{webhook}:{})});
}
export async function savedWebhookPreview(env:any,id:string,input:any={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['url','webhookTemplate','webhookHeaders','webhookSigning'].includes(k)))throw Error('Invalid webhook preview fields');
 const {readCredential}=await import('./notification-credentials.server.ts');
 const row=await env.DB.prepare("SELECT c.* FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=? AND d.kind='webhook' AND d.deleted_at IS NULL").bind(id).first();
 if(!row)throw Error('Webhook destination not found');
 const current=await readCredential(env,row,{repairUnavailable:false}),endpoint=input.url===undefined?current.endpoint:validateDestination(input.url).href,webhook=webhookInput(input,current),signing=webhook?.signing??true;
 const signing_secret=signing?(current.signing_secret??Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')):null;
 const unchanged=endpoint===current.endpoint&&signing_secret===current.signing_secret&&JSON.stringify(webhook)===JSON.stringify(current.webhook);
 return previewCredential({endpoint,signing_secret,...(webhook?{webhook}:{})},unchanged&&webhook&&webhook.config.mode!=='oncall'?{env,id,credentialId:row.id}:undefined);
}
