import {listRunners} from './domain/runner-registration.server.ts'
import {checkerReporting} from './domain/checker-status.ts'
import {developmentTiming} from './domain/development-timing.ts'
// Local-only Worker entry. vite.config.ts loads it only for `vite dev`; the deployed main stays server.ts, and
// `rer build` refuses any output that contains the dev layer. It adds dev sign-in, personas and the Dev product name.
import worker from './server'
import {withDevIdentity} from './base/modules/operator-auth/dev/index.mjs'
import {authConfig,type AuthBindings} from './domain/operator-auth.server.ts'
import {publicPath} from './domain/public-paths.ts'
import type {Bindings} from './domain/control.server'
import {limitPublicRequest} from './domain/public-rate-limits.server.ts'
import {configurationResponse} from './domain/startup-config.mjs'
import {devPersonas} from './domain/dev-personas.ts'

// Uptime names its origin UPTIME_ORIGIN and marks a local runtime by UPTIME_LOCAL_REVIEW; the dev layer reads the common names.
const local=(env:AuthBindings)=>({...env,AUTH_ORIGIN:env.UPTIME_ORIGIN,AUTH_LOCAL:env.UPTIME_LOCAL_REVIEW})

const developmentWorker=withDevIdentity<AuthBindings,typeof worker>(worker,{bindings:local as (env:AuthBindings)=>AuthBindings,config:authConfig,personas:devPersonas})
const fetchDevelopment=async(request:Request<unknown,IncomingRequestCfProperties>,env:Bindings,execution:ExecutionContext)=>{
 const invalid=await configurationResponse(env);if(invalid)return invalid;
 const path=new URL(request.url).pathname;
 // Startup probes the app first, starts the checker, then waits for its authenticated contact.
 // Re-entering rer dev uses ordinary /health and cannot report ready for an abandoned checker.
 if(env.UPTIME_LOCAL_REVIEW==='true'&&path==='/health'&&new URL(request.url).searchParams.get('app')!=='1'){
  const runners=await listRunners(env),now=Date.now();
  if(!runners.some(r=>r.builtIn&&checkerReporting(r,now)))return Response.json({status:'checker_stopped',error:'This computer’s checker is not reporting. In Uptime’s folder, run rer dev --stop, then rer dev.'},{status:503,headers:{'cache-control':'no-store'}});
 }
 if(env.UPTIME_LOCAL_REVIEW==='true'&&path==='/login')return new Response(null,{status:303,headers:{location:'/signin?returnTo=%2Fapp','cache-control':'no-store'}});
 if(env.UPTIME_LOCAL_REVIEW==='true'&&publicPath(path,true)?.kind==='development-asset'){const limited=await limitPublicRequest(env,request);if(limited)return limited;return env.ASSETS?env.ASSETS.fetch(request):new Response('Not found',{status:404})}
 if(env.UPTIME_LOCAL_REVIEW==='true'&&['/__dev/personas','/auth/dev/enter'].includes(path)){const limited=await limitPublicRequest(env,request);if(limited)return limited}
 return developmentWorker.fetch(request,env,execution)
}
export default {...developmentWorker,fetch(request,env,execution){
 const path=new URL(request.url).pathname;
 return path.startsWith('/api/')||path.startsWith('/app')?developmentTiming(env,bindings=>fetchDevelopment(request,bindings,execution)):fetchDevelopment(request,env,execution);
}} satisfies ExportedHandler<Bindings>
