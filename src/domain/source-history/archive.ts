import {clock,identity,type Tables} from '../archive-schema.ts'
export const sourceHistoryColumns={
 source_history_batches:['id','monitor_id','source','source_monitor_id','file_digest','extracted_at','coverage_from','coverage_to','imported_at','restored_at'],
 source_history_rows:['monitor_id','source','source_row_id','batch_id','kind','started_at','ended_at','response_ms','source_duration_seconds','author','comments','root_cause','included'],
 source_history_cutovers:['monitor_id','cutover_at'],
}
export function validateSourceHistory(t:Tables){
 const monitors=new Set(t.monitors.map(m=>m.id)),batches=new Set<string>(),rows=new Set<string>(),cutovers=new Set<string>()
 for(const b of t.source_history_batches){
  identity(b.id,'source batch');identity(b.source,'source');identity(b.source_monitor_id,'source monitor')
  if(!monitors.has(b.monitor_id)||batches.has(JSON.stringify([b.id,b.monitor_id]))||typeof b.file_digest!=='string'||!/^[a-f0-9]{64}$/.test(b.file_digest))throw Error('Invalid source-history batch')
  for(const key of ['coverage_from','coverage_to','imported_at'])clock(b[key],'source '+key)
  for(const key of ['extracted_at','restored_at'])if(b[key]!==null)clock(b[key],'source '+key)
  if(b.coverage_to<b.coverage_from)throw Error('Invalid source-history coverage')
  batches.add(JSON.stringify([b.id,b.monitor_id]))
 }
 for(const r of t.source_history_rows){
  identity(r.source_row_id,'source row');identity(r.source,'source')
  const key=JSON.stringify([r.monitor_id,r.source,r.source_row_id]),batch=t.source_history_batches.find(b=>b.id===r.batch_id&&b.monitor_id===r.monitor_id&&b.source===r.source)
  if(!batch||rows.has(key)||!['down','up','incident','response'].includes(r.kind)||![0,1].includes(r.included))throw Error('Invalid source-history row reference')
  clock(r.started_at,'source start');if(r.ended_at!==null){clock(r.ended_at,'source end');if(r.ended_at<r.started_at)throw Error('Invalid source-history duration')}
  if(r.started_at<batch.coverage_from||(r.ended_at??r.started_at)>batch.coverage_to)throw Error('Invalid source-history covered time')
  if(r.response_ms!==null&&(!Number.isFinite(r.response_ms)||r.response_ms<0)||r.kind==='response'&&r.response_ms===null||r.source_duration_seconds!==null&&(!Number.isFinite(r.source_duration_seconds)||r.source_duration_seconds<0))throw Error('Invalid source-history source figure')
  for(const key of ['author','comments','root_cause'])if(typeof r[key]!=='string'||r[key].length>20000)throw Error('Invalid source-history source text')
  rows.add(key)
 }
 for(const c of t.source_history_cutovers){if(!monitors.has(c.monitor_id)||cutovers.has(c.monitor_id))throw Error('Invalid source-history cutover');clock(c.cutover_at,'source cutover');cutovers.add(c.monitor_id)}
}
