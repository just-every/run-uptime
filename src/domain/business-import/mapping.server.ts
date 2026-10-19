import type {Bindings} from '../control.server.ts'
import {uptimeRobotImporter} from '../definitions/importers/uptimerobot.ts'
import {pingdomImporter} from '../definitions/importers/pingdom.ts'
import {betterStackHeartbeatImporter} from '../definitions/importers/betterstack-heartbeats.ts'
import {nativeImporter} from '../definitions/importers/native.ts'
import {HISTORY_SOURCE,type Importer} from '../definitions/importers/index.ts'
import {recogniseHistory} from '../definitions/history.ts'
import {planEntries,planState,type PlanEntry,type PlanItem,type PlanState} from '../definitions/plan.server.ts'
import {sha256} from '../../base/modules/import-kit/src/provenance/identity.ts'
import {assertNoCredentials,credentialQueryKey,decodedCredentialText} from '../../base/modules/import-kit/src/provenance/credentials.ts'
import type {ImportMapping,Json,MappingResult,ParsedRecord} from '../../base/modules/import-kit/src/types.ts'
import type {ImportDoorSource} from '../../base/modules/import-kit/src/door/types.ts'
import {DOOR_KEY} from './context.server.ts'
import {withholdValue} from '../definitions/withhold.ts'

/** The server-owned allow-list of door namespaces, shared by the grant mount and
 * the owner's move-in screen: one per vendor source, plus one per reviewed Uptime
 * definition file (`uptime.monitors:<uuid>`, a fresh namespace for each preview,
 * since a definition file is this installation's own source, not an account whose
 * lineage a catch-up follows). Each reuses Uptime's own reader for that source. */
type Source={importer:Importer|null;mapping:string;prefix:string}
const VENDORS:Record<string,Source>={
 uptimerobot:{importer:uptimeRobotImporter,mapping:'uptime-uptimerobot-definitions-v2',prefix:'uptimerobot'},
 pingdom:{importer:pingdomImporter,mapping:'uptime-pingdom-definitions-v1',prefix:'pingdom'},
 'betterstack-heartbeats':{importer:betterStackHeartbeatImporter,mapping:'uptime-betterstack-heartbeats-v1',prefix:'betterstack-heartbeats'},
 [HISTORY_SOURCE]:{importer:null,mapping:'uptime-uptimerobot-log-v1',prefix:HISTORY_SOURCE},
}
const DEFINITION_FILE=/^uptime\.monitors:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DEFINITION_SOURCE:Source={importer:nativeImporter,mapping:'uptime-definition-file-v1',prefix:'uptime-monitors'}
export function sourceOf(namespace:string):Source|null{
 if(Object.hasOwn(VENDORS,namespace))return VENDORS[namespace]
 return DEFINITION_FILE.test(namespace)?DEFINITION_SOURCE:null
}
export const UNCHANGED='Unchanged: Uptime already holds this definition.'

/** One NDJSON line of a bundle as source text. The move-in screen sends the owner's
 * whole file as one JSON string, exactly as chosen; Business sends saved pages. */
const lineText=(value:Json)=>typeof value==='string'?value:JSON.stringify(value)
const fallbackId=(line:number,index:number)=>`#${line}.${index}`
function sourceId(value:any,line:number,index:number,native:boolean){
 const id=native?undefined:value?.id
 return (typeof id==='string'&&id.trim()&&id.length<=256)||(typeof id==='number'&&Number.isSafeInteger(id)&&id>=0)?String(id):fallbackId(line,index)
}
/** Each entry of one bundle line, as the planner and the kit both see it. */
export function lineEntries(source:Source,value:Json,line:number):(PlanItem&{sourceId:string})[]{
 const importer=source.importer!
 return importer.entries(lineText(value)).map(entry=>({...entry,mapping:importer.map(entry),sourceId:sourceId(entry.value,line,entry.index,importer===nativeImporter)}))
}
export function historyRecord(value:Json){
 const history=recogniseHistory(lineText(value))
 if(!history)throw Error('This is not a recognised UptimeRobot log export.')
 return history
}
const credential=(value:unknown)=>{try{assertNoCredentials(value);return false}catch{return true}}
/** A field that names or carries a credential (an authorization header, a password, a URL with userinfo or a token
 * query) is withheld from what the kit retains. Uptime refuses such entries with their reason, read from the source
 * itself; no credential becomes durable import data. */
function withheld(value:Json):Json{
 if(Array.isArray(value))return value.map(withheld)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!credential({[key]:null})).map(([key,child])=>[key,withheld(child)]))
 return typeof value==='string'&&credential(value)?'[withheld]':value
}
/** A source record's payload as the kit retains and hashes it: its request secrets withheld, and any other credential-bearing
 * field or URL withheld as well. The move-in screen and command upload the withheld file, so this changes nothing for them. */
export const payloadOf=(value:Json):Json=>withheld(withholdValue(value))
/** The monitor a source record creates: stable for its namespace and source id. */
export const targetIdFor=(source:Source,namespace:string,id:string)=>`${source.prefix}-`+sha256(JSON.stringify([DOOR_KEY,namespace,id]))
/** The first value in a definition that the import kit reads as a credential, and where it is. */
function credentialAt(value:unknown,path:string[]):{path:string[];text?:string}|null{
 if(Array.isArray(value)){for(const [i,child] of value.entries()){const found=credentialAt(child,[...path,String(i)]);if(found)return found}return null}
 if(value&&typeof value==='object'){
  for(const [key,child] of Object.entries(value)){
   if(credential({[key]:null}))return {path:[...path,key]}
   const found=credentialAt(child,[...path,key]);if(found)return found
  }
  return null
 }
 return typeof value==='string'&&credential(value)?{path,text:value}:null
}
const CREDENTIAL_WORD=/token|secret|key|auth|signature|credential|password|cookie/i
/** Why the import door can never store this definition, in plain words, or null when it can. The import kit treats a URL
 * with a user name or password, or with a query parameter whose name contains key, token, auth, secret, password,
 * signature, credential or cookie (so “keyword” and “author” too), as a credential, and an import never stores one. Such an
 * entry is refused on its own; the rest of the file previews and applies. */
export function credentialRefusal(definition:unknown):string|null{
 if(!credential(definition))return null
 const found=credentialAt(definition,[])
 const path=(found?.path??[]).filter(part=>!/^\d+$/.test(part)),field=path.join('.'),place=field==='url'?'its URL':field?`its “${field.slice(0,60)}” value`:'it'
 const after='an import treats that as a credential and never stores it. Add or change this monitor in the editor instead.'
 if(!found?.text)return field?`its “${field.slice(0,60)}” field is named like a credential; ${after}`:`it carries a credential; ${after}`
 let url:URL|null=null
 try{url=new URL(found.text,'https://credential-check.invalid')}catch{/* Not a URL: described as a value below. */}
 if(url&&(url.username||url.password))return `${place} carries a user name or password; ${after}`
 const key=url&&[...url.search.slice(1).split('&'),...decodedCredentialText(url.search).slice(1).split('&')].map(pair=>pair.split('=')[0]).find(key=>credentialQueryKey(key))
 if(key!==undefined&&key!==null){const name=decodedCredentialText(key).slice(0,40),word=CREDENTIAL_WORD.exec(name)?.[0]??name
  return `${place} has a query parameter named “${name}”, which contains “${word}”; ${after}`}
 return `${place} reads as a credential; ${after}`
}
/** A read-only preview of an installation with no runner yet assumes the first one an apply establishes. */
export function planned(state:PlanState,source:Source,namespace:string,items:PlanItem[],requireRunner=true){
 return planEntries(state,items,{requireRunner,idFor:item=>targetIdFor(source,namespace,item.sourceId!),refusal:credentialRefusal})
}
function result(entry:PlanEntry):MappingResult{
 const unmapped=entry.differences.map(reason=>({reason}))
 if(entry.action==='refused'||entry.action==='unsupported')return {effects:[],rejection:entry.reason,unmapped}
 if(!entry.definition)return {effects:[],unmapped:[{reason:UNCHANGED},...unmapped]}
 return {effects:[{targetKind:'monitor',targetId:entry.monitorId!,value:entry.definition,...(entry.expectedRevision?{expectedRevision:entry.expectedRevision}:{})}],unmapped}
}
/** A fresh parser and mapping for a listed namespace, or null. The mapping plans the
 * whole bundle together, as the move-in screen always has: names, limits and flows
 * count across every entry. Parsing a bundle again starts a fresh plan. */
export async function importSource(env:Bindings,namespace:string):Promise<ImportDoorSource|null>{
 const source=sourceOf(namespace)
 if(!source)return null
 if(!source.importer)return {parse(value){const history=historyRecord(value);return {kind:'history',sourceId:'log',payload:{provenance:history.provenance,rows:history.rows,columns:history.columns}}},
  mapping:{version:source.mapping,map(record){const rows=Number((record.payload as any)?.rows);return {effects:[],unmapped:[{reason:`${rows.toLocaleString('en-US')} rows, provenance: UptimeRobot log export, not stored as evidence. History never becomes Uptime checks, incidents or uptime figures.`}]}}}}
 const state=await planState(env),items=new Map<string,PlanItem>()
 let entries:Map<string,PlanEntry>|null=null
 const mapping:ImportMapping={version:source.mapping,map(record){
  if(!entries){const list=[...items.values()],planned_=planned(state,source,namespace,list);entries=new Map(list.map((item,i)=>[item.sourceId!,planned_[i]]))}
  const entry=entries.get(record.sourceId)
  if(!entry)return {effects:[],rejection:'This record was not read from the uploaded source.'}
  return result(entry)
 }}
 return {mapping,parse(value:Json,line:number):ParsedRecord[]{
  if(line===0){items.clear();entries=null}
  return lineEntries(source,value,line).map(item=>{items.set(item.sourceId,item);return {kind:'monitor',sourceId:item.sourceId,payload:payloadOf(item.value),pointer:`/${line}/${item.index}`}})
 }}
}
