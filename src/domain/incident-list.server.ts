import type {Bindings} from './control.server.ts'
import {ReportInputError} from './reports/period.ts'

const instant=(value:string|null,fallback:number)=>{if(value===null)return fallback;const at=/^\d+$/.test(value)?Number(value):Date.parse(value);if(!Number.isSafeInteger(at)||at<0)throw new ReportInputError('Incident dates must be ISO 8601 or epoch milliseconds');return at}
/** Stable keyset pagination over durable scheduled confirmations; never current health. */
export async function incidentList(env:Bindings,params:URLSearchParams,now=Date.now()){
 const limit=params.has('limit')?Number(params.get('limit')):50,cursor=params.get('cursor');
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new ReportInputError('Incident page size must be between 1 and 100')
 if(cursor!==null&&(!/^[1-9][0-9]*$/.test(cursor)||!Number.isSafeInteger(Number(cursor))))throw new ReportInputError('Invalid incident cursor')
 const from=instant(params.get('from'),0),to=instant(params.get('to'),now),state=params.get('state');
 if(from>=to||to>now)throw new ReportInputError('Incident range must satisfy 0 <= from < to <= now')
 if(state&&!['open','acknowledged','resolved'].includes(state))throw new ReportInputError('Incident state must be open, acknowledged or resolved')
 const where=["opened.kind='trigger'","json_extract(opened.event,'$.observedAt')<?"],values:unknown[]=[to];
 if(cursor){where.push('opened.rowid<?');values.push(Number(cursor))}
 if(params.has('monitor')){where.push('opened.monitor_id=?');values.push(params.get('monitor'))}
 if(params.has('tag')){where.push("EXISTS(SELECT 1 FROM json_each(json_extract(m.definition,'$.tags')) WHERE value=?)");values.push(params.get('tag'))}
 if(params.has('rootCause')){where.push('w.root_category_id=?');values.push(params.get('rootCause'))}
 const rows=await env.DB.prepare(`WITH candidates AS (
 SELECT opened.rowid AS position,opened.id,opened.monitor_id,opened.event,opened.status,w.owner_id,w.status AS response_state,w.root_category_id,w.root_category_label,w.root_text,
 (SELECT closed.event FROM outbox closed WHERE closed.monitor_id=opened.monitor_id AND closed.kind='recovery'
 AND json_extract(closed.event,'$.incidentKey')=json_extract(opened.event,'$.incidentKey') ORDER BY closed.rowid LIMIT 1) AS recovery
 FROM outbox opened JOIN monitors m ON m.id=opened.monitor_id LEFT JOIN incident_work w ON w.incident_id=opened.id WHERE ${where.join(' AND ')})
 SELECT * FROM candidates WHERE (recovery IS NULL OR json_extract(recovery,'$.observedAt')>?)
 ${state?"AND (CASE WHEN recovery IS NOT NULL THEN 'resolved' ELSE coalesce(response_state,'open') END)=?":''}
 ORDER BY position DESC LIMIT ?`).bind(...values,from,...(state?[state]:[]),limit+1).all<any>();
 const page=rows.results.slice(0,limit);
 return {items:page.map(row=>{const trigger=JSON.parse(row.event),recovery=row.recovery?JSON.parse(row.recovery):null;return {
  id:row.id,key:trigger.incidentKey,monitorId:row.monitor_id,monitorName:trigger.monitorName,startedAt:trigger.observedAt,endedAt:recovery?.observedAt??null,
  durationSeconds:Math.max(0,((recovery?.observedAt??now)-trigger.observedAt)/1000),cause:trigger.explanation,failedLocations:trigger.incidentContext?.failedLocations??trigger.probes.filter((p:any)=>p.outcome!=='pass'),
  state:recovery?'resolved':row.response_state??'open',ownerId:row.owner_id??null,rootCause:{categoryId:row.root_category_id??null,categoryLabel:row.root_category_label??null,text:row.root_text??''},
  source:row.status==='imported-inactive'?'restored Uptime history':'Uptime',detailUrl:`/api/v1/incidents/${encodeURIComponent(row.id)}`}}),
  nextCursor:rows.results.length>limit?String(page.at(-1).position):null,limit,from,to};
}
