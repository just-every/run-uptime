// Revalidation follows normal session/role authorization. Only validators
// issued for the same actor and overview are accepted in this isolate.
const validators=new WeakMap<D1Database,Map<string,{etag:string;version:string;projectedAt:number;expiresAt:number}>>()
const headers=(etag:string,expiresAt:number)=>({etag,'x-uptime-overview-ttl':String(Math.max(0,expiresAt-Date.now()))})

async function overviewVersion(db:D1Database,monitorId?:string){
 const filter=monitorId===undefined?'':' WHERE m.id=?'
 const monitors=db.prepare(`SELECT COUNT(*) AS count,MAX(m.rowid) AS newest,
    SUM(m.revision) AS revision,SUM(g.generation) AS evidence
    FROM monitors m LEFT JOIN evidence_generation g ON g.monitor_id=m.id${filter}`)
 const [versions,contacts]=await db.batch([
  monitorId===undefined?monitors:monitors.bind(monitorId),
  db.prepare('SELECT COUNT(*) AS count,MAX(last_contact_at) AS contact,MAX(revoked_at) AS revoked FROM runners'),
 ])
 return JSON.stringify([versions.results[0],contacts.results[0]])
}

export async function overviewValidator(db:D1Database,key:string,requestTag:string|undefined,monitorId?:string){
 let byActor=validators.get(db)
 if(!byActor){byActor=new Map();validators.set(db,byActor)}
 const previous=byActor.get(key),version=await overviewVersion(db,monitorId),now=Date.now()
 if(previous&&previous.projectedAt<=now&&previous.expiresAt>now&&previous.version===version&&requestTag?.split(',').some(tag=>tag.trim().replace(/^W\//,'')===previous.etag)){
  return {unchanged:true,headers:headers(previous.etag,previous.expiresAt)} as const
 }
 return {unchanged:false,remember(projectedAt:number,expiresAt:number){
  const etag='"'+crypto.randomUUID()+'"'
  // Bound per-isolate state when consoles open many different monitor pages.
  if(byActor.size>=128){
   for(const [entry,value] of byActor)if(value.expiresAt<=now)byActor.delete(entry)
   if(byActor.size>=128)byActor.delete(byActor.keys().next().value!)
  }
  byActor.set(key,{etag,version,projectedAt,expiresAt})
  return headers(etag,expiresAt)
 }} as const
}
