import {MONITOR_LIMIT,type Bindings} from '../control.server.ts'
import {assignRunners,type Runner} from '../runner-registration.server.ts'
import {externalCheckUrl} from '../external-check.server.ts'
import {dnsCache,ProbeError} from '../worker-dns.server.ts'
import {SubrequestBudget} from '../worker-budget.ts'
// @ts-ignore Shared destination and flow validation.
import {publicTarget} from '../public-target.mjs'
// @ts-ignore Shared flow capacity.
import {FLOW_LIMITS} from '../flow.mjs'
import {canonical,sha256} from '../definitions/format.ts'

export type Monitor={id:string;revision:number;definition:any;nextDue:number;storedState:any}
export async function catalogContext(env:Bindings){
 const [rows,runners,external]=await Promise.all([
  env.DB.prepare('SELECT * FROM monitors ORDER BY id').all<any>(),
  env.DB.prepare('SELECT * FROM runners ORDER BY registered_at,runner_id').all<Runner>(),externalCheckUrl(env)])
 const monitors:Monitor[]=rows.results.map(row=>({id:row.id,revision:row.revision,definition:JSON.parse(row.definition),nextDue:row.next_due,storedState:JSON.parse(row.state)}))
 return {monitors,runners:runners.results,external}
}
export type Context=Awaited<ReturnType<typeof catalogContext>>
export function checkDependencies(definition:any,context:Context,id?:string){
 for(const dependency of definition.dependencies??[]){
  if(dependency===id)throw Error('A monitor cannot depend on itself.')
  if(!context.monitors.some(m=>m.id===dependency))throw Error('A dependency monitor does not exist in this installation.')
 }
}
// Assignment checks are pure in preview. An uninitialised installation is refused, never represented by a fake runner.
export function assigned(env:Bindings,context:Context,definition:any,input:any={}){
 const first=context.runners.find(r=>r.legacy_key)
 if(!first)throw Error('No location is set up. Open Locations before adding monitors.')
 return assignRunners(context.runners,first.runner_id,definition,input,context.external,env.RER_DEMO!=='1',env.UPTIME_ORIGIN)
}
export function publicChecks(){
 const resolve=dnsCache(),budget=new SubrequestBudget(40),allowance=budget.reserve(40)!
 return async(definition:any)=>{
  if(definition.network!=='public'||!['http','keyword','flow'].includes(definition.type))return
  const urls=[definition.url,...(definition.type==='flow'?definition.flow.origins??[]:[]),...Object.values(definition.assignments??{}).map((a:any)=>a.canaryUrl).filter(Boolean)]
  try{await Promise.all(urls.map(url=>resolve(publicTarget(url),AbortSignal.timeout(5000),allowance)))}catch(error){
   if(error instanceof ProbeError&&error.category==='network')throw Error('The target or external check resolves to a private, loopback or link-local address.')
   if(error instanceof ProbeError&&error.category==='unresolved')throw Error('The target or external check has no public DNS address.')
   if(error instanceof Error&&error.message==='Scheduled run subrequest budget exhausted')throw Error('Public DNS verification reached this request’s outbound limit. Split the input into smaller batches.')
   throw Error('Public DNS validation could not be completed. Nothing for this row can be created until validation succeeds.')
  }
 }
}
export function quota(context:Context,creates:number){return {limit:MONITOR_LIMIT,used:context.monitors.length,available:Math.max(0,MONITOR_LIMIT-context.monitors.length),creates,after:context.monitors.length+creates,inputRowLimit:500,flowLimit:FLOW_LIMITS.maxFlowsPerInstallation}}
export function capacity(context:Context,creates:number,flowCreates:number,definition:any){
 if(context.monitors.length+creates>=MONITOR_LIMIT)throw Error(`Monitor quota reached: this installation holds at most ${MONITOR_LIMIT} monitors.`)
 if(definition.type==='flow'&&context.monitors.filter(m=>m.definition.type==='flow').length+flowCreates>=FLOW_LIMITS.maxFlowsPerInstallation)throw Error('Flow monitor quota reached.')
}
export const reason=(error:unknown)=>error instanceof Error?error.message:'Invalid monitor.'
export const same=(a:any,b:any)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
export async function digestFor(context:Context,input:any,source:string,entries:any[]){
 return sha256(JSON.stringify(canonical({kind:'uptime.catalog',version:1,source,input,
  monitors:context.monitors.map(m=>({id:m.id,revision:m.revision,definition:m.definition})),
  runners:context.runners.map(r=>({id:r.runner_id,label:r.network_label,revokedAt:r.revoked_at,legacy:r.legacy_key,capabilities:r.capabilities})),external:context.external,entries})))
}
