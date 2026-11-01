import {renderSlackEvent,serializeSlackMessage,escapeSlackText} from '../base/modules/integrations/slack/message.ts'
import {triggerContext,recoveryContext,incidentContextText,incidentUrl,type IncidentContext} from './notification-context.ts'
import {eventWebhookContext,type WebhookContext} from './notification-webhook-context.ts'
export interface NotificationEvent {
 preparedBy?:{label:string;agent:{id:string;name:string};for:{id:string;name:string}};
 schemaVersion:2; id:string; kind:'report'|'trigger'|'recovery'|'test'|'expiry'|'renewal'|'reminder'|'slow'|'slow_recovery'|'slow_reminder'|'dependency'|'dependency_recovery'; eventType:string;
 incidentKey:string|null; state:'report'|'firing'|'recovered'|'test'|'warning'|'renewed'; title:string;
 monitorId:string|null; monitorRevision:number|null; monitorName:string; url:string;
 slotId:string|null; observedAt:number; visibility:'private'; evidenceRef:string;
 explanation:string; probes:{name:string;outcome:string;reason:string}[]; consoleUrl:string;
 incidentContext?:IncidentContext;
 webhookContext?:WebhookContext;
 fallbackContext?:FallbackContext;
 dependency?:DependencyContext;
}
/** DEPENDENCY-002: what a dependency notice states, attributed to the provider. It is never an Uptime incident. */
export interface DependencyContext {entryId:string;catalogVersion:number;provider:string;component:string|null;scope:'whole'|'component';stated:string;source:string}
export const dependencyText=(context:DependencyContext)=>[`Provider: ${context.provider}${context.component?`, ${context.component}`:''}`,`Stated by the provider: ${context.stated}`,`Source: ${context.source}`,'This is a dependency notice. It opened no Uptime incident and is not proof that your application is up or down.']
/** DELIVERY-002: a fallback contact's copy of the confirmed trigger names the earlier contacts that failed or stayed uncertain. */
export interface FallbackContext {step:number;previous:{deliveryId:string;destinationId:string;destinationName:string;kind:string|null;outcome:'failed'|'uncertain';code:string}[]}
export function fallbackText(context:FallbackContext){return context.previous.map(p=>`Fallback ${context.step}: ${p.destinationName}${p.kind?` (${p.kind})`:''} ${p.outcome==='failed'?'failed':'is still uncertain'} (${p.code}).`)}
export function incidentEvent({id,kind,monitor,slotId,now,state,observations,origin,incidentKey,trigger,contextVersion,timeZone}:any):NotificationEvent {
 const event:NotificationEvent={schemaVersion:2,id,kind,eventType:kind==='trigger'?'uptime.incident.firing':'uptime.incident.recovered',incidentKey,
 state:kind==='trigger'?'firing':'recovered',title:`${kind==='trigger'?'Down':'Recovered'}: ${monitor.definition.name}`,
 monitorId:monitor.id,monitorRevision:monitor.revision,monitorName:monitor.definition.name,url:monitor.definition.url,
 slotId,observedAt:now,visibility:'private',evidenceRef:`/api/monitors/${monitor.id}/history`,explanation:state.reason,
 probes:observations.map((o:any)=>({name:o.probe,outcome:o.outcome,reason:o.checks.filter((c:any)=>!c.pass).map((c:any)=>c.reason).join('; ')||'All checks passed'})),consoleUrl:origin||''}
 // Existing historical/demo event builders retain their original serialized representation.
 if(![1,2].includes(contextVersion))return event;
 event.webhookContext=eventWebhookContext(monitor.definition,observations);
 if(kind==='recovery'&&(!trigger||trigger.kind!=='trigger'||trigger.incidentKey!==incidentKey))throw Error('Recovery requires its durable incident trigger');
 event.incidentContext=kind==='trigger'?triggerContext(event,state.regions,contextVersion===2?timeZone:undefined):recoveryContext(trigger,now);
 if(kind==='recovery')event.incidentContext.incidentUrl=incidentUrl(event.consoleUrl,event.monitorId!,incidentKey);
 return event;
}
// A staged expiry warning (kind expiry, one per subject and stage) or the renewal that closes a subject's warnings
// (kind renewal, sharing the warning's incidentKey). See expiry-notices.server.ts.
const day=(at:number)=>new Date(at).toISOString().slice(0,10)
export function expiryEvent({kind,monitor,slotId,now,origin,subject,label,expiresAt,stage,owner,previous}:{kind:'expiry'|'renewal';monitor:any;slotId:string;now:number;origin?:string;subject:string;label:string;expiresAt:number;stage?:number;owner?:string;previous?:NotificationEvent}):NotificationEvent {
 const what=monitor.definition.type==='tls'?'Certificate':'Domain registration',left=Math.floor((expiresAt-now)/86400000),incidentKey=previous?.incidentKey??`expiry:${monitor.id}:${subject}`
 const accountable=owner?` Accountable owner: ${owner}.`:''
 return {schemaVersion:2,id:kind==='expiry'?`${incidentKey}:${stage}`:`renewal:${incidentKey}`,kind,eventType:kind==='expiry'?'uptime.expiry.warning':'uptime.expiry.renewed',incidentKey,state:kind==='expiry'?'warning':'renewed',
  title:kind==='expiry'?`${what} expires in ${left} day${left===1?'':'s'}: ${monitor.definition.name}`:`${what} renewed: ${monitor.definition.name}`,
  monitorId:monitor.id,monitorRevision:monitor.revision,monitorName:monitor.definition.name,url:monitor.definition.url,slotId,observedAt:now,visibility:'private',evidenceRef:`/api/monitors/${monitor.id}/history`,
  explanation:kind==='expiry'?`${label[0].toUpperCase()}${label.slice(1)} expires on ${day(expiresAt)} (${left} day${left===1?'':'s'} left; the ${stage}-day warning).${accountable} The warning stays open until a renewed one is observed.`:`A renewed ${what.toLowerCase()} was observed: ${label}, valid until ${day(expiresAt)}. It replaces the one warned about earlier (${previous!.explanation.split(' expires on ')[0]}).${accountable}`,
  probes:[],consoleUrl:origin||'',webhookContext:{...eventWebhookContext(monitor.definition),...(monitor.definition.type==='tls'?{sslExpiryDate:day(expiresAt),sslExpiryDaysLeft:left}:{domainExpiryDate:day(expiresAt),domainExpiryDaysLeft:left})}}
}
export function testEvent(origin:string):NotificationEvent {
 return {schemaVersion:2,id:`test:${crypto.randomUUID()}`,kind:'test',eventType:'uptime.notification.test',incidentKey:null,state:'test',title:'Test notification: Uptime',monitorId:null,monitorRevision:null,monitorName:'Test notification',url:'',slotId:null,observedAt:Date.now(),visibility:'private',evidenceRef:'',explanation:'This is a test notification. No monitor state or incident was changed.',probes:[],consoleUrl:origin}
}
// Archive validation rebuilds every recorded Slack body from this text, so its
// output must stay byte-stable or prior deliveries can no longer export or restore.
export function notificationText(event:NotificationEvent){return [event.title,...(event.fallbackContext?fallbackText(event.fallbackContext):[]),event.url?`URL: ${event.url}`:'',`State: ${event.state}`,event.monitorId?`Monitor: ${event.monitorId}`:'',event.incidentKey?`Incident: ${event.incidentKey}`:'',`Why: ${event.explanation}`,...(event.dependency?dependencyText(event.dependency):[]),`Time: ${new Date(event.observedAt).toISOString()}`,...event.probes.map(p=>`Probe ${p.name}: ${p.outcome} — ${p.reason}`),event.consoleUrl?`Console: ${event.consoleUrl}`:'',...(event.incidentContext?incidentContextText(event.incidentContext):[])].filter(Boolean).join('\n')}
export function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
export function mailContent(event:NotificationEvent){
 // Mail uses friendly check labels; persisted Slack envelopes retain their byte-stable rendering.
 const display={...event,probes:event.probes.map(p=>({...p,name:p.name==='local-a'&&event.explanation.includes('Cloudflare Worker')?'Cloudflare Worker':/^local-[a-z]$/.test(p.name)?`Check ${p.name.charCodeAt(6)-96}`:p.name}))};
 const text=[event.preparedBy?event.preparedBy.label:'',notificationText(display)].filter(Boolean).join('\n');let link='';
 if(event.consoleUrl){const url=new URL(event.consoleUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.origin!==event.consoleUrl)throw Error('Invalid console origin');link=event.incidentContext?`<p><a href="${escapeHtml(event.incidentContext.incidentUrl)}">Open incident in Uptime</a></p>`:`<p><a href="${escapeHtml(event.consoleUrl)}/app">Open Uptime console</a></p>`}
 return {subject:event.title.replace(/[\r\n\x00-\x1f\x7f]/g,' '),text,html:`<pre>${escapeHtml(text)}</pre>${link}`}
}
// Slack bounds the escaped text, so split complete Unicode code points after
// measuring their escaped size. Preserve all evidence without creating mentions.
function slackSections(value:string){
 const sections:string[]=[];let section='',size=0;
 for(const character of value){const width=escapeSlackText(character).length;if(size+width>3000){sections.push(section);section='';size=0}section+=character;size+=width}
 if(section)sections.push(section);return sections;
}
export function slackContent(event:NotificationEvent){return serializeSlackMessage(renderSlackEvent(event.eventType,event,{[event.eventType]:e=>({summary:e.title,sections:slackSections([e.preparedBy?.label,notificationText(e)].filter(Boolean).join('\n'))})}))}
