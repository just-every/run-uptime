import type {Bindings} from '../control.server.ts'
import {listBatches,undoBatch} from '../definitions/index.server.ts'
import type {AuditActor} from '../audit.server.ts'
import {readImportDoorHistory} from '../../base/modules/import-kit/src/door/index.ts'
import {undoD1Import,rollbackD1Import} from '../../base/modules/import-kit/src/d1/reverse.ts'
import {loadPlans} from '../../base/modules/import-kit/src/d1/plans.ts'
import {businessOwnerAuthority,ownerImportContext,DOOR_KEY} from './context.server.ts'
import {recordUndo} from './custody.server.ts'
import type {D1Sql} from '../../base/modules/import-kit/src/d1/types.ts'

type Applied={ordinal:number;effect_ordinal:number}
/** One door batch as it was applied: each effect its job wrote, from that job's own plan, whatever a later import of the
 * same source did since. Undo outcomes come from the job's reversal report: a monitor reversed is paused (created) or
 * restored (changed); one kept was edited or enabled since, or is gone. */
async function batchEntries(env:Bindings,jobId:string,undone:boolean){
 const job=await env.DB.prepare('SELECT id,plan_json FROM ik_jobs WHERE id=?').bind(jobId).first<{id:string;plan_json:string}>()
 if(!job)return []
 const plan=(await loadPlans([job],env.DB)).get(job.id)!
 // A catch-up moves an earlier import's provenance into its history; both still name this job's effects.
 const applied=(await env.DB.prepare(`SELECT ordinal,effect_ordinal FROM ik_provenance WHERE job_id=? UNION SELECT ordinal,effect_ordinal FROM ik_d1_history WHERE job_id=?
  ORDER BY ordinal,effect_ordinal`).bind(jobId,jobId).all<Applied>()).results
 const effects=applied.map(row=>plan.entries[row.ordinal]?.effects[row.effect_ordinal]).filter(Boolean)
 const ids=JSON.stringify(effects.map(effect=>effect.targetId))
 const monitors=new Map((await env.DB.prepare('SELECT id,revision,definition FROM monitors WHERE id IN(SELECT value FROM json_each(?))').bind(ids).all<{id:string;revision:number;definition:string}>()).results.map(row=>[row.id,row]))
 const reports=undone?new Map((await env.DB.prepare('SELECT record_json FROM ik_d1_reversal_reports WHERE job_id=? ORDER BY position').bind(jobId).all<{record_json:string}>()).results
  .map(row=>JSON.parse(row.record_json)).filter(report=>typeof report.targetId==='string').map(report=>[report.targetId,report])):new Map()
 return effects.map(effect=>{
  const current=monitors.get(effect.targetId),definition=current?JSON.parse(current.definition):null,action=effect.expectedRevision===undefined?'create':'change'
  const report=reports.get(effect.targetId)
  const undoOutcome=!undone?null:report?.disposition==='retained'?(!current?'missing':action==='create'&&definition.enabled?'enabled-since':'edited-since'):action==='create'?'paused':'restored'
  return {monitorId:effect.targetId,name:(effect.value as any)?.name??definition?.name??null,action,revision:current?.revision??null,currentRevision:current?.revision??null,undoOutcome}
 })
}
export async function definitionImportHistory(env:Bindings,request:Request){return importHistory(env,await businessOwnerAuthority(env,request))}
/** Uptime's own definition batches and every import-door job, owner's and Business's, newest first. */
export async function importHistory(env:Bindings,authority:D1Sql){
 const native=await listBatches(env),installation=DOOR_KEY
 const history=await readImportDoorHistory(env.DB,installation,authority) as Array<Record<string,any>>
 const undos=new Map((await env.DB.prepare('SELECT plan_id,undone_at FROM uptime_business_import_undos').all<{plan_id:string;undone_at:number}>()).results.map(row=>[row.plan_id,row.undone_at]))
 const business=await Promise.all(history.map(async item=>{
  const undone=['undone','rolled_back'].includes(String(item.state)),entries=await batchEntries(env,item.jobId,undone)
  // A reviewed definition file has its own namespace per preview; it reads as its source.
  return {id:'business:'+item.planId,createdAt:Date.parse(String(item.approvedAt)),source:String(item.namespace).split(':')[0],namespace:item.namespace,
   failed:item.failureCode??(item.state==='failed'?item.error??'import_door_apply_failed':null),
   counts:{create:entries.filter(e=>e.action==='create').length,change:entries.filter(e=>e.action==='change').length},undoneAt:undone?undos.get(item.planId)??null:null,undone,restoredAt:null,
   businessApproval:{owner:item.owner,approvedAt:item.approvedAt,fingerprint:item.fingerprint,approvalId:item.approvalRecordId,via:item.reviewer==='operator'?'owner':'business'},
   entries}
 }))
 return [...native,...business].sort((a,b)=>b.createdAt-a.createdAt)
}
export async function undoDefinitionImport(env:Bindings,request:Request,id:string,actor:AuditActor){
 if(!id.startsWith('business:'))return undoBatch(env,id,actor)
 const planId=id.slice('business:'.length),installation=DOOR_KEY
 const row=await env.DB.prepare(`SELECT p.id,p.job_id,j.namespace,j.mapping_version,j.state FROM ik_door_plans p JOIN ik_jobs j ON j.id=p.job_id
  WHERE p.id=? AND p.installation_id=?`).bind(planId,installation).first<any>()
 if(!row)throw Object.assign(Error('Import not found'),{status:404})
 const newer=await env.DB.prepare(`SELECT 1 FROM ik_door_plans p JOIN ik_jobs j ON j.id=p.job_id
  WHERE p.previous_id=? AND j.state NOT IN ('undone','rolled_back')`).bind(planId).first()
 if(newer)throw Object.assign(Error('Undo the newest Business snapshot first.'),{status:409})
 const context=await ownerImportContext(env,request,row.namespace,row.mapping_version)
 const job=await (['completed','undoing','undone'].includes(row.state)?undoD1Import:rollbackD1Import)(row.job_id,context)
 if(!['undone','rolled_back'].includes(job.state))throw Object.assign(Error('Undo is in progress. Choose Undo this batch again to continue.'),{status:409})
 await recordUndo(env,planId)
 return {batchId:id,job}
}
