import type {Bindings} from './control.server.ts'
import {expiryEvent,type NotificationEvent} from './notification-content.ts'
// @ts-ignore Shared protocol evaluation.
import {expiryOf} from './protocol/evaluate.mjs'
// TLS-001 and DOMAIN-001 staged expiry warnings. A scheduled result whose certificate or registration is valid but
// expires within one of the owner's warning stages records one warning per subject and stage (the event id is that
// pair, so later results add nothing). A warning stays open until a newly observed, valid subject that expires beyond
// every stage is seen: then one renewal event names both. Warnings are outbox events beside incidents, with the same
// destinations, maintenance suppression and archive rules; they never change monitor state.
const DAY=86400000
export interface ExpiryNotice{kind:'expiry'|'renewal';event:NotificationEvent}
export async function openExpiryWarnings(env:Bindings,monitorId:string){
 const rows=(await env.DB.prepare(`SELECT event FROM outbox o WHERE o.monitor_id=? AND o.kind='expiry' AND o.status<>'imported-inactive'
  AND NOT EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=o.monitor_id AND r.kind='renewal' AND json_extract(r.event,'$.incidentKey')=json_extract(o.event,'$.incidentKey'))
  ORDER BY o.rowid`).bind(monitorId).all<{event:string}>()).results.map(r=>JSON.parse(r.event) as NotificationEvent)
 return [...new Map(rows.map(e=>[e.incidentKey!,e])).values()]
}
export function expiryNotices({monitor,slotId,observations,now,open,origin}:{monitor:any;slotId:string;observations:any[];now:number;open:NotificationEvent[];origin?:string}):ExpiryNotice[]{
 const definition=monitor.definition,settings=definition[definition.type],stages:number[]=settings?.warnDays
 if(!stages)return []
 const seen=[...new Map(observations.map((o:any)=>expiryOf(definition,o)).filter(Boolean).map((e:any)=>[e.subject,e])).values()] as any[]
 const notices:ExpiryNotice[]=[]
 for(const e of seen){
  const left=Math.floor((e.expiresAt-now)/DAY),stage=e.valid&&left>=0?[...stages].reverse().find(days=>left<=days):undefined
  if(stage!==undefined)notices.push({kind:'expiry',event:expiryEvent({kind:'expiry',monitor,slotId,now,origin,subject:e.subject,label:e.label,expiresAt:e.expiresAt,stage,owner:settings.owner})})
 }
 const renewed=seen.find(e=>e.valid&&e.expiresAt-now>Math.max(...stages)*DAY)
 for(const warning of open){
  if(!renewed||seen.some(e=>`expiry:${monitor.id}:${e.subject}`===warning.incidentKey))continue
  notices.push({kind:'renewal',event:expiryEvent({kind:'renewal',monitor,slotId,now,origin,subject:renewed.subject,label:renewed.label,expiresAt:renewed.expiresAt,owner:settings.owner,previous:warning})})
 }
 return notices
}
