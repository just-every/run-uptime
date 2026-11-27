// A quiet check is a Worker check that passed with nothing to report: one passing attempt at each
// location, no incident, notice or snapshot, and a monitor that was Healthy and stays Healthy. It has no
// slot row. It waits on its monitor's availability tail, as the ninth element of its availability record,
// and is stored with its availability bucket, in `checks`, under its slot id. Both hold
// [leaseUntil, missedCount, hosted]: what the slot row would have held beyond its id and its revision's
// definition. These fragments read a quiet check back as the slot row it replaces.

/** The widest availability bucket. A check due at T is in a bucket that starts in (T-BUCKET_REACH, T]. */
export const BUCKET_REACH=21_600_000

/** The width of the availability bucket of a check whose definition has interval `interval` (a SQL expression):
 * the widths of availability_bucket_slots (migration 0096), for a check that has no slot row to be projected from. */
export const bucketWidth=(interval:string)=>`(CASE WHEN ${interval}<10000 THEN 1800000 WHEN ${interval}<20000 THEN 3600000
  WHEN ${interval}<30000 THEN 7200000 WHEN ${interval}<60000 THEN 10800000 ELSE ${BUCKET_REACH} END)`

export type QuietSlot={id:string;monitor_id:string;revision:number;due_at:number;status:'complete';definition:string;
 lease_owner:'';lease_until:number;missed_count:number;manual:0;hosted:string}

// A slot id is `${monitor}:${revision}:${dueAt}`. A bucket's keys alone give its checks' times, so a
// reader that only orders or counts them never opens their evidence.
type Monitors=string|((column:string)=>string)
const match=(monitor:Monitors,column:string)=>typeof monitor==='string'?`${column}=${monitor}`:monitor(column)
const stored=(monitor:Monitors,buckets:string,body:boolean)=>`SELECT monitor_id,id,CAST(substr(rest,1,instr(rest,':')-1) AS INTEGER) AS revision,
  CAST(substr(rest,instr(rest,':')+1) AS INTEGER) AS due_at${body?',body':''}
 FROM (SELECT b.monitor_id,c.key AS id,substr(c.key,length(b.monitor_id)+2) AS rest${body?',c.value AS body':''}
  FROM availability_buckets b CROSS JOIN json_each(b.checks) c WHERE ${match(monitor,'b.monitor_id')} AND b.checks IS NOT NULL AND ${buckets})`
const waiting=(monitor:Monitors,body:boolean)=>`SELECT m.id AS monitor_id,t.key AS id,json_extract(t.value,'$[2]') AS revision,json_extract(t.value,'$[1]') AS due_at${body?",json_extract(t.value,'$[8]') AS body":''}
 FROM monitors m CROSS JOIN json_each(m.hosted_availability_tail) t WHERE ${match(monitor,'m.id')} AND json_type(t.value,'$[8]')='array'`

/** Quiet checks as slot rows: those in the buckets `buckets` selects (alias b) and, unless `tail` is false, those
 * waiting on a tail. `monitor` is a SQL expression for one monitor's id, or a predicate over a monitor id column. */
export function quietSlots(monitor:Monitors,buckets:string,tail=true){
 return `SELECT q.id,q.monitor_id,q.revision,q.due_at,'complete' AS status,
   COALESCE((SELECT r.definition FROM revisions r WHERE r.monitor_id=q.monitor_id AND r.revision=q.revision),
    (SELECT m.definition FROM monitors m WHERE m.id=q.monitor_id)) AS definition,
   '' AS lease_owner,json_extract(q.body,'$[0]') AS lease_until,json_extract(q.body,'$[1]') AS missed_count,0 AS manual,
   json_extract(q.body,'$[2]') AS hosted
  FROM (${stored(monitor,buckets,true)}${tail?` UNION ALL ${waiting(monitor,true)}`:''}) q`
}

/** monitor_id, id, revision and due_at of the same checks, without opening their evidence. */
export function quietKeys(monitor:Monitors,buckets:string){
 return `${stored(monitor,buckets,false)} UNION ALL ${waiting(monitor,false)}`
}

/** The attempts of the quiet check `id` of `monitor`, due at `due` under a definition with interval `interval`: a JSON
 * array, or NULL when it is not a quiet check. Reads the monitor's own row and at most the one bucket of that time. */
export function quietAttempts(monitor:string,id:string,due:string,interval:string){
 return `COALESCE((SELECT json_extract(m.hosted_availability_tail,'$.'||json_quote(${id})||'[8][2].attempts') FROM monitors m WHERE m.id=${monitor}),
  (SELECT json_extract(b.checks,'$.'||json_quote(${id})||'[2].attempts') FROM availability_buckets b WHERE b.monitor_id=${monitor}
    AND b.starts_at=${due}/${bucketWidth(interval)}*${bucketWidth(interval)}))`
}

/** Buckets (alias b) that can hold a check due in [`from`,`through`]. */
export const bucketsBetween=(from:string,through:string)=>`b.starts_at>${from}-${BUCKET_REACH} AND b.starts_at<=${through}`

/** Where the buckets that can hold the monitor's newest quiet check due at or before `through` begin (exclusive).
 * A bucket that starts a full reach before `through` holds only earlier checks; the newest such bucket bounds the
 * search, and one that could only hold checks older than `floor` (a time a slot row already covers) is never visited. */
export function quietFloor(monitor:string,through:string,floor='0'){
 return `COALESCE((SELECT starts_at FROM availability_buckets
   WHERE monitor_id=${monitor} AND starts_at<=${through}-${BUCKET_REACH} AND starts_at>${floor}-${BUCKET_REACH} AND checks IS NOT NULL
   ORDER BY starts_at DESC LIMIT 1),${through})-${BUCKET_REACH}`
}

/** At most one `{id,revision,due_at,completed_at}` row: the monitor's newest quiet check due at or before `through`,
 * unless a slot row at least as new exists (the caller reads that row itself). completed_at is when its last attempt
 * completed. A quiet check is the monitor's hosted checkpoint when it is written, and the checkpoint only moves
 * forward: when `through` reaches the checkpoint, the answer is the checkpoint itself or nothing, read from the
 * monitor's own row (and its bucket, once flushed). Only an earlier `through` searches the tail and the buckets,
 * never below `floor`, a time a slot row already covers. */
export function newestQuiet(monitor:string,through:string,floor='0'){
 const path=(id:string,rest:string)=>`'$.'||json_quote(${id})||'${rest}'`
 const bucketOf=(id:string,due:string)=>`FROM availability_buckets b WHERE b.monitor_id=${monitor} AND b.starts_at>${due}-${BUCKET_REACH}
   AND b.starts_at<=${due} AND json_type(b.checks,${path(id,'')}) IS NOT NULL`
 const pending=`SELECT id,revision,due_at FROM (${waiting(monitor,false)}) WHERE due_at<=${through}`
 const search=`SELECT json_array(id,revision,due_at) FROM (
   ${pending}
   UNION ALL
   SELECT id,revision,due_at FROM (${stored(monitor,`b.starts_at<=${through} AND b.starts_at>${quietFloor(monitor,through,floor)}`,false)})
   WHERE due_at<=${through} AND NOT EXISTS(${pending})
  ) ORDER BY due_at DESC LIMIT 1`
 return `SELECT json_extract(f.found,'$[0]') AS id,json_extract(f.found,'$[1]') AS revision,json_extract(f.found,'$[2]') AS due_at,
   COALESCE(json_extract(f.tail,${path("json_extract(f.found,'$[0]')",'[6][0]')}),
    (SELECT json_extract(b.slots,${path("json_extract(f.found,'$[0]')",'[6][0]')}) ${bucketOf("json_extract(f.found,'$[0]')","json_extract(f.found,'$[2]')")} LIMIT 1)) AS completed_at
  FROM (SELECT c.tail,CASE
    WHEN c.due_at IS NULL THEN NULL
    WHEN c.due_at>${through} THEN (${search})
    WHEN CASE WHEN json_type(c.tail,${path('c.id','')}) IS NOT NULL THEN json_type(c.tail,${path('c.id','[8]')})='array'
      ELSE EXISTS(SELECT 1 ${bucketOf('c.id','c.due_at')}) END THEN json_array(c.id,c.revision,c.due_at)
    END AS found
   FROM (SELECT json_extract(hosted_checkpoint,'$.slotId') AS id,json_extract(hosted_checkpoint,'$.revision') AS revision,
     json_extract(hosted_checkpoint,'$.dueAt') AS due_at,hosted_availability_tail AS tail FROM monitors WHERE id=${monitor}) c) f
  WHERE f.found IS NOT NULL`
}

type Recent={through?:number;after?:number;revision?:number}
/** The monitor's newest quiet checks as slot rows, newest first: at most `limit`, due after `after` and at or before `through`. */
export async function recentQuietSlots(db:D1Database,monitorId:string,limit:number,{through=Number.MAX_SAFE_INTEGER,after=-1,revision}:Recent={}):Promise<QuietSlot[]>{
 const found:QuietSlot[]=[]
 const newest=()=>found.sort((a,b)=>b.due_at-a.due_at||(a.id<b.id?1:-1)).slice(0,limit)
 // Two buckets at a time, newest first. The first read also takes the checks still on the tail.
 const page=`SELECT starts_at FROM availability_buckets WHERE monitor_id=?1 AND starts_at<?2 AND starts_at>?3
  AND checks IS NOT NULL ORDER BY starts_at DESC LIMIT 2`
 for(let cursor=Math.min(through,Number.MAX_SAFE_INTEGER-1)+1,tail=true;;tail=false){
  const [rows,starts]=await db.batch<any>([
   db.prepare(quietSlots('?1',`b.starts_at IN (${page})`,tail)).bind(monitorId,cursor,after-BUCKET_REACH),
   db.prepare(`SELECT MIN(starts_at) AS oldest FROM (${page})`).bind(monitorId,cursor,after-BUCKET_REACH),
  ])
  for(const slot of rows.results as QuietSlot[])if(slot.due_at>after&&slot.due_at<=through&&(revision===undefined||slot.revision===revision))found.push(slot)
  const oldest=(starts.results[0] as {oldest:number|null}).oldest
  if(oldest===null)return newest()
  cursor=oldest
  // Buckets not yet read start before `cursor`, so every check in them is due before cursor+reach-1.
  const kept=newest()
  if(kept.length===limit&&kept[limit-1].due_at>=cursor+BUCKET_REACH-1)return kept
 }
}

/** Slot rows and quiet checks of one monitor in a single newest-first list, at most `limit`. Rows arrive newest first. */
export async function withQuietSlots<Row extends {id:string;due_at:number}>(db:D1Database,monitorId:string,rows:Row[],limit:number,options:Recent={}):Promise<(Row|QuietSlot)[]>{
 // A full page of rows bounds the search: an older quiet check cannot be among the newest `limit`.
 const after=rows.length>=limit?rows[limit-1].due_at-1:options.after
 const quiet=await recentQuietSlots(db,monitorId,limit,{...options,after})
 if(!quiet.length)return rows.slice(0,limit)
 const order=new Map<object,number>(rows.map((row,index)=>[row,index]))
 // A row keeps its place among rows, and comes before a quiet check due at the same time.
 return [...rows,...quiet].sort((a,b)=>b.due_at-a.due_at||(order.get(a)??rows.length)-(order.get(b)??rows.length)||(a.id<b.id?1:-1)).slice(0,limit)
}
