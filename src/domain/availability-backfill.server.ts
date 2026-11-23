// The migration covers the rolling overview/scrape windows. Older explicit
// periods rebuild a previously unprojected UTC day once from native evidence.
export const dayMs=86_400_000
export const utcDay=(at:number)=>Math.floor(at/dayMs)*dayMs

const cutoffs=new WeakMap<D1Database,number>()
async function cutoff(db:D1Database){
  const saved=cutoffs.get(db)
  if(saved!==undefined)return saved
  const row=await db.prepare("SELECT day FROM availability_bucket_history WHERE monitor_id=''").first<{day:number}>()
  if(!row)throw Error('Availability upgrade cutoff missing')
  cutoffs.set(db,row.day)
  return row.day
}

export async function hydrateAvailabilityDays(db:D1Database,id:string,from:number,to:number,anchors:number[]){
  const first=await cutoff(db),lower=Math.max(0,utcDay(from))
  if(lower>=first&&anchors.every(at=>at>=first))return
  const days=new Set(anchors.filter(at=>at>=0&&at<first).map(utcDay))
  for(let day=lower;day<=to&&day<first;day+=dayMs)days.add(day)
  if(!days.size)return
  const {results}=await db.prepare(`SELECT day FROM availability_bucket_history
    WHERE monitor_id=? AND day IN (SELECT value FROM json_each(?))`).bind(id,JSON.stringify([...days])).all<{day:number}>()
  for(const {day}of results)days.delete(day)
  // Write the rebuilt projection and its marker together. Concurrent requests
  // may find the same missing day; the guarded batch does the expensive work once.
  const missing=[...days]
  for(let offset=0;offset<missing.length;offset+=4){
    const statements=missing.slice(offset,offset+4).flatMap(day=>[
      db.prepare(`INSERT INTO availability_buckets(monitor_id,starts_at,slots)
        SELECT monitor_id,starts_at,jsonb_group_object(slot_key,record)
        FROM availability_bucket_slots
        WHERE monitor_id=?1 AND due_at>=?2 AND due_at<?3
          AND NOT EXISTS(SELECT 1 FROM availability_bucket_history WHERE monitor_id=?1 AND day=?2)
        GROUP BY starts_at
        ON CONFLICT(monitor_id,starts_at) DO UPDATE SET slots=excluded.slots,version=excluded.version`).bind(id,day,day+dayMs),
      db.prepare('INSERT OR IGNORE INTO availability_bucket_history(monitor_id,day) VALUES(?,?)').bind(id,day),
    ])
    await db.batch(statements)
  }
}
