import type {Bindings} from '../control.server.ts'
import {mutationGuard} from '../audit.server.ts'
import {archiveInserts} from '../archive-inserts.server.ts'
import {historyPlan,rowValue} from './preview.server.ts'
import {refuse} from './model.ts'
export async function applyHistory(env:Bindings,input:any){
 if(typeof input?.text!=='string')refuse('History apply needs file text')
 const plan=await historyPlan(env,input.text,input)
 if(typeof input.digest!=='string'||input.digest!==plan.digest)throw Object.assign(Error('The installation or file changed since preview. Nothing was applied; preview again.'),{status:409})
 if(plan.extractedAt===null)refuse('Export or extraction time is required; supply extractedAt context or an Exported At column. Nothing was applied.')
 if(plan.counts.conflict)throw Object.assign(Error('Source rows already exist with different content; nothing was applied.'),{status:409})
 const rows=plan.entries.filter(e=>e.action==='create'),batchId=crypto.randomUUID(),now=Date.now()
 if(!rows.length)return {batchId:null,addedRows:0,unchangedRows:plan.counts.unchanged,unmappedRows:plan.counts.unmapped,preview:plan}
 const groups=new Map<string,any[]>(),batches=[]
 for(const id of new Set(rows.map(r=>r.monitorId!))){
  const monitorRows=plan.entries.filter(r=>r.monitorId===id)
  batches.push({id:batchId,monitor_id:id,source:plan.source,source_monitor_id:monitorRows[0].sourceMonitorId,file_digest:plan.fileDigest,extracted_at:plan.extractedAt,coverage_from:plan.coverageExplicit?plan.coverageFrom:Math.min(...monitorRows.map(r=>r.startedAt)),coverage_to:plan.coverageExplicit?plan.coverageTo:Math.max(...monitorRows.map(r=>r.endedAt??r.startedAt)),imported_at:now,restored_at:null})
 }
 groups.set('source_history_batches',batches)
 groups.set('source_history_rows',rows.map(row=>({...rowValue(row,row.monitorId!),batch_id:batchId})))
 const guards=rows.map(row=>mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[row.monitorId,row.revision]))
 await env.DB.batch([...guards,...archiveInserts(env,groups)])
 return {batchId,addedRows:rows.length,unchangedRows:plan.counts.unchanged,unmappedRows:plan.counts.unmapped,preview:plan}
}
export async function removeHistoryBatch(env:Bindings,id:string){
 const batches=(await env.DB.prepare('SELECT * FROM source_history_batches WHERE id=?').bind(id).all()).results
 if(!batches.length)throw Object.assign(Error('History batch not found'),{status:404})
 const n=await env.DB.prepare('SELECT COUNT(*) n FROM source_history_rows WHERE batch_id=?').bind(id).first<{n:number}>()
 const counts={source_history_rows:n!.n,source_history_batches:batches.length}
 await env.DB.batch([mutationGuard(env,'(SELECT COUNT(*) FROM source_history_rows WHERE batch_id=?)=?',[id,n!.n]),env.DB.prepare('DELETE FROM source_history_rows WHERE batch_id=?').bind(id),env.DB.prepare('DELETE FROM source_history_batches WHERE id=?').bind(id)])
 return {removed:true,batchId:id,counts}
}
