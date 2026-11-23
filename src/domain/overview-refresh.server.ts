import {CONTACT_FRESHNESS_MS} from './runner-contact.server.ts'
// @ts-ignore Shared immutable maintenance calendar.
import {maintenanceOccurrences} from './planned-maintenance.mjs'
// @ts-ignore Shared heartbeat policy.
import {heartbeatDeadline} from './heartbeat-job.mjs'

export function overviewClock(now:number){
 // Rolling availability and other continuous values are read at least once
 // per minute. Categorical state expires at its own next clock boundary.
 const horizon=now+60_000;
 let deadline=horizon;
 const at=(edge:number)=>{if(edge>now&&edge<deadline)deadline=edge};
 const contact=(received:number|null,staleMs:number)=>{
  if(received===null)return;
  at(received);
  at(received+staleMs+1);
 };
 function maintenance(definition:any){
  at(definition.maintenanceUntil);
  for(const window of definition.maintenanceWindows??[]){
   for(const {startsAt,endsAt} of maintenanceOccurrences(window,now,horizon)){
    if(startsAt!==null){at(startsAt);at(endsAt)}
   }
  }
 }
 function attempts(definition:any,slots:any[]){
  for(const slot of slots){
   if(slot.pending)at(slot.lease_until+CONTACT_FRESHNESS_MS);
   else if(slot.lease_until>now&&JSON.parse(slot.assignments).some((assignment:any)=>assignment.delivered_at===null&&assignment.advanced_at===null))at(slot.lease_until);
  }
  return {at,evidence(visible:any[]){
   for(const observation of visible){
    at(observation.completedAt+definition.freshnessMs+1);
    if(observation.canary?.outcome==='pass')at(observation.canary.completedAt+definition.freshnessMs+1);
    if(definition.type!=='heartbeat'||observation.outcome!=='pass')continue;
    const received=observation.heartbeatReceivedAt,job=observation.heartbeatJob;
    at(received);
    if(job){
     at(Math.max(job.baselineAt,job.receivedAt??0,job.startedAt??0,job.failure?.at??0));
     at(heartbeatDeadline(definition,job));
     if(job.startedAt!==null&&definition.heartbeat.maxRunDurationMs)at(job.startedAt+definition.heartbeat.maxRunDurationMs);
    }else if(!definition.heartbeat.cron)at(received+definition.heartbeat.maxAgeMs+(definition.heartbeat.graceMs??0)+1);
   }
  }};
 }
 return {contact,maintenance,attempts,expiresAt:()=>deadline};
}

export type OverviewClock=ReturnType<typeof overviewClock>;
