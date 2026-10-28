// WEBHOOK-001 v1: portable templates contain header names, never endpoint or header credentials.
export const WEBHOOK_TEMPLATE_VERSION=1;
export const WEBHOOK_UNAVAILABLE='Unavailable';
const bytes=value=>new TextEncoder().encode(value).byteLength;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const names=['monitor.id','monitor.name','monitor.url','monitor.type','monitor.tags','monitor.group',
 'alert.type','alert.code','alert.name','alert.details','alert.timestamp','alert.startedAtUtc','alert.startedAtLocal','alert.timeZone',
 'alert.durationSeconds','alert.durationHuman','incident.key','incident.startedAtUtc','incident.endedAtUtc','event.id','console.url',
 'locations.failed','locations.outcomes','http.status','response.timeMs','assertion.failed','ssl.expiryDate','ssl.daysLeft',
 'domain.expiryDate','domain.daysLeft','heartbeat.lastReceiptAtUtc','alert.contacts','monitor.customFields'];
// Published UptimeRobot variables: https://help.uptimerobot.com/en/articles/14498593-webhook-integration
export const WEBHOOK_VARIABLE_ALIASES=Object.freeze({monitorID:'monitor.id',monitorURL:'monitor.url',monitorFriendlyName:'monitor.name',
 alertType:'alert.code',alertTypeFriendlyName:'alert.name',alertDetails:'alert.details',alertDuration:'alert.durationSeconds',
 alertDateTime:'alert.timestamp',monitorAlertContacts:'alert.contacts',sslExpiryDate:'ssl.expiryDate',sslExpiryDaysLeft:'ssl.daysLeft',
 domainExpireDate:'domain.expiryDate',dashboardUrl:'console.url',customFields:'monitor.customFields',incidentStartTime:'incident.startedAtUtc',
 incidentEndTime:'incident.endedAtUtc',monitoringRegions:'locations.failed',monitorType:'monitor.type',httpStatusCode:'http.status',
 monitorTags:'monitor.tags',monitorGroup:'monitor.group',responseTime:'response.timeMs'});
export const WEBHOOK_VARIABLES=Object.freeze([...names]);
const known=new Set(names),unmapped=new Set(['alert.contacts','monitor.customFields']);
const reserved=new Set(['host','content-length','content-type','connection','transfer-encoding','te','trailer','upgrade','expect',
 'proxy-authorization','proxy-authenticate','proxy-connection','keep-alive','accept-encoding','cookie','set-cookie',
 'x-lamp-timestamp','x-lamp-signature','x-uptime-timestamp','x-uptime-signature','x-uptime-signature-input']);
const invalid=message=>{throw Error(message)};
function headerName(value){
 if(typeof value!=='string'||value.length>100||! /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value))return invalid('Invalid custom webhook header name');
 const name=value.toLowerCase();
 if(reserved.has(name)||name.startsWith('webhook-')||name.startsWith('sec-'))return invalid(`Webhook header ${name} is managed by the transport`);
 return name;
}
function timeZone(value='America/Chicago'){
 if(typeof value!=='string'||value.length>100||/^[+-]/.test(value))return invalid('Webhook timeZone must be an IANA time zone');
 try{return new Intl.DateTimeFormat('en-US',{timeZone:value}).resolvedOptions().timeZone}catch{return invalid('Webhook timeZone must be an IANA time zone')}
}
function variable(raw,alias){
 const name=alias?WEBHOOK_VARIABLE_ALIASES[raw]:raw.trim();
 if(!name||!known.has(name))return invalid(`Unknown webhook variable ${String(raw).slice(0,100)}`);
 return name;
}
// Tokens are recognized in the original template only; substituted text can never introduce another expansion.
function tokens(template){
 const found=[],pattern=/\{\{([^{}]*)\}\}|\*([A-Za-z_][A-Za-z0-9_.-]*)\*/g;let match;
 while((match=pattern.exec(template)))found.push({start:match.index,end:pattern.lastIndex,name:variable(match[1]??match[2],match[2]!==undefined)});
 const rest=template.replace(pattern,'');if(rest.includes('{{')||rest.includes('}}'))return invalid('Malformed webhook variable; use {{monitor.name}} or *monitorFriendlyName*');
 return found;
}
function jsonString(value){return JSON.stringify(value).slice(1,-1).replace(/[<>&]/g,c=>({'<':'\\u003c','>':'\\u003e','&':'\\u0026'}[c]))}
const numericVariables=new Set(['alert.code','alert.timestamp','alert.durationSeconds','http.status','response.timeMs','ssl.daysLeft','domain.daysLeft']);
const arrayVariables=new Set(['monitor.tags','locations.failed','locations.outcomes']);
function jsonValue(name,value){
 let typed=value;
 if(value!==WEBHOOK_UNAVAILABLE){
  if(numericVariables.has(name)&&/^-?\d+(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value)))typed=Number(value);
  else if(arrayVariables.has(name))typed=JSON.parse(value);
 }
 return JSON.stringify(typed).replace(/[<>&]/g,c=>({'<':'\\u003c','>':'\\u003e','&':'\\u0026'}[c]));
}
function substitute(template,values,json=false){
 const found=tokens(template);let output='',offset=0,quoted=false,escaped=false,size=0;
 for(const token of found){
  if(json){for(let i=offset;i<token.start;i++){const c=template[i];if(escaped){escaped=false;continue}if(quoted&&c==='\\'){escaped=true;continue}if(c==='"')quoted=!quoted}
   if(escaped)return invalid(`Webhook variable ${token.name} cannot follow a JSON escape`)}
  const part=template.slice(offset,token.start)+(json?(quoted?jsonString(values[token.name]):jsonValue(token.name,values[token.name])):values[token.name]);size+=bytes(part);
  if(size>65536)return invalid('Rendered webhook value exceeds 64 KiB');output+=part;offset=token.end;
 }
 const tail=template.slice(offset);if(size+bytes(tail)>65536)return invalid('Rendered webhook value exceeds 64 KiB');output+=tail;
 if(json){try{JSON.parse(output)}catch{return invalid('Webhook JSON template must parse after variable substitution')}}
 return output;
}
const present=value=>value!==undefined&&value!==null&&value!=='';
function text(value){
 if(!present(value))return WEBHOOK_UNAVAILABLE;
 if(typeof value==='string'){if(bytes(value)>32768)return invalid('Webhook variable exceeds its size limit');return value}
 if(typeof value==='number')return Number.isFinite(value)?String(value):WEBHOOK_UNAVAILABLE;
 if(typeof value==='boolean')return String(value);
 if(object(value)||Array.isArray(value)){try{const serialized=JSON.stringify(value);if(bytes(serialized)>32768)return invalid('Webhook variable exceeds its size limit');return serialized}catch{return invalid('Webhook variable is not bounded JSON data')}}
 return WEBHOOK_UNAVAILABLE;
}
const clock=value=>Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;
const iso=value=>clock(value)?new Date(value).toISOString():undefined;
function localTime(at,zone){
 if(!clock(at))return undefined;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'}).formatToParts(at);
 const p=Object.fromEntries(parts.map(part=>[part.type,part.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName} [${zone}]`;
}
/** Resolve only immutable event fields. Missing evidence never becomes a guessed measurement. */
export function webhookTemplateVariables(event,{timeZone:zone='America/Chicago'}={}){
 if(!object(event))return invalid('Webhook event must be an object');
 zone=timeZone(zone);const context=event.webhookContext??{},incident=event.incidentContext??{};
 const type=({trigger:'down',reminder:'down',recovery:'up',test:'test',expiry:'expiry',slow:'slow',slow_reminder:'slow',slow_recovery:'slow_recovered',renewal:'renewal',dependency:'dependency',dependency_recovery:'dependency_recovered'})[event.kind];
 const started=incident.confirmedStartedAt??context.alertStartedAt??event.observedAt;
 const probes=Array.isArray(event.probes)?event.probes:undefined;
 const values={
  'monitor.id':event.monitorId,'monitor.name':event.monitorName,'monitor.url':event.url,'monitor.type':context.monitorType,
  'monitor.tags':context.monitorTags,'monitor.group':context.monitorGroup,'alert.type':type,
  'alert.code':({down:1,up:2,expiry:3})[type],'alert.name':({down:'Down',up:'Up',test:'Test',expiry:'Expiry warning',slow:'Slow',renewal:'Renewal',dependency:'Provider issue',dependency_recovered:'Provider recovered'})[type],
  'alert.details':incident.originalReason??event.explanation,'alert.timestamp':clock(event.observedAt)?Math.floor(event.observedAt/1000):undefined,
  'alert.startedAtUtc':iso(started),'alert.startedAtLocal':localTime(started,zone),'alert.timeZone':zone,
  'alert.durationSeconds':incident.downtimeSeconds,'alert.durationHuman':incident.downtimeHuman,
  'incident.key':event.incidentKey,'incident.startedAtUtc':iso(incident.confirmedStartedAt),'incident.endedAtUtc':iso(incident.confirmedRecoveredAt),
  'event.id':event.id,'console.url':incident.incidentUrl||monitorUrl(event),
  'locations.failed':incident.failedLocations??probes?.filter(p=>p.outcome==='target_failure'),
  'locations.outcomes':probes,'http.status':context.httpStatusCode,'response.timeMs':context.responseTimeMs,
  'assertion.failed':context.failedAssertion,'ssl.expiryDate':context.sslExpiryDate,'ssl.daysLeft':context.sslExpiryDaysLeft,
  'domain.expiryDate':context.domainExpiryDate,'domain.daysLeft':context.domainExpiryDaysLeft,
  'heartbeat.lastReceiptAtUtc':iso(context.heartbeatLastReceiptAt),
 };
 return Object.fromEntries(names.map(name=>[name,text(values[name])]));
}
function monitorUrl(event){
 if(!event.consoleUrl)return undefined;
 try{const url=new URL(event.consoleUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.origin!==event.consoleUrl)return undefined;
  return event.monitorId?`${url.origin}/app/monitors/${encodeURIComponent(event.monitorId)}`:`${url.origin}/app`}catch{return undefined}
}
/** Normalize the portable config, and parse JSON against every documented sample event at save time. */
export function normalizeWebhookTemplate(input){
 if(object(input)&&input.mode==='oncall'){
  if(Object.keys(input).some(k=>!['version','method','mode','template','headerNames','timeZone'].includes(k))||input.version!==1||input.method!=='POST'||!object(input.template)||
   Object.keys(input.template).some(k=>!['source','service','environment','severity'].includes(k)))return invalid('Invalid Oncall webhook configuration');
  const template={};
  for(const key of ['source','service','environment']){
   const value=input.template[key];
   if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>100||/[\x00-\x1f\x7f]/.test(value))return invalid('Oncall needs bounded source, service and environment');
   template[key]=value;
  }
  if(!/^intake:[A-Za-z0-9_-]+$/.test(template.source))return invalid('Oncall source must name a routed intake key');
  template.severity=input.template.severity??'critical';
  if(!['critical','warning','info'].includes(template.severity)||JSON.stringify(input.headerNames)!=='["authorization"]')return invalid('Oncall requires a bearer authorization header and native severity');
  return {version:1,method:'POST',mode:'oncall',template,headerNames:['authorization'],timeZone:timeZone(input.timeZone)};
 }

 if(!object(input)||Object.keys(input).some(name=>!['version','method','mode','template','headerNames','timeZone'].includes(name))||input.version!==1||
  !['GET','POST','PUT','PATCH'].includes(input.method)||!['json','form','query'].includes(input.mode))return invalid('Invalid webhook template configuration');
 if(input.method==='GET'&&input.mode!=='query')return invalid('GET webhooks require query parameters and send no body');
 const headerNames=input.headerNames??[];
 if(!Array.isArray(headerNames)||headerNames.length>10)return invalid('A webhook accepts at most 10 custom headers');
 const normalizedNames=headerNames.map(headerName);if(new Set(normalizedNames).size!==normalizedNames.length)return invalid('Duplicate custom webhook header name');
 const zone=timeZone(input.timeZone);let template;
 if(input.mode==='json'){
  if(typeof input.template!=='string'||bytes(input.template)>32768)return invalid('Webhook JSON template must be a string of at most 32 KiB');
  template=input.template;for(const event of webhookTemplateSamples())substitute(template,webhookTemplateVariables(event,{timeZone:zone}),true);
 }else{
  if(!object(input.template)||Object.keys(input.template).length>100)return invalid('Webhook parameters must be a dictionary with at most 100 fields');
  if(bytes(JSON.stringify(input.template))>32768)return invalid('Webhook parameter template exceeds 32 KiB');
  const pairs=Object.entries(input.template);for(const [key,value] of pairs){if(!key||bytes(key)>200||typeof value!=='string')return invalid('Webhook parameter names and values must be strings');tokens(value)}
  template=Object.fromEntries(pairs);
 }
 return {version:1,method:input.method,mode:input.mode,template,headerNames:normalizedNames,timeZone:zone};
}
/** Names recognized from UptimeRobot but currently lacking an immutable Uptime event equivalent. Show these at save/import. */
export function webhookTemplateWarnings(config,headers={}){
 const normalized=normalizeWebhookTemplate(config);if(normalized.mode==='oncall')return [];const values=[...(normalized.mode==='json'?[normalized.template]:Object.values(normalized.template)),...Object.values(headers)];
 return [...new Set(values.flatMap(value=>tokens(value).filter(token=>unmapped.has(token.name)).map(token=>token.name)))].map(name=>({variable:name,aliases:Object.keys(WEBHOOK_VARIABLE_ALIASES).filter(alias=>WEBHOOK_VARIABLE_ALIASES[alias]===name),reason:'No immutable Uptime event equivalent; renders Unavailable.'}));
}
function localHeaders(config,input,values){
 if(!object(input))return invalid('Webhook custom headers must be a dictionary');
 const entries=Object.entries(input),normalized=entries.map(([name,value])=>[headerName(name),value]);
 if(new Set(normalized.map(([name])=>name)).size!==normalized.length||normalized.length!==config.headerNames.length||
  normalized.some(([name])=>!config.headerNames.includes(name)))return invalid('Webhook custom header values must match the configured names');
 let size=0,sourceSize=0;for(const pair of normalized){
  const [name,source]=pair;
  if(typeof source!=='string'||/[^\t\x20-\x7e\x80-\xff]/.test(source))return invalid('Webhook header values must contain HTTP field characters without CR or LF');
  sourceSize+=bytes(name)+bytes(source);if(sourceSize>4096)return invalid('Webhook custom header names and values exceed 4 KiB');
  let value;try{value=substitute(source,values)}catch{return invalid(`Custom header ${name} contains an invalid variable; use the documented variable set`)}
  if(typeof value!=='string'||/[^\t\x20-\x7e\x80-\xff]/.test(value))return invalid('Webhook header values must contain HTTP field characters without CR or LF');
  pair[1]=value;
  size+=bytes(name)+bytes(value);
 }
 if(size>4096)return invalid('Webhook custom header names and values exceed 4 KiB');
 return Object.fromEntries(normalized);
}
/** Pure wire rendering. The caller validates/pins the destination, masks previews, applies HMAC and sends these exact bytes. */
export function renderWebhookTemplate({config,event,baseUrl,headers={}}){
 config=normalizeWebhookTemplate(config);const values=webhookTemplateVariables(event,{timeZone:config.timeZone}),outHeaders=localHeaders(config,headers,values);
 let url;try{url=new URL(baseUrl)}catch{return invalid('Invalid webhook destination')}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||bytes(url.href)>8192)return invalid('Webhook destination requires HTTPS without URL credentials or fragments');
 let body;
 if(config.mode==='oncall'){body=JSON.stringify(oncallEvent(config,event));outHeaders['content-type']='application/json'}
 else if(config.mode==='json'){body=substitute(config.template,values,true);outHeaders['content-type']='application/json'}
 else{
  const fields=[];let size=0;for(const [name,template] of Object.entries(config.template)){
   const encoded=new URLSearchParams([[name,substitute(template,values)]]).toString();size+=encoded.length+(fields.length?1:0);
   if(size>(config.mode==='query'?8192:65536))return invalid('Rendered webhook parameters exceed their size limit');fields.push(encoded);
  }
  const parameters=fields.join('&');
  if(config.mode==='query'){if(parameters)url.search+=(url.search?'&':'')+parameters}
  else{body=parameters;outHeaders['content-type']='application/x-www-form-urlencoded'}
 }
 if(bytes(url.href)>8192||(body!==undefined&&bytes(body)>65536))return invalid('Rendered webhook request exceeds its size limit');
 return {method:config.method,url:url.href,headers:outHeaders,body};
}
/** Deliberate UI examples, never used as monitoring evidence or as replacement data for a real delivery. */
export function webhookTemplateSamples(){
 const at=Date.UTC(2026,0,15,18),common={schemaVersion:2,id:'sample-trigger',kind:'trigger',monitorId:'sample-monitor',monitorName:'Checkout "API" <script> & worker',
  url:'https://checkout.example.com/health',incidentKey:'sample-incident',observedAt:at,consoleUrl:'https://uptime.example.com',explanation:'HTTP 503: required checkout health failed.',
  probes:[{name:'US East',outcome:'target_failure',reason:'HTTP 503'}],incidentContext:{confirmedStartedAt:at,confirmedRecoveredAt:null,downtimeSeconds:null,downtimeHuman:null,originalReason:'HTTP 503: required checkout health failed.',failedLocations:[{probe:'local-a',name:'US East',reason:'HTTP 503'}],incidentUrl:'https://uptime.example.com/app/monitors/sample-monitor#incident-sample-incident'},
  webhookContext:{monitorType:'http',monitorTags:['production','checkout'],monitorGroup:'Commerce',httpStatusCode:503,responseTimeMs:215,failedAssertion:'status',heartbeatLastReceiptAt:at-60000}};
 return [common,{...structuredClone(common),id:'sample-recovery',kind:'recovery',observedAt:at+90000,probes:[{name:'US East',outcome:'pass',reason:'All checks passed'}],incidentContext:{...common.incidentContext,confirmedRecoveredAt:at+90000,downtimeSeconds:90,downtimeHuman:'1 minute 30 seconds'},webhookContext:{...common.webhookContext,httpStatusCode:200,responseTimeMs:120,failedAssertion:null}},
  {...structuredClone(common),id:'sample-expiry',kind:'expiry',incidentContext:undefined,probes:[],explanation:'Certificate expires in 14 days.',webhookContext:{monitorType:'tls',sslExpiryDate:'2026-01-29',sslExpiryDaysLeft:14}},
  {...structuredClone(common),id:'sample-slow',kind:'slow',incidentContext:undefined,explanation:'The response exceeded the configured latency limit.',webhookContext:{monitorType:'http',responseTimeMs:1800,httpStatusCode:200,failedAssertion:'latency'}}];
}
export function previewWebhookTemplates(config,{baseUrl,headers={}}){
 return webhookTemplateSamples().map(event=>({kind:event.kind,request:renderWebhookTemplate({config,event,baseUrl,headers})}));
}

/** Native Oncall fields only. A generation follows the confirmed incident, while
 * each observation has its own immutable event ID. Missing probes supply nothing. */
export function oncallEvent(config,event){
 if(!['trigger','reminder','recovery'].includes(event.kind)||!event.monitorId||!event.incidentKey||!event.incidentContext)throw Error('Oncall requires a confirmed incident event');
 const locations=event.incidentContext.failedLocations;
 const labels=[...new Set(locations.map(p=>p.name))];
 if(!labels.length||event.kind!=='recovery'&&!event.probes.some(p=>p.outcome==='target_failure'))throw Error('Oncall requires retained failure evidence');
 const title='monitor='+event.monitorId+';networks='+labels.join(',');
 const body={source:config.template.source,eventId:event.id,service:config.template.service,environment:config.template.environment,
  key:'uptime:'+event.monitorId,generation:event.incidentKey,intent:event.kind==='recovery'?'recover':'trigger',
  severity:config.template.severity,title,observedAt:new Date(event.observedAt).toISOString(),evidence:event.incidentContext.incidentUrl};
 if(title.length>300||body.eventId.length>200||body.generation.length>100||!body.evidence||body.evidence.length>2000)throw Error('Oncall event exceeds native field bounds');
 return body;
}
/** Retain only a receiver-generated UUID and canonical timestamp. Request echoes,
 * arbitrary receiver text and credentials cannot enter a handoff fact. */
export function oncallReceipt(body,expected){
 try{
  const r=JSON.parse(body);
  if(!object(r)||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(r.id)||typeof r.acceptedAt!=='string'||new Date(r.acceptedAt).toISOString()!==r.acceptedAt)return null;
  if(expected&&(r.truncation||r.eventId!==expected.eventId||r.service!==expected.service||r.observedAt!==expected.observedAt||typeof r.duplicate!=='boolean'))return null;
  return {id:r.id,acceptedAt:r.acceptedAt};
 }catch{return null}
}
