import type {SlotRollup} from './availability-buckets.server.ts'
import {bucketWidth} from './quiet-checks.ts'

const slotsPerFlush=30
// The tail is flushed once its oldest record is a full flush of intervals behind the check being accepted.
// Keys keep their insertion order, so the oldest is the first: one row read, however long the tail is.
// `record` is a SQL expression for the accepted check's availability record.
const tailDue=(tail:string,record:string)=>`(SELECT json_extract(value,'$[1]') FROM json_each(${tail}) LIMIT 1)
  <=json_extract(${record},'$[1]')-${slotsPerFlush-1}*MAX(json_extract(${record},'$[5]'),60000)`

type HostedDefinition={
 enabled:boolean; intervalMs:number; freshnessMs:number; type?:string; heartbeat?:{maxAgeMs:number};
 probes:string[]; retries:number; timeoutMs:number; assignments:Record<string,{canaryUrl?:string|null}>;
}
type HostedAttempt={
 probe:string; attempt:number; outcome:string; startedAt:number; completedAt:number; durationMs:number;
 heartbeatReceivedAt?:number; canary?:{outcome:string; completedAt:number};
}

// The hosted intake has validated the exact attempt clocks. Store the same
// compact record as the legacy SQL view without rereading past attempts.
export function hostedAvailabilityRecord(
 slot:{id:string;due_at:number;revision:number;status:string},definition:HostedDefinition,attempts:HostedAttempt[],
):SlotRollup{
 const heartbeat=definition.type==='heartbeat',heartbeatAge=definition.heartbeat?.maxAgeMs??0;
 let completed=-Infinity,duration=-Infinity,expires=Infinity,latestHeartbeat=-Infinity,latestAttempt=-Infinity;
 let heartbeatExpires=Infinity,canaryAt=-Infinity,passing=true,valid=true;
 const samples:SlotRollup[6][9]=[];
 for(const probe of definition.probes){
  const chain=attempts.filter(attempt=>attempt.probe===probe).sort((a,b)=>b.attempt-a.attempt);
  const last=chain[0];
  if(!last){passing=valid=false;continue}
  completed=Math.max(completed,last.completedAt);
  duration=Math.max(duration,last.durationMs);
  expires=Math.min(expires,Math.min(last.completedAt,last.canary?.completedAt??last.completedAt)+definition.freshnessMs);
  latestAttempt=Math.max(latestAttempt,...chain.map(attempt=>attempt.completedAt));
  passing&&=last.outcome==='pass'&&chain.every(attempt=>attempt.outcome!=='target_failure');
  valid&&=chain.every(attempt=>attempt.outcome!=='runner_error');
  if(heartbeat){
   latestHeartbeat=Math.max(latestHeartbeat,...chain.map(attempt=>attempt.heartbeatReceivedAt??-Infinity));
   if(last.outcome==='pass'){
    const received=last.heartbeatReceivedAt;
    valid&&=received!==undefined&&received<=last.startedAt&&last.completedAt-received<=heartbeatAge;
    if(received!==undefined)heartbeatExpires=Math.min(heartbeatExpires,received+heartbeatAge);
   }
  }
  if(definition.assignments[probe]?.canaryUrl!=null){
   canaryAt=Math.max(canaryAt,last.canary?.completedAt??-Infinity);
   valid&&=last.canary?.outcome==='pass'&&chain.every(attempt=>!attempt.canary||attempt.canary.outcome==='pass');
  }
  samples.push([probe,last.completedAt,last.durationMs]);
 }
 const canaries=Object.values(definition.assignments).filter(assignment=>assignment.canaryUrl!=null).length;
 const canaryLimit=slot.due_at+definition.intervalMs+Math.max(30000,
   (definition.probes.length*(definition.retries+1)+canaries)*definition.timeoutMs+10000)+1000;
 const clock=(value:number)=>Number.isFinite(value)?value:null;
 return [slot.id,slot.due_at,slot.revision,slot.status,Number(definition.enabled),definition.intervalMs,
  [clock(completed),clock(duration),clock(expires),clock(latestHeartbeat),clock(latestAttempt),Number(passing),
   Number(valid),clock(heartbeatExpires),clock(canaryAt),samples],canaryLimit];
}

// What a quiet check (quiet-checks.ts) keeps beside its availability record: the content of the slot row it
// replaces, taken from the claim its monitor still holds. `claim` is a SQL expression for that claim.
const quietContent=(claim:string,attempts:string,receipts:string)=>`json_array(json_extract(${claim},'$.leaseUntil'),json_extract(${claim},'$.missedCount'),
  json_set(json_extract(${claim},'$.hosted'),'$.attempts',json(${attempts}),'$.receivedTimes',json(${receipts})))`
const bucketStart=(entry:string)=>`json_extract(${entry},'$[1]')/${bucketWidth(`json_extract(${entry},'$[5]')`)}*${bucketWidth(`json_extract(${entry},'$[5]')`)}`

// Flush the pending records within the acceptance transaction. The monitor
// update that follows either clears the flushed tail or appends this slot.
// A check with a slot row is projected from it. A quiet check has none: its record and its content come from
// its tail entry, and the content is stored in the bucket's `checks`. `quiet` carries the attempts and receipt
// times of the check being accepted when it is quiet; its record is `record`.
export function hostedAvailabilityStatement(db:D1Database,slotId:string,monitorId:string,record:string,quiet?:{attempts:string;receipts:string}){
  return db.prepare(`WITH flush AS MATERIALIZED (
    SELECT ?1 AS current_slot,hosted_availability_tail AS tail,hosted_claim AS claim FROM monitors
    WHERE id=?2 AND ${tailDue('hosted_availability_tail','?3')}
      AND json_type(hosted_availability_tail,'$.'||json_quote(?1)) IS NULL
  ), keys AS (
    SELECT current_slot AS slot_key FROM flush
    UNION ALL
    SELECT pending.key FROM flush CROSS JOIN json_each(flush.tail) pending
  ), quiet AS (
    -- Only a quiet check's content names its attempts: a tail without one is not read a second time.
    SELECT pending.key AS slot_key,json_remove(pending.value,'$[8]') AS record,json_extract(pending.value,'$[8]') AS content
    FROM flush CROSS JOIN json_each(flush.tail) pending
    WHERE instr(flush.tail,'"attempts"')>0 AND json_type(pending.value,'$[8]')='array'
    UNION ALL
    SELECT current_slot,?3,${quietContent('flush.claim','?4','?5')} FROM flush WHERE ?4 IS NOT NULL
  ), records AS (
    SELECT b.monitor_id,b.starts_at,b.slot_key,b.record,NULL AS content
    FROM keys CROSS JOIN availability_bucket_slots b ON b.slot_key=keys.slot_key
    UNION ALL
    SELECT ?2,${bucketStart('q.record')},q.slot_key,jsonb(q.record),jsonb(q.content) FROM quiet q
  )
  INSERT INTO availability_buckets(monitor_id,starts_at,slots,checks)
  SELECT monitor_id,starts_at,jsonb_group_object(slot_key,record),
    CASE WHEN COUNT(content)>0 THEN jsonb_group_object(slot_key,content) FILTER (WHERE content IS NOT NULL) END
  FROM records GROUP BY monitor_id,starts_at
  ON CONFLICT(monitor_id,starts_at) DO UPDATE SET slots=jsonb_patch(slots,excluded.slots),
    checks=CASE WHEN excluded.checks IS NULL THEN checks WHEN checks IS NULL THEN excluded.checks
      ELSE jsonb_patch(checks,excluded.checks) END,
    version=excluded.version`).bind(slotId,monitorId,record,quiet?.attempts??null,quiet?.receipts??null)
}

// Use in the existing monitor UPDATE immediately after the flush statement. With `quiet`, the entry also
// holds the check's content, built from the claim the same UPDATE clears.
export function hostedAvailabilityTail(slotId:string,record:string,quiet?:{attempts:string;receipts:string}){
  const path=`'$.'||json_quote(${slotId})`
  const entry=quiet?`json_insert(json(${record}),'$[8]',${quietContent('hosted_claim',quiet.attempts,quiet.receipts)})`:`json(${record})`
  return `CASE
    WHEN json_type(hosted_availability_tail,${path}) IS NULL
      AND ${tailDue('hosted_availability_tail',record)} THEN '{}'
    ELSE json_set(hosted_availability_tail,${path},${entry})
  END`
}
