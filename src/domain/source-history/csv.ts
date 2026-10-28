import {sourceInstant,sourceText,refuse,boundRows,type HistoryFile,type HistoryRow} from './model.ts'
import {sha256} from '../definitions/format.ts'
function records(text:string){
 const result:string[][]=[];let field='',row:string[]=[],quoted=false
 for(let i=0;i<text.length;i++){
  const c=text[i]
  if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c;continue}
  if(c==='"'){if(field)refuse(`CSV row ${result.length+1}: misplaced quote`);quoted=true}
  else if(c===','){row.push(field);field=''}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))result.push(row);row=[];field=''}else field+=c
 }
 if(quoted)refuse(`CSV row ${result.length+1}: unterminated quote`)
 row.push(field);if(row.some(v=>v.trim()))result.push(row)
 return result
}
// UptimeRobot publishes no fixed log CSV schema. Only this documented vocabulary is read.
const vocabulary:Record<string,string[]>={monitorId:['monitor id','monitor_id','monitorid'],name:['monitor','monitor name','friendlyname','friendly name'],event:['event','status','type'],at:['date-time','date time','datetime','date','time','timestamp'],end:['resolved at','resolved_at','resolvedat','end time','ended at'],id:['id','log id','incident id','source row id'],duration:['duration','duration seconds'],reason:['reason','root cause'],author:['author','source author'],comments:['comment','comments'],exported:['exported at','extracted at'],from:['period start','coverage from'],to:['period end','coverage to']}
export async function parseHistoryCsv(text:string):Promise<HistoryFile>{
 const all=records(text.replace(/^\uFEFF/,'')),header=all.shift()??[],indices:Record<string,number>={}
 for(const [i,value] of header.entries()){
  const key=Object.keys(vocabulary).find(key=>vocabulary[key].includes(value.trim().toLowerCase()))
  if(!key)refuse(`Unrecognised history column “${value}”`)
  if(indices[key]!==undefined)refuse(`Repeated history column “${value}”`)
  indices[key!]=i
 }
 for(const key of ['at','event'])if(indices[key]===undefined)refuse(`History header needs a ${key==='at'?'date/time':'event/status/type'} column; received: ${header.join(', ')}`)
 boundRows(all)
 if(!all.length)refuse('History file has 0 rows')
 let extractedAt:number|null=null,coverageFrom:number|null=null,coverageTo:number|null=null
 const rows:HistoryRow[]=[]
 for(const [i,record] of all.entries()){
  const line=`CSV row ${i+2}`,get=(key:string)=>indices[key]===undefined?'':record[indices[key]]?.trim()??''
  if(record.length!==header.length)refuse(`${line}: expected ${header.length} columns, received ${record.length}`)
  const event=get('event').toLowerCase()
  if(!['down','up','1','2'].includes(event))refuse(`${line}, column “${header[indices.event]}”: unrecognised event “${get('event')}”`)
  const startedAt=sourceInstant(get('at'),`${line}, column “${header[indices.at]}”`),kind=event==='down'||event==='1'?'down':'up'
  let duration:number|null=null
  if(get('duration')){
   const value=get('duration'),hms=/^(\d+):(\d\d):(\d\d)$/.exec(value)
   duration=hms&&+hms[2]<60&&+hms[3]<60?+hms[1]*3600 + +hms[2]*60 + +hms[3]:/^\d+(?:\.\d+)?$/.test(value)?Number(value):null
   if(duration===null||!Number.isFinite(duration))refuse(`${line}, column “${header[indices.duration]}”: unrecognised duration “${value}”`)
  }
  const row:HistoryRow={sourceMonitorId:get('monitorId'),sourceRowId:get('id'),name:get('name'),kind,startedAt,endedAt:get('end')?sourceInstant(get('end'),`${line}, resolved at`):null,responseMs:null,sourceDurationSeconds:duration,author:sourceText(get('author'),line),comments:sourceText(get('comments'),line),rootCause:sourceText(get('reason'),line),included:true,line}
  if(row.endedAt!==null&&row.endedAt<startedAt)refuse(`${line}: end precedes start`)
  row.sourceRowId||=await sha256(JSON.stringify({...row,line:undefined}))
  rows.push(row)
  for(const key of ['exported','from','to'])if(get(key)){
   const at=sourceInstant(get(key),`${line}, ${key}`),previous=key==='exported'?extractedAt:key==='from'?coverageFrom:coverageTo
   if(previous!==null&&previous!==at)refuse(`${line}: inconsistent ${key} timestamp`)
   if(key==='exported')extractedAt=at;else if(key==='from')coverageFrom=at;else coverageTo=at
  }
 }
 for(const id of new Set(rows.map(r=>r.sourceMonitorId))){
  const events=rows.filter(r=>r.sourceMonitorId===id).sort((a,b)=>a.startedAt-b.startedAt)
  for(const [i,row] of events.entries())if(row.kind==='down'&&row.endedAt===null){
   const next=events[i+1]
   if(next?.kind==='up')row.endedAt=next.startedAt
   else if(next)refuse(`${row.line}: Down has no following Up timestamp`)
   // A last unresolved Down remains source history; no end is invented from a duration.
  }
 }
 const from=coverageFrom??Math.min(...rows.map(r=>r.startedAt)),to=coverageTo??Math.max(...rows.map(r=>r.endedAt??r.startedAt))
 if(from>to||rows.some(r=>r.startedAt<from||(r.endedAt??r.startedAt)>to))refuse('Source rows fall outside the stated coverage range')
 return {rows,extractedAt,coverageFrom:from,coverageTo:to,columns:header}
}
