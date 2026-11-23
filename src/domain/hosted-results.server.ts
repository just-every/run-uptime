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

export function hostedResultStatement(env:Bindings,slot:any,stored:any[],fresh:any[],definition:any,terminal:boolean,availability:string,guard:string,values:unknown[]){
 const attempts=stored.map(o=>JSON.parse(o.evidence));
 const receipts:Record<string,Record<number,number>>=Object.fromEntries(definition.probes.map((probe:string)=>[probe,{}]));
 for(const observation of stored)receipts[observation.probe][observation.attempt]=observation.received_at;
 for(const {evidence,probe,attempt,received_at} of fresh){
  attempts.push(JSON.parse(evidence));
  receipts[probe][attempt]=received_at;
 }
 return env.DB.prepare(`UPDATE slots SET status=CASE WHEN ? THEN 'complete' ELSE status END,
  hosted=json_set(hosted,'$.attempts',json(?),'$.receivedTimes',json(?),'$.availability',json(?)) WHERE id=? AND ${guard}`)
  .bind(Number(terminal),JSON.stringify(attempts),JSON.stringify(receipts),
   availability,slot.id,...values);
}
