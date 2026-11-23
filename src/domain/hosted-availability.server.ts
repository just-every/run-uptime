const slotsPerFlush=5

// The hosted intake has already validated the exact attempt clocks and
// outcome taxonomy. Persist the same aggregate as the native SQL view so
// reports and bucket flushes do not regroup the same attempts repeatedly.
export function hostedAvailabilityRecord(slot:{id:string;due_at:number;revision:number;status:string},definition:any,attempts:any[]){
 const assignments=Object.fromEntries(Object.entries(definition.assignments).map(([probe,value]:[string,any])=>
  [probe,{canaryUrl:value.canaryUrl??null}]));
 const shape={enabled:Number(definition.enabled),intervalMs:definition.intervalMs,freshnessMs:definition.freshnessMs,
  probes:definition.probes,type:definition.type??null,heartbeat:{maxAgeMs:definition.heartbeat?.maxAgeMs??null},
  retries:definition.retries,timeoutMs:definition.timeoutMs,assigned:1,assignments};
 const probes=definition.probes.flatMap((probe:string)=>{
  const chain=attempts.filter(o=>o.probe===probe).sort((a,b)=>a.attempt-b.attempt);
  if(!chain.length)return [];
  const first=chain[0],last=chain[chain.length-1],count=(predicate:(o:any)=>boolean)=>chain.filter(predicate).length;
  const heartbeats=chain.flatMap(o=>o.heartbeatReceivedAt==null?[]:[o.heartbeatReceivedAt]);
  return [[probe,chain.length,first.attempt,last.attempt,count(o=>o.outcome==='target_failure'),count(o=>o.outcome==='runner_error'),
   0,Math.max(...chain.map(o=>o.completedAt)),heartbeats.length?Math.max(...heartbeats):null,
   count(o=>o.canary!=null&&o.canary.outcome!=='pass'),last.outcome,last.startedAt,last.completedAt,last.durationMs,
   last.heartbeatReceivedAt??null,last.canary?.outcome??null,last.canary?.completedAt??null]];
 });
 return [slot.id,slot.due_at,slot.revision,slot.status,shape,probes];
}

// Flush the pending records within the acceptance transaction. The monitor
// update that follows either clears the flushed tail or appends this slot.
export function hostedAvailabilityStatement(db:D1Database,slotKey:number,monitorId:string){
  return db.prepare(`WITH flush AS MATERIALIZED (
    SELECT ?1 AS current_slot,hosted_availability_tail AS tail FROM monitors
    WHERE id=?2 AND json_array_length(hosted_availability_tail)>=${slotsPerFlush-1}
      AND ?1 NOT IN (SELECT value FROM json_each(hosted_availability_tail))
  ), keys AS (
    SELECT current_slot AS slot_key FROM flush
    UNION ALL
    SELECT pending.value FROM flush CROSS JOIN json_each(flush.tail) pending
  )
  INSERT INTO availability_buckets(monitor_id,starts_at,slots)
  SELECT b.monitor_id,b.starts_at,jsonb_group_object(b.slot_key,b.record)
  FROM keys CROSS JOIN availability_bucket_slots b ON b.slot_key=keys.slot_key
  GROUP BY b.monitor_id,b.starts_at
  ON CONFLICT(monitor_id,starts_at) DO UPDATE SET slots=jsonb_patch(slots,excluded.slots),version=excluded.version`).bind(slotKey,monitorId)
}

// Use in the existing monitor UPDATE immediately after the flush statement.
export function hostedAvailabilityTail(slotKey:string){
  return `CASE
    WHEN ${slotKey} IN (SELECT value FROM json_each(monitors.hosted_availability_tail)) THEN monitors.hosted_availability_tail
    WHEN json_array_length(monitors.hosted_availability_tail)>=${slotsPerFlush-1} THEN '[]'
    ELSE json_insert(monitors.hosted_availability_tail,'$[#]',${slotKey})
  END`
}
