// Scheduled checks acquire new evidence once a minute. Reuse the default
// Prometheus snapshot over that cadence while authenticating every scrape.
const scrapes=new WeakMap<D1Database,{body:string;population:string;expiresAt:number}>()

export async function defaultMetricsScrape(db:D1Database,generate:()=>Promise<string>){
 const now=Date.now(),cached=scrapes.get(db)
 // Erasure and definition changes invalidate a snapshot before it can be served
 // again, even if the next Prometheus scrape falls inside the refresh period.
 const population=(await db.prepare("SELECT json_group_array(json_array(id,revision)) AS ids FROM monitors ORDER BY id").first<{ids:string}>())!.ids
 if(cached&&cached.expiresAt>now&&cached.population===population)return cached.body
 const body=await generate()
 scrapes.set(db,{body,population,expiresAt:now+55_000})
 return body
}
