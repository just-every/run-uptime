// @ts-ignore Shared monitor policy.
import {validateDefinition} from '../policy.mjs'
import {grants,type Bindings} from '../control.server.ts'
// @ts-ignore Shared public-target validation.
import {publicTarget} from '../public-target.mjs'
import {keptAssignments} from '../definitions/plan.server.ts'
import {addInput,bulkInput,csvInterval,metadata} from './input.ts'
import {assigned,capacity,catalogContext,checkDependencies,digestFor,publicChecks,quota,reason,same,type Context} from './context.server.ts'

export type CatalogEntry={index:number;label:string;action:'create'|'change'|'unchanged'|'duplicate'|'refused';selected?:boolean;name?:string;reason?:string;monitorId?:string;revision?:number;sourceMonitorId?:string;sourceRevision?:number;duplicateIndex?:number;definition?:any;differences:string[];changes?:{field:string;from:any;to:any}[]}
export type CatalogPlan={source:string;digest:string;context:Context;entries:CatalogEntry[];counts:Record<CatalogEntry['action'],number>&{excluded?:number};unsupported:string[]}
const checked=(input:any,env:Bindings)=>({...validateDefinition(input,grants(env)),...metadata(input)})
const canonicalUrl=(value:string)=>{const url=new URL(value);url.hostname=url.hostname.toLowerCase().replace(/\.$/,'');return url.href}
const defaultName=(url:URL)=>`${url.hostname}${url.pathname==='/'?'':url.pathname}`.slice(0,100)
async function finish(context:Context,input:any,source:string,entries:CatalogEntry[],unsupported:string[]):Promise<CatalogPlan>{
 const counts:CatalogPlan['counts']={create:0,change:0,unchanged:0,duplicate:0,refused:0,...(source.startsWith('catalog.add.')?{excluded:0}:{})}
 for(const entry of entries)if(entry.action==='create'&&entry.selected===false)counts.excluded!++;else counts[entry.action]++
 return {source,digest:await digestFor(context,input,source,entries),context,entries,counts,unsupported}
}
export async function planCatalogAdd(env:Bindings,input:any){
 const {rows,base,selected,enabled,unsupported}=addInput(input),context=await catalogContext(env),checkPublic=publicChecks(),entries:CatalogEntry[]=[]
 const urls=new Map<string,{monitorId?:string;index?:number;name:string}>()
 for(const monitor of context.monitors)if(monitor.definition.url&&['http','keyword','flow'].includes(monitor.definition.type))urls.set(canonicalUrl(monitor.definition.url),{monitorId:monitor.id,name:monitor.definition.name})
 let creates=0
 // Verify the selected rows first so an excluded row cannot consume their public-DNS allowance or quota.
 const ordered=[...rows.entries()].sort(([a],[b])=>Number(selected!==null&&!selected.has(a))-Number(selected!==null&&!selected.has(b)))
 for(const [index,row] of ordered){
  const label=`Row ${index+1}`
  const chosen=selected===null||selected.has(index)
  try{
   const values:any={...base,...row},url=publicTarget(values.url)
   if(values.interval!==undefined)values.intervalMs=csvInterval(values.interval)
   if(!['http','keyword'].includes(values.type))throw Error('Bulk URL add supports the http and keyword types. Create other monitor types with the monitor editor or definition import.')
   const definition=checked({...values,name:values.name??defaultName(url),url:url.href,network:'public',enabled,maintenanceUntil:0,
    assertions:values.keyword!==undefined?{status:200,bodyIncludes:values.keyword}:{status:200}},env)
   checkDependencies(definition,context)
   const key=canonicalUrl(definition.url),duplicate=urls.get(key)
   if(duplicate){entries.push({index,label,name:definition.name,action:'duplicate',selected:false,...(duplicate.monitorId?{monitorId:duplicate.monitorId}:{duplicateIndex:duplicate.index}),reason:duplicate.monitorId?'This canonical URL already has a monitor.':'This canonical URL is already selected in this input.',differences:[]});continue}
   if(chosen)capacity(context,creates,0,definition)
   const ready=assigned(env,context,definition)
   await checkPublic(ready)
   entries.push({index,label,name:definition.name,action:'create',selected:chosen,definition:ready,differences:[...unsupported]})
   if(chosen){urls.set(key,{index,name:definition.name});creates++}
  }catch(error){entries.push({index,label,action:'refused',selected:false,reason:reason(error),differences:[]})}
 }
 return finish(context,input,`catalog.add.${input.format}`,entries.sort((a,b)=>a.index-b.index),unsupported)
}
export async function planCatalogBulk(env:Bindings,input:any){
 const {ids,action,changes,enabled,unsupported}=bulkInput(input),context=await catalogContext(env),checkPublic=publicChecks(),entries:CatalogEntry[]=[]
 let creates=0,flowCreates=0
 for(const [index,id] of ids.entries()){
  const label=`Selection ${index+1}`,current=context.monitors.find(m=>m.id===id)
  if(!current){entries.push({index,label,action:'refused',monitorId:id,reason:'The selected monitor no longer exists.',differences:[]});continue}
  try{
   const clone=action==='clone',source=current.definition
   const raw=clone?{...source,...changes,name:`${source.name.slice(0,93)} (copy)`,enabled,maintenanceUntil:0,maintenanceWindows:[]}:{...source,...changes,...(action==='pause'?{enabled:false}:action==='resume'?{enabled:true}:{})}
   // Validation covers the whole definition; edits retain all current scheduling and request settings.
   const definition=checked(raw,env)
   checkDependencies(definition,context,clone?undefined:id)
   const ready=assigned(env,context,definition,{assignments:keptAssignments(source,definition)})
   const sourceFields=clone?{sourceMonitorId:id,sourceRevision:current.revision}:{monitorId:id,revision:current.revision}
   if(!clone&&same(source,ready)){entries.push({index,label,name:source.name,action:'unchanged',...sourceFields,differences:[]});continue}
   if(clone){capacity(context,creates,flowCreates,ready);await checkPublic(ready)}
   else if(action==='resume')await checkPublic(ready)
   const differences=[...unsupported,...(clone?['The source monitor and its revision, evidence and incident history are retained. The clone begins its own history. Maintenance schedules are not copied; plan them explicitly for the clone.',...(source.type==='heartbeat'?['No heartbeat token is copied; issue a new token for the clone.']:[]),...(source.request?['The request credential reference is copied, but its installation-local credential must be explicitly bound to the new monitor before it can check.']:[])]:[])]
   entries.push({index,label,name:ready.name,action:clone?'create':'change',...sourceFields,definition:ready,differences,
    ...(!clone?{changes:Object.keys({...source,...ready}).filter(field=>!same(source[field],ready[field])).map(field=>({field,from:source[field]??null,to:ready[field]??null}))}:{})})
   if(clone){creates++;if(ready.type==='flow')flowCreates++}
  }catch(error){entries.push({index,label,name:current.definition.name,monitorId:id,revision:current.revision,action:'refused',reason:reason(error),differences:[]})}
 }
 return finish(context,input,`catalog.${action}`,entries,unsupported)
}
const checks=(definition:any)=>definition.type==='heartbeat'?0:86400000/definition.intervalMs*definition.probes.length
export function catalogView(plan:CatalogPlan){
 const projected=new Map(plan.context.monitors.map(m=>[m.id,m.definition]))
 for(const entry of plan.entries)if(entry.action==='change')projected.set(entry.monitorId!,entry.definition)
 const creates=plan.entries.filter(e=>e.action==='create'&&e.selected!==false).map(e=>e.definition),all=[...projected.values(),...creates]
 const scheduled=all.reduce((sum,d)=>sum+(d.enabled?checks(d):0),0),configured=all.reduce((sum,d)=>sum+checks(d),0)
 return {kind:'catalog',source:plan.source,digest:plan.digest,counts:plan.counts,unsupported:plan.unsupported,quota:quota(plan.context,plan.counts.create),
  projectedChecksPerDay:scheduled,configuredChecksPerDay:configured,traffic:{scheduledChecksPerDay:scheduled,configuredChecksPerDay:configured,includesRetries:false,includesExternalChecks:false,note:'Scheduled target checks at the configured locations; retries, redirects, external checks and browser subrequests can add traffic.'},
  cost:{currency:'USD',status:'unpriced',amount:null,reason:'COST-001 pricing is not implemented. A USD estimate is unavailable.'},
  entries:plan.entries.map(({definition,...entry})=>({...entry,...(definition?{target:definition}:{})}))}
}
