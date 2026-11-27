import {mutationGuard} from './audit.server.ts'
import type {Bindings} from './control.server.ts'

// Keep UUIDs in their existing public format. The last 12 digits point to
// the scheduled time, so native submissions can check both stores by key.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-([a-f0-9]{12})$/;
export function hostedObservationId(id:string,dueAt:number){
 return id.slice(0,-12)+dueAt.toString(16).padStart(12,'0');
}
export function nativeObservationIdGuard(env:Bindings,id:string){
 const suffix=uuid.exec(id)?.[1];
 return suffix?mutationGuard(env,`NOT EXISTS(SELECT 1 FROM monitors m CROSS JOIN slots s INDEXED BY slots_monitor
  ON s.monitor_id=m.id AND s.due_at=? CROSS JOIN json_each(s.hosted,'$.attempts') o
  WHERE json_extract(o.value,'$.id')=?)`,[Number.parseInt(suffix,16),id]):null;
}

// The Worker returns every attempt of its claimed check at once. Write the slot
// then, complete, from the claim the monitor holds: one row for the whole check.
// `guard` is evaluated against that monitor row (alias m) in the same statement.
export function hostedResultStatement(env:Bindings,slot:any,fresh:any[],definition:any,encodedDefinition:string,terminal:boolean,availability:string,guard:string,values:unknown[]){
 const attempts:unknown[]=[];
 const receipts:Record<string,Record<number,number>>=Object.fromEntries(definition.probes.map((probe:string)=>[probe,{}]));
 for(const {evidence,probe,attempt,received_at} of fresh){
  attempts.push(JSON.parse(evidence));
  receipts[probe][attempt]=received_at;
 }
 return env.DB.prepare(`INSERT OR IGNORE INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,hosted)
  SELECT ?1,m.id,json_extract(m.hosted_claim,'$.revision'),json_extract(m.hosted_claim,'$.dueAt'),?2,?3,'',
   json_extract(m.hosted_claim,'$.leaseUntil'),json_extract(m.hosted_claim,'$.missedCount'),
   json_set(json_extract(m.hosted_claim,'$.hosted'),'$.attempts',json(?4),'$.receivedTimes',json(?5),'$.availability',json(?6))
  FROM monitors m WHERE m.id=?7 AND m.hosted_slot=?1 AND json_extract(m.hosted_claim,'$.id')=?1 AND ${guard}`)
  .bind(slot.id,terminal?'complete':'running',encodedDefinition,JSON.stringify(attempts),JSON.stringify(receipts),
   availability,slot.monitor_id,...values);
}
