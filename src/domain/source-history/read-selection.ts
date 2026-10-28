import {ReportInputError,type ReportPeriod} from '../reports/period.ts'
import type {WindowMetrics} from '../availability.server.ts'
import type {sourceSegments} from './segments.server.ts'
export const REPORT_SOURCES=['Uptime','UptimeRobot','blended'] as const
export const HISTORY_READ_SOURCES=['Uptime','UptimeRobot'] as const
export type ReadSource=typeof REPORT_SOURCES[number]
export function readSource(params:URLSearchParams,kind:'report'|'response times'|'incidents'='report'):ReadSource|null{
 const value=params.get('source')
 if(value===null)return null
 if(params.getAll('source').length!==1)throw new ReportInputError('Specify source only once')
 if(!REPORT_SOURCES.some(source=>source===value))throw new ReportInputError(`Unknown or unavailable source “${value.slice(0,150)}”; accepted sources: ${(kind==='report'?REPORT_SOURCES:HISTORY_READ_SOURCES).join(', ')}`,'source_unavailable')
 if(kind==='report'&&value!=='Uptime'&&params.has('rootCause'))throw new ReportInputError(`Source “${value}” has source-text root causes, without Uptime category IDs`,'source_unavailable')
 if(kind!=='report'&&value==='blended')throw new ReportInputError(`Source “blended” is unavailable for ${kind}; availability reports provide the labeled blended figure`,'source_unavailable')
 return value as ReadSource
}
export function selectAvailability(native:WindowMetrics,history:Awaited<ReturnType<typeof sourceSegments>>,source:ReadSource|null,period:ReportPeriod){
 if(source===null||source==='Uptime'&&!history)return {availability:native,selection:null}
 const selected=source==='Uptime'?history?.uptimeSegment:source==='blended'?history?.blended:history?.segments.find(s=>s.source===source)
 if(!selected||!selected.denominatorMs)throw new ReportInputError(`Source “${source}” is unavailable for this monitor and period`,'source_unavailable')
 if(source==='Uptime'&&history?.uptimeSegment.availability)return {availability:history.uptimeSegment.availability,selection:{value:source,label:selected.label}}
 const windowMs=period.to-period.from,pausedMs=source==='blended'?history?.uptimeSegment.availability?.pausedMs??0:0,maintenanceMs=source==='blended'?history?.uptimeSegment.availability?.maintenanceMs??0:0,unknownMs=Math.max(0,windowMs-selected.denominatorMs-pausedMs-maintenanceMs)
 const availability:WindowMetrics={windowMs,observedMs:selected.denominatorMs,upMs:selected.upMs,notPassingMs:selected.notPassingMs,uptimePercent:selected.uptimePercent,unknownMs,unknownPercent:100*unknownMs/windowMs,notPassingPercent:100*selected.notPassingMs/windowMs,pausedMs,maintenanceMs}
 return {availability,selection:{value:source,label:selected.label}}
}
export function selectIncidentSummary(native:{startedAt:number;endedAt:number|null;durationInPeriodMs:number}[],history:Awaited<ReturnType<typeof sourceSegments>>,source:ReadSource|null,period:ReportPeriod){
 const summary=(rows:{durationInPeriodMs:number}[])=>({count:rows.length,durationInPeriodMs:rows.reduce((n,r)=>n+r.durationInPeriodMs,0)})
 if(source===null||!history)return summary(native)
 const cutover=history.cutover.at??period.to
 const nativeRows=native.filter(r=>(r.endedAt??period.to)>Math.max(period.from,cutover)).map(r=>({durationInPeriodMs:Math.max(0,Math.min(r.endedAt??period.to,period.to)-Math.max(r.startedAt,period.from,cutover))}))
 if(source==='Uptime')return summary(nativeRows)
 const sourceRows=history.sourceIncidents.filter(r=>r.source==='UptimeRobot'&&(source!=='blended'||r.startedAt<cutover)).map(r=>({durationInPeriodMs:Math.max(0,Math.min(r.endedAt??period.to,period.to,source==='blended'?cutover:period.to)-Math.max(r.startedAt,period.from))}))
 return summary(source==='blended'?[...sourceRows,...nativeRows]:sourceRows)
}
