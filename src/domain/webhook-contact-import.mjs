import {normalizeWebhookTemplate,webhookTemplateWarnings,WEBHOOK_VARIABLES,WEBHOOK_VARIABLE_ALIASES} from './webhook-template.mjs';
import {validateDestination} from '../base/modules/integrations/core/destination.ts';

// Official v3 CreateWebhookIntegrationDto / WebhookBaseIntegrationDto, not the opaque IntegrationDto response.
// https://cdn.uptimerobot.com/api/openapi.yaml
// https://help.uptimerobot.com/en/articles/14498593-webhook-integration
// Custom POST JSON/form semantics: https://uptimerobot.com/blog/post-support-for-web-hook-alert-contacts-now-available/
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const bytes=value=>new TextEncoder().encode(value).byteLength;
const fail=message=>{throw Error(message)};
const fields=new Set(['friendlyName','urlToNotify','postValue','sendAsQueryString','sendAsJSON','sendAsPostParameters','customHeaders','enableNotificationsFor','sslExpirationReminder']);
const known=new Set(WEBHOOK_VARIABLES);
function variables(text){
 const tokens=/\{\{([^{}]*)\}\}|\*([A-Za-z_][A-Za-z0-9_.-]*)\*/g;let match;const names=[];
 while((match=tokens.exec(text))){
  const raw=match[1]??match[2],name=match[1]===undefined?WEBHOOK_VARIABLE_ALIASES[raw]:raw.trim();
  if(!known.has(name))return fail(`Unknown webhook variable ${raw.slice(0,100)}`);names.push(raw);
 }
 const rest=text.replace(tokens,'');if(rest.includes('{{')||rest.includes('}}'))return fail('Malformed webhook variable in the source URL');
 return names;
}
function customQuery(rawUrl){
 const split=rawUrl.indexOf('?'),prefix=split<0?rawUrl:rawUrl.slice(0,split);
 let decoded;try{decoded=decodeURI(prefix)}catch{return fail('Invalid UptimeRobot webhook URL encoding')}
 const outside=variables(decoded);if(outside.length)return fail(`Source URL variable ${outside[0]} is outside query values; review its destination manually`);
 const template=[],kept=[],seen=new Set(),dynamic=new Set();
 for(const segment of (split<0?'':rawUrl.slice(split+1)).split('&')){
  if(!segment){if(split>=0)kept.push(segment);continue}
  const entry=[...new URLSearchParams(segment)][0];if(!entry)return fail('Invalid UptimeRobot webhook query parameter');
  const [name,value]=entry;
  if(variables(name).length)return fail('Source webhook query parameter names cannot contain variables');
  const tokens=variables(value),hasDuplicate=seen.has(name);seen.add(name);
  if(tokens.length){if(hasDuplicate)return fail('Repeated source query names with variables require manual conversion');dynamic.add(name);template.push([name,value])}
  else{if(dynamic.has(name))return fail('Repeated source query names with variables require manual conversion');kept.push(segment)}
 }
 const base=prefix+(split>=0&&kept.length?`?${kept.join('&')}`:'');
 return {url:base,template:Object.fromEntries(template),hasVariables:template.length>0};
}
// Only the documented flat string-parameter subset can preserve its fields without implicit coercion.
function formFields(text){
 let value;try{value=JSON.parse(text)}catch{return fail('The source custom form POST value must be a JSON object of string fields')}
 if(!object(value)||Object.values(value).some(field=>typeof field!=='string'))return fail('The source custom form POST value needs manual conversion: only JSON objects of string fields are supported');
 return value;
}
/** Read-only proposal from one saved official create payload. Source header values are never read, copied or returned. */
export function previewUptimeRobotWebhook(input){
 if(object(input)&&['AlertContacts','AllAlertContacts'].includes(input.type))return previewUptimeRobotContacts(input);
 if(!object(input)||input.type!=='Webhook')return fail('Expected one UptimeRobot v3 Webhook integration object');
 if(!object(input.data))return fail('The v3 integration detail response has opaque value/customValue fields. Supply the saved official {type:"Webhook",data:{urlToNotify,postValue,...}} create payload; their meanings cannot be inferred safely');
 if(Object.keys(input).some(key=>!['type','data'].includes(key))||Object.keys(input.data).some(key=>!fields.has(key)))return fail('Unsupported UptimeRobot webhook payload fields; use the documented CreateWebhookIntegrationDto shape');
 const data=input.data;
 if(typeof data.friendlyName!=='string'||!data.friendlyName.trim()||data.friendlyName.length>60||/[\x00-\x1f\x7f]/.test(data.friendlyName))return fail('Supply the saved webhook friendlyName (1–60 printable characters)');
 if(typeof data.urlToNotify!=='string'||data.urlToNotify.length>1500||typeof data.postValue!=='string'||bytes(data.postValue)>32768)return fail('The saved webhook needs urlToNotify and a postValue string of at most 32 KiB');
 for(const field of ['sendAsQueryString','sendAsJSON','sendAsPostParameters'])if(typeof data[field]!=='boolean')return fail(`Supply the source ${field} boolean explicitly; no source default is assumed`);
 if(data.enableNotificationsFor!==undefined&&!['UpAndDown','Down','Up','None'].includes(data.enableNotificationsFor))return fail('Invalid source enableNotificationsFor setting');
 if(data.sslExpirationReminder!==undefined&&typeof data.sslExpirationReminder!=='boolean')return fail('Invalid source sslExpirationReminder setting');
 const sourceHeaders=data.customHeaders;
 if(sourceHeaders!==undefined&&sourceHeaders!==null&&!object(sourceHeaders))return fail('Source customHeaders must be an object or null');
 const headerNames=sourceHeaders?Object.keys(sourceHeaders):[],query=customQuery(data.urlToNotify);
 // These flags append a default payload in the source. Its exact emitted keys/types are not specified by the public schema.
 if(data.sendAsQueryString||data.sendAsPostParameters)return fail('Source default-variable delivery switches require manual conversion: their exact default field set is not documented, and combined query/body modes cannot be represented by one Uptime template');
 let method,mode,template;
 if(data.postValue.length){
  if(query.hasVariables)return fail('Source custom query variables plus a POST body require manual conversion; neither part can be dropped');
  method='POST';mode=data.sendAsJSON?'json':'form';template=data.sendAsJSON?data.postValue:formFields(data.postValue);
 }else{
  if(data.sendAsJSON)return fail('The source selects JSON but has no custom POST value; supply its actual JSON template');
  method='GET';mode='query';template=query.template;
 }
 let url;try{url=validateDestination(query.url).href}catch{return fail('The source receiver must satisfy Uptime public HTTPS destination rules; review it manually')}
 const webhookTemplate=normalizeWebhookTemplate({version:1,method,mode,template,headerNames});
 const warnings=webhookTemplateWarnings(webhookTemplate);
 const differences=[
  'This is a saved create-payload preview, not live extraction or a decoded integration-detail response.',
  `Delivery is proposed as ${method} ${mode}; the v3 create schema has no separate HTTP method field. Confirm it against the source receiver before cutover.`,
  'Source event selection, monitor/contact assignments, alert delays/repeats, account settings and activation are not imported. Review Uptime routes before enabling delivery.',
  'Header values and signing credentials are not imported, even when present in the source. Enter local credentials separately; this proposal authorizes no sends.',
  'The template time zone defaults to America/Chicago; choose the owner’s time zone explicitly.',
 ];
 if(webhookTemplate.headerNames.length)differences.push(`Local values must be re-entered for: ${webhookTemplate.headerNames.join(', ')}.`);
 if(mode==='query'&&query.hasVariables)differences.push('Variable-bearing URL query values become portable template fields; other receiver URL parameters stay installation-local.');
 if(mode==='form')differences.push('Custom JSON string fields become form parameters with the same names and variable tokens; Uptime percent-encodes their values.');
 if(warnings.length)differences.push('Named variables without immutable Uptime equivalents render Unavailable; review every warning.');
 return {name:data.friendlyName.trim(),url,webhookTemplate,headerNames:webhookTemplate.headerNames,warnings,differences};
}

// Saved GET /user/alert-contacts and /user/all-alert-contacts responses, respectively
// AlertContactDto and AllAlertContactDto in https://cdn.uptimerobot.com/api/openapi.yaml
// (read 23 October 2026). This proposal never stores, creates, confirms or sends a contact.
export const CONTACT_EXPORT_GUIDANCE='Review saved /user/alert-contacts or /user/all-alert-contacts through the read-only contact preview. Email and webhook kinds need local destination review; CHAT-001, PHONE-001 and ACCESS-001 own unsupported contacts and seat handoffs.';
const short=(value,fallback)=>typeof value==='string'&&value.trim()?value.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,100):fallback;
function legacyTeams(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname.endsWith('.webhook.office.com')||u.hostname==='outlook.office.com'&&u.pathname.startsWith('/webhook/'))}catch{return false}}
export function previewUptimeRobotContacts(input){
 if(!object(input)||!['AlertContacts','AllAlertContacts'].includes(input.type)||Object.keys(input).some(k=>!['type','data'].includes(k))||!Array.isArray(input.data)||input.data.length>500)return fail('Supply {type:"AlertContacts"|"AllAlertContacts",data:<saved response array>} with at most 500 records.');
 const seats=[],contacts=[],groups=input.type==='AllAlertContacts'?input.data:null;
 if(groups){
  for(const [index,seat] of groups.entries()){
   if(!object(seat)||typeof seat.notifyOnly!=='boolean'||!object(seat.user)||!Array.isArray(seat.alertContacts))return fail(`Saved seat ${index+1} needs notifyOnly, user and alertContacts from AllAlertContactDto.`);
   seats.push({index,id:Number.isSafeInteger(seat.user.id)&&seat.user.id>=0?seat.user.id:null,name:short(seat.user.name,`Seat ${index+1}`),notifyOnly:seat.notifyOnly,action:'refused',clause:'ACCESS-001',reason:seat.notifyOnly?'Notify-only seat needs explicit local destination and consent review; no destination is created.':'Login seat needs an owner-reviewed role and invitation; this response supplies no login role and creates no invitation.'});
   for(const contact of seat.alertContacts)contacts.push({contact,seatIndex:index});
  }
 }else for(const contact of input.data)contacts.push({contact});
 if(contacts.length>500)return fail('A saved contact preview accepts at most 500 contact records.');
 const entries=contacts.map(({contact:c,seatIndex},index)=>{
  const kind=short(c?.type,'Unknown'),base={index,id:Number.isSafeInteger(c?.id)&&c.id>=0?c.id:null,name:short(c?.friendlyName??c?.name,`Contact ${index+1}`),kind,...(seatIndex===undefined?{}:{seatIndex})};
  if(!object(c))return {...base,action:'refused',clause:'MIGRATE-001',reason:'The saved contact is not an object.'};
  if(legacyTeams(c.value))return {...base,action:'refused',clause:'CHAT-001',legacyTeams:true,reason:'Legacy Teams connector URL: create a replacement incoming-webhook workflow in Teams Workflows, review its owner and recipient, then configure and test a separate local destination. The legacy URL and its authority are not copied.'};
  if(kind==='Email'){
   if(typeof c.value!=='string'||c.value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value))return {...base,action:'refused',clause:'MIGRATE-001',reason:'Email contact has no usable email address.'};
   return {...base,action:'review',destination:{kind:'email',address:c.value},reason:'Review a separately configured local email destination. Source status is not consent; no destination or confirmation is created.'};
  }
  if(kind==='Webhook')return {...base,action:'review',destination:{kind:'webhook'},reason:'Review the saved official Webhook create payload through the existing template preview. AlertContactDto value/customValue do not specify template semantics; no URL, credentials or send authority are copied.'};
  const clause=['ProSms','SMS','Voice'].includes(kind)?'PHONE-001':['MobileAppOld','MobileApp','MobileAppIOS','MobileAppAndroid'].includes(kind)?'MOBILE-001':['Telegram','Slack','MSTeams','Discord','GoogleChat'].includes(kind)?'CHAT-001':'MIGRATE-001';
  return {...base,action:'refused',clause,reason:`${kind} requires ${clause} migration and local recipient/consent review; no destination is created.`};
 });
 const counts={read:entries.length,review:entries.filter(e=>e.action==='review').length,refused:entries.filter(e=>e.action==='refused').length},byKind=Object.create(null);
 for(const e of entries){const count=byKind[e.kind]??={read:0,review:0,refused:0};count.read++;count[e.action]++}
 return {kind:'uptimerobot-contact-preview',readOnly:true,counts,byKind,entries,seats,seatCounts:{read:seats.length,login:seats.filter(s=>!s.notifyOnly).length,notifyOnly:seats.filter(s=>s.notifyOnly).length,refused:seats.length},differences:[CONTACT_EXPORT_GUIDANCE,'Contact status, contact thresholds/repeats, notification selections and source account membership do not authorize local delivery. Nothing is written, confirmed, invited or sent.','Incident comments and root cause are absent from these saved contact responses. The current published API exposes /incidents/{id}/comments and IncidentDetailDto.rootCause separately; importing them as labelled source history remains a HISTORY-001/INCIDENT-001 gap.']};
}
