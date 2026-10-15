import type {Bindings} from './control.server.ts'
import {incidentEvent} from './notification-content.ts'

// A demo opens on a workspace that has been running for a week: scheduled
// slots with their observations and runner deliveries, one confirmed and
// recovered incident, and the notifications that incident sent. Rows use the
// shapes the runner and acceptance path write, so every view reads them as
// ordinary evidence; live checks continue from the next due time.
const PROBE='local-a',RUNNER_VERSION='uptime-node/0.1.0'

export type HistoryMonitor={id:string;definition:any;passChecks:any[];failChecks:any[];status:number;bytes:number;baseMs:number;spreadMs:number;incident?:{slotsBeforeEnd:number;failingSlots:number;status:number}}

const failingRange=(m:HistoryMonitor,count:number)=>m.incident?{first:count-m.incident.slotsBeforeEnd,end:count-m.incident.slotsBeforeEnd+m.incident.failingSlots}:{first:-1,end:-1}

/** Slots, observations and assignments for one monitor's revision 1 from start, every intervalMs, count times. */
export function historyStatements(env:Bindings,m:HistoryMonitor,runnerId:string,start:number,count:number){
 const interval=m.definition.intervalMs,{first,end}=failingRange(m,count),seed=m.id.length*131
 const definition=JSON.stringify(m.definition)
 return [
  env.DB.prepare(`WITH RECURSIVE p AS (SELECT CAST(?2 AS INTEGER) start,CAST(?3 AS INTEGER) count,CAST(?4 AS INTEGER) step,CAST(?6 AS INTEGER) lease),
   k(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM k,p WHERE n+1<p.count)
   INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual)
   SELECT ?1||':1:'||(start+n*step),?1,1,start+n*step,'complete',?5,'',start+n*step+lease,0,0 FROM k,p WHERE true ON CONFLICT(id) DO NOTHING`)
   .bind(m.id,start,count,interval,definition,m.definition.timeoutMs+30000),
  // Start offset and duration vary per slot but are fixed by its index, so a reseed writes identical evidence.
  // D1 binds every JavaScript number as REAL; evidence times must stay integers, so each one is cast here.
  env.DB.prepare(`WITH p AS (SELECT CAST(?2 AS INTEGER) start,CAST(?3 AS INTEGER) step,CAST(?4 AS INTEGER) count,CAST(?5 AS INTEGER) seed,CAST(?6 AS INTEGER) first,CAST(?7 AS INTEGER) last,
    CAST(?8 AS INTEGER) base,CAST(?9 AS INTEGER) spread,CAST(?10 AS INTEGER) status,CAST(?13 AS INTEGER) failing_ms,CAST(?14 AS INTEGER) failing_status,CAST(?15 AS INTEGER) bytes),
   t AS (SELECT s.id,s.due_at,(s.due_at-p.start)/p.step AS n FROM slots s,p WHERE s.monitor_id=?1 AND s.revision=1 AND s.manual=0 AND s.due_at>=p.start AND s.due_at<p.start+p.count*p.step),
   e AS (SELECT t.id,t.n,t.due_at+150+((t.n*7919+p.seed)%650) AS started,CASE WHEN t.n>=p.first AND t.n<p.last THEN 0 ELSE 1 END AS pass,
    CASE WHEN t.n>=p.first AND t.n<p.last THEN p.failing_ms ELSE p.base+((t.n*104729+p.seed)%p.spread) END AS dur FROM t,p)
   INSERT INTO observations(id,slot_id,probe,attempt,evidence)
   SELECT e.id||':${PROBE}:0',e.id,'${PROBE}',0,json_object('id',e.id||':${PROBE}:0','probe','${PROBE}','startedAt',e.started,'completedAt',e.started+e.dur,'durationMs',e.dur,
    'runnerVersion','${RUNNER_VERSION}','outcome',CASE WHEN e.pass THEN 'pass' ELSE 'target_failure' END,'status',CASE WHEN e.pass THEN p.status ELSE p.failing_status END,
    'bytes',CASE WHEN e.pass THEN p.bytes ELSE 61 END,'checks',json(CASE WHEN e.pass THEN ?11 ELSE ?12 END),'attempt',0) FROM e,p WHERE true ON CONFLICT(id) DO NOTHING`)
   .bind(m.id,start,interval,count,seed,first,end,m.baseMs,m.spreadMs,m.status,JSON.stringify(m.passChecks),JSON.stringify(m.failChecks),Math.min(m.definition.timeoutMs,1900),m.incident?.status??503,m.bytes),
  env.DB.prepare(`INSERT INTO runner_assignments(slot_id,probe,runner_id,delivered_at,received_times)
   SELECT o.slot_id,o.probe,?2,json_extract(o.evidence,'$.startedAt')-40,json_object('0',json_extract(o.evidence,'$.completedAt')+35)
   FROM observations o JOIN slots s ON s.id=o.slot_id WHERE s.monitor_id=?1 AND s.revision=1 AND s.due_at>=CAST(?3 AS INTEGER) AND s.due_at<CAST(?3 AS INTEGER)+CAST(?4 AS INTEGER)*CAST(?5 AS INTEGER) ON CONFLICT DO NOTHING`)
   .bind(m.id,runnerId,start,count,interval),
 ]
}

const reason=(failed:boolean,confirmed:number,recovered:number)=>`${failed?`Check ${PROBE}: Expected HTTP status. 1/1`:'0/1'} selected probes failed; 0 unknown; coverage complete. ${failed?'1 independent failing vantage':'0 independent failing vantages'}; passing external check absent; scheduled-slot confirmation ${confirmed}/2; recovery ${recovered}/2.`

/** The confirmed incident: a trigger at the second failing slot and a recovery at the second passing slot after it. */
export function incidentEvents(m:HistoryMonitor,start:number,count:number,origin:string){
 if(!m.incident)return []
 const interval=m.definition.intervalMs,{first,end}=failingRange(m,count),monitor={id:m.id,revision:1,definition:m.definition}
 const slotAt=(n:number)=>`${m.id}:1:${start+n*interval}`,observedAt=(n:number)=>start+n*interval+2400
 const triggerSlot=slotAt(first+1),incidentKey=`incident:${triggerSlot}`
 const failing=[{probe:PROBE,outcome:'target_failure',checks:m.failChecks}],passing=[{probe:PROBE,outcome:'pass',checks:m.passChecks}]
 return [
  incidentEvent({id:`${triggerSlot}:trigger`,kind:'trigger',monitor,slotId:triggerSlot,now:observedAt(first+1),state:{reason:reason(true,2,0)},observations:failing,origin,incidentKey}),
  incidentEvent({id:`${slotAt(end+1)}:recovery`,kind:'recovery',monitor,slotId:slotAt(end+1),now:observedAt(end+1),state:{reason:reason(false,0,2)},observations:passing,origin,incidentKey}),
 ]
}

export function incidentStatements(env:Bindings,monitorId:string,events:any[],destinations:{id:string;name:string;kind:string;credentialId:string;code:string}[]){
 return events.flatMap(event=>[
  env.DB.prepare('INSERT INTO outbox(id,monitor_id,slot_id,kind,event) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(event.id,monitorId,event.slotId,event.kind,JSON.stringify(event)),
  ...destinations.map((d,index)=>env.DB.prepare(`INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at,state,code,finished_at,attempts)
   VALUES(?,?,?,?,?,?,?,CAST(? AS INTEGER),'accepted',?,CAST(? AS INTEGER),1) ON CONFLICT(id) DO NOTHING`).bind(`${event.id}:${d.id}`,event.id,d.id,d.name,d.kind,d.credentialId,JSON.stringify(event),event.observedAt+400+index*90,d.code,event.observedAt+1300+index*240)),
 ])
}
