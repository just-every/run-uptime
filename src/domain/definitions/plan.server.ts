// @ts-ignore checked by family policy tests
import {validateDefinition} from '../policy.mjs'
import {grants,MONITOR_LIMIT,type Bindings} from '../control.server.ts'
import {assignRunners,type Runner} from '../runner-registration.server.ts'
import {externalCheck,externalCheckMode,type ExternalCheck} from '../external-check.server.ts'
// @ts-ignore Edition flow vocabulary is JavaScript shared with the runner.
import {FLOW_LIMITS} from '../flow.mjs'
import {COMPARED_FIELDS,canonical,sha256} from './format.ts'
// @ts-ignore Shared catalog recognition; edition JavaScript.
import {followedMappingOf,followedPart} from '../service-catalog/match.mjs'
import type {Mapping,SourceEntry} from './importers/index.ts'

export type Action='create'|'unchanged'|'change'|'refused'|'unsupported'
export type PlanEntry={index:number;label:string;action:Action;name?:string;reason?:string;monitorId?:string;revision?:number;
 /** The import door's expected target revision for a change: the import's own revision, or the native one. */
 expectedRevision?:string;changes?:{field:string;from:unknown;to:unknown}[];differences:string[];definition?:any}
type Marker={kit_revision:string;native_revision:number;retired:number}
/** Everything the planner reads, read once. Planning itself is synchronous and writes nothing. */
export type PlanState={local:number[];monitors:{id:string;revision:number;definition:any}[];runners:Runner[];first:string|null;
 tokens:Set<string>;external:ExternalCheck;markers:Map<string,Marker>;demo:boolean;origin?:string;
 /** DEPENDENCY-002: the catalog parts this installation follows, and the monitors that follow them. */
 followed:{parts:Set<string>;monitors:Set<string>}}
export type PlanItem=SourceEntry&{mapping:Mapping;sourceId?:string}

export const RELEASED='Imported before and released by undo or erasure; it stays in Uptime as its own monitor. Erase that monitor to import it again.'
export const NO_RUNNER='Open Locations to set up this installation’s first location before importing.'
const compared=(definition:any)=>canonical(Object.fromEntries(COMPARED_FIELDS.map(k=>[k,definition[k]])))
const storedView=(definition:any,local:number[])=>{try{return compared(validateDefinition(definition,local))}catch{return compared(definition)}}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
const message=(error:unknown)=>error instanceof Error?error.message:'Invalid definition'

export async function planState(env:Bindings):Promise<PlanState>{
 const [stored,registered,tokens,external,markers,followed]=await Promise.all([
  env.DB.prepare('SELECT id,revision,definition FROM monitors ORDER BY rowid').all<any>(),
  env.DB.prepare('SELECT * FROM runners ORDER BY registered_at,runner_id').all<Runner>(),
  liveHeartbeatTokens(env),externalCheck(env),
  env.DB.prepare('SELECT monitor_id,kit_revision,native_revision,retired FROM uptime_business_import_targets').all<any>(),
  env.DB.prepare('SELECT monitor_id,entry_id,scope,component_key FROM followed_services').all<any>(),
 ])
 const runners=registered.results
 return {local:grants(env),monitors:stored.results.map(r=>({id:r.id as string,revision:r.revision as number,definition:JSON.parse(r.definition)})),
  runners,first:(runners.find(r=>r.legacy_key)??runners[0])?.runner_id??null,tokens,external,
  markers:new Map(markers.results.map(m=>[m.monitor_id,{kit_revision:m.kit_revision,native_revision:m.native_revision,retired:m.retired}])),
  demo:env.RER_DEMO==='1',origin:env.UPTIME_ORIGIN,
  followed:{parts:new Set(followed.results.map(row=>followedPart(row))),monitors:new Set(followed.results.map(row=>row.monitor_id as string))}}
}

/** One source file's plan against the installation, in file order: each entry creates, changes or leaves one monitor,
 * or says why it is refused or unsupported. An entry matches the monitor its source record created before (`idFor`),
 * otherwise the monitor with its name. A monitor an earlier import released is never taken over. Without a registered
 * runner a read-only preview assumes the first one saving would create; an import refuses instead. */
export function planEntries(state:PlanState,items:PlanItem[],{idFor,requireRunner,refusal}:{idFor?:(item:PlanItem)=>string;requireRunner?:boolean;
 /** Why a definition this plan would write can never be stored, or null: such an entry is refused with that reason. */
 refusal?:(definition:any)=>string|null}={}):PlanEntry[]{
 const {local,monitors}=state
 const runners=state.runners.length||requireRunner?state.runners:[{runner_id:'self-first-runner',registered_at:0,network_label:'owner-network',key_ciphertext:null,legacy_key:1,revoked_at:null,last_contact_at:null} as Runner]
 const first=state.first??(runners[0]?.runner_id??null)
 const byName=new Map<string,typeof monitors>()
 for(const m of monitors){const name=String(m.definition.name);byName.set(name,[...(byName.get(name)??[]),m])}
 const seen=new Map<string,string>(),entries:PlanEntry[]=[],following=new Set<string>(state.followed.parts);let creates=0,flowCreates=0
 const flows=monitors.filter(m=>m.definition.type==='flow').length
 // Browser runs cost minutes of runner time, so an installation holds a few flows. The count includes this file's own creates.
 const flowRoom=(definition:any,replacing:boolean)=>definition.type!=='flow'||replacing||flows+flowCreates<FLOW_LIMITS.maxFlowsPerInstallation
 const assign=(definition:any,input:any)=>assignRunners(runners,first!,definition,input,state.external,!state.demo,state.origin)
 for(const item of items){
  const {index,label,mapping}=item
  const differences=[...('differences' in mapping?mapping.differences??[]:[])]
  if('refused' in mapping){entries.push({index,label,action:'refused',reason:mapping.refused,differences});continue}
  if('unsupported' in mapping){entries.push({index,label,action:'unsupported',reason:mapping.unsupported,differences});continue}
  const input:any=mapping.definition
  let normalized:any
  try{normalized=validateDefinition({...input,enabled:false,maintenanceUntil:0,maintenanceWindows:[]},local)}catch(error){entries.push({index,label,action:'refused',reason:`${label}: ${message(error)}`,differences:[]});continue}
  const name=normalized.name
  if(seen.has(name)){entries.push({index,label,name,action:'refused',reason:`${label}: duplicate name; ${seen.get(name)} already uses “${name}”.`,differences});continue}
  seen.set(name,label)
  const id=idFor?.(item),own=id===undefined?undefined:monitors.find(m=>m.id===id)
  const matches=own?[own]:byName.get(name)??[]
  if(own&&(byName.get(name)??[]).some(m=>m.id!==own.id)){entries.push({index,label,name,action:'refused',reason:`${label}: a monitor with this name already exists. Review it in Settings › Backup and files before importing a separate source.`,differences});continue}
  if(matches.length>1){entries.push({index,label,name,action:'refused',reason:`${label}: ${matches.length} monitors in this installation are named “${name}”. Rename them in the console first.`,differences});continue}
  if(!matches.length){
   if(!first){entries.push({index,label,name,action:'refused',reason:`${label}: ${NO_RUNNER}`,differences});continue}
   if(monitors.length+creates>=MONITOR_LIMIT){entries.push({index,label,name,action:'refused',reason:`${label}: monitor limit reached (an installation holds at most ${MONITOR_LIMIT} monitors).`,differences});continue}
   if(!flowRoom(normalized,false)){entries.push({index,label,name,action:'refused',reason:`${label}: flow monitor limit reached (an installation runs at most ${FLOW_LIMITS.maxFlowsPerInstallation} flows).`,differences});continue}
   let definition
   try{definition=assign(normalized,{})}catch(error){entries.push({index,label,name,action:'refused',reason:`${label}: ${message(error)}`,differences});continue}
   const refused=refusal?.(definition);if(refused){entries.push({index,label,name,action:'refused',reason:`${label}: ${refused}`,differences});continue}
   // DEPENDENCY-002: one monitor follows each catalog part; a second never becomes an unfollowed copy.
   const part=followedMappingOf(definition)
   if(part&&following.has(followedPart(part))){entries.push({index,label,name,action:'refused',reason:`${label}: this installation already follows that catalog part. Review it on its followed service's monitor page.`,differences});continue}
   if(part)following.add(followedPart(part))
   if(input.enabled===true)differences.push('The file marks this monitor enabled; files never enable monitors, so it arrives paused.')
   creates++;if(normalized.type==='flow')flowCreates++;entries.push({index,label,name,action:'create',...(id?{monitorId:id}:{}),differences,definition});continue
  }
  const current=matches[0],before=storedView(current.definition,local),after=compared(normalized),marker=state.markers.get(current.id)
  if(typeof input.enabled==='boolean'&&input.enabled!==current.definition.enabled)differences.push(`The file marks this monitor ${input.enabled?'enabled':'paused'}; it stays ${current.definition.enabled?'enabled':'paused'} because files never change that.`)
  if(input.maintenanceWindows!==undefined&&JSON.stringify(input.maintenanceWindows)!==JSON.stringify(current.definition.maintenanceWindows??[]))differences.push('The file lists planned maintenance; files never change maintenance schedules.');
  if(input.maintenanceUntil!==undefined&&input.maintenanceUntil!==(current.definition.maintenanceUntil??0))differences.push('The file sets a different maintenance end; the monitor keeps its current maintenance.')
  // A monitor this source record imported stays its target even when unchanged, so a catch-up keeps the same target set.
  const imported=Boolean(own&&marker&&!marker.retired),unchanged=same(before,after)
  if(unchanged&&!imported){entries.push({index,label,name,action:'unchanged',monitorId:current.id,revision:current.revision,differences});continue}
  if(!first){entries.push({index,label,name,action:'refused',reason:`${label}: ${NO_RUNNER}`,differences});continue}
  if(marker?.retired){entries.push({index,label,name,action:'refused',reason:`${label}: ${RELEASED}`,differences});continue}
  if(!flowRoom(normalized,current.definition.type==='flow')){entries.push({index,label,name,action:'refused',reason:`${label}: flow monitor limit reached (an installation runs at most ${FLOW_LIMITS.maxFlowsPerInstallation} flows).`,differences});continue}
  // A file never carries the installation-local external check: the monitor keeps following Settings, or keeps its own URL.
  const mode=externalCheckMode(current.definition,state.external.legacyUrl)
  const kept={...normalized,enabled:current.definition.enabled,maintenanceUntil:current.definition.maintenanceUntil??0,...(current.definition.maintenanceWindows?{maintenanceWindows:current.definition.maintenanceWindows}:{}),...(mode?{externalCheck:mode}:{})}
  const token=tokenNote(current.definition,kept,state.tokens.has(current.id)).trim();if(token)differences.push(token)
  let definition
  try{definition=assign(kept,{assignments:keptAssignments(current.definition,kept)})}catch(error){entries.push({index,label,name,action:'refused',reason:`${label}: ${message(error)}`,differences});continue}
  const refused=refusal?.(definition);if(refused){entries.push({index,label,name,action:'refused',reason:`${label}: ${refused}`,differences});continue}
  if(followedMappingOf(definition)&&!state.followed.monitors.has(current.id))differences.push('This changes an existing monitor, which stays an ordinary monitor and does not become a followed service. Follow the provider from the catalog to receive dependency notices.')
  if(normalized.type==='flow'&&current.definition.type!=='flow')flowCreates++
  entries.push({index,label,name,action:unchanged?'unchanged':'change',monitorId:current.id,revision:current.revision,
   expectedRevision:marker&&marker.native_revision===current.revision?marker.kit_revision:`native:${current.revision}`,differences,definition,
   changes:COMPARED_FIELDS.filter(k=>!same(before[k],after[k])).map(field=>({field,from:before[field],to:after[field]}))})
 }
 return entries
}
export function planCounts(entries:{action:Action}[]){
 const counts={create:0,unchanged:0,change:0,refused:0,unsupported:0} as Record<Action,number>
 for(const e of entries)counts[e.action]++
 return counts
}
/** The digest a reviewed preview names: its source, the installation's monitor count and each entry's outcome. */
export async function planDigest(source:string,monitorCount:number,entries:PlanEntry[]){
 return sha256(JSON.stringify(canonical({plan:'uptime.definitions',version:2,source,monitors:monitorCount,
  entries:entries.map(e=>({index:e.index,action:e.action,monitorId:e.action==='create'?null:e.monitorId??null,revision:e.revision??null,definition:e.definition?compared(e.definition):null,enabled:e.definition?.enabled??null,reason:e.reason??null}))})))
}
// Monitors whose heartbeat token is live: issued for the monitor's current revision.
export async function liveHeartbeatTokens(env:Bindings){return new Set((await env.DB.prepare('SELECT a.monitor_id FROM heartbeat_authority a JOIN monitors m ON m.id=a.monitor_id AND m.revision=a.revision').all<any>()).results.map(r=>r.monitor_id as string))}
// A file never carries or rotates a heartbeat token, so a heartbeat that stays a heartbeat keeps it. A token changes only
// with the monitor's type: leaving heartbeat retires it, becoming one needs a new one.
export function tokenNote(current:any,next:any,live:boolean){
 if(current.type==='heartbeat'&&next.type!=='heartbeat'&&live)return ' This retires its heartbeat token: pings from your jobs are refused afterwards.'
 if(current.type!=='heartbeat'&&next.type==='heartbeat')return ' This makes it a heartbeat with no token: issue one on the monitor page and point your jobs at it.'
 return ''
}
// A change keeps the monitor's installation-local runner assignments and canaries for the probes it still uses.
export function keptAssignments(current:any,next:any){return Object.fromEntries(Object.entries(current.assignments??{}).filter(([probe])=>next.probes.includes(probe)))}
