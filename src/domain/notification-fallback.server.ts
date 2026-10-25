import type {Bindings} from './control.server.ts'
import type {NotificationEvent,FallbackContext} from './notification-content.ts'
import {defaultContactSettings,type ContactSettings} from './contact-schedule.ts'
// DELIVERY-002 fallback chains. Every decision reads durable D1 state (attempt start times, outcomes and the
// confirmed chain snapshot), so a restart resumes at the stored deadline without an extra send.
const namespace='uptime-notifications';
/** Attempts on a fallback contact's own delivery are fallback-phase records; others are the contact's retries. */
export const attemptPhase=(job='j')=>`CASE WHEN json_extract(${job}.event,'$.fallbackContext') IS NULL THEN 'retry' ELSE 'fallback' END`;
const jobState=`CASE WHEN j.state<>'queued' THEN j.state ELSE COALESCE(d.state,j.state) END`;
const jobRows=`SELECT j.id,j.destination_id,j.destination_name,j.kind,j.event,j.finished_at,${jobState} state,
 COALESCE((SELECT a.code FROM notification_delivery_attempts a WHERE a.delivery_id=j.id AND a.finished_at IS NOT NULL ORDER BY a.number DESC LIMIT 1),j.code) code,
 (SELECT MIN(a.started_at) FROM notification_delivery_attempts a WHERE a.delivery_id=j.id) started_at
 FROM notification_jobs j LEFT JOIN integration_deliveries d ON d.namespace='${namespace}' AND d.id=j.id`;
// Codes that end a send without it failing to reach its contact: nothing to escalate.
const settled=['contact_schedule_stopped','trigger_not_accepted','imported_inactive'];
type Job={id:string;destination_id:string;destination_name:string;kind:string;event:string;finished_at:number|null;state:string;code:string;started_at:number|null};
/** Failed now, Uncertain (including a deduplicated send still retrying) past the deadline, or neither yet. */
function escalation(job:Job,deadlineMs:number,now:number):'failed'|'uncertain'|null{
 if(job.state==='rejected')return settled.includes(job.code)?null:'failed';
 if(!['uncertain','sending','queued'].includes(job.state))return null;
 const started=job.started_at??(job.state==='uncertain'?job.finished_at:null);
 return started!==null&&started+deadlineMs<=now?'uncertain':null;
}
// A dependency notice's chain closes on its own recovery notice (DEPENDENCY-002); incident and dependency keys never collide.
const closedSql=`EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=? AND r.kind IN ('recovery','dependency_recovery') AND json_extract(r.event,'$.incidentKey')=?)`;
export async function advanceFallbackChains(env:Bindings){
 const now=Date.now();
 const chains=(await env.DB.prepare('SELECT * FROM alert_fallback_chains WHERE ended_at IS NULL ORDER BY created_at LIMIT 100').all<any>()).results;
 for(const chain of chains){
  const ids:string[]=JSON.parse(chain.destination_ids),settings:Record<string,ContactSettings>=JSON.parse(chain.contact_settings);
  const end=(reason:string)=>env.DB.prepare('UPDATE alert_fallback_chains SET ended_at=?,end_reason=? WHERE event_id=? AND step=? AND ended_at IS NULL').bind(now,reason,chain.event_id,chain.step).run();
  if(await env.DB.prepare(`SELECT 1 FROM outbox WHERE id=? AND NOT ${closedSql}`).bind(chain.event_id,chain.monitor_id,chain.incident_key).first()===null){await end('closed');continue}
  const jobs=(await env.DB.prepare(`${jobRows} WHERE j.event_id=?`).bind(chain.event_id).all<Job>()).results;
  // Step 0 is every contact the route selected; step n is the nth named fallback contact.
  const current=chain.step===0?jobs.filter(j=>!ids.includes(j.destination_id)):jobs.filter(j=>j.destination_id===ids[chain.step-1]);
  if(current.length&&current.every(j=>j.state==='accepted')){await end('accepted');continue}
  let previous:FallbackContext['previous'];
  if(!current.length&&chain.step>0){
   // The named contact was disabled, deleted or unavailable when its turn came: it could not be sent.
   const id=ids[chain.step-1],d=await env.DB.prepare('SELECT name,kind FROM notification_destinations WHERE id=?').bind(id).first<any>();
   previous=[{deliveryId:`${chain.event_id}:${id}`,destinationId:id,destinationName:d?.name??'Unavailable destination',kind:d?.kind??null,outcome:'failed',code:'destination_unavailable'}];
  }else previous=current.flatMap(j=>{const outcome=escalation(j,chain.deadline_ms,now);return outcome?[{deliveryId:j.id,destinationId:j.destination_id,destinationName:j.destination_name,kind:j.kind,outcome,code:j.code}]:[]});
  if(!previous.length)continue;
  // After the last named contact the follow-up stays open in the console; nobody else is messaged.
  if(chain.step>=ids.length){await end('exhausted');continue}
  const next=ids[chain.step],step=chain.step+1;
  const trigger=await env.DB.prepare('SELECT event FROM outbox WHERE id=?').bind(chain.event_id).first<{event:string}>();
  const event:NotificationEvent={...JSON.parse(trigger!.event),fallbackContext:{step,previous}};
  // A dependency notice goes to each contact once, under its quiet hours; its saved delay still applies; dependency notices do not repeat.
  const own={...defaultContactSettings,...settings[next]},policy=event.kind==='dependency'?{...own,repeatMinutes:0,maxRepeats:null,recovery:true,stopOnAck:false}:own;
  const due=event.observedAt+policy.delayMinutes*60000,repeat=policy.repeatMinutes*60000;
  // Reminders keep the confirmation-anchored cadence, starting after this contact's first notice.
  const nextAt=repeat?due+(Math.max(0,Math.floor((now-due)/repeat))+1)*repeat:null;
  const fired=`EXISTS(SELECT 1 FROM alert_fallback_chains WHERE event_id=? AND step=? AND fired_at=?)`,id=`${chain.event_id}:${next}`;
  await env.DB.batch([
   env.DB.prepare('UPDATE alert_fallback_chains SET step=?,fired_at=? WHERE event_id=? AND step=? AND ended_at IS NULL').bind(step,now,chain.event_id,chain.step),
   env.DB.prepare(`INSERT OR IGNORE INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at)
    SELECT ?,?,d.id,d.name,d.kind,d.credential_id,?,? FROM notification_destinations d WHERE d.id=? AND d.enabled=1 AND d.deleted_at IS NULL
    AND EXISTS(SELECT 1 FROM notification_credentials c WHERE c.id=d.credential_id AND c.retired_at IS NULL AND c.unavailable_at IS NULL AND (c.ciphertext IS NOT NULL OR c.endpoint IS NOT NULL))
    AND ${fired} AND NOT ${closedSql}`).bind(id,chain.event_id,JSON.stringify(event),now,next,chain.event_id,step,now,chain.monitor_id,chain.incident_key),
   env.DB.prepare(`INSERT OR IGNORE INTO alert_contact_schedules(trigger_job_id,monitor_id,incident_key,due_at,repeat_ms,max_repeats,next_at,recovery,stop_on_ack,quiet_rules,route_quiet_rules)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM notification_jobs WHERE id=?) AND ${fired}`).bind(id,chain.monitor_id,chain.incident_key,due,repeat,policy.maxRepeats,nextAt,Number(policy.recovery),Number(policy.stopOnAck),policy.quietHours?JSON.stringify(policy.quietHours):null,chain.route_quiet_rules,id,chain.event_id,step,now),
  ]);
 }
}
/** Console read: which earlier contacts a fallback names (with their outcome now), which fallbacks a delivery
 * started, and whether the chain ended after its last contact with nobody accepting. Linear in the rows read, with no
 * extra query when no listed delivery belongs to a chain. */
export async function fallbackOverview(env:Bindings,deliveries:{id:string;event_id:string;destination_id:string;event:string}[]){
 const events=[...new Set(deliveries.map(d=>d.event_id))];
 const chains=new Map((await env.DB.prepare('SELECT event_id,destination_ids,step,ended_at,end_reason FROM alert_fallback_chains WHERE event_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(events)).all<any>()).results.map(c=>[c.event_id,c]));
 if(!chains.size&&!deliveries.some(d=>d.event.includes('"fallbackContext"')))return ()=>undefined;
 const chained=events.filter(id=>chains.has(id)||deliveries.some(d=>d.event_id===id&&d.event.includes('"fallbackContext"')));
 const related=(await env.DB.prepare(`${jobRows} WHERE j.event_id IN(SELECT value FROM json_each(?))`).bind(JSON.stringify(chained)).all<Job>()).results;
 const byId=new Map(related.map(j=>[j.id,j])),startedBy=new Map<string,{id:string;destinationName:string;state:string}[]>();
 for(const j of related){
  const context:FallbackContext|undefined=j.event.includes('"fallbackContext"')?JSON.parse(j.event).fallbackContext:undefined;
  for(const p of context?.previous??[])startedBy.set(p.deliveryId,[...(startedBy.get(p.deliveryId)??[]),{id:j.id,destinationName:j.destination_name,state:j.state}]);
 }
 return (delivery:{id:string;event_id:string;destination_id:string;event:string})=>{
  const context:FallbackContext|undefined=delivery.event.includes('"fallbackContext"')?JSON.parse(delivery.event).fallbackContext:undefined,chain=chains.get(delivery.event_id);
  const started=startedBy.get(delivery.id)??[],step=context?.step??0;
  const last=chain&&chain.end_reason==='exhausted'&&step===chain.step;
  if(!context&&!started.length&&!last)return undefined;
  return {step,...(context?{after:context.previous.map(p=>({...p,stateNow:byId.get(p.deliveryId)?.state??null}))}:{}),fallbacks:started,...(chain?{chainLength:JSON.parse(chain.destination_ids).length}:{}),...(last?{ended:'exhausted' as const}:{})};
 };
}

/** Read the same durable start/deadline decision advanceFallbackChains uses. */
export async function nextFallbackDue(env:Bindings,eventId:string){
 const chain=await env.DB.prepare('SELECT * FROM alert_fallback_chains WHERE event_id=? AND ended_at IS NULL').bind(eventId).first<any>()
 if(!chain)return null
 const ids:string[]=JSON.parse(chain.destination_ids)
 if(chain.step>=ids.length)return null
 const jobs=(await env.DB.prepare(`${jobRows} WHERE j.event_id=?`).bind(eventId).all<Job>()).results
 const current=chain.step===0?jobs.filter(j=>!ids.includes(j.destination_id)):jobs.filter(j=>j.destination_id===ids[chain.step-1])
 const due=current.flatMap(job=>{
  if(job.state==='rejected'&&!settled.includes(job.code))return [job.finished_at??chain.fired_at??chain.created_at]
  if(!['uncertain','sending','queued'].includes(job.state))return []
  const started=job.started_at??(job.state==='uncertain'?job.finished_at:null)
  return started===null?[]:[started+chain.deadline_ms]
 })
 return due.length?{due:Math.min(...due),kind:'escalation' as const}:null
}
