import {publicLimits,publicPath,type PublicPath} from './public-paths.ts'
import type {AuthBindings} from './operator-auth.server.ts'
import {storageOperation,classifyStorage,storageLogLine} from './storage-error.ts'

const windowMs=60_000,hourMs=60*windowMs
// Only Cloudflare's trusted edge header supplies hosted client identity. A
// missing/malformed header cannot mint unlimited buckets. Never trust XFF.
export function publicClientIdentity(env:Pick<AuthBindings,'UPTIME_LOCAL_REVIEW'>,request:Request):string {
 if(env.UPTIME_LOCAL_REVIEW==='true')return 'loopback'
 const ip=request.headers.get('cf-connecting-ip')??''
 if(/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(ip)&&ip.split('.').every(part=>Number(part)<=255))return ip
 if(ip.includes(':')&&/^[\da-f:.]+$/i.test(ip)){
  try{return new URL(`http://[${ip}]/`).hostname.slice(1,-1)}catch{}
 }
 return 'unknown'
}
async function clientHash(env:AuthBindings,request:Request){
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('Missing or invalid SESSION_SECRET')
 const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const bytes=await crypto.subtle.sign('HMAC',key,encoder.encode(`uptime-public-rate-limit:v1:${publicClientIdentity(env,request)}`))
 return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('')
}
// Keep each minute independent, even if concurrent requests reach D1 out of
// order across a minute boundary. Include any counter from before the upgrade.
function metricsCounter(db:AuthBindings['DB'],hash:string,windowStart:number,limit:number){
 const hourStart=Math.floor(windowStart/hourMs)*hourMs
 const minutePath='$.m'+(windowStart-hourStart)/windowMs
 return db.prepare(`WITH quota(remaining) AS (
   SELECT ?5-COALESCE((SELECT request_count FROM public_rate_limits
    WHERE class='metrics' AND client_hash=?2 AND window_start=?4),0)
  )
  INSERT INTO metrics_rate_hours(hour_start,client_hash,minute_counts,request_limit)
  SELECT ?1,?2,json_set('{}',?3,1),?5 FROM quota WHERE remaining>0
  ON CONFLICT(hour_start,client_hash) DO UPDATE SET request_limit=excluded.request_limit,
   minute_counts=json_set(minute_counts,?3,COALESCE(json_extract(minute_counts,?3),0)+1)
  WHERE COALESCE(json_extract(minute_counts,?3),0)<(SELECT remaining FROM quota)
  RETURNING 1 AS admitted`).bind(hourStart,hash,minutePath,windowStart,limit)
}
/** Returns 429 at the class limit, 503 if counting is unavailable, else null. */
export async function limitPublicRequest(env:AuthBindings,request:Request,declaration:PublicPath|undefined=publicPath(new URL(request.url).pathname,env.UPTIME_LOCAL_REVIEW==='true')):Promise<Response|null>{
 if(!declaration)return null
 const now=Date.now(),windowStart=Math.floor(now/windowMs)*windowMs,expiresAt=windowStart+windowMs,limit=publicLimits[declaration.class]
 // D1 executes this admission as one statement. At the boundary exactly one
 // concurrent request can increment limit-1; denied calls do not grow the row.
 const hash=await clientHash(env,request)
 let admitted:unknown
 try{
  const counter=declaration.class==='metrics'?metricsCounter(env.DB,hash,windowStart,limit):env.DB.prepare(`INSERT INTO public_rate_limits(class,client_hash,window_start,request_count,expires_at)
  VALUES(?,?,?,1,?) ON CONFLICT(class,client_hash,window_start) DO UPDATE SET request_count=request_count+1
  WHERE public_rate_limits.request_count<? RETURNING request_count`).bind(declaration.class,hash,windowStart,expiresAt,limit)
  admitted=await storageOperation('publicRateLimit.count',()=>counter.first())
 }catch(error){
  // A missing migration or unavailable D1 must close the public boundary,
  // including health; never admit an uncounted request or expose DB details.
  const fault=classifyStorage(error)
  console.error(fault?storageLogLine(request.method,declaration.path,fault):JSON.stringify({event:'storage_error',method:request.method,route:declaration.path,operation:'publicRateLimit.count',class:'other',status:503,cause:'not a D1 error'}))
  return Response.json({error:'Public request limiter unavailable',code:'storage_unavailable',retryable:true,class:fault?.class??'other',operation:'publicRateLimit.count'},{status:503,headers:{'retry-after':'5','cache-control':'no-store'}})
 }
 if(admitted)return null
 return Response.json({error:'Public request rate limit exceeded'},{status:429,headers:{'retry-after':String(Math.max(1,Math.ceil((expiresAt-now)/1000))),'cache-control':'no-store'}})
}
/** Cron may expire only these request counters, never product or audit data. */
export function cleanupPublicRateLimits(db:D1Database,now:number){
 return [
  db.prepare('DELETE FROM public_rate_limits WHERE expires_at<=?').bind(now),
  db.prepare('DELETE FROM metrics_rate_hours WHERE hour_start<=?').bind(now-hourMs),
 ]
}
