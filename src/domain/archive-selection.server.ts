import {columns,identity,object,shape,type Tables,type ArchiveSelection} from './archive-schema.ts'
import type {Bindings} from './control.server.ts'

const MONITORS=100
/** An explicit request never falls back to a whole-installation export. A range
 * without monitors selects every monitor, resolved to explicit IDs by the export. */
export function archiveSelection(params:URLSearchParams):ArchiveSelection|undefined{
 if(!params.size)return;
 if([...params.keys()].some(key=>!['monitor','from','to'].includes(key)))throw Error('Unsupported archive selection; use repeated monitor parameters and an optional from and to range')
 const monitorIds=params.getAll('monitor'),from=params.get('from'),to=params.get('to')
 if((from===null)!==(to===null))throw Error('Archive range selection needs both from and to (milliseconds since the Unix epoch)')
 const range=from===null?undefined:{from:Number(from),to:Number(to)}
 if(range&&!(Number.isSafeInteger(range.from)&&Number.isSafeInteger(range.to)&&range.from>=0&&range.from<range.to))throw Error('Invalid archive range: from must be before to')
 if(monitorIds.length>MONITORS||!monitorIds.length&&!range)throw Error(`Archive monitor selection bound exceeded: ${monitorIds.length} requested (1 to ${MONITORS} required)`)
 for(const id of monitorIds)identity(id,'selection monitor')
 if(new Set(monitorIds).size!==monitorIds.length)throw Error('Duplicate archive selection monitor')
 return {kind:'monitors',monitorIds:monitorIds.sort(),sharedRecords:'installation-history-v1',...(range?{range}:{})}
}

/** Each portable table has an explicit ownership decision; schema growth fails closed.
 * A range keeps every selected monitor's definitions and revisions but only the history
 * its scheduled slots own: their evidence, events, notifications and incident work.
 * Integers are validated before they are written into the statement. */
export function selectionFilter(name:string,selection:ArchiveSelection){
 const range=selection.range,ids='SELECT value FROM json_each(?)',monitors=`monitor_id IN (${ids})`
 const due=range?` AND due_at>=${range.from} AND due_at<${range.to}`:''
 const slots=`SELECT id FROM slots WHERE ${monitors}${due}`
 const owned=`slot_id IN (${slots})`
 const triggers=`SELECT id FROM outbox WHERE kind='trigger' AND ${owned}`
 const reports=range?`SELECT delivery_id FROM scheduled_reports WHERE ${monitors} AND due_at>=${range.from} AND due_at<${range.to}`:''
 const jobs=`SELECT id FROM notification_jobs WHERE json_extract(event,'$.monitorId') IS NULL OR ${range?`json_extract(event,'$.slotId') IN (${slots}) OR id IN (${reports})`:`json_extract(event,'$.monitorId') IN (${ids})`}`
 let sql:string
 if(name==='monitors')sql=`id IN (${ids})`
 else if(name==='slots')sql=`${monitors}${due}`
 else if(range&&['outbox','failure_snapshots','cleanup_debt'].includes(name))sql=`${monitors} AND ${owned}`
 else if(name==='heartbeat_runs'&&range)sql=`${monitors} AND received_at>=${range.from} AND received_at<${range.to}`
 else if(name==='scheduled_reports'&&range)sql=`${monitors} AND due_at>=${range.from} AND due_at<${range.to}`
 else if(range&&name.startsWith('incident_')&&columns[name].includes('incident_id'))sql=`${monitors} AND incident_id IN (${triggers})`
 else if(range&&name==='dependency_acks')sql=`${monitors} AND notice_id IN (SELECT id FROM outbox WHERE ${owned})`
 else if(columns[name].includes('monitor_id'))sql=monitors
 else if(name==='observations')sql=owned
 else if(name==='notification_jobs')sql=`id IN (${jobs})`
 else if(name==='integration_deliveries')sql=`id IN (${jobs})`
 else if(['notification_delivery_attempts','integration_attempts','integration_resolutions'].includes(name))sql=`delivery_id IN (${jobs})`
 else if(name==='archive_history')sql=`CASE table_name
  WHEN 'monitors' THEN json_extract(record,'$.id') IN (${ids})
  WHEN 'slots' THEN json_extract(record,'$.id') IN (${slots})
  WHEN 'outbox' THEN json_extract(record,'$.slot_id') IN (${slots})
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

/** Resolves a range-only request to every monitor, then refuses what cannot be scoped. */
export async function resolveSelection(env:Bindings,selection:ArchiveSelection):Promise<ArchiveSelection>{
 let resolved=selection
 if(!selection.monitorIds.length){
  const all=(await env.DB.prepare('SELECT id FROM monitors ORDER BY id LIMIT ?').bind(MONITORS+1).all<{id:string}>()).results.map(row=>row.id)
  if(!all.length||all.length>MONITORS)throw Error(`Archive monitor selection bound exceeded: ${all.length} monitors (1 to ${MONITORS} required); select monitors explicitly`)
  resolved={...selection,monitorIds:all}
 }
 const rows=await env.DB.prepare('SELECT id FROM monitors WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(resolved.monitorIds)).all<{id:string}>()
 if(rows.results.length!==resolved.monitorIds.length)throw Error('Archive selection contains an unavailable monitor')
 if(resolved.range){
  const imported=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM source_history_batches WHERE monitor_id IN (SELECT value FROM json_each(?))) n').bind(JSON.stringify(resolved.monitorIds)).first<{n:number}>()
  if(imported?.n)throw Error('Archive range selection cannot scope imported source history; export the monitors without a range')
 }
 return resolved
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
 shape(selection,['kind','monitorIds','sharedRecords',...(selection?.range!==undefined?['range']:[])],'selection')
 const range=selection.range
 if(range!==undefined){shape(range,['from','to'],'selection range');if(!Number.isSafeInteger(range.from)||!Number.isSafeInteger(range.to)||range.from<0||range.from>=range.to)throw Error('Invalid archive selection range')}
 if(selection.kind!=='monitors'||selection.sharedRecords!=='installation-history-v1'||!Array.isArray(selection.monitorIds)||!selection.monitorIds.length||selection.monitorIds.length>MONITORS)throw Error('Invalid archive selection')
 for(const id of selection.monitorIds)identity(id,'selection monitor')
 const selected=new Set(selection.monitorIds)
 if(selected.size!==selection.monitorIds.length||JSON.stringify(selection.monitorIds)!==JSON.stringify([...selected].sort())||JSON.stringify(t.monitors.map(m=>m.id).sort())!==JSON.stringify(selection.monitorIds))throw Error('Archive selection monitor mismatch')
 for(const row of t.integration_replays){const id=replayMonitor(row);if(id!==null&&!selected.has(id))throw Error('Archive selection replay mismatch')}
 const checkDefinition=(text:string)=>{
  const definition=JSON.parse(text)
  if((definition.dependencies??[]).some((id:string)=>!selected.has(id)))throw Error('Archive selection crosses a monitor dependency; select every referenced monitor')
 }
 for(const row of t.monitors)checkDefinition(row.definition)
 if(range){
  const inside=(value:number)=>value>=range.from&&value<range.to
  if(t.slots.some(row=>!inside(row.due_at))||t.scheduled_reports.some(row=>!inside(row.due_at))||t.heartbeat_runs.some(row=>!inside(row.received_at)))throw Error('Archive range selection holds history outside its range')
  if(t.source_history_batches.length||t.source_history_rows.length)throw Error('Archive range selection cannot scope imported source history')
  const outbox=new Set(t.outbox.map(row=>row.id))
  if(t.dependency_acks.some(row=>row.via_incident_id!==null&&!outbox.has(row.via_incident_id)))throw Error('Archive range selection crosses a dependency acknowledgement incident; widen the range')
 }
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
