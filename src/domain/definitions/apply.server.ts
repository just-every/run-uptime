// @ts-ignore checked by family policy tests
import {validateDefinition} from '../policy.mjs'
import {get,grants,revisionStatements,flowCapGuard,withinFlowCap,type Bindings} from '../control.server.ts'
import {assignDefinition} from '../runner-registration.server.ts'
import {mutationGuard,type AuditActor} from '../audit.server.ts'
import {keptAssignments,liveHeartbeatTokens,tokenNote} from './plan.server.ts'
// @ts-ignore Shared catalog metadata validation.
import {validateMonitorMetadata} from '../monitor-metadata.mjs'

const conflict=(message:string)=>Object.assign(Error(message),{status:409})
export const STALE_PLAN='The installation or the file changed since this preview. Nothing was applied; preview again.'

// Undo pauses what the batch created and restores what it changed, but only where the monitor's current revision is
// still the one the batch produced. Everything else is reported, never forced. No observation, slot or incident is
// removed. A batch restored from an archive is history here: it never becomes authority over this installation.
export async function undoBatch(env:Bindings,batchId:string,actor:AuditActor){
 const batch=await env.DB.prepare('SELECT * FROM definition_batches WHERE id=?').bind(batchId).first<any>()
 if(!batch)throw Object.assign(Error('Batch not found'),{status:404})
 if(batch.restored_at!==null)throw Error('This batch came from an archive. It is history in this installation and cannot be undone here.')
 if(batch.undone_at!==null)throw conflict('This batch was already undone.')
 const catalog=['catalog.add.urls','catalog.add.csv','catalog.edit','catalog.pause','catalog.resume','catalog.clone'].includes(batch.source)
 const entries=(await env.DB.prepare('SELECT * FROM definition_batch_entries WHERE batch_id=? ORDER BY rowid').bind(batchId).all<any>()).results
 const now=Date.now(),tokens=await liveHeartbeatTokens(env),statements:D1PreparedStatement[]=[mutationGuard(env,'EXISTS(SELECT 1 FROM definition_batches WHERE id=? AND undone_at IS NULL)',[batchId])],outcomes=[]
 let addsFlows=0
 for(const e of entries){
  const current=await get(env,e.monitor_id)
  let outcome:string,reason:string
  if(!current){outcome='missing';reason='The monitor no longer exists.'}
  else if(current.revision!==e.revision){outcome=e.action==='create'&&current.definition.enabled?'enabled-since':'edited-since';reason=outcome==='enabled-since'?'It was enabled after the import; it was left running.':'It was edited after the import; that edit was kept.'}
  else if(e.action==='create'){
   // Catalog adds/clones can explicitly start enabled. Undo records their pause as a new immutable revision.
   if(catalog&&current.definition.enabled)statements.push(...(await revisionStatements(env,{...current.definition,enabled:false},current,current.id,now,actor,{keepHeartbeatToken:true})).statements)
   else statements.push(mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[e.monitor_id,e.revision]))
   outcome='paused';reason=catalog?'Paused; its revision, evidence and incident history are kept.':'Paused, as imported; its history is kept.'
  }else{
   const previous=await env.DB.prepare('SELECT definition FROM revisions WHERE monitor_id=? AND revision=?').bind(e.monitor_id,e.previous_revision).first<any>()
   if(!previous){outcome='missing';reason='Its earlier revision is no longer stored.'}
   else{
    const previousDefinition=JSON.parse(previous.definition)
    const restoredInput={...previousDefinition,enabled:catalog&&['catalog.pause','catalog.resume'].includes(batch.source)?previousDefinition.enabled:current.definition.enabled,maintenanceUntil:current.definition.maintenanceUntil??0,...(current.definition.maintenanceWindows?{maintenanceWindows:current.definition.maintenanceWindows}:{})}
    const restored={...validateDefinition(restoredInput,grants(env)),...(catalog?validateMonitorMetadata(restoredInput):{})}
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
