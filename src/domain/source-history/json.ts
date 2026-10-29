import {withheldCredentials} from '../business-import/credential-shapes.ts'
import {jsonValues,sha256} from '../definitions/format.ts'
import {withholdValue} from '../definitions/withhold.ts'
import {sourceIdentity,sourceInstant,sourceText,refuse,boundRows,type HistoryFile,type HistoryRow} from './model.ts'
const list=(value:any):any[]=>Array.isArray(value)?value.flatMap(list):Array.isArray(value?.data)?value.data:[value]
export function isIncidentJson(text:string){
 if(!/^\s*[[{]/.test(text))return false
 try{return jsonValues(text,'history').some((value:any)=>list(value?.incidents??value).some(row=>row&&typeof row==='object'&&'startedAt' in row&&('resolvedAt' in row||'rootCause' in row))||value?.responseTimes)}catch{return false}
}
/** Saved v3 /incidents pages or detail captures, optionally wrapped with the source monitor and extraction range.
 * /monitors/{id}/response-time-stats time_series points retain their published millisecond units separately. */
export async function parseHistoryJson(text:string,context:any={}):Promise<HistoryFile>{
 const captures=jsonValues(text,'history'),rows:HistoryRow[]=[],warnings:string[]=[]
 let extractedAt:number|null=context.extractedAt===undefined?null:sourceInstant(context.extractedAt,'extractedAt'),coverageFrom:number|null=context.coverageFrom===undefined?null:sourceInstant(context.coverageFrom,'coverageFrom'),coverageTo:number|null=context.coverageTo===undefined?null:sourceInstant(context.coverageTo,'coverageTo')
 for(const [page,value] of captures.flatMap((v:any)=>Array.isArray(v)?v:[v]).entries()){
  const capture:any=value
  for(const [field,key] of [['extractedAt','extractedAt'],['coverageFrom','coverageFrom'],['coverageTo','coverageTo']] as const)if(capture?.[key]!==undefined){
   const at=sourceInstant(capture[key],`JSON capture ${page+1}, ${field}`),old:number|null=field==='extractedAt'?extractedAt:field==='coverageFrom'?coverageFrom:coverageTo
   if(old!==null&&old!==at)refuse(`JSON capture ${page+1}: inconsistent ${field}`)
   if(field==='extractedAt')extractedAt=at;else if(field==='coverageFrom')coverageFrom=at;else coverageTo=at
  }
  const incidents=capture?.incidents??(capture?.responseTimes?[]:capture)
  for(const [index,item] of list(incidents).entries()){
   const line=`JSON capture ${page+1}, incident ${index+1}`
   if(!item||typeof item!=='object'||!('startedAt' in item)||!('resolvedAt' in item))refuse(`${line}: expected v3 incident startedAt and resolvedAt`)
   if(item.includeInReports!==undefined&&typeof item.includeInReports!=='boolean')refuse(`${line}, includeInReports: expected a boolean`)
   const startedAt=sourceInstant(item.startedAt,`${line}, startedAt`),endedAt=item.resolvedAt===null?null:sourceInstant(item.resolvedAt,`${line}, resolvedAt`)
   if(endedAt!==null&&endedAt<startedAt)refuse(`${line}: resolvedAt precedes startedAt`)
   const sourceMonitorId=sourceIdentity(item.monitor?.id??capture.monitorId??context.sourceMonitorId,`${line}, monitor.id (or capture monitorId)`)
   const savedComments=item.comments??capture.comments?.[item.id]
   if(savedComments?.nextLink)refuse(`${line}, comments: more source pages remain; save every comment page before importing this incident`)
   if(savedComments===undefined)warnings.push(`${line}: comment bodies are not exposed by the saved incident list. Include the saved comments response for this incident from GET /incidents/{id}/comments; commentsCount is not a comment thread.`)
   if(!Object.hasOwn(item,'rootCause'))warnings.push(`${line}: rootCause is not exposed by the saved incident list. Include the saved detail response from GET /incidents/{id}; a summary reason is not the detailed root cause.`)
   const commentsValue=savedComments?.data??savedComments??[]
   if(!Array.isArray(commentsValue))refuse(`${line}, comments: expected saved comment rows`)
   const comments=commentsValue.map((c:any,i:number)=>({text:sourceText(c.comment,`${line}, comment ${i+1}`),author:sourceText(c.user?.fullName??c.author,`${line}, comment author`),createdAt:c.created===undefined?null:sourceInstant(c.created,`${line}, comment created`)}))
   const root=item.rootCause
   const rootCause=typeof root==='string'?root:root?JSON.stringify(withheldCredentials(withholdValue(root))):item.reason??''
   if(item.duration!==undefined&&item.duration!==null&&(!Number.isFinite(item.duration)||item.duration<0))refuse(`${line}, duration: expected nonnegative seconds`)
   rows.push({sourceMonitorId,sourceRowId:sourceIdentity(item.id,`${line}, id`),name:sourceText(item.monitor?.friendlyName??capture.monitorName,line),kind:'incident',startedAt,endedAt,responseMs:null,sourceDurationSeconds:item.duration??null,author:sourceText(item.author??item.user?.fullName,line),comments:sourceText(JSON.stringify(comments),line+', combined comments'),rootCause:sourceText(rootCause,line),included:item.includeInReports!==false,line})
  }
  if(capture.responseTimes){
   const samples=capture.responseTimes
   if(!Array.isArray(samples.time_series))refuse(`JSON capture ${page+1}, responseTimes.time_series: expected source samples`)
   const sourceMonitorId=sourceIdentity(capture.monitorId??context.sourceMonitorId,`JSON capture ${page+1}, monitorId`)
   for(const [i,sample] of samples.time_series.entries()){
    const line=`JSON capture ${page+1}, response sample ${i+1}`,startedAt=sourceInstant(sample.timestamp,line)
    if(typeof sample.value!=='number'||!Number.isFinite(sample.value)||sample.value<0)refuse(`${line}: value must be response time in milliseconds`)
    rows.push({sourceMonitorId,sourceRowId:'response:'+await sha256(JSON.stringify([sourceMonitorId,startedAt,sample.value])),name:capture.monitorName??'',kind:'response',startedAt,endedAt:startedAt,responseMs:sample.value,sourceDurationSeconds:null,author:'',comments:'',rootCause:'',included:true,line})
   }
  }
 }
 boundRows(rows)
 if(!rows.length)refuse('History file has 0 rows')
 if((coverageFrom===null)!==(coverageTo===null))refuse('Supply both coverageFrom/Period Start and coverageTo/Period End')
 const from=coverageFrom??Math.min(...rows.map(r=>r.startedAt)),to=coverageTo??Math.max(...rows.map(r=>r.endedAt??r.startedAt))
 if(from>to||rows.some(r=>r.startedAt<from||(r.endedAt??r.startedAt)>to))refuse('Source rows fall outside the stated coverage range')
 return {rows,extractedAt,coverageFrom:from,coverageTo:to,coverageExplicit:coverageFrom!==null&&coverageTo!==null,columns:[],warnings}
}
