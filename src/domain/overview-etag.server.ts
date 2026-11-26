import {equalSignature} from '../base/modules/integrations/core/crypto.ts'
import {type Bindings} from './control.server.ts'
import {sign} from './runner-crypto.ts'
import {overviewRefreshMs} from './overview-refresh.server.ts'

const headers=(etag:string,expiresAt:number)=>({etag,'x-uptime-overview-ttl':String(Math.max(0,expiresAt-Date.now()))})

function* signedIntervals(requestTag:string|undefined){
 for(const tag of requestTag?.split(',')??[]){
  const match=/^(?:W\/)?"(\d{1,16})\.(\d{1,16})\.([0-9a-f]{64})"$/.exec(tag.trim())
  if(!match)continue
  const [,start,end,digest]=match
  const validFrom=Number(start),expiresAt=Number(end)
  if(!Number.isSafeInteger(validFrom)||!Number.isSafeInteger(expiresAt)||expiresAt<=validFrom||expiresAt-validFrom>overviewRefreshMs)continue
  yield {validFrom,expiresAt,digest,tag:`W/"${start}.${end}.${digest}"`}
 }
}

async function overviewVersion(db:D1Database,monitorId?:string){
 const filter=monitorId===undefined?'':' WHERE m.id=?'
 const monitors=db.prepare(`SELECT m.id,m.revision,m.next_due,g.generation,m.hosted_generation
    FROM monitors m LEFT JOIN evidence_generation g ON g.monitor_id=m.id${filter} ORDER BY m.rowid`)
 const state=await db.batch([
  monitorId===undefined?monitors:monitors.bind(monitorId),
  db.prepare('SELECT runner_id,network_label,registered_at,last_contact_at,revoked_at,capabilities,legacy_key FROM runners ORDER BY rowid'),
  db.prepare(`SELECT (SELECT last_contact_at FROM runner_contact WHERE id=1) AS contact,
    (SELECT at FROM cron_runs WHERE id=1) AS cron,
    (SELECT url FROM external_check WHERE id=1) AS external,
    (SELECT time_zone FROM notification_preferences WHERE singleton=1) AS zone,
    (SELECT value FROM bs_overrides WHERE field='display_name') AS name,
    (SELECT rev FROM bs_settings WHERE singleton=1) AS business,
    (SELECT rowid FROM uptime_audit ORDER BY rowid DESC LIMIT 1) AS audit`),
 ])
 return state.map(({results})=>results)
}

// A weak validator covers a bounded projection of the same state. The signed
// clock interval lets any authorized Worker revalidate it without rendering
// the overview again or retaining the original projection in memory.
export async function overviewValidator(env:Bindings,key:string,requestTag:string|undefined,monitorId?:string){
 const version=await overviewVersion(env.DB,monitorId)
 const signature=(validFrom:number,expiresAt:number)=>sign(env.SESSION_SECRET!,JSON.stringify([
  'uptime-overview-v1',env.RER_VERSION?.id,key,version,validFrom,expiresAt,
 ]))
 const now=Date.now()
 for(const {validFrom,expiresAt,digest,tag} of signedIntervals(requestTag)){
  if(validFrom>now||expiresAt<=now)continue
  if(equalSignature(digest,await signature(validFrom,expiresAt))){
   return {unchanged:true,headers:headers(tag,expiresAt)} as const
  }
 }
 return {unchanged:false,async issue(validFrom:number,expiresAt:number){
  return headers(`W/"${validFrom}.${expiresAt}.${await signature(validFrom,expiresAt)}"`,expiresAt)
 }} as const
}

// The list rechecks live status and alerts on every poll. Its signed interval
// controls only how often to refresh the rolling chart and last-check time.
export async function monitorListValidator(env:Bindings,key:string,requestTag:string|undefined,version:unknown,now:number,deadline:number){
 const content=JSON.stringify(['uptime-monitor-list-v1',env.RER_VERSION?.id,key,version])
 const signature=(start:number,end:number)=>sign(env.SESSION_SECRET!,JSON.stringify([content,start,end]))
 let steady=false
 for(const {validFrom,expiresAt,digest,tag} of signedIntervals(requestTag)){
  if(validFrom>now||!equalSignature(digest,await signature(validFrom,expiresAt)))continue
  if(expiresAt>now)return {unchanged:true,headers:headers(tag,Math.min(deadline,expiresAt))}
  steady=true
 }
 const end=now+overviewRefreshMs
 const tag=`W/"${now}.${end}.${await signature(now,end)}"`
 return {unchanged:false,headers:{...headers(tag,Math.min(deadline,end)),...(steady?{'x-uptime-overview-steady':'1'}:{})}}
}
