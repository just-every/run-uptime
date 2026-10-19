import type {Bindings} from '../control.server.ts'
import {loadPlans} from '../../base/modules/import-kit/src/d1/plans.ts'
import {sha256} from '../../base/modules/import-kit/src/provenance/identity.ts'
import {appliedEntries} from './history.server.ts'
import {DOOR_KEY} from './context.server.ts'

/** A door job that reached its apply: its batch is history, undone or not. A failed or rolled-back apply is not a batch. */
const COMPLETED=['completed','undoing','undone']
const uuidOf=(hex:string)=>`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`

/** Every completed import-door batch, the owner's and Business's, as archive definition-batch history: the plan id as the
 * batch, its approval time, the owner who approved it, its source and reviewed fingerprint, its counts and undo time,
 * and per monitor the revision its apply wrote, from the job's own plan. The door's custody, grants and plans stay in
 * this installation; a restore marks these rows restored history, as it does every batch, so they undo nothing there. */
export async function doorBatchArchive(env:Bindings){
 const jobs=(await env.DB.prepare(`SELECT p.id AS plan_id,p.namespace,p.fingerprint,a.approved_at,j.id,j.state,j.principal_id,j.plan_json,u.undone_at,
  EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=j.principal_id) AS operator
  FROM ik_door_plans p JOIN ik_door_approvals a ON a.plan_id=p.id JOIN ik_jobs j ON j.id=p.job_id LEFT JOIN uptime_business_import_undos u ON u.plan_id=p.id
  WHERE p.installation_id=? ORDER BY a.approved_at,p.id`).bind(DOOR_KEY).all<any>()).results
 const plans=await loadPlans(jobs,env.DB)
 const applied=await Promise.all(jobs.map(async job=>({job,entries:await appliedEntries(env,job,plans.get(job.id)!,job.state==='undone')})))
 // The native revision each apply wrote. Writes always add one to the revision they replace: a create writes 1, a change
 // of a monitor at native revision N writes N+1, and a catch-up of a monitor still as an earlier import left it writes one
 // more than that import did.
 const byApplied=new Map(applied.flatMap(({entries})=>entries.map(entry=>[entry.appliedRevision,entry] as const)))
 const written=(entry:typeof applied[number]['entries'][number],depth=0):number=>{
  const expected=entry.expectedRevision
  if(expected===undefined)return 1
  if(expected.startsWith('native:'))return Number(expected.slice('native:'.length))+1
  const earlier=byApplied.get(expected)
  if(!earlier||depth>byApplied.size)throw Error('Archive import history is incomplete: a catch-up names an import this installation no longer holds.')
  return written(earlier,depth+1)+1
 }
 const batches:any[]=[],entries:any[]=[]
 for(const {job,entries:effects} of applied){
  if(!COMPLETED.includes(job.state))continue
  const rows=effects.map(entry=>{const revision=written(entry)
   return {batch_id:job.plan_id,monitor_id:entry.monitorId,action:entry.action,revision,previous_revision:entry.action==='change'?revision-1:null,undo_outcome:entry.undoOutcome}})
  batches.push({id:job.plan_id,created_at:Date.parse(job.approved_at),
   // An owner since erased is anonymous here too, as their own batches and audit entries are.
   actor_kind:job.operator?'operator':'anonymized',actor_ref:job.operator?job.principal_id:uuidOf(sha256(JSON.stringify(['door-batch-actor',job.plan_id]))),
   source:String(job.namespace).split(':')[0],plan_digest:job.fingerprint,
   counts:JSON.stringify({create:rows.filter(row=>row.action==='create').length,change:rows.filter(row=>row.action==='change').length}),
   undone_at:job.state==='undone'?job.undone_at??null:null,restored_at:null})
  entries.push(...rows)
 }
 return {batches,entries}
}
