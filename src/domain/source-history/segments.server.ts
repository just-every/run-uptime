import type {Bindings} from '../control.server.ts'
import type {ReportPeriod} from '../reports/period.ts'
import {periodAvailability} from '../reports/coverage.server.ts'
import type {StoredHistoryRow} from './preview.server.ts'
export type Span=[number,number]
export function union(spans:Span[]):Span[]{
 const result:Span[]=[]
 for(const span of spans.filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0])){const last=result.at(-1);if(last&&span[0]<=last[1])last[1]=Math.max(last[1],span[1]);else result.push([...span])}
 return result
}
const length=(spans:Span[])=>union(spans).reduce((n,[a,b])=>n+b-a,0)
const intersect=(a:Span[],b:Span[])=>union(a.flatMap(([x,y])=>b.map(([s,e]):Span=>[Math.max(x,s),Math.min(y,e)])))
function without(spans:Span[],excluded:Span[]):Span[]{
 let kept=union(spans)
 for(const [a,b] of union(excluded))kept=kept.flatMap(([x,y]):Span[]=>b<=x||a>=y?[[x,y]]:[[x,Math.min(a,y)],[Math.max(x,b),y]].filter(([s,e])=>e>s) as Span[])
 return kept
}
const figure=(denominatorMs:number,downMs:number)=>({denominatorMs,upMs:denominatorMs-downMs,notPassingMs:downMs,uptimePercent:denominatorMs?100*(denominatorMs-downMs)/denominatorMs:null})
export async function historyCutover(env:Pick<Bindings,'DB'>,id:string){
 const first=await env.DB.prepare('SELECT MIN(due_at) at,MAX(due_at+CAST(json_extract(definition,\'$.intervalMs\') AS INTEGER)) last FROM slots WHERE monitor_id=? AND manual=0').bind(id).first<{at:number|null;last:number|null}>()
 const override=await env.DB.prepare('SELECT cutover_at FROM source_history_cutovers WHERE monitor_id=?').bind(id).first<{cutover_at:number}>()
 return {at:override?.cutover_at??first?.at??null,mode:override?'owner':'first-scheduled-slot',firstSlotAt:first?.at??null,lastSlotTo:first?.last??null}
}
/** Source covered time and downtime never enter the native availability engine. Overlap is clipped only for blending. */
export async function sourceSegments(env:Pick<Bindings,'DB'>,id:string,period:ReportPeriod){
 const batches=(await env.DB.prepare('SELECT * FROM source_history_batches WHERE monitor_id=? ORDER BY source,coverage_from,id').bind(id).all<any>()).results
 if(!batches.length)return null
 const rows=(await env.DB.prepare('SELECT * FROM source_history_rows WHERE monitor_id=? AND started_at<? AND (ended_at IS NULL OR ended_at>=?) ORDER BY started_at,source_row_id LIMIT 10001').bind(id,period.to,period.from).all<StoredHistoryRow>()).results
 if(rows.length>10000)throw Object.assign(Error('Source history exceeds 10,000 period rows; choose a shorter period'),{status:400})
 const cutover=await historyCutover(env,id),segments=[]
 for(const source of [...new Set(batches.map(b=>b.source as string))]){
  const coverage=union(batches.filter(b=>b.source===source).map((b):Span=>[Math.max(period.from,b.coverage_from),Math.min(period.to,b.coverage_to)]))
  const outages=rows.filter(r=>r.source===source&&['down','incident'].includes(r.kind))
  const excluded=outages.filter(r=>!r.included).map((r):Span=>[r.started_at,r.ended_at??period.to])
  const covered=without(coverage,excluded),down=intersect(covered,outages.filter(r=>r.included).map((r):Span=>[r.started_at,r.ended_at??period.to]))
  const blendCoverage=cutover.at===null?[]:intersect(covered,[[period.from,Math.min(period.to,cutover.at)]])
  segments.push({source,label:`source: ${source}`,coverage:covered,...figure(length(covered),length(down)),blendedContribution:figure(length(blendCoverage),length(intersect(down,blendCoverage)))})
 }
 const uptimeFrom=Math.min(period.to,Math.max(period.from,cutover.at??period.to))
 const uptime=uptimeFrom<period.to?await periodAvailability(env.DB,id,{...period,from:uptimeFrom}):null
 const uptimeSegment={source:'Uptime',label:'source: Uptime',from:uptimeFrom,to:period.to,denominatorMs:uptime?.observedMs??0,upMs:uptime?.upMs??0,notPassingMs:uptime?.notPassingMs??0,uptimePercent:uptime?.uptimePercent??null}
 const contribution=segments.reduce((a,s)=>({denominatorMs:a.denominatorMs+s.blendedContribution.denominatorMs,notPassingMs:a.notPassingMs+s.blendedContribution.notPassingMs}),{denominatorMs:uptimeSegment.denominatorMs,notPassingMs:uptimeSegment.notPassingMs})
 // A monitor can have several files from one incumbent. They union above. Multiple incumbents require an owner
 // selection in a later adapter; until then overlapping sources refuse a combined figure instead of double counting.
 const blended=segments.length===1&&cutover.at!==null?{label:`blended: ${segments[0].source} + Uptime`,sources:[segments[0].source,'Uptime'],...figure(contribution.denominatorMs,contribution.notPassingMs)}:null
 const sourceIncidents=rows.filter(r=>['down','incident'].includes(r.kind)).map(r=>({source:r.source,label:`source: ${r.source}`,sourceRowId:r.source_row_id,batchId:r.batch_id,startedAt:r.started_at,endedAt:r.ended_at,durationSeconds:r.ended_at===null?null:(r.ended_at-r.started_at)/1000,durationInPeriodSeconds:Math.max(0,Math.min(r.ended_at??period.to,period.to)-Math.max(r.started_at,period.from))/1000,sourceStatedDurationSeconds:r.source_duration_seconds,author:r.author,comments:r.comments,rootCause:r.root_cause,includeInReports:Boolean(r.included),inBlendedFigure:Boolean(r.included&&cutover.at!==null&&r.started_at<cutover.at)}))
 const sourceResponseTimes=rows.filter(r=>r.kind==='response').map(r=>({source:r.source,label:`source: ${r.source}`,sourceRowId:r.source_row_id,batchId:r.batch_id,at:r.started_at,responseMs:r.response_ms}))
 return {cutover,segments,uptimeSegment,blended,sourceIncidents,sourceResponseTimes,
  provenance:batches.map(b=>({batchId:b.id,source:b.source,sourceMonitorId:b.source_monitor_id,fileDigest:b.file_digest,extractedAt:b.extracted_at,importedAt:b.imported_at,restoredAt:b.restored_at})),
  policy:'Each source has its own covered-time denominator. Blending uses source coverage before the cutover and observed Uptime time on or after it; post-cutover source history stays visible. Unknown native time is excluded. No source row is monitoring evidence.'}
}
