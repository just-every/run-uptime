import {eventWebhookContext} from './notification-webhook-context.ts'
import type {NotificationEvent} from './notification-content.ts'
// DEPENDENCY-002: a followed provider's incident and recovery are dependency notices. A notice carries the provider's own
// stated status as attributed context. It is never an Uptime incident: the confirmed transition of the followed monitor
// writes an outbox row of kind dependency or dependency_recovery, never trigger or recovery, and delivers it through the
// route the owner chose for that monitor.
export const NOTICE_KINDS=['dependency','dependency_recovery'] as const
export const noticeKind=(open:boolean)=>open?'dependency_recovery':'dependency'
// The provider's value is kept in the evidence's own JSON check reason: `actual "degraded_performance"`.
function stated(observations:any[],kind:'dependency'|'dependency_recovery'){
 if(kind==='dependency_recovery')return 'operational'
 for(const observation of observations)for(const check of observation.checks??[]){
  if(check.pass!==false)continue
  const value=/\bactual "([^"]{1,60})"/.exec(check.reason)?.[1]
  if(value)return value
  if(check.assertion==='body-regex')return 'an impact is listed in the provider’s feed'
 }
 return 'not operational'
}
export function dependencyEvent({kind,monitor,followed,slotId,now,origin,observations,previous}:{kind:'dependency'|'dependency_recovery';monitor:any;followed:{entry_id:string;catalog_version:number;scope:'whole'|'component'};slotId:string;now:number;origin?:string;observations:any[];previous:NotificationEvent|null}):NotificationEvent{
 const definition=monitor.definition,provider=definition.service as string,component=followed.scope==='component'?(definition.group??null):null,label=component?`${provider} ${component}`:provider
 const value=stated(observations,kind),opening=kind==='dependency'
 const explanation=opening
  ?`${provider}'s own status source states ${component?`${component} is `:''}${value}. This is the provider's claim: it opened no Uptime incident and is not proof that your application is up or down.`
  :`${provider}'s own status source now states ${component?`${component} is `:''}operational again after the notice of ${new Date(previous?.observedAt??now).toISOString()}. This is the provider's claim, not proof that your application recovered.`
 return {schemaVersion:2,id:`${slotId}:${kind}`,kind,eventType:opening?'uptime.dependency.firing':'uptime.dependency.recovered',incidentKey:opening?`dependency:${slotId}`:previous!.incidentKey,
  state:opening?'warning':'recovered',title:`${opening?'Provider issue':'Provider recovered'}: ${label}`,monitorId:monitor.id,monitorRevision:monitor.revision,monitorName:definition.name,url:definition.url,
  slotId,observedAt:now,visibility:'private',evidenceRef:`/api/monitors/${monitor.id}/history`,explanation,
  probes:observations.map((o:any)=>({name:o.probe,outcome:o.outcome,reason:o.checks.filter((c:any)=>!c.pass).map((c:any)=>c.reason).join('; ')||'All checks passed'})),consoleUrl:origin||'',
  webhookContext:{...eventWebhookContext(definition,observations),...(opening?{}:{alertStartedAt:previous?.observedAt??now})},
  dependency:{entryId:followed.entry_id,catalogVersion:followed.catalog_version,provider,component,scope:followed.scope,stated:value,source:definition.url}}
}
