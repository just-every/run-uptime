import type {BulkUptime} from './bulk.server.ts'
import type {incidentList} from '../incident-list.server.ts'

function cell(value:unknown) {
 let text=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value)
 if(typeof value==='string'&&/^\s*[=+@-]/.test(text))text="'"+text
 return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text
}
const csv=(rows:unknown[][])=>rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'

/** Export exactly this cursor page; handlers expose nextCursor in a Link header. */
export function incidentListCsv(page:Awaited<ReturnType<typeof incidentList>>) {
 return csv([['id','monitor_id','monitor_name','started_at','ended_at','duration_seconds','cause','failed_locations','state','owner_id','root_cause_category_id','root_cause_category','root_cause','source'],
  ...page.items.map(row=>[row.id,row.monitorId,row.monitorName,row.startedAt,row.endedAt,row.durationSeconds,row.cause,row.failedLocations,row.state,row.ownerId,row.rootCause.categoryId,row.rootCause.categoryLabel,row.rootCause.text,row.source])])
}

export function bulkUptimeCsv(result:BulkUptime) {
 return csv([['monitor_id','monitor_name','from','to','time_zone','availability_percent','observed_seconds','up_seconds','down_seconds','unknown_seconds','paused_seconds','maintenance_seconds','slow_seconds','incident_count','incident_duration_seconds','denominator_policy','source'],
  ...result.monitors.map(row=>[row.monitor.id,row.monitor.name,result.period.from,result.period.to,result.period.timeZone,row.availability.uptimePercent,
   row.seconds.observed,row.seconds.up,row.seconds.down,row.seconds.unknown,row.seconds.paused,row.seconds.maintenance,row.seconds.slow,row.incidentSummary.count,row.incidentSummary.durationInPeriodMs/1000,row.denominatorPolicy,result.source])])
}
