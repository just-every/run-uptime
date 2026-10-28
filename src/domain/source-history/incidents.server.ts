import type {Bindings} from '../control.server.ts'
import {credentialMonitorFilter} from '../credentials/model.server.ts'
import {ReportInputError} from '../reports/period.ts'
import {sha256} from '../definitions/format.ts'
/** A separate cursor space over source rows. No source incident acquires native follow-up authority. */
export async function sourceIncidentList(env:Bindings,params:URLSearchParams,now:number){
 const limit=params.has('limit')?Number(params.get('limit')):50,cursor=params.get('cursor')
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new ReportInputError('Incident page size must be between 1 and 100')
 if(cursor!==null&&(!/^[1-9][0-9]*$/.test(cursor)||!Number.isSafeInteger(Number(cursor))))throw new ReportInputError('Invalid incident cursor')
 const instant=(value:string|null,fallback:number)=>value===null?fallback:/^\d+$/.test(value)?Number(value):Date.parse(value)
 const from=instant(params.get('from'),0),to=instant(params.get('to'),now),state=params.get('state')
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||from>=to||to>now)throw new ReportInputError('Incident range must satisfy 0 <= from < to <= now')
 if(state&&!['open','resolved'].includes(state))throw new ReportInputError(`Source “UptimeRobot” has no response state “${state}”`,'source_unavailable')
 if(params.has('rootCause'))throw new ReportInputError('Source “UptimeRobot” root causes are source text, without Uptime category IDs','source_unavailable')
 const filter=credentialMonitorFilter(env,'m'),conditions=[filter.sql,"r.source='UptimeRobot'","r.kind IN ('down','incident')"],values:unknown[]=[...filter.params]
 if(params.has('monitor')){conditions.push('r.monitor_id=?');values.push(params.get('monitor'))}
 if(params.has('tag')){conditions.push("EXISTS(SELECT 1 FROM json_each(json_extract(m.definition,'$.tags')) WHERE value=?)");values.push(params.get('tag'))}
 const available=await env.DB.prepare(`SELECT 1 FROM source_history_rows r JOIN monitors m ON m.id=r.monitor_id WHERE ${conditions.join(' AND ')} LIMIT 1`).bind(...values).first()
 if(!available)throw new ReportInputError('Source “UptimeRobot” incidents are unavailable for the selected monitors','source_unavailable')
 conditions.push('r.started_at<?','(r.ended_at IS NULL OR r.ended_at>?)');values.push(to,from)
 if(cursor){conditions.push('r.rowid<?');values.push(Number(cursor))}
 if(state){conditions.push(state==='open'?'r.ended_at IS NULL':'r.ended_at IS NOT NULL')}
 const rows=(await env.DB.prepare(`SELECT r.*,r.rowid AS position,json_extract(m.definition,'$.name') AS monitor_name FROM source_history_rows r JOIN monitors m ON m.id=r.monitor_id WHERE ${conditions.join(' AND ')} ORDER BY r.rowid DESC LIMIT ?`).bind(...values,limit+1).all<any>()).results,page=rows.slice(0,limit)
 return {items:await Promise.all(page.map(async r=>({id:'source:'+await sha256(JSON.stringify([r.monitor_id,r.source,r.source_row_id])),key:r.source_row_id,monitorId:r.monitor_id,monitorName:r.monitor_name,startedAt:r.started_at,endedAt:r.ended_at,durationSeconds:r.ended_at===null?null:(r.ended_at-r.started_at)/1000,cause:r.root_cause,failedLocations:[],state:r.ended_at===null?'open':'resolved',ownerId:null,rootCause:{categoryId:null,categoryLabel:null,text:r.root_cause},source:r.source,label:`source: ${r.source}`,author:r.author,comments:r.comments,sourceRowId:r.source_row_id,batchId:r.batch_id,detailUrl:`/api/v1/monitors/${encodeURIComponent(r.monitor_id)}/report?`+new URLSearchParams({from:String(r.started_at),to:String(r.ended_at??to),source:'UptimeRobot',bucket:'1d'})}))),nextCursor:rows.length>limit?String(page.at(-1).position):null,limit,from,to}
}
