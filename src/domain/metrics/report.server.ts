import { availabilityBucketReports } from '../availability-buckets.server.ts'
import { summarizeAvailability } from '../availability-rollup.ts'
import { windowMetrics } from '../availability.server.ts'
import type { LatencyStatistics } from '../reports/latency.server.ts'
import type { ReportPeriod } from '../reports/period.ts'

const empty:LatencyStatistics = {count:0,minMs:null,meanMs:null,p50Ms:null,p95Ms:null,p99Ms:null,maxMs:null}

export async function metricsReports(db:D1Database,rows:{id:string;definition:{probes:string[]}}[],period:ReportPeriod,now:number) {
  const ids=rows.map(row=>row.id),sameEnd=period.to===now
  const latest=sameEnd?null:await lastScheduledChecks(db,ids,now)
  return availabilityBucketReports(db,ids,period.from,period.to,sameEnd,async(data,index)=>{
    const report=await summarizeAvailability(data,period.from,period.to,'metrics'),total=report.totals[0]
    const locations=[...new Set([...rows[index].definition.probes,...report.locations.keys()])].sort()
    return {
      coverage:windowMetrics(total.up,total.notPassing,period.to-period.from,total.paused,total.maintenance),
      lastCheckAt:latest?latest[index]:report.lastCheckAt,
      latency:{statistics:report.latency,locations:locations.map(id=>({id,statistics:report.locations.get(id)??empty}))},
    }
  })
}

// Current metadata is independent of an explicitly historical metrics period.
async function lastScheduledChecks(db:D1Database,ids:string[],now:number) {
  if (!ids.length) return []
  const statements=ids.map(id=>db.prepare(`SELECT MAX(json_extract(o.evidence,'$.completedAt')) AS at
    FROM (SELECT id,revision FROM slots INDEXED BY slots_monitor
      WHERE monitor_id=? AND manual=0 AND status='complete' AND due_at<=?
      ORDER BY due_at DESC,rowid DESC LIMIT 1) s
    JOIN revisions r ON r.monitor_id=? AND r.revision=s.revision AND r.created_at<=?
    JOIN observations o ON o.slot_id=s.id
    WHERE o.attempt=(SELECT MAX(x.attempt) FROM observations x WHERE x.slot_id=o.slot_id AND x.probe=o.probe)`).bind(id,now,id,now))
  return (await db.batch(statements)).map(row=>{
    const at=(row.results[0] as {at?:unknown}|undefined)?.at
    return typeof at==='number'&&Number.isSafeInteger(at)&&at<=now?at:null
  })
}
