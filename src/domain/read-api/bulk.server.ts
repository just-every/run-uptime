import {credentialMonitorFilter} from '../credentials/model.server.ts'
import {configuredPeriod} from '../reports/configured-period.server.ts'
import type {Bindings} from '../control.server.ts'
import {monitorReport,ReportInputError} from '../reports/index.server.ts'

export const BULK_MONITOR_LIMIT=500

/** One clock and the console report engine for every selected monitor. */
export async function bulkUptime(env:Bindings, params:URLSearchParams, now=Date.now()) {
 const period=await configuredPeriod(env,params,now)
 const requested=params.has('monitor')?params.get('monitor')!.split(','):null,tag=params.get('tag')
 if(requested&&(requested.length>BULK_MONITOR_LIMIT||new Set(requested).size!==requested.length||requested.some(id=>!id||id.length>512||/[\x00-\x1f\x7f]/.test(id))))throw new ReportInputError('Specify at most 500 distinct monitor identifiers')
 const filter=credentialMonitorFilter(env),conditions:string[]=[filter.sql],values:(string|number|null)[]=[...filter.params]
 if(requested){conditions.push('id IN (SELECT value FROM json_each(?))');values.push(JSON.stringify(requested))}
 if(tag!==null){conditions.push("EXISTS(SELECT 1 FROM json_each(json_extract(definition,'$.tags')) WHERE value=?)");values.push(tag)}
 const population=(await env.DB.prepare(`SELECT id FROM monitors ${conditions.length?'WHERE '+conditions.join(' AND '):''} ORDER BY id LIMIT 501`).bind(...values).all<{id:string}>()).results
 if(population.length>BULK_MONITOR_LIMIT)throw new ReportInputError('Bulk uptime supports at most 500 monitors; select monitors explicitly')
 // Validate the entire selection before calculating anything; never return a
 // successful subset when a requested monitor is unavailable.
 if(requested&&population.length!==requested.length)throw new ReportInputError('A selected monitor is unavailable','monitor_not_found')
 const reports=[]
 for(let offset=0;offset<population.length;offset+=2){
  const batch=await Promise.all(population.slice(offset,offset+2).map(async({id})=>{
   // The bulk uptime response omits response-time series. A daily internal resolution keeps the
   // shared report's point bound independent of a long calendar availability range.
   const reportParams=new URLSearchParams({period:'custom',from:String(period.from),to:String(period.to),timeZone:period.timeZone,bucket:'1d',
    ...(period.slaTargetPercent===null?{}:{sla:String(period.slaTargetPercent)}),...(params.has('rootCause')?{rootCause:params.get('rootCause')!}:{})})
   const report=await monitorReport(env,id,reportParams,now)
   if(!report)throw new ReportInputError('A selected monitor is unavailable','monitor_not_found')
   const a=report.availability
   return {monitor:report.monitor,availability:a,sla:report.sla,slow:{slowMs:report.slow.slowMs,policy:report.slow.policy},incidentSummary:report.incidentSummary,
    seconds:{observed:a.observedMs/1000,up:a.upMs/1000,down:a.notPassingMs/1000,unknown:a.unknownMs/1000,paused:a.pausedMs/1000,maintenance:a.maintenanceMs/1000,slow:report.slow.slowMs/1000},
    denominatorPolicy:report.denominatorPolicy}
  }))
  reports.push(...batch)
 }
 return {schemaVersion:1,generatedAt:now,period,source:'Uptime',monitors:reports}
}

export type BulkUptime = Awaited<ReturnType<typeof bulkUptime>>
