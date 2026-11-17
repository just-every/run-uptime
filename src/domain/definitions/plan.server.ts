// @ts-ignore checked by family policy tests
import {validateDefinition} from '../policy.mjs'
import {grants,MONITOR_LIMIT,type Bindings} from '../control.server.ts'
import {assignRunners,type Runner} from '../runner-registration.server.ts'
import {externalCheck,externalCheckMode,type ExternalCheck} from '../external-check.server.ts'
// @ts-ignore Edition flow vocabulary is JavaScript shared with the runner.
import {FLOW_LIMITS} from '../flow.mjs'
import {COMPARED_FIELDS,canonical,sha256,suppliedLeaves,SCHEMA_NOTES,captureOf} from './format.ts'
// @ts-ignore Shared catalog recognition; edition JavaScript.
import {followedMappingOf,followedPart} from '../service-catalog/match.mjs'
import type {Mapping,SourceEntry} from './importers/index.ts'

export type Action='create'|'unchanged'|'change'|'refused'|'unsupported'
export type SourceReport={sourceKind:string;sourceId:string;sourcePath?:string;companionOf?:string;schemaNotes?:string[]}
export type PlanEntry=Partial<SourceReport>&{index:number;label:string;action:Action;name?:string;reason?:string;monitorId?:string;revision?:number;
 /** The import door's expected target revision for a change: the import's own revision, or the native one. */
 expectedRevision?:string;changes?:{field:string;from:unknown;to:unknown}[];differences:string[];definition?:any}
type Marker={kit_revision:string;native_revision:number;retired:number}
/** Everything the planner reads, read once. Planning itself is synchronous and writes nothing. */
export type PlanState={local:number[];monitors:{id:string;revision:number;definition:any}[];runners:Runner[];first:string|null;
 tokens:Set<string>;external:ExternalCheck;markers:Map<string,Marker>;demo:boolean;origin?:string;
 /** DEPENDENCY-002: the catalog parts this installation follows, and the monitors that follow them. */
 followed:{parts:Set<string>;monitors:Set<string>}}
export type PlanItem=SourceEntry&{mapping:Mapping;sourceId?:string;report?:SourceReport}

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
 return entries.map((entry,i)=>({...items[i].report,...entry}))
}
export function planCounts(entries:{action:Action}[]){
 const counts={create:0,unchanged:0,change:0,refused:0,unsupported:0} as Record<Action,number>
 for(const e of entries)counts[e.action]++
 return counts
}
/** The digest a reviewed preview names: its source, the installation's monitor count and each entry's outcome. */
export async function planDigest(source:string,monitorCount:number,entries:PlanEntry[]){
 return sha256(JSON.stringify(canonical({plan:'uptime.definitions',version:2,source,monitors:monitorCount,
  entries:entries.map(e=>({index:e.index,sourceId:e.sourceId??null,action:e.action,monitorId:e.action==='create'?null:e.monitorId??null,revision:e.revision??null,definition:e.definition?compared(e.definition):null,enabled:e.definition?.enabled??null,reason:e.reason??null}))})))
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

export type FieldDisposition={path:string;disposition:string;reason:string;sourceId?:string;target?:string}
const FIELD_TARGETS:Record<string,string>={tags:'tags','type/ping':'ICMP type (explicit adapter convention)',id:'source identity',name:'name',hostname:'protocol host / URL',resolution:'intervalMs',status:'paused creation; existing local state retained',sendnotificationwhendown:'confirmSlots',responsetime_threshold:'slow.thresholdMs (non-outage Slow)',
 'type/http/url':'url','type/http/port':'url port','type/http/encryption':'url scheme','type/http/verify_certificate':'tlsTrust','type/http/ssl_down_days_before':'separate TLS monitor',
 'type/http/shouldcontain':'assertions.bodyIncludes','type/http/shouldnotcontain':'assertions.bodyExcludes','type/tcp/port':'tcp.port','type/tcp/stringtoexpect':'tcp.bannerIncludes',
 'type/smtp/port':'mail.port','type/smtp/encryption':'mail.security (inferred TLS mode)','type/dns/nameserver':'dns.nameserver (TCP 53)','type/dns/expectedip':'dns.expect (includes)',
}
/** A report contains paths and fixed explanations only, never source values. Unknown keys are explicit unsupported leaves.
 * Empty arrays/objects count as leaves; companion monitors share a source but never double-count its fields. */
export function fieldReport(documents:unknown[],entries:PlanEntry[]){
 const records=entries.filter(e=>!e.companionOf),containers:{path:string;disposition:string;reason:string}[]=[],fields:FieldDisposition[]=[]
 for(const [documentIndex,doc] of documents.entries()){
  const root=documents.length===1?'':`/documents/${documentIndex}`
  const visit=(value:any,path:string)=>{if(value&&typeof value==='object'){containers.push({path:path||'/',disposition:'accounted',reason:'Container and nested records accounted for by their exact descendant field dispositions; no unlisted operative mapping.'});for(const [key,child] of Object.entries(value))visit(child,path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'))}}
  visit(doc,root)
  for(const path of suppliedLeaves(doc)){
   const fullPath=root+path,owner=records.filter(e=>e.sourcePath!==undefined&&(fullPath===e.sourcePath||fullPath.startsWith(e.sourcePath+'/'))).sort((a,b)=>b.sourcePath!.length-a.sourcePath!.length)[0]
   const parts=path.split('/').slice(1).map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~')),value=parts.reduce((v:any,k)=>v?.[k],doc)
   const base={path:root+path,...(owner?.sourceId?{sourceId:owner.sourceId}:{})}
   if(typeof value==='string'&&value.includes('[withheld]')){fields.push({...base,disposition:'withheld',reason:'Secret or executable payload withheld before upload; local review/re-entry required.'});continue}
   if(owner){
    if(['refused','unsupported'].includes(owner.action)){fields.push({...base,disposition:owner.action,reason:owner.reason??'This source record has no imported target.'});continue}
    const relative=fullPath.slice(owner.sourcePath!.length+1),target=FIELD_TARGETS[relative]??(/^tags\/\d+\/name$/.test(relative)?'tags':undefined)
    if(target){const lossy=['status','sendnotificationwhendown','responsetime_threshold','type/http/verify_certificate','type/http/ssl_down_days_before','type/smtp/encryption','type/dns/expectedip','type/dns/nameserver'].includes(relative)
     fields.push({...base,disposition:lossy?'lossy':'mapped',target,reason:lossy?`Reviewed adapter difference: ${target}. Source semantics are not claimed equivalent.`:`Mapped to ${target}.`});continue}
   }
   const metadata=/^\/(format|source|synthetic|seed|capturedAt|scope|schemaNotes)(\/|$)/.test(path)||/^\/records\/\d+\/(id|kind|sourceId|request|pagination)(\/|$)/.test(path)
   fields.push({...base,disposition:metadata?'metadata':'unsupported',reason:metadata?'Capture provenance only; grants no authority and changes no product state.':'No adapter mapping for this supplied field; it is not carried into an operative monitor, route or source history.'})
  }
 }
 const summary=Object.fromEntries(['mapped','lossy','withheld','metadata','unsupported','refused'].map(key=>[key,fields.filter(f=>f.disposition===key).length]))
 const captures=documents.filter((doc:any)=>doc?.format==='uptime.incumbent-capture.v1') as any[]
 const captureRows=captures.flatMap(doc=>captureOf(JSON.stringify(doc))!.rows)
 const recordLedger=captures.length?captureRows.map(row=>{const entry=records.find(e=>e.sourcePath!==undefined&&(row.path===e.sourcePath||row.path.startsWith(e.sourcePath+'/')));return {path:row.path,kind:row.kind,sourceId:entry?.sourceId,disposition:entry?.action??'unsupported',reason:entry?.reason??'Source metadata only; no operative mapping.'}}):records.map(e=>({sourceId:e.sourceId,path:e.sourcePath,kind:e.sourceKind,disposition:e.action,reason:e.reason??'Reviewed monitor definition; creation is paused and local operational state is preserved.'}))
 const uniqueChecks=new Set<string>()
 for(const doc of captures)for(const record of doc.records){
  if(record.kind==='check-detail')uniqueChecks.add('uptime:'+record.sourceId)
  if(record.kind==='checks-list')for(const check of record.response.checks)uniqueChecks.add('uptime:'+check.id)
  if(record.kind==='tms-detail')uniqueChecks.add('tms:'+record.sourceId)
  if(record.kind==='tms-list')for(const check of record.response.checks)uniqueChecks.add('tms:'+check.id)
 }
 return {version:1,counts:{sourceChecks:captures.length?uniqueChecks.size:records.length,sourceRecords:recordLedger.length,nativeEntries:captures.length?entries.filter(e=>e.sourceKind==='check-detail').length:entries.length,tlsCompanions:entries.filter(e=>e.companionOf).length,leaves:fields.length},summary,
  records:recordLedger,
  captures:captures.flatMap(doc=>doc.records.map((r:any,i:number)=>({path:`/records/${i}`,kind:r.kind,disposition:'accounted',reason:'Every resource leaf is listed below; request/provenance metadata grants no authority.'}))),
  schemaNotes:captures.length?SCHEMA_NOTES:[],containers,fields}
}
