import {columns,identity,object,shape,type Tables,type ArchiveSelection} from './archive-schema.ts'
import type {Bindings} from './control.server.ts'

/** An explicit request never falls back to a whole-installation export. */
export function archiveSelection(params:URLSearchParams):ArchiveSelection|undefined{
 if(!params.size)return;
 if([...params.keys()].some(key=>key!=='monitor'))throw Error('Unsupported archive selection; use repeated monitor parameters')
 const monitorIds=params.getAll('monitor')
 if(!monitorIds.length||monitorIds.length>100)throw Error(`Archive monitor selection bound exceeded: ${monitorIds.length} requested (1 to 100 required)`)
 for(const id of monitorIds)identity(id,'selection monitor')
 if(new Set(monitorIds).size!==monitorIds.length)throw Error('Duplicate archive selection monitor')
 return {kind:'monitors',monitorIds:monitorIds.sort(),sharedRecords:'installation-history-v1'}
}

/** Each portable table has an explicit ownership decision; schema growth fails closed. */
export function selectionFilter(name:string,selection:ArchiveSelection){
 const ids='SELECT value FROM json_each(?)',monitors=`monitor_id IN (${ids})`
 const jobs=`SELECT id FROM notification_jobs WHERE json_extract(event,'$.monitorId') IN (${ids}) OR json_extract(event,'$.monitorId') IS NULL`
 let sql:string
 if(name==='monitors')sql=`id IN (${ids})`
 else if(columns[name].includes('monitor_id'))sql=monitors
 else if(name==='observations')sql=`slot_id IN (SELECT id FROM slots WHERE ${monitors})`
 else if(name==='notification_jobs')sql=`id IN (${jobs})`
 else if(name==='integration_deliveries')sql=`id IN (${jobs})`
 else if(['notification_delivery_attempts','integration_attempts','integration_resolutions'].includes(name))sql=`delivery_id IN (${jobs})`
 else if(name==='archive_history')sql=`CASE table_name
  WHEN 'monitors' THEN json_extract(record,'$.id') IN (${ids})
  WHEN 'slots' THEN json_extract(record,'$.monitor_id') IN (${ids})
  WHEN 'outbox' THEN json_extract(record,'$.monitor_id') IN (${ids})
  WHEN 'notification_jobs' THEN json_extract(record,'$.id') IN (${jobs})
  WHEN 'integration_deliveries' THEN json_extract(record,'$.id') IN (${jobs})
  ELSE 1 END`
 else if(['migrations','notification_destinations','integration_replays','uptime_erasure_receipts','uptime_audit','incident_settings','definition_batches','auxiliary_attempts','discovery_sources','discovery_source_runs'].includes(name))sql='1'
 else throw Error(`Archive selection has no ownership rule: ${name}`)
 // Rejected discovery decisions are shared history without a monitor.
 if(name==='discovery_decisions')sql=`(${sql} OR monitor_id IS NULL)`
 const count=sql.split('?').length-1
 return {sql,params:Array(count).fill(JSON.stringify(selection.monitorIds))}
}

export async function requireSelectionMonitors(env:Bindings,selection:ArchiveSelection){
 const rows=await env.DB.prepare('SELECT id FROM monitors WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(selection.monitorIds)).all<{id:string}>()
 if(rows.results.length!==selection.monitorIds.length)throw Error('Archive selection contains an unavailable monitor')
}

/** JSON replay bodies retain their monitor identity; opaque replay bodies cannot
 * be scoped safely. No guessing or implicit monitor expansion is permitted. */
function replayMonitor(row:any){
 const envelope=JSON.parse(row.envelope)
 let event;try{event=JSON.parse(envelope.body)}catch{throw Error('Archive selection cannot scope an opaque replay; export the whole installation')}
 if(!object(event)||!Object.hasOwn(event,'monitorId')||event.monitorId!==null&&typeof event.monitorId!=='string')throw Error('Archive selection cannot scope a replay; export the whole installation')
 return event.monitorId
}
export function projectSelectionReplays(t:Tables,selection:ArchiveSelection){
 const selected=new Set(selection.monitorIds)
 t.integration_replays=t.integration_replays.filter(row=>{const id=replayMonitor(row);return id===null||selected.has(id)})
}

export function validateArchiveSelection(selection:any,t:Tables){
 shape(selection,['kind','monitorIds','sharedRecords'],'selection')
 if(selection.kind!=='monitors'||selection.sharedRecords!=='installation-history-v1'||!Array.isArray(selection.monitorIds)||!selection.monitorIds.length||selection.monitorIds.length>100)throw Error('Invalid archive selection')
 for(const id of selection.monitorIds)identity(id,'selection monitor')
 const selected=new Set(selection.monitorIds)
 if(selected.size!==selection.monitorIds.length||JSON.stringify(selection.monitorIds)!==JSON.stringify([...selected].sort())||JSON.stringify(t.monitors.map(m=>m.id).sort())!==JSON.stringify(selection.monitorIds))throw Error('Archive selection monitor mismatch')
 for(const row of t.integration_replays){const id=replayMonitor(row);if(id!==null&&!selected.has(id))throw Error('Archive selection replay mismatch')}
 const checkDefinition=(text:string)=>{
  const definition=JSON.parse(text)
  if((definition.dependencies??[]).some((id:string)=>!selected.has(id)))throw Error('Archive selection crosses a monitor dependency; select every referenced monitor')
 }
 for(const row of t.monitors)checkDefinition(row.definition)
 for(const row of t.revisions)checkDefinition(row.definition)
 for(const row of t.slots)checkDefinition(row.definition)
 for(const row of t.archive_history)if(row.table_name==='monitors'||row.table_name==='slots')checkDefinition(JSON.parse(row.record).definition)
 for(const row of t.scheduled_reports){
  const snapshot=JSON.parse(row.report)
  if(snapshot.service?.monitors?.some((m:any)=>!selected.has(m.id))||snapshot.members?.some((m:any)=>!selected.has(m.monitor?.id)))throw Error('Archive selection crosses a service report; select every referenced monitor')
 }
 for(const row of t.notification_jobs){const event=JSON.parse(row.event);if(event.monitorId!==null&&!selected.has(event.monitorId))throw Error('Archive selection notification mismatch')}
 // Ordinary archive validation checks the complete remaining graph, including
 // dependency acknowledgements, incident timelines and original-history copies.
}
