// PERF-001: the real-user beacon's public door. GET /rum/v1/s/<site>.js serves the beacon script for one registered, enabled site
// with that site's sampling and exclusions; POST /rum/v1/collect accepts one beacon, only from that site's registered origin, and
// adds it to anonymous hourly aggregates. Both paths are declared in seed.json and admitted by the public request limiter first.
// The door reads no cookie and sets none, stores no IP address (the limiter keeps only keyed hashes that expire), keeps no query
// string, fragment or identifier, drops bots and excluded paths (counting them), and never calls anything outside this Worker.
import type {Bindings} from '../control.server.ts'
// @ts-ignore Shared beacon rules (edition JavaScript).
import {RUM_LIMITS,BOT_AGENTS,validateBeacon} from './privacy.mjs'
import {beaconScript} from './beacon-script.ts'

const site=(env:Bindings,id:string)=>env.DB.prepare('SELECT * FROM rum_sites WHERE id=?').bind(id).first<any>()
const plain=(status:number,headers:Record<string,string>={})=>new Response(null,{status,headers:{'cache-control':'no-store',...headers}})
const geography=(request:Request)=>{
 const cf=(request as any).cf,country=cf?.country;
 const region=typeof country==='string'&&/^[A-Z]{2}$/.test(country)?country:'unknown';
 const code=cf?.regionCode;
 return {region,subdivision:region==='US'&&typeof code==='string'&&/^[A-Z]{2}$/.test(code)?code:''};
}

export async function rumDoor(env:Bindings,request:Request):Promise<Response>{
 const path=new URL(request.url).pathname,script=/^\/rum\/v1\/s\/([0-9a-f-]{36})\.js$/.exec(path)
 if(script){
  if(!['GET','HEAD'].includes(request.method))return plain(405,{allow:'GET, HEAD'})
  const row=await site(env,script[1])
  // A site that is not registered or not enabled gets a script that does nothing, so a pasted tag never errors.
  const body=row?.enabled?beaconScript({site:row.id,endpoint:`${env.UPTIME_ORIGIN}/rum/v1/collect`,samplePercent:row.sample_percent,excludedPaths:JSON.parse(row.excluded_paths)}):'/* Uptime real-user beacon: this site is not enabled. */\n'
  return new Response(request.method==='HEAD'?null:body,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}})
 }
 if(path!=='/rum/v1/collect')return plain(404)
 const origin=request.headers.get('origin')??''
 if(request.method==='OPTIONS')return plain(204,{allow:'POST, OPTIONS'})
 if(request.method!=='POST')return plain(405,{allow:'POST, OPTIONS'})
 // The body is read to its bound and no further.
 const reader=request.body?.getReader();let size=0,text=''
 if(reader){const decoder=new TextDecoder('utf-8',{fatal:true});try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>RUM_LIMITS.bodyBytes){await reader.cancel();return plain(413)}text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}catch{return plain(400)}}
 let beacon:any
 try{beacon=validateBeacon(JSON.parse(text))}catch{return plain(400)}
 const row=await site(env,beacon.site)
 // Only the registered origin of an enabled site; anything else learns nothing and gets no CORS answer.
 if(!row||!row.enabled||origin!==row.origin)return plain(403)
 const cors={'access-control-allow-origin':row.origin,vary:'origin'},hour=Math.floor(Date.now()/3600000)*3600000
 const dropped=BOT_AGENTS.test(request.headers.get('user-agent')??'')?'bot':JSON.parse(row.excluded_paths).some((prefix:string)=>beacon.route.startsWith(prefix))?'excluded':null
 if(dropped){
  await env.DB.prepare('INSERT INTO rum_dropped(site_id,hour,reason,count) VALUES(?,?,?,1) ON CONFLICT(site_id,hour,reason) DO UPDATE SET count=count+1').bind(row.id,hour,dropped).run()
  return plain(204,cors)
 }
 const n=(value:number|null)=>value===null?0:1,v=(value:number|null)=>value??0
 const {region,subdivision}=geography(request)
 const aggregate=env.DB.prepare(`INSERT INTO rum_aggregates(site_id,hour,route,device,region,views,failed_views,known_views,errors,lcp_n,lcp_sum,lcp_poor,cls_n,cls_milli_sum,inp_n,inp_sum,ttfb_n,ttfb_sum)
  VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(site_id,hour,route,device,region) DO UPDATE SET views=views+1,failed_views=failed_views+excluded.failed_views,known_views=known_views+excluded.known_views,
  errors=errors+excluded.errors,lcp_n=lcp_n+excluded.lcp_n,lcp_sum=lcp_sum+excluded.lcp_sum,lcp_poor=lcp_poor+excluded.lcp_poor,cls_n=cls_n+excluded.cls_n,cls_milli_sum=cls_milli_sum+excluded.cls_milli_sum,
  inp_n=inp_n+excluded.inp_n,inp_sum=inp_sum+excluded.inp_sum,ttfb_n=ttfb_n+excluded.ttfb_n,ttfb_sum=ttfb_sum+excluded.ttfb_sum`)
  .bind(row.id,hour,beacon.route,beacon.device,region,Number(beacon.status==='failed'),Number(beacon.status!=='unknown'),beacon.errors,n(beacon.lcpMs),v(beacon.lcpMs),Number((beacon.lcpMs??0)>RUM_LIMITS.poorLcpMs),
   n(beacon.cls),Math.round(v(beacon.cls)*1000),n(beacon.inpMs),v(beacon.inpMs),n(beacon.ttfbMs),v(beacon.ttfbMs))
 // Counts combine equal anonymous values. Keep these and the legacy sums in one
 // transaction, so failures cannot leave mismatched reporting denominators.
 const values:Record<string,number|null>={status:beacon.status==='unknown'?0:beacon.status==='failed'?2:1,errors:beacon.errors,lcpMs:beacon.lcpMs,cls:beacon.cls===null?null:Math.round(beacon.cls*1000),inpMs:beacon.inpMs}
 const frequencies=Object.entries(values).filter(([,value])=>value!==null).map(([metric,value])=>env.DB.prepare(`INSERT INTO rum_value_counts(site_id,hour,route,device,region,subdivision,metric,value,count)
  VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(site_id,hour,route,device,region,subdivision,metric,value) DO UPDATE SET count=count+1`)
  .bind(row.id,hour,beacon.route,beacon.device,region,subdivision,metric,value))
 await env.DB.batch([aggregate,...frequencies])
 return plain(204,cors)
}
