import {escapeSlackText} from '../base/modules/integrations/slack/message.ts'
import {slackContent} from './notification-content.ts'
// @ts-expect-error Maintained mail parser defines exact recipient boundaries.
import {parseAddress} from '../base/modules/mail/src/core/validation.mjs'
function object(value:any):any {if(typeof value==='string'){try{return JSON.parse(value)}catch{return null}}return value&&typeof value==='object'?value:null}
const eventMonitor=(event:any,id:string)=>event?.monitorId===id||event?.monitor?.id===id;
const followsDestination=(event:any,id:string)=>Array.isArray(event?.fallbackContext?.previous)&&event.fallbackContext.previous.some((p:any)=>p?.destinationId===id);
export function erasureRelations(kind:'monitor'|'destination'|'operator',id:string,jobs:{id:string;event:string}[],credentials:string[]){
 const jobIds=new Set(jobs.map(row=>row.id)),credentialIds=new Set(credentials),bodies=new Set<string>();
 if(kind==='monitor')for(const row of jobs){bodies.add(row.event);const event=object(row.event);if(event)bodies.add(slackContent(event))}
 function envelopeRelated(value:any){const envelope=object(value);if(!envelope)return false;
  if(kind==='destination')return envelope.destinationId===id||credentialIds.has(envelope.destinationId)||jobIds.has(envelope.id);
  const body=object(envelope.body),slackMonitor=envelope.protocol==='slack.incoming-webhook.v1'&&Array.isArray(body?.blocks)&&body.blocks.map((block:any)=>block?.text?.text??'').join('').split('\n').includes(`Monitor: ${escapeSlackText(id)}`);
  return kind==='monitor'&&(jobIds.has(envelope.id)||eventMonitor(body,id)||bodies.has(envelope.body)||slackMonitor);
 }
 function historyRelated(table:string,value:any){const row=object(value);if(!row)return false;
  if(table==='scheduled_reports')return kind==='monitor'?row.monitor_id===id:kind==='destination'&&row.destination_id===id;
  if(table==='notification_delivery_attempts')return jobIds.has(row.delivery_id)||(kind==='destination'&&row.destination_id===id);
  if(kind==='monitor'){
   if(table==='monitors')return row.id===id;
   if(table==='slots'||table==='outbox')return row.monitor_id===id;
   if(table==='notification_jobs')return jobIds.has(row.id)||eventMonitor(object(row.event),id);
   if(table==='integration_deliveries')return jobIds.has(row.id)||envelopeRelated(row.envelope);
  }
  if(kind==='destination'){
   if(table==='notification_destinations')return row.id===id;
   if(table==='notification_jobs')return row.destination_id===id||jobIds.has(row.id)||followsDestination(object(row.event),id);
   if(table==='integration_deliveries')return jobIds.has(row.id)||envelopeRelated(row.envelope);
  }
  return false;
 }
 return {envelopeRelated,historyRelated};
}
export function operatorMailRelated(value:string,email:string,tokenIds:Set<string>){
 const message=object(value);if(!message)return false;
 if(tokenIds.has(message.deliveryId))return true;
 return ['to','cc','bcc'].some(field=>(Array.isArray(message[field])?message[field]:[]).some((recipient:unknown)=>{try{return parseAddress(recipient).email.toLowerCase()===email.toLowerCase()}catch{return false}}));
}

// Catalog acknowledgments depend on both their provider monitor and the application incident that grouped them.
export const dependencyAckErasure="monitor_id=? OR via_incident_id IN(SELECT value FROM json_each(?))";
// An application timeline must not retain a notice ID after its provider is erased.
export const dependencyTimelineErasure="monitor_id<>? AND kind='dependency_acknowledged' AND json_extract(data,'$.noticeId') IN(SELECT id FROM outbox WHERE monitor_id=?)";
