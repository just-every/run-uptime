import type {MonitorReport} from './index.server.ts'
import {PdfReportWriter} from './pdf-layout.ts'

/** A downloadable view of the same period snapshot as JSON/CSV; no independent health calculation. */
export async function reportPdf(report:MonitorReport,assets:Fetcher|undefined){
 const pdf=await PdfReportWriter.create(assets),zone=report.period.timeZone
 const at=(value:number|null)=>value===null?'Not reported':new Intl.DateTimeFormat('en-US',{timeZone:zone,dateStyle:'medium',timeStyle:'long'}).format(value)
 const number=(value:unknown)=>value===null?'Unknown':String(value)
 const duration=(value:number|null)=>value===null?'Not reported':`${value/1000} seconds (${value} ms)`
 pdf.text(report.monitor.name,20,10)
 pdf.text(`Monitor ${report.monitor.id} / revision ${report.monitor.revision}`)
 pdf.text(`Generated ${at(report.generatedAt)} / ${zone}`)
 pdf.text(`Period: ${at(report.period.from)} inclusive to ${at(report.period.to)} exclusive`)
 if(report.flowProfiles?.length){
  pdf.heading('Browser and device revisions')
  pdf.text('Each profile has separate retained evidence. The whole-period figures combine revisions; they do not prove another browser or device passed.')
  for(const segment of report.flowProfiles){
   const p=segment.profile
   pdf.text(`Revision ${segment.revision}: ${p.browser} / ${p.device} / ${p.viewport.width} x ${p.viewport.height}\n${at(segment.from)} to ${at(segment.to)}\nUptime: ${number(segment.availability.uptimePercent)}% / observed: ${duration(segment.availability.observedMs)} / not passing: ${duration(segment.availability.notPassingMs)} / Unknown: ${duration(segment.availability.unknownMs)}\nLatency samples: ${segment.latency.statistics.count} / p95: ${number(segment.latency.statistics.p95Ms)} ms`)
  }
 }
 if(report.sourceHistory){
  const h=report.sourceHistory
  pdf.heading('Sourced history segments');pdf.text(h.policy);pdf.text(`Cutover: ${at(h.cutover.at)}`)
  for(const s of [...h.segments,h.uptimeSegment])pdf.text(`${s.label}: ${number(s.uptimePercent)}% / denominator ${duration(s.denominatorMs)} / downtime ${duration(s.notPassingMs)}`)
  if(h.blended)pdf.text(`${h.blended.label}: ${number(h.blended.uptimePercent)}% / denominator ${duration(h.blended.denominatorMs)}`)
  for(const r of h.sourceIncidents)pdf.text(`${r.label}: ${at(r.startedAt)} to ${at(r.endedAt)} / ${r.durationSeconds??'Unknown'} seconds / source author: ${r.author||'not supplied'} / ${r.comments} / root cause: ${r.rootCause}`)
 }
 pdf.heading('Availability and coverage')
 pdf.text(report.denominatorPolicy)
 for(const [label,key] of [['Uptime','uptimePercent'],['Healthy time','upMs'],['Not-passing time','notPassingMs'],['Observed denominator','observedMs'],['Unknown time','unknownMs'],['Paused time','pausedMs'],['Maintenance time','maintenanceMs'],['Entire period','windowMs']] as const){
  const value=report.availability[key];pdf.text(`${label}: ${key==='uptimePercent'?number(value)+(value===null?'':'%'):duration(value)}`)
 }
 if(report.sla){
  pdf.heading('SLA')
  const sla=report.sla
  pdf.text(`Target: ${sla.targetPercent}% / observed result: ${sla.met===null?'Unknown':sla.met?'Met':'Not met'}`)
  pdf.text(`Actual uptime: ${number(sla.actualPercent)}${sla.actualPercent===null?'':'%'} / denominator: ${duration(sla.denominatorMs)}`)
  pdf.text(`Allowed not-passing time: ${duration(sla.allowedNotPassingMs)} / remaining error budget: ${duration(sla.remainingBudgetMs)}`)
 }
 pdf.heading('Slow-response time')
 pdf.text(report.slow.policy);pdf.text(`Confirmed Slow time: ${duration(report.slow.slowMs)} / episodes: ${report.slow.episodes.length}`)
 pdf.text('Slow time does not reduce uptime or the SLA result.')
 for(const episode of report.slow.episodes)pdf.text(`${at(episode.startedAt)} to ${at(episode.endedAt)} / period overlap: ${duration(episode.durationInPeriodMs)}${episode.imported?' / imported history':''}\n${episode.explanation}`)
 pdf.heading('Response times')
 pdf.text(`Location: ${report.latency.location} / resolution: ${report.latency.bucket} / bucket alignment: ${report.latency.bucketAlignment}`)
 pdf.text(report.latency.samplePolicy);pdf.text(`Percentile method: ${report.latency.percentileMethod}`)
 for(const [label,metric] of [['Sample count','count'],['Minimum','minMs'],['Mean','meanMs'],['p50','p50Ms'],['p95','p95Ms'],['p99','p99Ms'],['Maximum','maxMs']] as const){const value=report.latency.statistics[metric];pdf.text(`${label}: ${number(value)}${value===null?'':metric==='count'?' samples':' ms'}`)}
 pdf.heading('Response-time samples and buckets')
 if(!report.latency.series.length)pdf.text('No eligible samples. Response time is Unknown.')
 for(const point of report.latency.series)pdf.text(`${at(point.at)} to ${at(point.to)} / ${point.location} / ${point.count} samples\nMin ${point.minMs} / mean ${point.meanMs} / p50 ${point.p50Ms} / p95 ${point.p95Ms} / p99 ${point.p99Ms} / max ${point.maxMs} ms`)
 pdf.heading('Incidents in this period')
 pdf.text(`Confirmed incidents: ${report.incidentSummary.count} / period overlap: ${duration(report.incidentSummary.durationInPeriodMs)}`)
 if(report.rootCauseFilter)pdf.text(`Root-cause filter: ${report.rootCauseFilter}. Coverage and SLA retain the complete denominator.`)
 for(const group of report.rootCauseGroups)pdf.text(`${group.categoryLabel}: ${group.count} incidents / overlap ${duration(group.durationInPeriodMs)}`)
 for(const incident of report.incidents){
  pdf.text(`${at(incident.startedAt)} to ${at(incident.endedAt)} / overlap ${duration(incident.durationInPeriodMs)}${incident.imported?' / imported history':''}`)
  pdf.text(`Root cause: ${incident.rootCause.categoryLabel??'Not categorized'}${incident.rootCause.text?': '+incident.rootCause.text:''}`)
  pdf.text(`Failure: ${incident.trigger.explanation}`)
  for(const probe of incident.trigger.probes)pdf.text(`${probe.name}: ${probe.outcome} / ${probe.reason}`)
  if(incident.recovery)pdf.text(`Recovery: ${incident.recovery.explanation}`)
 }
 if(report.jobRuns){
  pdf.heading('Job runs in this period')
  pdf.text('Server receipt times select the period. Runs retain their revision and reported outcome; receipts do not establish monitor health.')
  if(!report.jobRuns.length)pdf.text('No job receipts in this period.')
  for(const run of report.jobRuns){
   pdf.text(`Received ${at(run.receivedAt)} / started ${at(run.startedAt)}\nRevision ${run.revision} / sequence ${run.sequence} / ${run.state} / duration ${duration(run.durationMs)} / exit ${run.exitCode??'Not reported'} / late ${run.late?'Yes':'No'}${run.output?'\nRedacted output: '+run.output:''}`)
  }
 }
 return pdf.finish(`${report.monitor.name} - Uptime period report`)
}
