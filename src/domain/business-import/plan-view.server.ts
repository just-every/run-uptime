import {Buffer} from 'node:buffer'
import type {Bindings} from '../control.server.ts'
import {definitionView} from '../definitions/index.server.ts'
import {planState,type PlanEntry} from '../definitions/plan.server.ts'
import {sha256} from '../../base/modules/import-kit/src/provenance/identity.ts'
import type {DoorSnapshot} from '../../base/modules/import-kit/src/door/types.ts'
import {DOOR_KEY} from './context.server.ts'
import {historyRecord,lineEntries,planned,sourceOf} from './mapping.server.ts'

const status=(message:string,code:number)=>Object.assign(Error(message),{status:code})
/** The move-in screen's preview of a plan the import door holds: its counts and each entry,
 * read from the door's retained snapshot and upload. It writes nothing. Each entry's outcome
 * is the door's (a catch-up keeps unchanged records and refuses conflicts); the details beside
 * it are Uptime's planner reading the same source against the installation. */
export async function doorPlanView(env:Bindings,planId:string){
 const row=await env.DB.prepare('SELECT id,namespace,bundle_sha256,fingerprint,snapshot_hash,complete FROM ik_door_plans WHERE id=? AND installation_id=?')
  .bind(planId,DOOR_KEY).first<{id:string;namespace:string;bundle_sha256:string;fingerprint:string;snapshot_hash:string;complete:number}>()
 const source=row&&sourceOf(row.namespace)
 if(!row||!row.complete||!source)throw status('Import plan not found',404)
 const chunks=(await env.DB.prepare('SELECT body FROM ik_door_plan_chunks WHERE plan_id=? ORDER BY ordinal').bind(row.id).all<{body:string}>()).results
 const text=chunks.map(chunk=>chunk.body).join('')
 if(!chunks.length)throw status('This import plan was withdrawn by an erasure.',410)
 if(sha256(text)!==row.snapshot_hash)throw status('Import plan custody changed.',409)
 const snapshot=JSON.parse(text) as DoorSnapshot
 const upload=await env.DB.prepare('SELECT id,total_chunks,bundle_sha256 FROM ik_door_uploads WHERE installation_id=? AND namespace=? AND bundle_sha256=? ORDER BY rowid LIMIT 1')
  .bind(DOOR_KEY,row.namespace,row.bundle_sha256).first<{id:string;total_chunks:number;bundle_sha256:string}>()
 const parts=upload?(await env.DB.prepare('SELECT base64 FROM ik_door_chunks WHERE upload_id=? ORDER BY ordinal').bind(upload.id).all<{base64:string}>()).results:[]
 if(!upload||parts.length!==upload.total_chunks)throw status('This import’s source was withdrawn by an erasure.',410)
 const bytes=Buffer.concat(parts.map(part=>Buffer.from(part.base64,'base64')))
 if(sha256(bytes)!==row.bundle_sha256)throw status('Import source custody changed.',409)
 const lines:any[]=bytes.toString('utf8').split('\n').filter((line:string)=>line.trim()).map((line:string)=>JSON.parse(line))
 const plan={planId:row.id,namespace:row.namespace}
 if(!source.importer){const history=historyRecord(lines[0]);return {...history,...plan,digest:row.fingerprint}}
 const items=lines.flatMap((value:any,line:number)=>lineEntries(source,value,line)),state=await planState(env)
 const decided=new Map(snapshot.plan.entries.map(entry=>[entry.source.sourceId,entry]))
 const entries=planned(state,source,row.namespace,items).map((entry,i):PlanEntry=>{
  const door=decided.get(items[i].sourceId)
  if(door?.rejection&&!['refused','unsupported'].includes(entry.action))return {index:entry.index,label:entry.label,name:entry.name,action:'refused',reason:door.rejection,differences:entry.differences}
  if(door&&!door.rejection&&!door.effects.length&&['create','change'].includes(entry.action))return {index:entry.index,label:entry.label,name:entry.name,action:'unchanged',monitorId:entry.monitorId,revision:entry.revision,differences:entry.differences}
  return entry
 })
 return {...await definitionView(source.importer,entries,state.monitors.length,row.fingerprint),...plan}
}
