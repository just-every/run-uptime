import type {Bindings} from './control.server.ts'
import type {NotificationEvent} from './notification-content.ts'
import {eventWebhookContext} from './notification-webhook-context.ts'
// @ts-ignore Shared bounded slow evaluation.
import {slowEvaluation} from './slow-evaluation.mjs'
/** Called before the observation transaction; its generation guard is shared
 * with the observations, derived state and notices, so concurrent results cannot
 * each open a degradation. Current scheduled evidence alone can change it. */
export async function slowNotice(env:Bindings,monitor:any,slot:any,fresh:any[],now:number):Promise<NotificationEvent|null>{
 const last=await env.DB.prepare("SELECT kind,event FROM outbox WHERE monitor_id=? AND kind IN ('slow','slow_recovery') AND status<>'imported-inactive' ORDER BY rowid DESC LIMIT 1").bind(monitor.id).first<any>();
 const open=last?.kind==='slow',previous=open?JSON.parse(last.event):null;
 let policy=monitor.definition.slow;
 if(open){const original=await env.DB.prepare('SELECT definition FROM revisions WHERE monitor_id=? AND revision=?').bind(monitor.id,previous.monitorRevision).first<{definition:string}>();const saved=original?JSON.parse(original.definition):null;policy=saved?.slow?{...saved.slow,locations:saved.slow.locations==='all'?saved.probes:saved.slow.locations}:null;}
 if(!policy)return null;
 const rows=(await env.DB.prepare('SELECT id,due_at,manual,missed_count FROM slots WHERE monitor_id=? AND revision=? AND manual=0 ORDER BY due_at DESC LIMIT 100').bind(monitor.id,monitor.revision).all<any>()).results;
 if(rows[0]?.id!==slot.id)return null; // late historical arrivals cannot regress current degradation
 const stored=(await env.DB.prepare('SELECT slot_id,probe,evidence FROM observations WHERE slot_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(rows.map(s=>s.id))).all<any>()).results;
 const observations=[...stored,...fresh.map(o=>({slot_id:slot.id,probe:o.probe,evidence:o}))];
 const result=slowEvaluation({...monitor.definition,slow:policy},rows,observations,now);if(!result)return null;
 if(result.slow===open)return null;
 const kind=result.slow?'slow':'slow_recovery',key=previous?.incidentKey??`slow:${slot.id}`;
 const explanation=result.slow?`Response time ${result.valueMs} ms exceeded ${policy.thresholdMs} ms over ${policy.slots} ${policy.mode==='consecutive'?'consecutive scheduled slots':`slots (p${policy.percentile})`}; locations: ${result.locations.join(', ')}. This is degradation, not downtime.`:`The complete valid ${policy.slots}-slot window no longer satisfies the opening ${policy.mode==='consecutive'?'consecutive':`p${policy.percentile}`} Slow rule at ${policy.thresholdMs} ms. This closes the Slow event; availability is unchanged.`;
 return {schemaVersion:2,id:`${slot.id}:${kind}`,kind,eventType:result.slow?'uptime.slow.firing':'uptime.slow.recovered',incidentKey:key,state:result.slow?'warning':'recovered',title:`${result.slow?'Slow':'Slow recovered'}: ${monitor.definition.name}`,monitorId:monitor.id,monitorRevision:monitor.revision,monitorName:monitor.definition.name,url:monitor.definition.url,slotId:slot.id,observedAt:now,visibility:'private',evidenceRef:`/api/monitors/${monitor.id}/history`,explanation,probes:result.locations.map((name:string)=>({name,outcome:result.slow?'slow':'pass',reason:explanation})),consoleUrl:env.UPTIME_ORIGIN??'',webhookContext:{...eventWebhookContext(monitor.definition,fresh),alertStartedAt:previous?.observedAt??now}};
}
