import {Buffer} from 'node:buffer'
import {randomUUID} from 'node:crypto'
import type {Bindings} from '../control.server.ts'
import {definitionView,recogniseSource} from '../definitions/index.server.ts'
import {recogniseHistory} from '../definitions/history.ts'
import {HISTORY_SOURCE} from '../definitions/importers/index.ts'
import {withholdText} from '../definitions/withhold.ts'
import {planState,type PlanEntry,type PlanItem} from '../definitions/plan.server.ts'
import {canonicalJson,sha256} from '../../base/modules/import-kit/src/provenance/identity.ts'
import type {DoorSnapshot} from '../../base/modules/import-kit/src/door/types.ts'
import {DOOR_KEY} from './context.server.ts'
import {historyRecord,lineEntries,payloadOf,planned,sourceOf} from './mapping.server.ts'

const status=(message:string,code:number)=>Object.assign(Error(message),{status:code})
type Decision={rejection?:string;effects:unknown[]}
/** Each entry's outcome is the door's (a catch-up keeps unchanged records and refuses conflicts); the details beside it
 * are Uptime's planner reading the same source against the installation. */
function doorEntries(entries:PlanEntry[],items:(PlanItem&{sourceId:string})[],decided:Map<string,Decision>){
 return entries.map((entry,i):PlanEntry=>{
  const door=decided.get(items[i].sourceId)
  if(door?.rejection&&!['refused','unsupported'].includes(entry.action))return {index:entry.index,label:entry.label,name:entry.name,action:'refused',reason:door.rejection,differences:entry.differences}
  if(door&&!door.rejection&&!door.effects.length&&['create','change'].includes(entry.action))return {index:entry.index,label:entry.label,name:entry.name,action:'unchanged',monitorId:entry.monitorId,revision:entry.revision,differences:entry.differences}
  return entry
 })
}
async function snapshotOf(env:Bindings,row:{id:string;snapshot_hash:string}){
 const chunks=(await env.DB.prepare('SELECT body FROM ik_door_plan_chunks WHERE plan_id=? ORDER BY ordinal').bind(row.id).all<{body:string}>()).results
 if(!chunks.length)return null
 const text=chunks.map(chunk=>chunk.body).join('')
 if(sha256(text)!==row.snapshot_hash)throw status('Import plan custody changed.',409)
 return JSON.parse(text) as DoorSnapshot
}
/** The move-in screen's preview of a plan the import door holds: its counts and each entry,
 * read from the door's retained snapshot and upload. It writes nothing. */
export async function doorPlanView(env:Bindings,planId:string){
 const row=await env.DB.prepare('SELECT id,namespace,bundle_sha256,fingerprint,snapshot_hash,complete FROM ik_door_plans WHERE id=? AND installation_id=?')
  .bind(planId,DOOR_KEY).first<{id:string;namespace:string;bundle_sha256:string;fingerprint:string;snapshot_hash:string;complete:number}>()
 const source=row&&sourceOf(row.namespace)
 if(!row||!row.complete||!source)throw status('Import plan not found',404)
 const snapshot=await snapshotOf(env,row)
 if(!snapshot)throw status('This import plan was withdrawn by an erasure.',410)
 const upload=await env.DB.prepare('SELECT id,total_chunks,bundle_sha256 FROM ik_door_uploads WHERE installation_id=? AND namespace=? AND bundle_sha256=? ORDER BY rowid LIMIT 1')
  .bind(DOOR_KEY,row.namespace,row.bundle_sha256).first<{id:string;total_chunks:number;bundle_sha256:string}>()
 const parts=upload?(await env.DB.prepare('SELECT base64 FROM ik_door_chunks WHERE upload_id=? ORDER BY ordinal').bind(upload.id).all<{base64:string}>()).results:[]
 if(!upload||parts.length!==upload.total_chunks)throw status('This import’s source was withdrawn by an erasure.',410)
 const bytes=Buffer.concat(parts.map(part=>Buffer.from(part.base64,'base64')))
 if(sha256(bytes)!==row.bundle_sha256)throw status('Import source custody changed.',409)
 const lines:any[]=bytes.toString('utf8').split('\n').filter((line:string)=>line.trim()).map((line:string)=>JSON.parse(line))
 // Whether this plan already has an import job (the same file previewed again after its apply): only a plan without one
 // is cancelled; the door's undo of a plan with a job undoes that import.
 const applied=Boolean(await env.DB.prepare("SELECT 1 FROM ik_door_plans p WHERE p.id=? AND (p.job_id IS NOT NULL OR EXISTS(SELECT 1 FROM ik_jobs j WHERE j.operation_key='door:'||p.id))").bind(row.id).first())
 const plan={planId:row.id,namespace:row.namespace,applied}
 if(!source.importer){const history=historyRecord(lines[0]);return {...history,...plan,digest:row.fingerprint}}
 const items=lines.flatMap((value:any,line:number)=>lineEntries(source,value,line)),state=await planState(env)
 const decided=new Map<string,Decision>(snapshot.plan.entries.map(entry=>[entry.source.sourceId,entry]))
 return {...await definitionView(source.importer,doorEntries(planned(state,source,row.namespace,items),items,decided),state.monitors.length,row.fingerprint),...plan}
}
/** What the door would keep unchanged in a catch-up of `namespace`: each record its last import holds with the same
 * source content under the same mapping. Read-only. */
async function unchangedSinceImport(env:Bindings,namespace:string,mapping:string,items:(PlanItem&{sourceId:string})[]){
 const decided=new Map<string,Decision>()
 const head=await env.DB.prepare(`SELECT p.id,p.snapshot_hash FROM ik_door_namespaces n JOIN ik_door_plans p ON p.id=n.head_id
  WHERE n.installation_id=? AND n.namespace=? AND p.complete=1`).bind(DOOR_KEY,namespace).first<{id:string;snapshot_hash:string}>()
 const snapshot=head&&await snapshotOf(env,head)
 if(!snapshot||snapshot.plan.mappingVersion!==mapping)return decided
 const records=new Map(snapshot.records.map(record=>[canonicalJson([record.kind,record.sourceId]),record]))
 for(const item of items){
  const old=records.get(canonicalJson(['monitor',item.sourceId]))
  if(old&&(old.targets.length||old.explanation)&&old.sourceHash===sha256(canonicalJson(payloadOf(item.value))))decided.set(item.sourceId,{effects:[]})
 }
 return decided
}
/** The local command's read-only preview: the file with its request secrets withheld, planned exactly as the import door
 * plans it (each source record's own monitor, a registered runner, a catch-up's unchanged records), so the digest it
 * prints is the one `apply` reviews. It writes nothing; applying always goes through the door, which plans again. */
export async function previewDefinitions(env:Bindings,file:string,requested='auto'){
 const text=withholdText(file),recognised=recogniseSource(text,requested)
 if(recognised===HISTORY_SOURCE)return recogniseHistory(text)!
 const namespace=recognised==='uptime.monitors'?`uptime.monitors:${randomUUID()}`:recognised,source=sourceOf(namespace)!
 const items=lineEntries(source,text,0),state=await planState(env)
 const decided=await unchangedSinceImport(env,namespace,source.mapping,items)
 return definitionView(source.importer!,doorEntries(planned(state,source,namespace,items,state.runners.length>0),items,decided),state.monitors.length)
}
