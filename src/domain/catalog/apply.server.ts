import {flowCapGuard,revisionStatements,withinFlowCap,withinMonitorCap,type Bindings} from '../control.server.ts'
import {assignDefinition} from '../runner-registration.server.ts'
import {mutationGuard,type AuditActor} from '../audit.server.ts'
import {STALE_PLAN} from '../definitions/apply.server.ts'
import {classifyStorage} from '../storage-error.ts'
import {same} from './context.server.ts'
import {fail} from './input.ts'
import type {CatalogPlan} from './plan.server.ts'

const stale=()=>Object.assign(Error(STALE_PLAN),{status:409})
export async function applyCatalogPlan(env:Bindings,plan:CatalogPlan,digest:unknown,actor:AuditActor){
 if(typeof digest!=='string'||!/^[0-9a-f]{64}$/.test(digest))fail('Apply needs the digest shown by the catalog preview.')
 if(digest!==plan.digest)throw stale()
 const accepted=plan.entries.filter(e=>(e.action==='create'||e.action==='change')&&e.selected!==false)
 if(!accepted.length)fail('This preview has nothing to create or change.')
 const context=plan.context,now=Date.now(),batchId=crypto.randomUUID(),statements:D1PreparedStatement[]=[]
 // Guard the whole reviewed catalog, including unrelated monitors. A same-count erase/create also fails.
 statements.push(mutationGuard(env,'(SELECT COUNT(*) FROM monitors)=?',[context.monitors.length]))
 for(const monitor of context.monitors)statements.push(mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[monitor.id,monitor.revision]))
 statements.push(mutationGuard(env,'(SELECT COUNT(*) FROM runners)=?',[context.runners.length]))
 for(const runner of context.runners)statements.push(mutationGuard(env,'EXISTS(SELECT 1 FROM runners WHERE runner_id=? AND network_label=? AND revoked_at IS ?)',[runner.runner_id,runner.network_label,runner.revoked_at]))
 statements.push(context.external.url===null?mutationGuard(env,'NOT EXISTS(SELECT 1 FROM external_check WHERE id=1)'):mutationGuard(env,'EXISTS(SELECT 1 FROM external_check WHERE id=1 AND url=?)',[context.external.url]))
 const written:{monitorId:string;action:'create'|'change';revision:number;previous:number|null}[]=[]
 let addsFlows=0
 for(const entry of accepted){
  const old=entry.action==='change'?context.monitors.find(m=>m.id===entry.monitorId)!:null,key=old?.id??crypto.randomUUID()
  // A successful preview requires the real first runner already registered. assignDefinition's idempotent runner
  // setup consequently adds nothing here. The actual definitions, revisions and batch entries commit together.
  const definition=await assignDefinition(env,entry.definition,{assignments:entry.definition.assignments})
  if(!same(definition,entry.definition))throw stale()
  if(definition.type==='flow'&&old?.definition.type!=='flow')addsFlows++
  const revision=await revisionStatements(env,definition,old,key,now,actor,{keepHeartbeatToken:true})
  statements.push(...revision.statements)
  written.push({monitorId:key,action:entry.action as 'create'|'change',revision:revision.revision,previous:old?.revision??null})
 }
 statements.push(env.DB.prepare('INSERT INTO definition_batches(id,created_at,actor_kind,actor_ref,source,plan_digest,counts) VALUES(?,?,?,?,?,?,?)').bind(batchId,now,actor.kind,actor.ref,plan.source,plan.digest,JSON.stringify(plan.counts)))
 for(const row of written)statements.push(env.DB.prepare('INSERT INTO definition_batch_entries(batch_id,monitor_id,action,revision,previous_revision) VALUES(?,?,?,?,?)').bind(batchId,row.monitorId,row.action,row.revision,row.previous))
 if(addsFlows)statements.push(flowCapGuard(env))
 try{await withinMonitorCap(env,plan.counts.create,withinFlowCap(env,addsFlows,env.DB.batch(statements)))}catch(error){if(classifyStorage(error)?.class==='guard_conflict')throw stale();throw error}
 return {batchId,created:written.filter(w=>w.action==='create').map(w=>w.monitorId),changed:written.filter(w=>w.action==='change').map(w=>w.monitorId),counts:plan.counts}
}
