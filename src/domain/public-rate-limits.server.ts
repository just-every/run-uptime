import {publicLimits,publicPath,type PublicPath} from './public-paths.ts'
import type {AuthBindings} from './operator-auth.server.ts'

const windowMs=60_000
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
/** Returns 429 at the class limit, 503 if counting is unavailable, else null. */
export async function limitPublicRequest(env:AuthBindings,request:Request,declaration:PublicPath|undefined=publicPath(new URL(request.url).pathname,env.UPTIME_LOCAL_REVIEW==='true')):Promise<Response|null>{
 if(!declaration)return null
 const now=Date.now(),windowStart=Math.floor(now/windowMs)*windowMs,expiresAt=windowStart+windowMs,limit=publicLimits[declaration.class]
 // D1 executes this admission as one statement. At the boundary exactly one
 // concurrent request can increment limit-1; denied calls do not grow the row.
 const hash=await clientHash(env,request)
 let admitted:unknown
 try{
  admitted=await env.DB.prepare(`INSERT INTO public_rate_limits(class,client_hash,window_start,request_count,expires_at)
  VALUES(?,?,?,1,?) ON CONFLICT(class,client_hash,window_start) DO UPDATE SET request_count=request_count+1
  WHERE public_rate_limits.request_count<? RETURNING request_count`).bind(declaration.class,hash,windowStart,expiresAt,limit).first()
 }catch{
  // A missing migration or unavailable D1 must close the public boundary,
  // including health; never admit an uncounted request or expose DB details.
  return Response.json({error:'Public request limiter unavailable'},{status:503,headers:{'cache-control':'no-store'}})
 }
 if(admitted)return null
 return Response.json({error:'Public request rate limit exceeded'},{status:429,headers:{'retry-after':String(Math.max(1,Math.ceil((expiresAt-now)/1000))),'cache-control':'no-store'}})
}
/** Cron may expire only these request counters, never product or audit data. */
export async function cleanupPublicRateLimits(env:Pick<AuthBindings,'DB'>,now=Date.now()){
 return env.DB.prepare('DELETE FROM public_rate_limits WHERE expires_at<=?').bind(now).run()
}
