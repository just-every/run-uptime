import type {Bindings} from '../control.server.ts'
import {periodAvailability} from '../reports/coverage.server.ts'
import {periodLatency} from '../reports/latency.server.ts'
import {periodIncidents} from '../reports/incidents.server.ts'
import {reportPeriod,ReportInputError} from '../reports/period.ts'
import {availabilityOverview} from '../availability.server.ts'
import {attemptSnapshot} from '../attempt-checkpoint.server.ts'
import {projectRecentAttempts} from '../attempt-projection.ts'
import {METRICS_MONITOR_LIMIT,METRICS_LOCATION_LIMIT,METRICS_STATES,DELIVERY_STATES,type MetricsSnapshot,type MetricsMonitor,type DeliveryState} from './types.ts'

type MonitorRow = {id:string;revision:number;definition:string;state:string}
type RunnerRow = {runner_id:string;revoked_at:number|null;last_contact_at:number|null;legacy_key:number}
const policy='Healthy time as a share of observed scheduled time (healthy + not passing). Unknown, paused and maintenance time are excluded from the uptime and SLA denominator and shown separately.'

/** A fixed population and one clock are used by all formats. No console initialization or checkpoint writes. */
export async function metricsSnapshot(env:Bindings,params:URLSearchParams,now=Date.now()):Promise<MetricsSnapshot>{
 const period=reportPeriod(params,now)
 if(period.to-period.from>90*86400000)throw new ReportInputError('Metrics range cannot exceed 90 days')
 const ids=params.getAll('monitor').flatMap(value=>value.split(','))
 if(ids.length>METRICS_MONITOR_LIMIT||ids.some(id=>!id||id.length>512)||new Set(ids).size!==ids.length)throw new ReportInputError('Specify at most 100 distinct monitor identifiers')
 const staleMs=Number(env.UPTIME_RUNNER_STALE_MS??120000)
 if(!Number.isSafeInteger(staleMs)||staleMs<=0)throw Error('Invalid monitoring watch interval')
 const [population,runnersResult]=await Promise.all([
  (ids.length?env.DB.prepare(`SELECT id,revision,definition,state FROM monitors WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id LIMIT 101`).bind(...ids):env.DB.prepare('SELECT id,revision,definition,state FROM monitors ORDER BY id LIMIT 101')).all<MonitorRow>(),
  env.DB.prepare('SELECT runner_id,revoked_at,last_contact_at,legacy_key FROM runners').all<RunnerRow>(),
 ])
 if(population.results.length>METRICS_MONITOR_LIMIT)throw new ReportInputError('Metrics supports at most 100 monitors; select monitors explicitly')
 if(ids.length&&population.results.length!==ids.length)throw new ReportInputError('A selected monitor is unavailable','monitor_not_found')
 const rows=population.results.map(row=>({...row,definition:JSON.parse(row.definition),storedState:JSON.parse(row.state)}))
 for(const row of rows)if(!Array.isArray(row.definition.probes)||row.definition.probes.length>METRICS_LOCATION_LIMIT)throw new ReportInputError('Metrics supports at most 3 locations per monitor')
 const availability=await availabilityOverview(env.DB,rows,now)
 const monitors:MetricsMonitor[]=[]
 // Small batches bound in-flight D1 work while preserving independent reads.
 for(let offset=0;offset<rows.length;offset+=2){
  const batch=await Promise.all(rows.slice(offset,offset+2).map(async row=>{
   const [coverage,latency,incidents,attempts,deliveryRows]=await Promise.all([
    periodAvailability(env.DB,row.id,period),periodLatency(env.DB,row.id,period,{bucket:'1d',location:'all'}),
    periodIncidents(env.DB,row.id,period,now),attemptSnapshot(env,row.id,row.revision,row.definition,now,undefined,true),
    env.DB.prepare(`SELECT CASE WHEN j.state<>'queued' THEN j.state ELSE COALESCE(d.state,j.state) END state,COUNT(*) count
     FROM notification_jobs j LEFT JOIN integration_deliveries d ON d.namespace='uptime-notifications' AND d.id=j.id
     WHERE json_extract(j.event,'$.monitorId')=? AND j.created_at>=? AND j.created_at<? GROUP BY 1`).bind(row.id,period.from,period.to).all<{state:string;count:number}>(),
   ])
   const locationIds=[...new Set([...row.definition.probes,...latency.availableLocations])] as string[]
   if(locationIds.length>METRICS_LOCATION_LIMIT)throw new ReportInputError('Metrics supports at most 3 locations per monitor')
   const locations=await Promise.all(locationIds.sort().map(async id=>({id,statistics:(await periodLatency(env.DB,row.id,period,{bucket:'1d',location:id})).statistics})))
   const projection=projectRecentAttempts(row.definition,attempts.slots,attempts.observations,now,attempts.checkpoint)
   let state=projection.state
   if(row.storedState.notificationOpen&&projection.targetState==='Healthy'&&projection.recoveryStreak<row.definition.recoverSlots&&!projection.maintenance)state='Recovering'
   if(!row.definition.enabled)state='Paused'
   if(!METRICS_STATES.includes(state))throw Error('Invalid monitor state')
   const probes=row.definition.probes.map((id:string)=>{
    const region=projection.regions.find((entry:any)=>entry.probe===id)
    const runnerId=row.definition.assignments?.[id]?.runnerId??runnersResult.results.find(runner=>runner.legacy_key===1)?.runner_id??null
    const runner=runnersResult.results.find(entry=>entry.runner_id===runnerId)
    const contactAt=runner?.last_contact_at??null
    return {id,runnerId,contactAt,contactFresh:Boolean(runner&&runner.revoked_at===null&&contactAt!==null&&contactAt<=now&&now-contactAt<=staleMs),evidenceFresh:Boolean(region&&region.state!=='Unknown'),state:region?.state??'Unknown'}
   })
   const deliveries=DELIVERY_STATES.map(state=>({state,count:0}))
   for(const entry of deliveryRows.results){const state:DeliveryState=DELIVERY_STATES.includes(entry.state as DeliveryState)?entry.state as DeliveryState:'other';deliveries.find(value=>value.state===state)!.count+=entry.count}
   return {id:row.id,availability:coverage,latency:{statistics:latency.statistics,locations},incidents:{count:incidents.length,durationInPeriodMs:incidents.reduce((sum,incident)=>sum+incident.durationInPeriodMs,0)},deliveries,
    current:{state,lastCheckAt:availability.get(row.id)!.lastCheckAt,coverage:{expected:row.definition.probes.length,observed:probes.filter((probe:any)=>probe.evidenceFresh).length},probes}} as MetricsMonitor
  }))
  monitors.push(...batch)
 }
 return {schemaVersion:1,generatedAt:now,period,denominatorPolicy:policy,source:'uptime',monitors}
}
