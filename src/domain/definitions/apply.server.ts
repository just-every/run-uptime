// @ts-ignore checked by family policy tests
import {validateDefinition} from '../policy.mjs'
import {get,grants,revisionStatements,flowCapGuard,withinFlowCap,type Bindings} from '../control.server.ts'
import {assignDefinition} from '../runner-registration.server.ts'
import {mutationGuard,type AuditActor} from '../audit.server.ts'
import {keptAssignments,liveHeartbeatTokens,tokenNote,type Plan} from './plan.server.ts'

const conflict=(message:string)=>Object.assign(Error(message),{status:409})
export const STALE_PLAN='The installation or the file changed since this preview. Nothing was applied; preview again.'

// Applies exactly the previewed plan in one D1 batch, or nothing. New monitors arrive paused; a change becomes a new
// immutable revision that keeps the monitor's enabled and maintenance state, its runner assignments and, while it stays a
// heartbeat, its heartbeat token. Nothing here issues a heartbeat token, schedules a notification or touches a destination.
export async function applyPlan(env:Bindings,plan:Plan,digest:string,actor:AuditActor){
 if(plan.digest!==digest)throw conflict(STALE_PLAN)
 const actionable=plan.entries.filter(e=>e.action==='create'||e.action==='change')
 if(!actionable.length)throw Error('This preview has nothing to create or change.')
 const now=Date.now(),batchId=crypto.randomUUID(),statements:D1PreparedStatement[]=[mutationGuard(env,'(SELECT COUNT(*) FROM monitors)=?',[plan.monitorCount])],written:{monitorId:string;action:string;revision:number;previous:number|null}[]=[]
 for(const e of plan.entries.filter(e=>e.action==='unchanged'))statements.push(mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[e.monitorId,e.revision]))
 let addsFlows=0
 for(const e of actionable){
  const old=e.action==='change'?await get(env,e.monitorId!):null
  if(e.action==='change'&&old?.revision!==e.revision)throw conflict(STALE_PLAN)
  if(e.definition.type==='flow'&&old?.definition.type!=='flow')addsFlows++
  const key=old?.id??crypto.randomUUID()
  const definition=await assignDefinition(env,e.definition,old?{assignments:keptAssignments(old.definition,e.definition)}:{})
  const {revision,statements:revisionWrites}=await revisionStatements(env,definition,old,key,now,actor,{keepHeartbeatToken:true})
  statements.push(...revisionWrites);written.push({monitorId:key,action:e.action,revision,previous:old?.revision??null})
 }
 statements.push(env.DB.prepare('INSERT INTO definition_batches(id,created_at,actor_kind,actor_ref,source,plan_digest,counts) VALUES(?,?,?,?,?,?,?)').bind(batchId,now,actor.kind,actor.ref,plan.source,plan.digest,JSON.stringify(plan.counts)))
 for(const w of written)statements.push(env.DB.prepare('INSERT INTO definition_batch_entries(batch_id,monitor_id,action,revision,previous_revision) VALUES(?,?,?,?,?)').bind(batchId,w.monitorId,w.action,w.revision,w.previous))
 // The preview counted room for its flows; a flow saved since then must not take the installation past the bound.
 if(addsFlows)statements.push(flowCapGuard(env))
 await withinFlowCap(env,addsFlows,env.DB.batch(statements))
 return {batchId,created:written.filter(w=>w.action==='create').map(w=>w.monitorId),changed:written.filter(w=>w.action==='change').map(w=>w.monitorId),counts:plan.counts}
}

// Undo pauses what the batch created and restores what it changed, but only where the monitor's current revision is
// still the one the batch produced. Everything else is reported, never forced. No observation, slot or incident is
// removed. A batch restored from an archive is history here: it never becomes authority over this installation.
export async function undoBatch(env:Bindings,batchId:string,actor:AuditActor){
 const batch=await env.DB.prepare('SELECT * FROM definition_batches WHERE id=?').bind(batchId).first<any>()
 if(!batch)throw Object.assign(Error('Batch not found'),{status:404})
 if(batch.restored_at!==null)throw Error('This batch came from an archive. It is history in this installation and cannot be undone here.')
 if(batch.undone_at!==null)throw conflict('This batch was already undone.')
 const entries=(await env.DB.prepare('SELECT * FROM definition_batch_entries WHERE batch_id=? ORDER BY rowid').bind(batchId).all<any>()).results
 const now=Date.now(),tokens=await liveHeartbeatTokens(env),statements:D1PreparedStatement[]=[mutationGuard(env,'EXISTS(SELECT 1 FROM definition_batches WHERE id=? AND undone_at IS NULL)',[batchId])],outcomes=[]
 let addsFlows=0
 for(const e of entries){
  const current=await get(env,e.monitor_id)
  let outcome:string,reason:string
  if(!current){outcome='missing';reason='The monitor no longer exists.'}
  else if(current.revision!==e.revision){outcome=e.action==='create'&&current.definition.enabled?'enabled-since':'edited-since';reason=outcome==='enabled-since'?'It was enabled after the import; it was left running.':'It was edited after the import; that edit was kept.'}
  else if(e.action==='create'){
   // Created monitors arrive paused; with the revision unchanged they were never enabled.
   statements.push(mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[e.monitor_id,e.revision]))
   outcome='paused';reason='Paused, as imported; its history is kept.'
  }else{
   const previous=await env.DB.prepare('SELECT definition FROM revisions WHERE monitor_id=? AND revision=?').bind(e.monitor_id,e.previous_revision).first<any>()
   if(!previous){outcome='missing';reason='Its earlier revision is no longer stored.'}
   else{
    const restoredInput={...JSON.parse(previous.definition),enabled:current.definition.enabled,maintenanceUntil:current.definition.maintenanceUntil??0}
    const restored=validateDefinition(restoredInput,grants(env))
    const definition=await assignDefinition(env,restored,{assignments:keptAssignments(current.definition,restored)})
    if(definition.type==='flow'&&current.definition.type!=='flow')addsFlows++
    statements.push(...(await revisionStatements(env,definition,current,current.id,now,actor,{keepHeartbeatToken:true})).statements)
    outcome='restored';reason=`Restored to its settings before the import as a new revision.${tokenNote(current.definition,definition,tokens.has(current.id))}`
   }
  }
  statements.push(env.DB.prepare('UPDATE definition_batch_entries SET undo_outcome=? WHERE batch_id=? AND monitor_id=?').bind(outcome,batchId,e.monitor_id))
  outcomes.push({monitorId:e.monitor_id,name:current?.definition.name??null,action:e.action,outcome,reason})
 }
 statements.push(env.DB.prepare('UPDATE definition_batches SET undone_at=? WHERE id=? AND undone_at IS NULL').bind(now,batchId))
 if(addsFlows)statements.push(flowCapGuard(env))
 await withinFlowCap(env,addsFlows,env.DB.batch(statements))
 return {batchId,undoneAt:now,outcomes}
}

export async function listBatches(env:Bindings){
 const batches=(await env.DB.prepare('SELECT * FROM definition_batches ORDER BY created_at DESC,rowid DESC LIMIT 50').all<any>()).results
 const entries=batches.length?(await env.DB.prepare(`SELECT e.*,json_extract(m.definition,'$.name') AS name,m.revision AS current_revision FROM definition_batch_entries e LEFT JOIN monitors m ON m.id=e.monitor_id WHERE e.batch_id IN (${batches.map(()=>'?').join(',')}) ORDER BY e.rowid`).bind(...batches.map(b=>b.id)).all<any>()).results:[]
 return batches.map(b=>({id:b.id,createdAt:b.created_at,source:b.source,counts:JSON.parse(b.counts),undoneAt:b.undone_at,restoredAt:b.restored_at,
  entries:entries.filter(e=>e.batch_id===b.id).map(e=>({monitorId:e.monitor_id,name:e.name,action:e.action,revision:e.revision,currentRevision:e.current_revision,undoOutcome:e.undo_outcome}))}))
}
