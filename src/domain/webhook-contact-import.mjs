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
