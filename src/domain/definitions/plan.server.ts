// @ts-ignore checked by family policy tests
import {validateDefinition} from '../policy.mjs'
import {grants,MONITOR_LIMIT,type Bindings} from '../control.server.ts'
import {assignRunners,type Runner} from '../runner-registration.server.ts'
import {externalCheckUrl} from '../external-check.server.ts'
// @ts-ignore Edition flow vocabulary is JavaScript shared with the runner.
import {FLOW_LIMITS} from '../flow.mjs'
import {COMPARED_FIELDS,canonical,sha256} from './format.ts'
import type {Mapping,SourceEntry} from './importers/index.ts'

export type Action='create'|'unchanged'|'change'|'refused'|'unsupported'
export type PlanEntry={index:number;label:string;action:Action;name?:string;reason?:string;monitorId?:string;revision?:number;changes?:{field:string;from:unknown;to:unknown}[];differences:string[];definition?:any}
export type Plan={source:string;digest:string;counts:Record<Action,number>;entries:PlanEntry[];monitorCount:number}

const compared=(definition:any)=>canonical(Object.fromEntries(COMPARED_FIELDS.map(k=>[k,definition[k]])))
const storedView=(definition:any,local:number[])=>{try{return compared(validateDefinition(definition,local))}catch{return compared(definition)}}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
const message=(error:unknown)=>error instanceof Error?error.message:'Invalid definition'

// Read-only: the installation is only read. The same function runs again at apply, and the digest of its result must
// equal the digest the owner previewed.
export async function planDefinitions(env:Bindings,source:string,items:(SourceEntry&{mapping:Mapping})[]):Promise<Plan>{
 const local=grants(env)
 const monitors=(await env.DB.prepare('SELECT id,revision,definition FROM monitors ORDER BY rowid').all<any>()).results.map(r=>({id:r.id as string,revision:r.revision as number,definition:JSON.parse(r.definition)}))
 const registered=(await env.DB.prepare('SELECT * FROM runners ORDER BY registered_at,runner_id').all<Runner>()).results
 const tokens=await liveHeartbeatTokens(env),external=await externalCheckUrl(env)
 // Before the console first loads there may be no runner row yet; saving creates it, previewing must not.
 const runners=registered.length?registered:[{runner_id:'self-first-runner',registered_at:0,network_label:'owner-network',key_ciphertext:null,legacy_key:1,revoked_at:null,last_contact_at:null}]
 const first=(runners.find(r=>r.legacy_key)??runners[0]).runner_id
 const byName=new Map<string,typeof monitors>()
 for(const m of monitors){const name=String(m.definition.name);byName.set(name,[...(byName.get(name)??[]),m])}
 const seen=new Map<string,string>(),entries:PlanEntry[]=[];let creates=0,flowCreates=0
 const flows=monitors.filter(m=>m.definition.type==='flow').length
 // Browser runs cost minutes of runner time, so an installation holds a few flows. The count includes this file's own creates.
 const flowRoom=(definition:any,replacing:boolean)=>definition.type!=='flow'||replacing||flows+flowCreates<FLOW_LIMITS.maxFlowsPerInstallation
 for(const {index,label,mapping} of items){
  const differences=[...('differences' in mapping?mapping.differences??[]:[])]
  if('refused' in mapping){entries.push({index,label,action:'refused',reason:mapping.refused,differences});continue}
  if('unsupported' in mapping){entries.push({index,label,action:'unsupported',reason:mapping.unsupported,differences});continue}
  const input:any=mapping.definition
  let normalized:any
  try{normalized=validateDefinition({...input,enabled:false,maintenanceUntil:0},local)}catch(error){entries.push({index,label,action:'refused',reason:`${label}: ${message(error)}`,differences:[]});continue}
  const name=normalized.name
  if(seen.has(name)){entries.push({index,label,name,action:'refused',reason:`${label}: duplicate name; ${seen.get(name)} already uses “${name}”.`,differences});continue}
  seen.set(name,label)
  const matches=byName.get(name)??[]
  if(matches.length>1){entries.push({index,label,name,action:'refused',reason:`${label}: ${matches.length} monitors in this installation are named “${name}”. Rename them in the console first.`,differences});continue}
  if(!matches.length){
   if(monitors.length+creates>=MONITOR_LIMIT){entries.push({index,label,name,action:'refused',reason:`${label}: monitor limit reached (an installation holds at most ${MONITOR_LIMIT} monitors).`,differences});continue}
   if(!flowRoom(normalized,false)){entries.push({index,label,name,action:'refused',reason:`${label}: flow monitor limit reached (an installation runs at most ${FLOW_LIMITS.maxFlowsPerInstallation} flows).`,differences});continue}
   try{assignRunners(runners,first,normalized,{},external)}catch(error){entries.push({index,label,name,action:'refused',reason:`${label}: ${message(error)}`,differences});continue}
   if(input.enabled===true)differences.push('The file marks this monitor enabled; files never enable monitors, so it arrives paused.')
   creates++;if(normalized.type==='flow')flowCreates++;entries.push({index,label,name,action:'create',differences,definition:normalized});continue
  }
  const current=matches[0],before=storedView(current.definition,local),after=compared(normalized)
  if(typeof input.enabled==='boolean'&&input.enabled!==current.definition.enabled)differences.push(`The file marks this monitor ${input.enabled?'enabled':'paused'}; it stays ${current.definition.enabled?'enabled':'paused'} because files never change that.`)
  if(input.maintenanceUntil!==undefined&&input.maintenanceUntil!==(current.definition.maintenanceUntil??0))differences.push('The file sets a different maintenance end; the monitor keeps its current maintenance.')
  if(same(before,after)){entries.push({index,label,name,action:'unchanged',monitorId:current.id,revision:current.revision,differences});continue}
  if(!flowRoom(normalized,current.definition.type==='flow')){entries.push({index,label,name,action:'refused',reason:`${label}: flow monitor limit reached (an installation runs at most ${FLOW_LIMITS.maxFlowsPerInstallation} flows).`,differences});continue}
  if(normalized.type==='flow'&&current.definition.type!=='flow')flowCreates++
  const definition={...normalized,enabled:current.definition.enabled,maintenanceUntil:current.definition.maintenanceUntil??0}
  const token=tokenNote(current.definition,definition,tokens.has(current.id)).trim();if(token)differences.push(token)
  try{assignRunners(runners,first,definition,{assignments:keptAssignments(current.definition,definition)},external)}catch(error){entries.push({index,label,name,action:'refused',reason:`${label}: ${message(error)}`,differences});continue}
  entries.push({index,label,name,action:'change',monitorId:current.id,revision:current.revision,differences,definition,
   changes:COMPARED_FIELDS.filter(k=>!same(before[k],after[k])).map(field=>({field,from:before[field],to:after[field]}))})
 }
 const counts={create:0,unchanged:0,change:0,refused:0,unsupported:0} as Record<Action,number>
 for(const e of entries)counts[e.action]++
 const digest=await sha256(JSON.stringify(canonical({plan:'uptime.definitions',version:1,source,monitors:monitors.length,
  entries:entries.map(e=>({index:e.index,action:e.action,monitorId:e.monitorId??null,revision:e.revision??null,definition:e.definition?compared(e.definition):null,enabled:e.definition?.enabled??null,reason:e.reason??null}))})))
 return {source,digest,counts,entries,monitorCount:monitors.length}
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
