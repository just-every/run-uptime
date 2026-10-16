import {notificationReadiness,ensureNotificationCustody} from './notification-credentials.server.ts'
import {deploymentHealth} from '../base/deployment-health.ts'
import type {Bindings} from './control.server.ts'

const unavailable=()=>Response.json({error:'Health dependencies unavailable'},{status:503,headers:{'cache-control':'no-store'}})

// Include public admission in the budget: its D1 write can stall before the
// health handler is reached. Allow a global 3 s readiness budget for remote D1
// round trips. D1 has no cancellation API; the deadline bounds
// the response, not a claim that the underlying operation was cancelled.
export async function boundedHealth(operation:()=>Promise<Response>):Promise<Response>{
 let timer:ReturnType<typeof setTimeout>|undefined
 try{return await Promise.race([operation(),new Promise<Response>(resolve=>{timer=setTimeout(()=>resolve(unavailable()),3000)})])}
 catch{return unavailable()}
 finally{clearTimeout(timer)}
}

// This installation depends on D1 and emitted static assets. It has no R2 or
// queue binding. Runner contact and external providers have separate evidence.
export async function health(env:Bindings){
 try{
 const [schema,,assets]=await Promise.all([
  notificationReadiness(env).then(()=>true,()=>false),
  env.DB.prepare('SELECT 1 FROM monitors LIMIT 1').first(),
  emittedAssets(env),
 ])
 if(!schema)return Response.json({error:'Notification schema upgrade required'},{status:503,headers:{'cache-control':'no-store'}})
 if(!assets)return unavailable()
 // Preserve the first-health upgrade seal. Individual unavailable credentials
 // stay isolated; a storage failure must not be reported as healthy.
 await ensureNotificationCustody(env,{validate:false})
 return Response.json({status:'ok',...deploymentHealth(env)},{headers:{'cache-control':'no-store'}})
 }catch{return unavailable()}
}

async function emittedAssets(env:Bindings){
 if(!env.ASSETS)return false
 const asset=await env.ASSETS.fetch(new Request(new URL('/app.js',env.UPTIME_ORIGIN)))
 if(!asset.ok||!/javascript/.test(asset.headers.get('content-type')??'')){await asset.body?.cancel();return false}
 return (await asset.arrayBuffer()).byteLength>0
}
