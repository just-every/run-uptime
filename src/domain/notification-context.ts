import type {NotificationEvent} from './notification-content.ts'

export interface IncidentContext {
 version:1|2;
 confirmedStartedAt:number;
 confirmedRecoveredAt:number|null;
 downtimeSeconds:number|null;
 downtimeHuman:string|null;
 originalReason:string;
 failedLocations:{probe:string;name:string;reason:string}[];
 timeZone:string;
 incidentUrl:string;
 confirmedStartedLocal?:string;
 confirmedRecoveredLocal?:string|null;
}

export function incidentUrl(origin:string,monitorId:string,incidentKey:string){
 if(!origin)return '';
 const url=new URL(origin);
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.origin!==origin)throw Error('Invalid console origin');
 return `${origin}/app/monitors/${encodeURIComponent(monitorId)}#incident-${encodeURIComponent(incidentKey)}`;
}

/** Keep millisecond precision; these are confirmed transition times, not an inferred outage onset. */
export function downtimeHuman(milliseconds:number){
 let left=milliseconds;const parts:string[]=[];
 for(const [unit,size] of [['day',86400000],['hour',3600000],['minute',60000]] as const){
  const count=Math.floor(left/size);if(count)parts.push(`${count} ${unit}${count===1?'':'s'}`);left%=size;
 }
 if(left||!parts.length){const seconds=left/1000;parts.push(`${seconds} second${seconds===1?'':'s'}`)}
 return parts.join(' ');
}

export function triggerContext(event:NotificationEvent,regions:{probe:string;networkLabel:string;state:string}[],timeZone?:string):IncidentContext {
 return {...(timeZone?{confirmedStartedLocal:notificationLocalTime(event.observedAt,timeZone),confirmedRecoveredLocal:null}:{}),version:timeZone?2:1,confirmedStartedAt:event.observedAt,confirmedRecoveredAt:null,downtimeSeconds:null,downtimeHuman:null,
  originalReason:event.explanation,failedLocations:event.probes.filter(p=>p.outcome==='target_failure').map(p=>({probe:p.name,name:regions.find(r=>r.probe===p.name)?.networkLabel??p.name,reason:p.reason})),
  timeZone:timeZone??'UTC',incidentUrl:incidentUrl(event.consoleUrl,event.monitorId!,event.incidentKey!)};
}

export function recoveryContext(trigger:NotificationEvent,recoveredAt:number):IncidentContext {
 // Legacy open incidents are upgraded only from their immutable trigger, never current monitor state.
 const context=trigger.incidentContext??triggerContext(trigger,[]),elapsed=recoveredAt-context.confirmedStartedAt;
 if(elapsed<0)throw Error('Recovery precedes confirmed incident start');
 return {...context,...(context.version===2?{confirmedRecoveredLocal:notificationLocalTime(recoveredAt,context.timeZone)}:{}),confirmedRecoveredAt:recoveredAt,downtimeSeconds:elapsed/1000,downtimeHuman:downtimeHuman(elapsed)};
}

/** Optional v1 context is validated independently so old schema-2 archive events remain valid. */
export function validateIncidentContext(event:NotificationEvent){
 const context=event.incidentContext;if(context===undefined)return;
 const invalid=()=>{throw Error('Invalid notification incident context')};
 const object=(value:unknown)=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const clock=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0;
 const text=(value:unknown)=>typeof value==='string'&&value.length<=4096;
 if(!object(context)||Object.keys(context).sort().join(',')!==(context.version===2?'confirmedRecoveredAt,confirmedRecoveredLocal,confirmedStartedAt,confirmedStartedLocal,downtimeHuman,downtimeSeconds,failedLocations,incidentUrl,originalReason,timeZone,version':'confirmedRecoveredAt,confirmedStartedAt,downtimeHuman,downtimeSeconds,failedLocations,incidentUrl,originalReason,timeZone,version')||![1,2].includes(context.version)||(context.version===1?context.timeZone!=='UTC':!validZone(context.timeZone))||!['trigger','recovery'].includes(event.kind)||!event.monitorId||!event.incidentKey||!clock(context.confirmedStartedAt)||!text(context.originalReason)||!Array.isArray(context.failedLocations)||context.failedLocations.length>3)return invalid();
 for(const location of context.failedLocations)if(!object(location)||Object.keys(location).sort().join(',')!=='name,probe,reason'||!text(location.probe)||!location.probe||!text(location.name)||!location.name||!text(location.reason))return invalid();
 if(new Set(context.failedLocations.map(p=>p.probe)).size!==context.failedLocations.length||context.incidentUrl!==incidentUrl(event.consoleUrl,event.monitorId,event.incidentKey))return invalid();
 if(context.version===2&&(context.confirmedStartedLocal!==notificationLocalTime(context.confirmedStartedAt,context.timeZone)||context.confirmedRecoveredLocal!==(context.confirmedRecoveredAt===null?null:notificationLocalTime(context.confirmedRecoveredAt,context.timeZone))))return invalid();
 if(event.kind==='trigger'){
  if(context.confirmedStartedAt!==event.observedAt||context.confirmedRecoveredAt!==null||context.downtimeSeconds!==null||context.downtimeHuman!==null||context.originalReason!==event.explanation)return invalid();
  const failed=event.probes.filter(p=>p.outcome==='target_failure');
  if(failed.length!==context.failedLocations.length||failed.some((probe,index)=>probe.name!==context.failedLocations[index].probe||probe.reason!==context.failedLocations[index].reason))return invalid();
 }else{
  const recoveredAt=context.confirmedRecoveredAt;
  if(recoveredAt===null||!clock(recoveredAt)||recoveredAt!==event.observedAt||recoveredAt<context.confirmedStartedAt)return invalid();
  const elapsed=recoveredAt-context.confirmedStartedAt;
  if(context.downtimeSeconds!==elapsed/1000||context.downtimeHuman!==downtimeHuman(elapsed))return invalid();
 }
}

function validZone(value:unknown){if(typeof value!=='string'||value.length>80)return false;try{new Intl.DateTimeFormat('en-US',{timeZone:value});return true}catch{return false}}
export function notificationLocalTime(value:number,timeZone:string){return new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'longOffset'}).format(value)}
export function incidentContextText(context:IncidentContext){
 const at=(value:number)=>context.version===1?new Date(value).toISOString():notificationLocalTime(value,context.timeZone);
 return [`Original down reason: ${context.originalReason}`,...context.failedLocations.map(p=>`Failed location ${p.name} (${p.probe}): ${p.reason}`),
  `Confirmed start (${context.timeZone}): ${at(context.confirmedStartedAt)}`,
  context.confirmedRecoveredAt===null?'Recovery: not confirmed':`Confirmed recovery (${context.timeZone}): ${at(context.confirmedRecoveredAt)}`,
  context.downtimeSeconds===null?'Downtime: ongoing since confirmed start':`Confirmed downtime: ${context.downtimeHuman} (${context.downtimeSeconds} seconds)`,
  context.incidentUrl?`Incident details: ${context.incidentUrl}`:''];
}
