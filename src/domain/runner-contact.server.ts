export const CONTACT_FRESHNESS_MS=120000;

// Receipt of an authenticated request is not process liveness or target health.
export function projectContact(lastContactAt:number|null,now:number) {
  if(lastContactAt===null)return {state:'Never seen',lastContactAt:null,freshnessMs:CONTACT_FRESHNESS_MS,reason:'This installation has not recorded an authenticated runner request.'};
  if(!Number.isFinite(lastContactAt)||lastContactAt>now)return {state:'Stale contact',lastContactAt:Number.isFinite(lastContactAt)?lastContactAt:null,freshnessMs:CONTACT_FRESHNESS_MS,reason:'Contact time could not be verified.'};
  const fresh=now-lastContactAt<=CONTACT_FRESHNESS_MS;
  return {state:fresh?'Fresh contact':'Stale contact',lastContactAt,freshnessMs:CONTACT_FRESHNESS_MS,reason:fresh?'An authenticated runner request reached this control plane within the last 2 minutes.':'No authenticated runner request received within the last 2 minutes.'};
}

export async function readContact(DB:D1Database,now=Date.now()) {
  const row=await DB.prepare('SELECT last_contact_at FROM runner_contact WHERE id=1').first<{last_contact_at:number}>();
  return projectContact(row?.last_contact_at??null,now);
}

export async function recordContact(DB:D1Database) {
  await DB.prepare('INSERT INTO runner_contact(id,last_contact_at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET last_contact_at=excluded.last_contact_at').bind(Date.now()).run();
}
