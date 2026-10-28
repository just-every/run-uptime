import type {Bindings} from '../control.server.ts'
import type {AuditActor} from '../audit.server.ts'
// Stored in the same revision transaction, never reconstructed from today's
// definition. Corrections and later applications append distinct entries.
export function definitionTimeline(env:Bindings,monitorId:string,old:any,definition:any,revision:number,now:number,actor:AuditActor){
 if(!old)return []
 const kinds:string[]=[]
 if(old.enabled&&definition.enabled===false)kinds.push('pause_applied')
 if((definition.maintenanceUntil>now&&definition.maintenanceUntil!==old.maintenanceUntil)||(definition.maintenanceWindows??[]).some((window:any)=>! (old.maintenanceWindows??[]).some((prior:any)=>JSON.stringify(prior)===JSON.stringify(window))))kinds.push('maintenance_applied')
 return kinds.map(kind=>env.DB.prepare(`INSERT INTO incident_timeline(id,incident_id,monitor_id,occurred_at,actor_id,kind,data)
 SELECT ?||o.id,o.id,o.monitor_id,?,?,?,? FROM outbox o WHERE o.monitor_id=? AND o.kind='trigger' AND NOT EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=o.monitor_id AND r.kind='recovery' AND json_extract(r.event,'$.incidentKey')=json_extract(o.event,'$.incidentKey'))`)
 .bind(crypto.randomUUID()+':',now,actor.kind==='operator'?actor.ref:null,kind,JSON.stringify({revision,outcome:'applied',feature:actor.kind==='feature'?actor.ref:null,...(actor.preparedBy?{preparedBy:actor.preparedBy,approvers:actor.approvers??[]}:{})}),monitorId))
}
