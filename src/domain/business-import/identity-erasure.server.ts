import type {Bindings} from '../control.server.ts'
import {mutationGuard} from '../audit.server.ts'
import type {D1Sql} from '../../base/modules/import-kit/src/d1/types.ts'
import {retirementScope,retirementWrites,scopeGuards} from '../../base/modules/import-kit/src/d1/retirement-scope.ts'
import {readonlyChecks} from '../../base/modules/import-kit/src/d1/database.ts'
import {BUSINESS_DESTINATION,DOOR_KEY} from './context.server.ts'

/** Operator/destination identities have no reliable membership index in opaque exports.
 * Withdraw their entire import custody, keeping native monitors and anonymous receipts. */
export async function businessIdentityErasure(env:Bindings){
 const namespaces=(await env.DB.prepare('SELECT namespace FROM ik_jobs WHERE destination=?').bind(BUSINESS_DESTINATION).all<{namespace:string}>()).results.map(row=>row.namespace)
 const scope=await retirementScope(env.DB,BUSINESS_DESTINATION,namespaces)
 const receipt=crypto.randomUUID(),at=new Date().toISOString(),sql=(sql:string,...params:unknown[]):D1Sql=>({sql,params})
 const writes=[
  sql('DELETE FROM ik_door_chunks WHERE upload_id IN(SELECT id FROM ik_door_uploads WHERE installation_id=?)',DOOR_KEY),
  sql('DELETE FROM ik_door_uploads WHERE installation_id=?',DOOR_KEY),
  sql('DELETE FROM ik_door_plan_chunks WHERE plan_id IN(SELECT id FROM ik_door_plans WHERE installation_id=?)',DOOR_KEY),
  sql('DELETE FROM ik_door_archive_chunks WHERE archive_id IN(SELECT id FROM ik_door_archives WHERE installation_id=?)',DOOR_KEY),
  sql('DELETE FROM uptime_business_import_writes'),
  ...retirementWrites(scope,BUSINESS_DESTINATION,receipt,at),
 ]
 const counts:Record<string,number>={}
 // Count withdrawals before the guarded transaction, including kit originals and before-images.
 for(const query of writes.filter(query=>/^DELETE FROM /i.test(query.sql))){
  const table=/^DELETE FROM (\w+)/i.exec(query.sql)![1]
  const row=await env.DB.prepare(query.sql.replace(/^DELETE FROM /i,'SELECT COUNT(*) AS n FROM ')).bind(...query.params??[]).first<{n:number}>()
  counts[table]=(counts[table]??0)+(row?.n??0)
 }
 for(const table of ['ik_door_approvals','ik_door_archives']){
  const row=await env.DB.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${table==='ik_door_approvals'?'plan_id IN(SELECT id FROM ik_door_plans WHERE installation_id=?)':'installation_id=?'}`).bind(DOOR_KEY).first<{n:number}>()
  counts[table]=row?.n??0
 }
 counts.uptime_business_import_targets=(await env.DB.prepare('SELECT COUNT(*) n FROM uptime_business_import_targets WHERE retired=0').first<{n:number}>())?.n??0
 const prepare=(query:D1Sql)=>env.DB.prepare(query.sql).bind(...query.params??[])
 return {counts,statements:[
  ...readonlyChecks(scopeGuards(scope)).map(prepare),
  ...writes.map(prepare),
  // Approval ids/reviewer ids and filenames are caller-supplied too. Preserve only
  // the approval's fingerprint/time, owner-vs-Business channel and opaque lineage.
  env.DB.prepare(`UPDATE ik_door_approvals SET owner='Erased identity',approval_id=lower(hex(randomblob(16))),
   reviewer=CASE WHEN reviewer='operator' THEN 'operator' ELSE 'erased' END
   WHERE plan_id IN(SELECT id FROM ik_door_plans WHERE installation_id=?)`).bind(DOOR_KEY),
  env.DB.prepare("UPDATE ik_door_archives SET name='Withdrawn',tool='withdrawn' WHERE installation_id=?").bind(DOOR_KEY),
  env.DB.prepare('UPDATE ik_door_namespaces SET head_id=NULL,pending_id=NULL WHERE installation_id=?').bind(DOOR_KEY),
  env.DB.prepare('UPDATE uptime_business_import_targets SET retired=1 WHERE retired=0'),
  mutationGuard(env,'NOT EXISTS(SELECT 1 FROM ik_jobs WHERE destination=?)',[BUSINESS_DESTINATION]),
  env.DB.prepare(`INSERT INTO ik_d1_erasure_journal(id,destination,recorded_at,records_erased,jobs_retired,streams_retired,stores_json)
   VALUES(?,?,?,?,?,?,?)`).bind(receipt,BUSINESS_DESTINATION,at,0,scope.jobs.length,scope.anchors.length,JSON.stringify(Object.entries(counts).map(([store,rows])=>({store,rows})))),
 ]}
}
