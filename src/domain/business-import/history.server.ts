import type {Bindings} from '../control.server.ts'
import {listBatches,undoBatch} from '../definitions/index.server.ts'
import type {AuditActor} from '../audit.server.ts'
import {readImportDoorHistory} from '../../base/modules/import-kit/src/door/index.ts'
import {undoD1Import,rollbackD1Import} from '../../base/modules/import-kit/src/d1/reverse.ts'
import {loadPlans} from '../../base/modules/import-kit/src/d1/plans.ts'
import {businessOwnerAuthority,ownerImportContext,DOOR_KEY} from './context.server.ts'
import {recordUndo} from './custody.server.ts'
import type {D1Sql} from '../../base/modules/import-kit/src/d1/types.ts'
import type {ImportPlan} from '../../base/modules/import-kit/src/types.ts'
import {canonicalJson,sha256} from '../../base/modules/import-kit/src/provenance/identity.ts'

type Applied={ordinal:number;effect_ordinal:number}
type Job={id:string;plan_json:string}
/** Each effect a door job applied, from that job's own plan, whatever a later import of the same source did since, with
 * the kit's applied revision for it. Undo outcomes come from the job's reversal report: a monitor reversed is paused
 * (created) or restored (changed); one kept was edited or enabled since, or is gone. */
export async function appliedEntries(env:Bindings,job:Job,plan:ImportPlan,undone:boolean){
 // A catch-up moves an earlier import's provenance into its history; both still name this job's effects.
 const applied=(await env.DB.prepare(`SELECT ordinal,effect_ordinal FROM ik_provenance WHERE job_id=? UNION SELECT ordinal,effect_ordinal FROM ik_d1_history WHERE job_id=?
  ORDER BY ordinal,effect_ordinal`).bind(job.id,job.id).all<Applied>()).results
 const effects=applied.map(row=>{const entry=plan.entries[row.ordinal],effect=entry?.effects[row.effect_ordinal]
  return effect&&{effect,appliedRevision:sha256(canonicalJson([job.id,entry.identity,row.effect_ordinal,'applied']))}}).filter(Boolean) as {effect:ImportPlan['entries'][number]['effects'][number];appliedRevision:string}[]
 const ids=JSON.stringify(effects.map(({effect})=>effect.targetId))
 const monitors=new Map((await env.DB.prepare('SELECT id,revision,definition FROM monitors WHERE id IN(SELECT value FROM json_each(?))').bind(ids).all<{id:string;revision:number;definition:string}>()).results.map(row=>[row.id,row]))
 const reports=undone?new Map((await env.DB.prepare('SELECT record_json FROM ik_d1_reversal_reports WHERE job_id=? ORDER BY position').bind(job.id).all<{record_json:string}>()).results
  .map(row=>JSON.parse(row.record_json)).filter(report=>typeof report.targetId==='string').map(report=>[report.targetId,report])):new Map()
 return effects.map(({effect,appliedRevision})=>{
  const current=monitors.get(effect.targetId),definition=current?JSON.parse(current.definition):null,action:'create'|'change'=effect.expectedRevision===undefined?'create':'change'
  const report=reports.get(effect.targetId)
  const undoOutcome=!undone?null:report?.disposition==='retained'?(!current?'missing':action==='create'&&definition.enabled?'enabled-since':'edited-since'):action==='create'?'paused':'restored'
  return {monitorId:effect.targetId,name:(effect.value as any)?.name??definition?.name??null,action,currentRevision:current?.revision??null,undoOutcome,
   appliedRevision,expectedRevision:effect.expectedRevision}
 })
}
/** One door batch as it was applied, as the history lists it. */
async function batchEntries(env:Bindings,jobId:string,undone:boolean){
 const job=await env.DB.prepare('SELECT id,plan_json FROM ik_jobs WHERE id=?').bind(jobId).first<Job>()
 if(!job)return []
 const plan=(await loadPlans([job],env.DB)).get(job.id)!
 return (await appliedEntries(env,job,plan,undone)).map(({monitorId,name,action,currentRevision,undoOutcome})=>({monitorId,name,action,revision:currentRevision,currentRevision,undoOutcome}))
}
export async function definitionImportHistory(env:Bindings,request:Request){return importHistory(env,await businessOwnerAuthority(env,request))}
/** Uptime's own definition batches and every import-door job, owner's and Business's, newest first. */
export async function importHistory(env:Bindings,authority:D1Sql){
 const native=await listBatches(env),installation=DOOR_KEY
 const history=await readImportDoorHistory(env.DB,installation,authority) as Array<Record<string,any>>
 // Retired jobs have no source/target content left to read. Their approved
 // fingerprints and lineage remain inspectable as anonymous history only.
 const withdrawn=(await env.DB.prepare(`SELECT p.id AS planId,p.namespace,p.fingerprint,a.owner,a.approved_at AS approvedAt,a.approval_id AS approvalRecordId,a.reviewer
  FROM ik_door_plans p JOIN ik_door_approvals a ON a.plan_id=p.id JOIN ik_d1_retirements r ON r.id=p.job_id AND r.kind='job'
  WHERE p.installation_id=? AND NOT EXISTS(SELECT 1 FROM ik_jobs j WHERE j.id=p.job_id)`).bind(installation).all<Record<string,any>>()).results
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
 const retired=withdrawn.map(item=>({id:'business:'+item.planId,createdAt:Date.parse(String(item.approvedAt)),source:String(item.namespace).split(':')[0],namespace:item.namespace,
  counts:{create:0,change:0},entries:[],withdrawn:true,undone:false,undoneAt:null,restoredAt:null,
  businessApproval:{owner:item.owner,approvedAt:item.approvedAt,fingerprint:item.fingerprint,approvalId:item.approvalRecordId,via:item.reviewer==='operator'?'owner':'business'}}))
 return [...native,...business,...retired].sort((a,b)=>b.createdAt-a.createdAt)
}
export async function undoDefinitionImport(env:Bindings,request:Request,id:string,actor:AuditActor){
 if(!id.startsWith('business:'))return undoBatch(env,id,actor)
 const planId=id.slice('business:'.length),installation=DOOR_KEY
 if(await env.DB.prepare("SELECT 1 FROM ik_door_plans p JOIN ik_d1_retirements r ON r.id=p.job_id AND r.kind='job' WHERE p.id=? AND p.installation_id=?").bind(planId,installation).first())throw Object.assign(Error('Import custody was erased; nothing remains to undo.'),{status:410})
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
