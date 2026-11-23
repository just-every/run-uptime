import type { AvailabilityBuckets } from './availability-buckets.server.ts'
import type { LatencyStatistics } from './reports/latency.server.ts'

const DAY = 86_400_000
const noSamples:LatencyStatistics = {count:0,minMs:null,meanMs:null,p50Ms:null,p95Ms:null,p99Ms:null,maxMs:null}

type Histogram=Map<number,number>
function addSample(values:Histogram,value:number){
  values.set(value,(values.get(value)??0)+1)
}

function statistics(values:Histogram):LatencyStatistics{
  if(!values.size)return noSamples
  const sorted=[...values.entries()].sort((a,b)=>a[0]-b[0])
  const count=sorted.reduce((sum,[,frequency])=>sum+frequency,0)
  const ranks=[Math.ceil(count/2),Math.floor((95*count+99)/100),Math.floor((99*count+99)/100)]
  const percentiles:number[]=[]
  let sum=0,seen=0
  for(const [value,frequency]of sorted){
    sum+=value*frequency
    seen+=frequency
    while(percentiles.length<ranks.length&&ranks[percentiles.length]<=seen)percentiles.push(value)
  }
  return {count,minMs:sorted[0][0],meanMs:sum/count,p50Ms:percentiles[0],p95Ms:percentiles[1],
    p99Ms:percentiles[2],maxMs:sorted[sorted.length-1][0]}
}

type Span={startsAt:number;endsAt:number}
const overlap=(start:number,end:number,spans:Span[])=>{
  let total=0
  for(const span of spans)total+=Math.max(0,Math.min(end,span.endsAt)-Math.max(start,span.startsAt))
  return total
}

export async function summarizeAvailability(buckets:AvailabilityBuckets,from:number,to:number,mode:'overview'|'metrics'){
  const recent=mode==='overview'
  const starts=recent?[to-DAY,from]:[from]
  const totals=starts.map(()=>({up:0,notPassing:0,paused:0,maintenance:0}))
  const revisions=new Map(buckets.revisions.map(r=>[r.revision,r]))
  const maintenance=buckets.revisions.flatMap(r=>r.maintenance)
  const pauses=buckets.revisions.filter(r=>r.definition.enabled===false)
  let nextCompleted=Infinity,lastCheckAt:number|null=null,responseDurationMs:number|null=null
  const allSamples:Histogram=new Map(),byProbe=new Map<string,Histogram>()
  for await(const page of buckets.pages)for(const slot of page){
    const revision=revisions.get(slot.revision)
    if(!revision)continue
    const completion=slot.completedAt
    const valid=slot.valid&&completion>=slot.dueAt&&completion<=to&&slot.latestAttempt<=Math.min(to,revision.endsAt)&&
      slot.latestHeartbeat<=to&&slot.canaryAt<=to
    if(slot.id===buckets.latest){
      if(Number.isSafeInteger(completion)&&completion<=to)lastCheckAt=completion
      if(valid&&Number.isSafeInteger(slot.duration)&&slot.duration>=0)responseDurationMs=slot.duration
    }
    const activeFrom=slot.enabled?revision.startsAt:revision.endsAt
    const coverageStart=Math.max(completion,activeFrom)
    const coverageEnd=Math.min(to,revision.endsAt,completion+slot.interval,nextCompleted,slot.expiresAt,slot.passing?slot.heartbeatExpires:Infinity)
    if(completion!==-Infinity)nextCompleted=Math.min(nextCompleted,completion)
    if(!valid||!slot.complete||slot.canaryAt>slot.canaryLimit)continue
    if(coverageEnd>coverageStart){
      for(const [index,start]of starts.entries()){
        const clipped=Math.max(coverageStart,start)
        // The arbitrary-period report measures maintenance over its full
        // underlying span before clipping. Overview clips both at its edge.
        const excluded=overlap(recent?clipped:coverageStart,coverageEnd,maintenance)
        const duration=Math.max(0,coverageEnd-clipped-excluded)
        totals[index][slot.passing?'up':'notPassing']+=duration
      }
    }
    if(recent)continue
    for(const probe of slot.probes){
      const at=probe[12]
      if(at<from||at>=to||at<activeFrom||maintenance.some(span=>at>=span.startsAt&&at<span.endsAt))continue
      let values=byProbe.get(probe[0])
      if(!values){values=new Map();byProbe.set(probe[0],values)}
      addSample(values,probe[13]);addSample(allSamples,probe[13])
    }
  }
  for(const [index,start]of starts.entries()){
    totals[index].paused=overlap(start,to,pauses)
    totals[index].maintenance=overlap(start,to,maintenance)
  }
  return {totals,lastCheckAt,responseDurationMs,latency:statistics(allSamples),
    locations:new Map([...byProbe].map(([probe,values])=>[probe,statistics(values)]))}
}
