import { maintenanceReportSnapshots } from './planned-maintenance/report.server.ts'

import { dayMs, hydrateAvailabilityDays, utcDay } from './availability-backfill.server.ts'
type Span = { startsAt:number; endsAt:number }
type Revision = Span & { revision:number; definition:{enabled:boolean; intervalMs:number; probes:string[]; retries:number; timeoutMs:number}; maintenance:Span[] }
export type SlotRollup = [
  id:string, dueAt:number, revision:number, status:string, enabled:number, interval:number,
  evidence:[completedAt:number|null, duration:number|null, expiresAt:number|null, latestHeartbeat:number|null,
    latestAttempt:number|null, passing:number, valid:number, heartbeatExpires:number|null, canaryAt:number|null,
    probes:[name:string, completedAt:number, duration:number][]],
  canaryLimit:number,
]

type CachedBucket = {at:number; monitor:string; version:string; slots:SlotRollup[]}

// A slot carries one compact evidence tuple and at most three latency tuples.
// Keep enough for four minute-cadence overviews, across all request ranges.
const maxCachedSlots=50_000
class BucketCache {
  readonly monitors=new Map<string,Map<number,CachedBucket>>()
  private readonly lru=new Set<CachedBucket>()
  private slots=0

  touch(bucket:CachedBucket){
    if(this.lru.delete(bucket))this.lru.add(bucket)
  }

  put(bucket:CachedBucket){
    const current=this.monitors.get(bucket.monitor)?.get(bucket.at)
    if(current)this.remove(current)
    if(bucket.slots.length>maxCachedSlots)return
    let monitor=this.monitors.get(bucket.monitor)
    if(!monitor){monitor=new Map();this.monitors.set(bucket.monitor,monitor)}
    monitor.set(bucket.at,bucket)
    this.lru.add(bucket)
    this.slots+=bucket.slots.length
    while(this.slots>maxCachedSlots)this.remove(this.lru.values().next().value!)
  }

  private remove(bucket:CachedBucket){
    const monitor=this.monitors.get(bucket.monitor)!
    monitor.delete(bucket.at)
    if(!monitor.size)this.monitors.delete(bucket.monitor)
    this.lru.delete(bucket)
    this.slots-=bucket.slots.length
  }
}
const bucketCaches=new WeakMap<D1Database,BucketCache>()

type LatestSlot={id:string;due_at:number}
type StoredBucket={starts_at:number;version:string;payload:string|null}

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
  let cache=bucketCaches.get(db)
  if(!cache){cache=new BucketCache();bucketCaches.set(db,cache)}
  const buckets=cache

  async function readRange(start:number,end:number){
    const cachedBuckets=new Map<number,CachedBucket>()
    for(const [at,bucket] of buckets.monitors.get(id)??[])if(at>=start&&at<=end)cachedBuckets.set(at,bucket)
    const versions=JSON.stringify(Object.fromEntries([...cachedBuckets].map(([at,bucket])=>[at,bucket.version])))
    const {results}=await db.prepare(`SELECT starts_at,version,
      CASE WHEN version IS NOT json_extract(?1,'$."'||starts_at||'"') THEN json(slots) END AS payload
      FROM availability_buckets WHERE monitor_id=?2 AND starts_at BETWEEN ?3 AND ?4`)
      .bind(versions,id,start,end).all<StoredBucket>()
    const slots:SlotRollup[]=[]
    for(const row of results){
      const cached=cachedBuckets.get(row.starts_at)
      const records=row.payload===null?cached!.slots:Object.values(JSON.parse(row.payload) as Record<string,SlotRollup>)
      if(row.payload===null)buckets.touch(cached!)
      else if(keep)buckets.put({at:row.starts_at,monitor:id,version:row.version,slots:records})
      for(const slot of records)if((slot[1]>=floor&&slot[1]<=to)||slot[0]===latest?.id)slots.push(slot)
    }
    return slots.sort((a,b)=>b[1]-a[1]||(a[0]===b[0]?0:a[0]<b[0]?1:-1))
  }

  async function* pages(){
    for(let end=to;end>=bucketFloor;){
      const start=Math.max(bucketFloor,utcDay(end)-(pageDays-1)*dayMs)
      yield await readRange(start,end)
      end=start-1
    }
    for(const day of extraDays)yield await readRange(day,day+dayMs-1)
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
