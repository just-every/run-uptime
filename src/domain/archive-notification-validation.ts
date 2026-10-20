import {validateIncidentContext} from './notification-context.ts'
import {slackContent} from './notification-content.ts'
import {clock,identity,object,shape,unique,notificationNamespace,type Tables} from './archive-schema.ts'
import {validateWebhookContext} from './notification-webhook-context.ts'
// @ts-ignore Portable pure template rendering; header values and endpoint stay local.
import {normalizeWebhookTemplate,renderWebhookTemplate} from './webhook-template.mjs'
// @ts-expect-error Shared mailbox validation.
import {parseAddress} from '../base/modules/mail/src/core/validation.mjs'
const integrationProtocols=new Map([['webhook','webhook'],['slack','slack.incoming-webhook.v1']]);
const envelopeKeys=['id','tenant','destinationId','event','protocol'];
// A fallback contact's job carries the confirmed trigger plus the earlier contacts it names; nothing else changes.
function validateFallback(event:any,job:any){
 const f=event.fallbackContext;
 if(event.kind!=='trigger'||!object(f)||Object.keys(f).sort().join(',')!=='previous,step'||!Number.isInteger(f.step)||f.step<1||f.step>3||!Array.isArray(f.previous)||!f.previous.length||f.previous.length>100)throw Error('Invalid notification fallback context');
 for(const p of f.previous){
  shape(p,['deliveryId','destinationId','destinationName','kind','outcome','code'],'notification fallback contact');identity(p.deliveryId,'fallback delivery');identity(p.destinationId,'fallback destination');
  if(p.destinationId===job.destination_id||typeof p.destinationName!=='string'||!p.destinationName||p.destinationName.length>100||/[\x00-\x1f\x7f]/.test(p.destinationName)||![null,'email','webhook','slack'].includes(p.kind)||!['failed','uncertain'].includes(p.outcome)||typeof p.code!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(p.code))throw Error('Invalid notification fallback context');
 }
}
export function validateOutcome(text:any){
 if(text===null)return;
 if(typeof text!=='string')throw Error('Invalid archive notification outcome');const o=JSON.parse(text);
 if(!object(o)||Object.keys(o).some(k=>!['kind','code','status','retryAfterMs','responseExcerpt'].includes(k))||!['accepted','rejected','retryable','uncertain'].includes(o.kind)||typeof o.code!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(o.code)||(o.status!==undefined&&(!Number.isInteger(o.status)||o.status<100||o.status>599))||(o.retryAfterMs!==undefined&&(!Number.isFinite(o.retryAfterMs)||o.retryAfterMs<0))||(o.responseExcerpt!==undefined&&(typeof o.responseExcerpt!=='string'||o.responseExcerpt.length>512||/[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(o.responseExcerpt))))throw Error('Invalid archive notification outcome');
}
function template(row:any){
 if(row.webhook_template===null)return null;
 if(row.kind!=='webhook'||typeof row.webhook_template!=='string')throw Error('Invalid archive webhook template');
 const config=normalizeWebhookTemplate(JSON.parse(row.webhook_template));
 if(JSON.stringify(config)!==row.webhook_template)throw Error('Noncanonical archive webhook template');return config;
}
/** The exact body a delivery sent is a pure function of its archived job event and portable template; archives carry
 * envelopes without it (DELIVERY-002) and restore rebuilds it here. Older archives that still carry it must match. */
export function deliveryBody(job:any,event:any){
 const config=template(job);if(!config)return job.kind==='slack'?slackContent(event):job.event;
 const headers=Object.fromEntries(config.headerNames.map((name:string)=>[name,'']));
 return renderWebhookTemplate({config,event,baseUrl:'https://example.com/',headers}).body??'';
}
export function validateNotificationTables(t:Tables){
 const destinations=unique(t.notification_destinations,r=>r.id,'destination'),jobs=unique(t.notification_jobs,r=>r.id,'notification job'),deliveries=unique(t.integration_deliveries,r=>r.id,'delivery');
 for(const r of destinations.values()){
  template(r);
  if(typeof r.name!=='string'||!r.name.trim()||r.name.length>100||/[\x00-\x1f\x7f]/.test(r.name)||!['email','webhook','slack'].includes(r.kind)||![0,1].includes(r.enabled))throw Error('Invalid archive destination');clock(r.created_at,'destination');if(r.deleted_at!==null)clock(r.deleted_at,'destination deletion');
  if(r.kind==='email'&&r.address!==null){try{const p=parseAddress(r.address);if(p.name||p.email!==r.address)throw Error()}catch{throw Error('Invalid archive email address')}}else if(r.address!==null)throw Error('Archive destination credentials forbidden');
 }
 unique(t.notification_jobs,r=>`${r.event_id}:${r.destination_id}`,'event destination');
 for(const r of jobs.values()){
  template(r);
  const destination=destinations.get(r.destination_id),event=JSON.parse(r.event);
  if(!destination||destination.kind!==r.kind||typeof r.destination_name!=='string'||!r.destination_name||r.destination_name.length>100||!object(event)||event.id!==r.event_id||event.visibility!=='private'||!['trigger','recovery','test','expiry','renewal','reminder','slow','slow_recovery','slow_reminder'].includes(event.kind))throw Error('Invalid notification job reference');
  shape(event,['schemaVersion','id','kind','eventType','incidentKey','state','title','monitorId','monitorRevision','monitorName','url','slotId','observedAt','visibility','evidenceRef','explanation','probes','consoleUrl',...(Object.hasOwn(event,'incidentContext')?['incidentContext']:[]),...(Object.hasOwn(event,'webhookContext')?['webhookContext']:[]),...(Object.hasOwn(event,'fallbackContext')?['fallbackContext']:[])],'notification event');validateIncidentContext(event);validateWebhookContext(event);if(Object.hasOwn(event,'fallbackContext'))validateFallback(event,r);clock(event.observedAt,'notification event');
  if(event.schemaVersion!==2||!Array.isArray(event.probes)||event.probes.length>3||['title','monitorName','url','evidenceRef','explanation','consoleUrl','eventType'].some(k=>typeof event[k]!=='string'||event[k].length>4096))throw Error('Invalid notification event');
  if(event.kind!=='test'){const outbox=t.outbox.find(x=>x.id===r.event_id),{fallbackContext,...trigger}=event;if(!outbox||outbox.event!==(fallbackContext===undefined?r.event:JSON.stringify(trigger)))throw Error('Invalid notification event history')}else if(event.monitorId!==null||event.slotId!==null||event.incidentKey!==null)throw Error('Invalid test event');
  if(!['queued','sending','accepted','rejected','uncertain','imported-inactive'].includes(r.state)||typeof r.code!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(r.code)||!Number.isSafeInteger(r.attempts)||r.attempts<0||r.attempts>1)throw Error('Invalid notification job state');clock(r.created_at,'job');if(r.finished_at!==null){clock(r.finished_at,'job finish');if(r.finished_at<r.created_at)throw Error('Invalid notification job timing')}
 }
 for(const r of deliveries.values()){
  const job=jobs.get(r.id),e=JSON.parse(r.envelope);
  const projected=object(e)&&!Object.hasOwn(e,'body');
  if(!job||!integrationProtocols.has(job.kind)||r.namespace!==notificationNamespace)throw Error('Invalid delivery reference');shape(e,projected?envelopeKeys:[...envelopeKeys,'body'],'notification envelope');
  if(e.id!==r.id||e.tenant!==notificationNamespace||e.destinationId!==job.destination_id||(!projected&&typeof e.body!=='string')||!['webhook','slack.incoming-webhook.v1'].includes(e.protocol)||typeof e.event!=='string')throw Error('Invalid notification envelope');
  const event=JSON.parse(job.event);if(e.event!==event.eventType||e.protocol!==integrationProtocols.get(job.kind)||(!projected&&e.body!==deliveryBody(job,event)))throw Error('Notification envelope event mismatch');
  if(!['queued','sending','accepted','rejected','uncertain'].includes(r.state)||!Number.isSafeInteger(r.attempts)||r.attempts<0||r.attempts>r.max_attempts||!Number.isInteger(r.max_attempts)||r.max_attempts<1||r.max_attempts>10||(job.kind!=='webhook'&&r.max_attempts!==1)||!Array.isArray(JSON.parse(r.retry_delays))||JSON.parse(r.retry_delays).length!==r.max_attempts-1||JSON.parse(r.retry_delays).some((d:any)=>!Number.isSafeInteger(d)||d<1||d>86400000))throw Error('Invalid notification delivery state');clock(r.created_at,'delivery');clock(r.next_at,'delivery due');
 }
 for(const name of ['integration_attempts','integration_resolutions']){
  unique(t[name],r=>r.id,name);
  for(const r of t[name]){if(r.namespace!==notificationNamespace||!deliveries.has(r.delivery_id))throw Error('Invalid notification history reference');identity(r.id,'notification history');if(name==='integration_attempts'){if(!Number.isInteger(r.number)||r.number<1||r.number>deliveries.get(r.delivery_id).max_attempts)throw Error('Invalid notification attempt number');clock(r.started_at,'attempt');if(r.finished_at!==null){clock(r.finished_at,'attempt finish');if(r.finished_at<r.started_at)throw Error('Invalid notification attempt timing')}if((r.finished_at===null)!==(r.outcome===null))throw Error('Invalid notification attempt outcome')}else clock(r.at,'resolution');validateOutcome(r.outcome)}
 }
 unique(t.notification_delivery_attempts,r=>`${r.delivery_id}:${r.number}`,'scheduled notification attempt');
 for(const r of t.notification_delivery_attempts){
  const job=jobs.get(r.delivery_id),delivery=deliveries.get(r.delivery_id);
  if(!job||job.destination_id!==r.destination_id||r.key_reference!==job.event_id||!['retry','fallback'].includes(r.phase)||!Number.isSafeInteger(r.number)||r.number<1||r.number>(delivery?.max_attempts??Math.max(1,job.attempts)))throw Error('Invalid scheduled notification attempt reference');
  clock(r.scheduled_at,'notification schedule');for(const k of ['started_at','finished_at'])if(r[k]!==null)clock(r[k],'notification attempt');
  if(r.started_at!==null&&r.started_at<r.scheduled_at||r.finished_at!==null&&r.started_at!==null&&r.finished_at<r.started_at||r.outcome_category!==null&&!['accepted','rejected','retryable','uncertain'].includes(r.outcome_category)||r.code!==null&&(typeof r.code!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(r.code))||r.status!==null&&(!Number.isInteger(r.status)||r.status<100||r.status>599)||r.retry_after_seconds!==null&&(!Number.isFinite(r.retry_after_seconds)||r.retry_after_seconds<0))throw Error('Invalid scheduled notification attempt outcome');
 }
 unique(t.integration_replays,r=>r.id,'notification replay');
 for(const r of t.integration_replays){const e=JSON.parse(r.envelope);shape(e,['id','tenant','destinationId','event','protocol','body'],'notification replay envelope');const destination=destinations.get(e.destinationId);if(r.namespace!==notificationNamespace||e.tenant!==notificationNamespace||e.id!==r.id||!destination||!integrationProtocols.has(destination.kind)||e.protocol!==integrationProtocols.get(destination.kind)||typeof e.body!=='string'||typeof e.event!=='string')throw Error('Invalid notification replay');clock(r.received_at,'notification replay')}
 unique(t.integration_attempts,r=>`${r.delivery_id}:${r.number}`,'delivery attempt');
 for(const d of deliveries.values())if(t.integration_attempts.filter(a=>a.delivery_id===d.id).length!==d.attempts)throw Error('Missing notification attempt history');
}
