import type {ReportPeriod} from './period.ts'
/** Event spans have their own denominator and never enter availability/SLA. */
export async function periodSlow(db:D1Database,id:string,period:ReportPeriod){
 const rows=await db.prepare("SELECT event,status FROM outbox WHERE monitor_id=? AND kind IN ('slow','slow_recovery') AND json_extract(event,'$.observedAt')<? ORDER BY rowid").bind(id,period.to).all<any>();
 const events=rows.results.map(r=>({...JSON.parse(r.event),imported:r.status==='imported-inactive'})),starts=events.filter(e=>e.kind==='slow');
 const episodes=starts.flatMap(start=>{
  const end=events.find(e=>e.kind==='slow_recovery'&&e.incidentKey===start.incidentKey),from=Math.max(period.from,start.observedAt),to=Math.min(period.to,end?.observedAt??period.to);
  return to>from?[{key:start.incidentKey,startedAt:start.observedAt,endedAt:end?.observedAt??null,durationInPeriodMs:to-from,imported:start.imported,explanation:start.explanation}]:[];
 });
 // Merge overlaps across revisions while retaining each source event above.
 const spans=episodes.map(e=>[Math.max(period.from,e.startedAt),Math.min(period.to,e.endedAt??period.to)]).sort((a,b)=>a[0]-b[0]);
 let slowMs=0,end=period.from;for(const span of spans){slowMs+=Math.max(0,span[1]-Math.max(span[0],end));end=Math.max(end,span[1])}
 return {slowMs,episodes,policy:'Time from confirmed Slow to independently confirmed slow recovery, clipped to this period. Unknown evidence never resolves a Slow event. This is separate from downtime and SLA.'};
}
