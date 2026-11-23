import { maintenanceReportSnapshots } from './planned-maintenance/report.server.ts'

import { dayMs, hydrateAvailabilityDays, utcDay } from './availability-backfill.server.ts'
type SlotDefinition = {
  enabled: number; intervalMs: number; freshnessMs: number; timeoutMs: number; retries: number
  probes: string[]; type: string | null; heartbeat: { maxAgeMs: number | null }
  assigned: number; assignments: Record<string, {canaryUrl: string | null}> | null
}
type Probe = [
  probe: string, attempts: number, first: number, last: number, failures: number, runnerErrors: number,
  invalid: number, latestCompletion: number, latestHeartbeat: number | null, failedCanaries: number,
  outcome: string, startedAt: number, completedAt: number, duration: number,
  heartbeatAt: number | null, canaryOutcome: string | null, canaryAt: number | null,
]
type BucketSlot = [id: string, dueAt: number, revision: number, status: string, definition: SlotDefinition, probes: Probe[]]
type Span = { startsAt:number; endsAt:number }
type Revision = Span & { revision:number; definition:{enabled:boolean; intervalMs:number; probes:string[]; retries:number; timeoutMs:number}; maintenance:Span[] }
export type SlotRollup = {
  id:string; dueAt:number; revision:number; complete:boolean; enabled:boolean; interval:number
  completedAt:number; duration:number; expiresAt:number; latestHeartbeat:number; latestAttempt:number
  passing:boolean; valid:boolean; heartbeatExpires:number; canaryAt:number; canaryLimit:number; probes:Probe[]
}

function summarize([id,dueAt,revision,status,definition,probes]:BucketSlot):SlotRollup {
  let completedAt=-Infinity,duration=-Infinity,expiresAt=Infinity,latestHeartbeat=-Infinity,latestAttempt=-Infinity
  let heartbeatExpires=Infinity
  let passing=probes.length===definition.probes.length,valid=passing,canaryAt=-Infinity
  const heartbeat=definition.type==='heartbeat',age=definition.heartbeat.maxAgeMs??0
  for (const [name,count,first,last,failures,runnerErrors,invalid,maxAt,maxHeartbeat,canaryFailures,outcome,started,completed,elapsed,received,canaryOutcome,canaryCompleted] of probes) {
    const selected=definition.probes.includes(name)
    completedAt=Math.max(completedAt,completed??-Infinity)
    duration=Math.max(duration,elapsed??-Infinity)
    latestAttempt=Math.max(latestAttempt,maxAt??-Infinity)
    if(heartbeat)latestHeartbeat=Math.max(latestHeartbeat,maxHeartbeat??-Infinity)
    passing&&=outcome==='pass'&&failures===0
    valid&&=selected&&runnerErrors===0&&invalid===0&&
      (definition.assigned!==0||count===last+1&&first===0)&&['pass','target_failure','runner_error'].includes(outcome)
    if(heartbeat&&outcome==='pass'){
      valid&&=received!==null&&started!==null&&completed!==null&&received<=started&&completed-received<=age
      if(selected&&received!==null)heartbeatExpires=Math.min(heartbeatExpires,received+age)
    }
    if(definition.assignments?.[name]?.canaryUrl!=null){
      valid&&=canaryFailures===0&&canaryOutcome==='pass'&&canaryCompleted!==null
      canaryAt=Math.max(canaryAt,canaryCompleted??-Infinity)
    }
    if(selected&&completed!==null)expiresAt=Math.min(expiresAt,Math.min(completed,canaryCompleted??completed)+definition.freshnessMs)
  }
  const canaries=Object.values(definition.assignments??{}).filter(assignment=>assignment.canaryUrl!==null).length
  const canaryLimit=dueAt+definition.intervalMs+Math.max(30000,
    (definition.probes.length*(definition.retries+1)+canaries)*definition.timeoutMs+10000)+1000
  return {id,dueAt,revision,complete:status==='complete',enabled:definition.enabled!==0,interval:definition.intervalMs,
    completedAt,duration,expiresAt,latestHeartbeat,latestAttempt,passing,valid,heartbeatExpires,canaryAt,canaryLimit,probes}
}

type CachedBucket = {version:string; slots:SlotRollup[]}
const bucketCache = new WeakMap<D1Database,Map<string,Map<number,CachedBucket>>>()

type LatestSlot={id:string;due_at:number}
type StoredBucket={starts_at:number;version:string|null;payload:string|null}

function caches(db:D1Database,id:string){
  let monitors=bucketCache.get(db)
  if(!monitors){monitors=new Map();bucketCache.set(db,monitors)}
  let buckets=monitors.get(id)
  if(!buckets){
    if(monitors.size>=8)monitors.delete(monitors.keys().next().value!)
    buckets=new Map();monitors.set(id,buckets)
  }
  monitors.delete(id);monitors.set(id,buckets)
  return buckets
}

async function readMonitorBuckets(db:D1Database,id:string,from:number,to:number,revisions:Revision[],includeLatest:boolean){
  const reach=revisions.reduce((max,{definition:d})=>Math.max(max,d.intervalMs+
    Math.max(30000,d.probes.length*(d.retries+2)*d.timeoutMs+10000)+1000),0)
  const lower=from-reach
  const [floorRow,latestRow]=await db.batch([
    db.prepare('SELECT due_at FROM slots INDEXED BY slots_monitor WHERE monitor_id=? AND manual=0 AND due_at<? ORDER BY due_at DESC LIMIT 1').bind(id,lower),
    ...(includeLatest?[db.prepare(`SELECT id,due_at FROM slots INDEXED BY slots_monitor
      WHERE monitor_id=? AND manual=0 AND status='complete' AND due_at<=? ORDER BY due_at DESC,rowid DESC LIMIT 1`).bind(id,to)]:[]),
  ])
  const floor=Number((floorRow.results[0] as {due_at:number}|undefined)?.due_at??lower)
  const latest=latestRow?.results[0] as LatestSlot|undefined
  const anchors=[floor,...(latest?[latest.due_at]:[])]
  await hydrateAvailabilityDays(db,id,lower,to,anchors)
  // Dense or explicitly long periods are folded a few days at a time,
  // keeping D1 response size and Worker memory bounded.
  const interval=revisions.reduce((min,{definition})=>Math.min(min,definition.intervalMs),dayMs)
  const pageDays=Math.max(1,Math.min(10,Math.floor(15000*interval/dayMs)))
  const bucketFloor=utcDay(lower)
  const extraDays=[...new Set(anchors.map(utcDay).filter(day=>day>=0&&day<bucketFloor))].sort((a,b)=>b-a)
  const keep=to-from<=8*dayMs&&((to-from)/interval)<12000
  const buckets=caches(db,id)

  async function readRange(start:number,end:number){
    const cachedBuckets=new Map(buckets)
    const versions=JSON.stringify(Object.fromEntries([...cachedBuckets].map(([at,bucket])=>[at,bucket.version])))
    const {results}=await db.prepare(`SELECT starts_at,version,
      CASE WHEN version IS NOT json_extract(?1,'$."'||starts_at||'"') THEN json(slots) END AS payload
      FROM availability_buckets WHERE monitor_id=?2 AND starts_at BETWEEN ?3 AND ?4
      UNION ALL
      SELECT b.starts_at,NULL,json(b.record)
      FROM monitors m CROSS JOIN json_each(m.hosted_availability_tail) pending
      CROSS JOIN availability_bucket_slots b ON b.slot_key=pending.value
      WHERE m.id=?2 AND b.starts_at BETWEEN ?3 AND ?4`)
      .bind(versions,id,start,end).all<StoredBucket>()
    // A previously folded slot can receive a late attempt. Its exact pending
    // record supersedes the older bucket record until the next flush.
    const pending=new Map<string,SlotRollup>()
    for(const row of results){
      if(row.version!==null)continue
      const slot=summarize(JSON.parse(row.payload!) as BucketSlot)
      pending.set(slot.id,slot)
    }
    const slots:SlotRollup[]=[]
    const inRange=(slot:SlotRollup)=>(slot.dueAt>=floor&&slot.dueAt<=to)||slot.id===latest?.id
    for(const row of results){
      if(row.version===null)continue
      const cached=cachedBuckets.get(row.starts_at)
      const records=row.payload===null&&cached?.version===row.version?cached.slots:
        Object.values(JSON.parse(row.payload!) as Record<string,BucketSlot>).map(summarize)
      if(keep)buckets.set(row.starts_at,{version:row.version,slots:records})
      for(const slot of records)if(!pending.has(slot.id)&&inRange(slot))slots.push(slot)
    }
    for(const slot of pending.values())if(inRange(slot))slots.push(slot)
    return slots.sort((a,b)=>b.dueAt-a.dueAt||(a.id===b.id?0:a.id<b.id?1:-1))
  }

  async function* pages(){
    for(let end=to;end>=bucketFloor;){
      const start=Math.max(bucketFloor,utcDay(end)-(pageDays-1)*dayMs)
      yield await readRange(start,end)
      end=start-1
    }
    for(const day of extraDays)yield await readRange(day,day+dayMs-1)
    for(const at of buckets.keys())if(at<bucketFloor&&!extraDays.includes(utcDay(at))||at>to||!keep)buckets.delete(at)
  }
  return {pages:pages(),latest:latest?.id,revisions}
}

export async function availabilityBucketReports<T>(
  db:D1Database, ids:string[], from:number, to:number, includeLatest:boolean,
  summarize:(buckets:AvailabilityBuckets,index:number)=>Promise<T>,
):Promise<T[]> {
  const snapshots=await maintenanceReportSnapshots(db,ids,from,to)
  const result:T[]=[]
  for(let offset=0;offset<ids.length;offset+=4){
    const batch=await Promise.all(ids.slice(offset,offset+4).map(async(id,index)=>{
      const revisions=JSON.parse(snapshots.get(id)!) as Revision[]
      return summarize(await readMonitorBuckets(db,id,from,to,revisions,includeLatest),offset+index)
    }))
    result.push(...batch)
  }
  return result
}
export type AvailabilityBuckets = Awaited<ReturnType<typeof readMonitorBuckets>>
