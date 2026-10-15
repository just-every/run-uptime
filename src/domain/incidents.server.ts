import type {Bindings} from './control.server.ts'
import type {NotificationEvent} from './notification-content.ts'

// Incident transitions are committed with their scheduled evidence, even when no
// destination exists. Read that durable record rather than inferring incidents
// from today's state or the bounded recent-check list.
export async function incidents(env:Bindings,id:string,now=Date.now()){
 const rows=await env.DB.prepare(`SELECT opened.event AS started,opened.status,
  (SELECT closed.event FROM outbox closed WHERE closed.monitor_id=opened.monitor_id
   AND closed.kind='recovery' AND json_extract(closed.event,'$.incidentKey')=json_extract(opened.event,'$.incidentKey')
   ORDER BY closed.rowid LIMIT 1) AS ended
  FROM outbox opened WHERE opened.monitor_id=? AND opened.kind='trigger'
  ORDER BY opened.rowid DESC LIMIT 100`).bind(id).all<{started:string;ended:string|null;status:string}>()
 return rows.results.map(row=>{
  const trigger=JSON.parse(row.started) as NotificationEvent,recovery=row.ended?JSON.parse(row.ended) as NotificationEvent:null
  return {key:trigger.incidentKey,startedAt:trigger.observedAt,endedAt:recovery?.observedAt??null,
   durationMs:Math.max(0,(recovery?.observedAt??now)-trigger.observedAt),imported:row.status==='imported-inactive',trigger,recovery}
 })
}
