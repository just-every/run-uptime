import type {Bindings} from '../control.server.ts'
import {boundDefinitionText,canonical,sha256} from '../definitions/format.ts'
import {sourceIdentity as kitIdentity} from '../../base/modules/import-kit/src/provenance/identity.ts'
import {BUSINESS_DESTINATION} from '../business-import/context.server.ts'
import {parseHistoryCsv} from './csv.ts'
import {parseHistoryJson} from './json.ts'
import {SOURCE,type HistoryRow} from './model.ts'
export type StoredHistoryRow={monitor_id:string;source:string;source_row_id:string;batch_id:string;kind:HistoryRow['kind'];started_at:number;ended_at:number|null;response_ms:number|null;source_duration_seconds:number|null;author:string;comments:string;root_cause:string;included:number}
export const rowValue=(row:HistoryRow,monitorId:string)=>({monitor_id:monitorId,source:SOURCE,source_row_id:row.sourceRowId,kind:row.kind,started_at:row.startedAt,ended_at:row.endedAt,response_ms:row.responseMs,source_duration_seconds:row.sourceDurationSeconds,author:row.author,comments:row.comments,root_cause:row.rootCause,included:Number(row.included)})
export async function historyPlan(env:Bindings,text:string){
 boundDefinitionText(text)
 const file=/^\s*[[{]/.test(text)?await parseHistoryJson(text):await parseHistoryCsv(text),fileDigest=await sha256(text)
 const monitors=(await env.DB.prepare('SELECT id,revision,definition FROM monitors ORDER BY id').all<{id:string;revision:number;definition:string}>()).results
 const provenance=(await env.DB.prepare('SELECT source_identity,target_id FROM ik_provenance WHERE destination=? AND target_kind=\'monitor\' AND reversed=0').bind(BUSINESS_DESTINATION).all<{source_identity:string;target_id:string}>()).results
 const old=(await env.DB.prepare('SELECT * FROM source_history_rows ORDER BY monitor_id,source,source_row_id').all<StoredHistoryRow>()).results
 const cutovers=(await env.DB.prepare('SELECT * FROM source_history_cutovers ORDER BY monitor_id').all()).results
 const entries=file.rows.map(row=>{
  const identity=kitIdentity(BUSINESS_DESTINATION,'uptimerobot','monitor',row.sourceMonitorId)
  const ids=[...new Set(provenance.filter(p=>p.source_identity===identity).map(p=>p.target_id))]
  const monitor=ids.length===1?monitors.find(m=>m.id===ids[0]):undefined
  const stored=monitor?old.find(r=>r.monitor_id===monitor.id&&r.source===SOURCE&&r.source_row_id===row.sourceRowId):undefined
  const expected=monitor?rowValue(row,monitor.id):null
  const {batch_id:batchId,...previous}=stored??{batch_id:null}
  const action=!monitor?'unmapped':stored?JSON.stringify(canonical(previous))===JSON.stringify(canonical(expected))?'unchanged':'conflict':'create'
  return {...row,monitorId:monitor?.id??null,monitorName:monitor?JSON.parse(monitor.definition).name:null,revision:monitor?.revision??null,action,
   ...(action==='unmapped'?{reason:row.sourceMonitorId?`Source monitor ${row.sourceMonitorId} (${row.name||'unnamed'}) was not migrated or has no unique retained mapping`:`${row.line}: ${row.name||'unnamed monitor'} has no source monitor ID`}:action==='conflict'?{reason:`${row.line}: source row ${row.sourceRowId} already exists with different content`}:{})}
 })
 const seen=new Map<string,string>()
 for(const entry of entries){const key=JSON.stringify([entry.sourceMonitorId,entry.sourceRowId]),value=JSON.stringify(canonical(rowValue(entry,entry.monitorId??'')));if(seen.has(key)){entry.action=seen.get(key)===value?'unchanged':'conflict'}else seen.set(key,value)}
 const counts={create:entries.filter(e=>e.action==='create').length,unchanged:entries.filter(e=>e.action==='unchanged').length,unmapped:entries.filter(e=>e.action==='unmapped').length,conflict:entries.filter(e=>e.action==='conflict').length}
 const mapping=[...new Set(entries.map(e=>e.sourceMonitorId))].map(id=>{
  const rows=entries.filter(e=>e.sourceMonitorId===id),outages=rows.filter(r=>['down','incident'].includes(r.kind))
  return {sourceMonitorId:id,name:rows[0].name,monitorId:rows[0].monitorId,monitorName:rows[0].monitorName,rows:rows.length,dateFrom:Math.min(...rows.map(r=>r.startedAt)),dateTo:Math.max(...rows.map(r=>r.endedAt??r.startedAt)),outageCount:outages.length,totalDowntimeSeconds:outages.reduce((n,r)=>n+(r.endedAt===null?0:(r.endedAt-r.startedAt)/1000),0),sourceStatedDowntimeSeconds:outages.every(r=>r.sourceDurationSeconds!==null)?outages.reduce((n,r)=>n+r.sourceDurationSeconds!,0):null,unresolvedOutages:outages.filter(r=>r.endedAt===null).length}
 })
 const digest=await sha256(JSON.stringify(canonical({fileDigest,monitors,provenance,old,cutovers,entries})))
 return {kind:'history' as const,source:SOURCE,provenance:'UptimeRobot sourced history',stored:false,rows:entries.length,columns:file.columns,fileDigest,extractedAt:file.extractedAt,coverageFrom:file.coverageFrom,coverageTo:file.coverageTo,digest,reviewDigest:digest,counts,mapping,entries,note:'Sourced history is stored separately from monitoring evidence. No current state, incident, notification or follow-up is changed.'}
}
