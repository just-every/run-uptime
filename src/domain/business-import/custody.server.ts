import {Buffer} from 'node:buffer'
import type {Bindings} from '../control.server.ts'
import {jsonValues} from '../definitions/format.ts'
import {liveRequestSecret} from './credential-shapes.ts'
import type {Json} from '../../base/modules/import-kit/src/types.ts'
import {DOOR_KEY} from './context.server.ts'

// What the import door keeps of an upload, besides its plans. An upload is held only while a plan of its namespace
// reads it: a cancelled, replaced or refused preview's upload goes with it, a repeated upload of the same bytes goes
// once its plan exists, and an upload that still carries a live request secret never stays at all.
export const DEFINITION_FILE_PREFIX='uptime.monitors:'
type Statement={sql:string;params:unknown[]}
const statement=(sql:string,...params:unknown[]):Statement=>({sql,params})
const run=(env:Bindings,statements:Statement[])=>statements.length?env.DB.batch(statements.map(s=>env.DB.prepare(s.sql).bind(...s.params))):Promise.resolve([])

/** A complete upload's bytes, or null while it is incomplete or gone. */
export async function uploadBytes(env:Bindings,id:string){
 const upload=await env.DB.prepare('SELECT total_chunks FROM ik_door_uploads WHERE id=? AND installation_id=?').bind(id,DOOR_KEY).first<{total_chunks:number}>()
 if(!upload)return null
 const parts=(await env.DB.prepare('SELECT base64 FROM ik_door_chunks WHERE upload_id=? ORDER BY ordinal').bind(id).all<{base64:string}>()).results
 return parts.length===upload.total_chunks?Buffer.concat(parts.map(part=>Buffer.from(part.base64,'base64'))):null
}
/** The JSON values a bundle line holds: a saved page itself, or each value of a file's text the move-in screen sends as one
 * JSON string. Text that is not JSON (a CSV log export) holds none. */
function lineValues(value:Json):Json[]{
 if(typeof value!=='string')return [value]
 if(!/^\s*[[{]/.test(value))return []
 try{return jsonValues(value,'file') as Json[]}catch{return []}
}
/** Whether a bundle still carries a live request secret (see liveRequestSecret): an upload rer's vendor export produced,
 * with its removal markers and the user names, plain headers and bodies it keeps, does not; nor does the text the move-in
 * screen uploads, whose request secrets Uptime has withheld. */
export function bundleCarriesSecrets(bytes:Uint8Array){
 let text:string
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return false}
 for(const line of text.split('\n')){
  if(!line.trim())continue
  let value:Json
  try{value=JSON.parse(line)}catch{continue}
  if(lineValues(value).some(liveRequestSecret))return true
 }
 return false
}
const unreferenced=`installation_id=? AND namespace=? AND NOT EXISTS(SELECT 1 FROM ik_door_plans p WHERE p.installation_id=ik_door_uploads.installation_id
 AND p.namespace=ik_door_uploads.namespace AND p.bundle_sha256=ik_door_uploads.bundle_sha256)`
function dropUploads(where:string,...params:unknown[]):Statement[]{
 return [statement(`DELETE FROM ik_door_chunks WHERE upload_id IN(SELECT id FROM ik_door_uploads WHERE ${where})`,...params),statement(`DELETE FROM ik_door_uploads WHERE ${where}`,...params)]
}
/** A namespace nothing holds any more leaves no row behind. */
function dropEmptyNamespace(namespace:string):Statement[]{
 return [statement(`DELETE FROM ik_door_namespaces WHERE installation_id=? AND namespace=? AND head_id IS NULL AND pending_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM ik_door_plans WHERE installation_id=? AND namespace=?)`,DOOR_KEY,namespace,DOOR_KEY,namespace),
  statement(`DELETE FROM ik_door_scopes WHERE installation_id=? AND namespace=? AND NOT EXISTS(SELECT 1 FROM ik_door_plans WHERE installation_id=? AND namespace=?)
  AND NOT EXISTS(SELECT 1 FROM ik_door_uploads WHERE installation_id=? AND namespace=?)
  AND NOT EXISTS(SELECT 1 FROM ik_door_namespaces WHERE installation_id=? AND namespace=?)`,DOOR_KEY,namespace,DOOR_KEY,namespace,DOOR_KEY,namespace,DOOR_KEY,namespace)]
}
/** Withdraws one upload no plan reads. */
export function withdrawUpload(env:Bindings,id:string,namespace:string){
 return run(env,[...dropUploads(`id=? AND ${unreferenced}`,id,DOOR_KEY,namespace),...dropEmptyNamespace(namespace)])
}
/** Withdraws an upload that still carries a request secret, whatever reads it: nothing may plan from it. */
export function withdrawSecretUpload(env:Bindings,id:string,namespace:string){
 return run(env,[...dropUploads('id=? AND installation_id=? AND namespace=?',id,DOOR_KEY,namespace),...dropEmptyNamespace(namespace)])
}
/** After a plan, its namespace holds one upload per planned bundle (the one the preview reads) and nothing else. */
export function settleNamespace(env:Bindings,namespace:string){
 return run(env,[...dropUploads(unreferenced,DOOR_KEY,namespace),
  ...dropUploads(`installation_id=? AND namespace=? AND rowid>(SELECT MIN(u.rowid) FROM ik_door_uploads u WHERE u.installation_id=ik_door_uploads.installation_id
   AND u.namespace=ik_door_uploads.namespace AND u.bundle_sha256=ik_door_uploads.bundle_sha256)`,DOOR_KEY,namespace)])
}
/** After a plan is cancelled, its upload goes unless another plan reads the same bytes, and so does a namespace left empty. */
export function afterCancel(env:Bindings,namespace:string,bundle:string){
 return run(env,[...dropUploads(`bundle_sha256=? AND ${unreferenced}`,bundle,DOOR_KEY,namespace),...dropEmptyNamespace(namespace)])
}
/** A namespace no plan holds (an abandoned definition-file preview) keeps none of its uploads. */
export function dropAbandoned(env:Bindings,namespace:string){
 return run(env,[...dropUploads(unreferenced,DOOR_KEY,namespace),...dropEmptyNamespace(namespace)])
}
/** Records when a door batch was undone, once, for its history. */
export function recordUndo(env:Bindings,planId:string){
 return env.DB.prepare('INSERT OR IGNORE INTO uptime_business_import_undos(plan_id,undone_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM ik_door_plans WHERE id=? AND installation_id=?)').bind(planId,Date.now(),planId,DOOR_KEY).run()
}
/** Every other definition-file namespace: a newer preview of a definition file replaces their unapplied previews. */
export async function otherDefinitionFiles(env:Bindings,namespace:string){
 const pending=(await env.DB.prepare(`SELECT n.namespace,p.id FROM ik_door_namespaces n JOIN ik_door_plans p ON p.id=n.pending_id
  WHERE n.installation_id=? AND substr(n.namespace,1,?)=? AND n.namespace<>? AND p.job_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM ik_jobs j WHERE j.operation_key='door:'||p.id)`).bind(DOOR_KEY,DEFINITION_FILE_PREFIX.length,DEFINITION_FILE_PREFIX,namespace).all<{namespace:string;id:string}>()).results
 const orphans=(await env.DB.prepare(`SELECT DISTINCT namespace FROM ik_door_uploads u WHERE installation_id=? AND substr(namespace,1,?)=? AND namespace<>?
  AND NOT EXISTS(SELECT 1 FROM ik_door_plans p WHERE p.installation_id=u.installation_id AND p.namespace=u.namespace)`).bind(DOOR_KEY,DEFINITION_FILE_PREFIX.length,DEFINITION_FILE_PREFIX,namespace).all<{namespace:string}>()).results
 return {pending,orphans:orphans.map(row=>row.namespace)}
}
