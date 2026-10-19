import type {Bindings} from '../control.server.ts'
import type {AuditActor} from '../audit.server.ts'
import type {D1Sql} from '../../base/modules/import-kit/src/d1/types.ts'
import {retirementScope,scopeGuards,retirementWrites} from '../../base/modules/import-kit/src/d1/retirement-scope.ts'
import {finalGuard,readonlyChecks} from '../../base/modules/import-kit/src/d1/database.ts'
import {sha256} from '../../base/modules/import-kit/src/provenance/identity.ts'
import {BUSINESS_DESTINATION,DOOR_KEY} from './context.server.ts'
import {lineEntries,sourceOf} from './mapping.server.ts'
import {uploadBytes} from './custody.server.ts'

// A source record names the monitor by its target or, in each reader's own field, by name.
const named=(payload:any,name:string)=>[payload?.friendlyName,payload?.name,payload?.attributes?.name,payload?.check?.name].includes(name)
/** Whether an upload no plan reads could hold this monitor: it names it, or it cannot be read (incomplete or not a
 * source the allow-list reads), so it cannot be shown not to. */
function uploadNames(namespace:string,bytes:Uint8Array|null,name:string){
 const source=sourceOf(namespace)
 if(!bytes||!source)return true
 try{
  const lines=new TextDecoder('utf-8',{fatal:true}).decode(bytes).split('\n').filter(line=>line.trim()).map(line=>JSON.parse(line))
  if(!source.importer)return lines.some(line=>JSON.stringify(line).includes(name))
  return lines.some((value,line)=>lineEntries(source,value,line).some(entry=>named(entry.value,name)))
 }catch{return true}
}
/** The door custody an erasure of this monitor reaches: every namespace whose plan names it, and every upload no plan
 * reads (an abandoned or interrupted preview) that names it or cannot be read. */
export async function businessErasureScope(env:Bindings,id:string,name:string){
 const plans=(await env.DB.prepare('SELECT id,namespace,job_id,snapshot_hash FROM ik_door_plans WHERE complete=1').all<any>()).results
 const namespaces=new Set<string>()
 for(const plan of plans){
  const chunks=(await env.DB.prepare('SELECT body FROM ik_door_plan_chunks WHERE plan_id=? ORDER BY ordinal').bind(plan.id).all<{body:string}>()).results
  const text=chunks.map(chunk=>chunk.body).join('')
  if(sha256(text)!==plan.snapshot_hash)throw Error('Business import custody changed; erasure was not applied.')
  const snapshot=JSON.parse(text)
  if(snapshot.plan.entries.some((entry:any)=>entry.effects.some((effect:any)=>effect.targetId===id)||named(entry.source.payload,name)))namespaces.add(plan.namespace)
 }
 const orphans=(await env.DB.prepare(`SELECT id,namespace FROM ik_door_uploads u WHERE installation_id=? AND NOT EXISTS(SELECT 1 FROM ik_door_plans p
  WHERE p.installation_id=u.installation_id AND p.namespace=u.namespace AND p.bundle_sha256=u.bundle_sha256 AND p.complete=1) ORDER BY rowid`).bind(DOOR_KEY).all<{id:string;namespace:string}>()).results
 const uploads:string[]=[]
 for(const upload of orphans)if(!namespaces.has(upload.namespace)&&uploadNames(upload.namespace,await uploadBytes(env,upload.id),name))uploads.push(upload.id)
 return {namespaces:[...namespaces],uploads}
}

/** A source export is an indivisible original. Erasing one of its monitors
 * retires that move's custody and undo, while peer native monitors stay intact. */
export async function eraseBusinessCustody(env:Bindings,id:string,actor:AuditActor,version:number,namespaces:string[],native:D1PreparedStatement[],checkpoint:D1PreparedStatement[]){
 const selected=JSON.stringify(namespaces),sql=(sql:string,...params:unknown[]):D1Sql=>({sql,params})
 const jobs=(await env.DB.prepare(`SELECT j.namespace FROM ik_jobs j JOIN ik_door_plans p ON p.job_id=j.id
  WHERE p.namespace IN(SELECT value FROM json_each(?))`).bind(selected).all<{namespace:string}>()).results.map(row=>row.namespace)
 const scope=await retirementScope(env.DB,BUSINESS_DESTINATION,jobs)
 const cleanup=[
  sql(`UPDATE uptime_business_import_targets SET retired=1 WHERE monitor_id IN(SELECT target_id FROM ik_provenance
   WHERE job_id IN(SELECT job_id FROM ik_door_plans WHERE namespace IN(SELECT value FROM json_each(?))))`,selected),
  sql('DELETE FROM uptime_business_import_targets WHERE monitor_id=?',id),
  sql('DELETE FROM uptime_business_import_writes WHERE monitor_id=?',id),
  sql('DELETE FROM ik_door_chunks WHERE upload_id IN(SELECT id FROM ik_door_uploads WHERE namespace IN(SELECT value FROM json_each(?)))',selected),
  sql('DELETE FROM ik_door_uploads WHERE namespace IN(SELECT value FROM json_each(?))',selected),
  sql('DELETE FROM ik_door_plan_chunks WHERE plan_id IN(SELECT id FROM ik_door_plans WHERE namespace IN(SELECT value FROM json_each(?)))',selected),
  sql('DELETE FROM ik_door_approvals WHERE plan_id IN(SELECT id FROM ik_door_plans WHERE namespace IN(SELECT value FROM json_each(?)))',selected),
  sql('DELETE FROM ik_door_apply_failures WHERE plan_id IN(SELECT id FROM ik_door_plans WHERE namespace IN(SELECT value FROM json_each(?)))',selected),
  sql('DELETE FROM uptime_business_import_undos WHERE plan_id IN(SELECT id FROM ik_door_plans WHERE namespace IN(SELECT value FROM json_each(?)))',selected),
  sql('DELETE FROM ik_door_plans WHERE namespace IN(SELECT value FROM json_each(?))',selected),
  sql('DELETE FROM ik_door_namespaces WHERE namespace IN(SELECT value FROM json_each(?))',selected),
  sql('DELETE FROM ik_door_scopes WHERE namespace IN(SELECT value FROM json_each(?))',selected),
 ]
 const predicate=sql("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active' AND version=?)",actor.ref,version)
 const receipt=crypto.randomUUID(),at=new Date().toISOString(),retire=retirementWrites(scope,BUSINESS_DESTINATION,receipt,at)
 // The seed owns the door's additional stores. Compose Base's retirement SQL
 // with the native erasure, whose full-table count guards fence this discovery.
 // The generic Kit person-retirement helper intentionally refuses unscoped stores.
 const deleted=[...cleanup,...retire].filter(query=>/^DELETE FROM /i.test(query.sql))
 const stores=[]
 for(const query of deleted){const name=/^DELETE FROM (\w+)/i.exec(query.sql)![1];const result=await env.DB.prepare(query.sql.replace(/^DELETE FROM /i,'SELECT COUNT(*) AS n FROM ')).bind(...query.params??[]).first<{n:number}>();stores.push({store:name,rows:result?.n??0})}
 const prepare=(query:D1Sql)=>env.DB.prepare(query.sql).bind(...query.params??[])
 const journal=sql('INSERT INTO ik_d1_erasure_journal(id,destination,recorded_at,records_erased,jobs_retired,streams_retired,stores_json) VALUES(?,?,?,?,?,?,?)',receipt,BUSINESS_DESTINATION,at,0,scope.jobs.length,scope.anchors.length,JSON.stringify(stores))
 await env.DB.batch([prepare(finalGuard(predicate)),...readonlyChecks(scopeGuards(scope)).map(prepare),
  ...native,...cleanup.map(prepare),...retire.map(prepare),...checkpoint,prepare(journal),prepare(finalGuard(predicate))])
}
