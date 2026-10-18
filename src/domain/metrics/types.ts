import type {WindowMetrics} from '../availability.server.ts'
import type {LatencyStatistics} from '../reports/latency.server.ts'
import type {ReportPeriod} from '../reports/period.ts'

export const METRICS_MONITOR_LIMIT = 100
export const METRICS_LOCATION_LIMIT = 3
export const METRICS_STATES = ['Healthy','Degraded','Failing','Unknown','Recovering','Maintenance','Paused'] as const
export const DELIVERY_STATES = ['queued','sending','accepted','rejected','uncertain','other'] as const
export type MetricsState = typeof METRICS_STATES[number]
export type DeliveryState = typeof DELIVERY_STATES[number]
export type MetricsMonitor = {
 id:string
 availability:WindowMetrics
 latency:{statistics:LatencyStatistics;locations:Array<{id:string;statistics:LatencyStatistics}>}
 incidents:{count:number;durationInPeriodMs:number}
 deliveries:Array<{state:DeliveryState;count:number}>
 current:{
  state:MetricsState;lastCheckAt:number|null
  coverage:{expected:number;observed:number}
  probes:Array<{id:string;runnerId:string|null;contactAt:number|null;contactFresh:boolean;evidenceFresh:boolean;state:'Healthy'|'Failing'|'Unknown'}>
 }
}
export type MetricsSnapshot = {
 schemaVersion:1;generatedAt:number;period:ReportPeriod;denominatorPolicy:string
 source:'uptime';monitors:MetricsMonitor[]
}
export type MetricSample = {name:string;help:string;labels:Record<string,string>;value:number}
