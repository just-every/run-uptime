import {ReportInputError,type ReportPeriod} from '../reports/period.ts'
import type {LatencyOptions} from '../reports/latency.server.ts'
import type {sourceResponseTimes} from './response-times.server.ts'
type Sample=Awaited<ReturnType<typeof sourceResponseTimes>>[number]
const resolutions={raw:0,'1m':60000,'5m':300000,'1h':3600000,'1d':86400000}
function statistics(samples:Sample[]){
 const values=samples.map(s=>s.responseMs).sort((a,b)=>a-b),count=values.length
 const rank=(percent:number)=>count?values[Math.ceil(percent*count)-1]:null
 return {count,minMs:values[0]??null,meanMs:count?values.reduce((a,b)=>a+b,0)/count:null,p50Ms:rank(.5),p95Ms:rank(.95),p99Ms:rank(.99),maxMs:values.at(-1)??null}
}
export function sourceLatency(samples:Sample[],period:ReportPeriod,options:LatencyOptions){
 if(options.location!=='all'&&options.location!=='source: UptimeRobot')throw new ReportInputError(`Source “UptimeRobot” has no samples for location “${options.location}”`,'source_unavailable')
 if(!samples.length)throw new ReportInputError('Source “UptimeRobot” response times are unavailable for this monitor and period','source_unavailable')
 const width=resolutions[options.bucket],groups=new Map<number,Sample[]>()
 for(const sample of samples){const at=width?Math.floor(sample.at/width)*width:sample.at;groups.set(at,[...(groups.get(at)??[]),sample])}
 return {period,...options,source:'UptimeRobot',label:'source: UptimeRobot',bucketAlignment:'UTC' as const,percentileMethod:'nearest-rank' as const,samplePolicy:'Saved UptimeRobot response-time samples in milliseconds, separate from native observations. No missing samples are filled.',availableLocations:['source: UptimeRobot'],statistics:statistics(samples),series:[...groups].map(([at,values])=>({at,to:width?Math.min(period.to,at+width):at,location:'source: UptimeRobot',...statistics(values)})),sourceSamples:samples}
}
