import {METRICS_STATES,type MetricsSnapshot,type MetricSample} from './types.ts'

/** All exporters share this mapping. Window values are gauges, never cumulative counters. */
export function metricSamples(snapshot:MetricsSnapshot):MetricSample[]{
 const samples:MetricSample[]=[]
 const add=(name:string,help:string,labels:Record<string,string>,value:number)=>{if(!Number.isFinite(value))throw Error('Invalid metric value');samples.push({name:`uptime_${name}`,help,labels,value})}
 add('snapshot_timestamp_seconds','Snapshot generation time.',{},snapshot.generatedAt/1000)
 add('window_from_timestamp_seconds','Report window start.',{},snapshot.period.from/1000)
 add('window_to_timestamp_seconds','Report window end.',{},snapshot.period.to/1000)
 for(const monitor of snapshot.monitors){
  const labels={monitor_id:monitor.id}
  add('availability_defined','One when observed scheduled time provides an availability denominator.',labels,Number(monitor.availability.uptimePercent!==null))
  if(monitor.availability.uptimePercent!==null)add('availability_percent','Exact report availability percent; absent when undefined.',labels,monitor.availability.uptimePercent)
  for(const [field,metric] of Object.entries({observedMs:'observed',upMs:'healthy',notPassingMs:'not_passing',unknownMs:'unknown',pausedMs:'paused',maintenanceMs:'maintenance',windowMs:'window'}))add(`availability_${metric}_seconds`,'Immutable report duration in seconds.',labels,monitor.availability[field as keyof typeof monitor.availability]!/1000)
  for(const state of METRICS_STATES)add('monitor_state','One for the current state.',{...labels,state},Number(monitor.current.state===state))
  add('last_check_defined','One when scheduled check evidence exists.',labels,Number(monitor.current.lastCheckAt!==null))
  if(monitor.current.lastCheckAt!==null)add('last_check_timestamp_seconds','Latest scheduled check completion time.',labels,monitor.current.lastCheckAt/1000)
  add('coverage_expected','Configured probe denominator.',labels,monitor.current.coverage.expected)
  add('coverage_observed','Probes with fresh target evidence.',labels,monitor.current.coverage.observed)
  add('incidents','Report incidents overlapping the window.',labels,monitor.incidents.count)
  add('incident_duration_seconds','Report incident duration overlapping the window.',labels,monitor.incidents.durationInPeriodMs/1000)
  for(const delivery of monitor.deliveries)add('delivery_jobs','Jobs created in the window by current delivery outcome.',{...labels,outcome:delivery.state},delivery.count)
  for(const location of [{id:'all',statistics:monitor.latency.statistics},...monitor.latency.locations]){
   const dimensions={...labels,probe_id:location.id}
   add('latency_samples','Valid scheduled final probe samples in the report window.',dimensions,location.statistics.count)
   for(const [field,statistic] of Object.entries({minMs:'min',meanMs:'mean',p50Ms:'p50',p95Ms:'p95',p99Ms:'p99',maxMs:'max'})){
    const value=location.statistics[field as keyof typeof location.statistics]
    if(value!==null)add('latency_seconds','Exact report latency statistic in seconds.',{...dimensions,statistic},value/1000)
   }
  }
  for(const probe of monitor.current.probes){
   const dimensions={...labels,probe_id:probe.id,...(probe.runnerId?{runner_id:probe.runnerId}:{})}
   add('probe_contact_fresh','One when the assigned active runner contacted within the freshness bound.',dimensions,Number(probe.contactFresh))
   add('probe_evidence_fresh','One when this selected probe has fresh target evidence.',dimensions,Number(probe.evidenceFresh))
   if(probe.contactAt!==null)add('probe_contact_timestamp_seconds','Last assigned runner contact time.',dimensions,probe.contactAt/1000)
   for(const state of ['Healthy','Failing','Unknown'])add('probe_state','One for the current selected probe state.',{...dimensions,state},Number(probe.state===state))
  }
 }
 if(samples.length>15000)throw Error('Metrics exceeds 15000 samples')
 return samples
}

const quote=(value:string)=>JSON.stringify(value).replace(/\\u000a/gi,'\\n')
export function prometheusMetrics(snapshot:MetricsSnapshot):string{
 const seen=new Set<string>(),lines:string[]=[]
 for(const sample of metricSamples(snapshot)){
  if(!seen.has(sample.name)){seen.add(sample.name);lines.push(`# HELP ${sample.name} ${sample.help}`,`# TYPE ${sample.name} gauge`)}
  const labels=Object.entries(sample.labels).map(([name,value])=>`${name}=${quote(value)}`).join(',')
  lines.push(`${sample.name}${labels?`{${labels}}`:''} ${sample.value}`)
 }
 return `${lines.join('\n')}\n`
}
