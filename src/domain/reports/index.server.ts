import {heartbeatRuns} from '../heartbeat-jobs.server.ts'
import { periodAvailability } from './coverage.server.ts'
import { periodLatency, latencyOptions } from './latency.server.ts'
import {periodSlow} from './slow.server.ts'
import { periodIncidents } from './incidents.server.ts'
import { normalizePeriod, type ReportPeriod } from './period.ts'

export { reportPeriod, ReportInputError, type ReportPeriod } from './period.ts'
export { monitorLatency, latencyOptions, REPORT_POINT_LIMIT, type LatencyBucket } from './latency.server.ts'
export { reportCsv, reportJson } from './export.ts'

export async function monitorReport(env: { DB: D1Database }, id: string, params: URLSearchParams | ReportPeriod, now = Date.now()) {
  const period = normalizePeriod(params, now)
  const options = latencyOptions(params instanceof URLSearchParams ? params : new URLSearchParams())
  const monitor = await env.DB.prepare('SELECT id,revision,definition FROM monitors WHERE id=?').bind(id)
    .first<{ id: string; revision: number; definition: string }>()
  if (!monitor) return null
  const [availability, latency, allIncidents, slow] = await Promise.all([
    periodAvailability(env.DB, id, period), periodLatency(env.DB, id, period, options),
    periodIncidents(env.DB, id, period, now),periodSlow(env.DB,id,period),
  ])
  const rootCauseFilter=params instanceof URLSearchParams?params.get('rootCause'):null
  const incidents=rootCauseFilter?allIncidents.filter(incident=>incident.rootCause.categoryId===rootCauseFilter):allIncidents
  const rootCauseGroups=Object.values(incidents.reduce((groups:Record<string,{categoryId:string|null;categoryLabel:string;count:number;durationInPeriodMs:number}>,incident)=>{
   const key=incident.rootCause.categoryId??'';const group=groups[key]??={categoryId:incident.rootCause.categoryId,categoryLabel:incident.rootCause.categoryLabel??'Not categorized',count:0,durationInPeriodMs:0};group.count++;group.durationInPeriodMs+=incident.durationInPeriodMs;return groups
  },Object.create(null)))
  const jobRuns=JSON.parse(monitor.definition).type==='heartbeat'?await heartbeatRuns(env,id,{from:period.from,to:period.to,limit:10000}):null
  if(jobRuns?.nextCursor)throw Error('Heartbeat report exceeds 10,000 run records; choose a shorter period')
  const targetPercent = period.slaTargetPercent
  return {
    schemaVersion: 1, generatedAt: now,
    monitor: { id: monitor.id, name: String(JSON.parse(monitor.definition).name), revision: monitor.revision },
    period,
    denominatorPolicy: 'Healthy time as a share of observed scheduled time (healthy + not passing). Unknown, paused and maintenance time are excluded from the uptime and SLA denominator and shown separately.',
    availability,
    sla: targetPercent === null ? null : {
      targetPercent, actualPercent: availability.uptimePercent,
      met: availability.observedMs ? availability.upMs * 100 >= targetPercent * availability.observedMs : null,
      denominatorMs: availability.observedMs,
      allowedNotPassingMs: availability.observedMs * (100 - targetPercent) / 100,
      remainingBudgetMs: availability.observedMs * (100 - targetPercent) / 100 - availability.notPassingMs,
    },
    latency, slow, incidents, rootCauseFilter, rootCauseGroups,
    ...(jobRuns?{jobRuns:jobRuns.runs}:{}),
    incidentSummary: { count: incidents.length, durationInPeriodMs: incidents.reduce((total, incident) => total + incident.durationInPeriodMs, 0) },
  }
}

export type MonitorReport = NonNullable<Awaited<ReturnType<typeof monitorReport>>>
