import {auditStatement,mutationGuard,type AuditActor} from './audit.server.ts'
import type {Bindings} from './control.server.ts'
/** This acknowledges a performance notice; it never creates/resolves an outage. */
export async function acknowledgeSlow(env:Bindings,id:string,input:any,actor:AuditActor){
 if(!input||Object.keys(input).some(k=>k!=='eventId')||typeof input.eventId!=='string'||input.eventId.length>512)throw Error('A current Slow event ID is required');
 const guard="EXISTS(SELECT 1 FROM outbox o WHERE o.id=? AND o.monitor_id=? AND o.kind='slow' AND o.status<>'imported-inactive' AND NOT EXISTS(SELECT 1 FROM outbox r WHERE r.monitor_id=o.monitor_id AND r.kind='slow_recovery' AND json_extract(r.event,'$.incidentKey')=json_extract(o.event,'$.incidentKey')))";
 const now=Date.now();
 try{await env.DB.batch([mutationGuard(env,guard,[input.eventId,id]),env.DB.prepare('INSERT OR IGNORE INTO slow_acknowledgements(opening_event_id,monitor_id,actor_id,acknowledged_at) VALUES(?,?,?,?)').bind(input.eventId,id,actor.ref,now),auditStatement(env,actor,'slow_acknowledge','monitor',crypto.randomUUID(),'changes()=1',[],now)])}
 catch(error){if(String(error).includes('uptime_audit.id'))throw Object.assign(Error('Slow event changed; refresh before acknowledging'),{status:409});throw error}
 return {acknowledged:true};
}
