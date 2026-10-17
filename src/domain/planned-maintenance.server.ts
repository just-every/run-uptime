import {get,revisionStatements,sha,type Bindings} from './control.server.ts'
import {auditStatement,type AuditActor} from './audit.server.ts'
import {classifyStorage} from './storage-error.ts'
// @ts-ignore Shared deterministic calendar and validation.
import {validateMaintenanceWindows,maintenanceOccurrences,previewRange,timestamp} from './planned-maintenance.mjs'

const conflict = () => Object.assign(Error('A selected monitor or the maintenance window changed since preview. Nothing was applied; preview again.'),{status:409})
function monitorIds(input:any):string[] {
  const ids = input?.monitorIds
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id=>typeof id!=='string'||!id||id.length>100)) throw Error('Select 1 to 100 distinct monitor IDs')
  return [...ids].sort()
}
async function selected(env:Bindings,input:any) {
  const monitors = await Promise.all(monitorIds(input).map(id=>get(env,id)))
  if (monitors.some(monitor=>!monitor)) throw Object.assign(Error('A selected monitor no longer exists'),{status:404})
  return monitors as NonNullable<Awaited<ReturnType<typeof get>>>[]
}
async function plan(env:Bindings,input:any,checkCapacity=true) {
  const window = validateMaintenanceWindows([input?.window])[0], monitors = await selected(env,input)
  for (const monitor of checkCapacity?monitors:[]) {
    if ((monitor.definition.maintenanceWindows??[]).some((existing:any)=>existing.id===window.id)) throw Error(`Maintenance window ${window.id} already exists on a selected monitor; cancel it before applying a replacement`)
    validateMaintenanceWindows([...(monitor.definition.maintenanceWindows??[]),window])
  }
  const defaultRange = previewRange(window)
  const from = input.from===undefined?defaultRange.from:timestamp(input.from,'preview from')
  const to = input.to===undefined?defaultRange.to:timestamp(input.to,'preview to')
  if (to<=from || to-from>370*86400000) throw Error('Maintenance preview range must be positive and at most 370 days')
  const selection = monitors.map(monitor=>({id:monitor.id,name:monitor.definition.name,revision:monitor.revision}))
  const review = {window,scope:{kind:'selected-monitors' as const,monitorIds:selection.map(monitor=>monitor.id)},monitors:selection,from,to,
    occurrences:maintenanceOccurrences(window,from,to),dstPolicy:window.weekly?'skip-gap-first-repeat':null,durationPolicy:'fixed-elapsed-minutes' as const}
  return {monitors,review,digest:await sha(JSON.stringify(review))}
}

/** A group selection is resolved by the caller to explicit IDs. The preview
 * names that fixed selection; later group edits never expand its authority. */
export async function previewMaintenance(env:Bindings,input:any) {
  const {review,digest} = await plan(env,input)
  return {...review,digest}
}
async function commit(env:Bindings,statements:D1PreparedStatement[]) {
  try { await env.DB.batch(statements) }
  catch(error) { if (classifyStorage(error)?.class==='guard_conflict') throw conflict(); throw error }
}
export async function applyMaintenance(env:Bindings,input:any,digest:string,actor:AuditActor) {
  const planned = await plan(env,input,false)
  if (typeof digest!=='string' || planned.digest!==digest) throw conflict()
  const now = Date.now(), statements:D1PreparedStatement[] = [], changed = []
  for (const monitor of planned.monitors) {
    const definition = {...monitor.definition,maintenanceWindows:validateMaintenanceWindows([...(monitor.definition.maintenanceWindows??[]),planned.review.window])}
    const revision = await revisionStatements(env,definition,monitor,monitor.id,now,actor,{keepHeartbeatToken:true})
    statements.push(...revision.statements,auditStatement(env,actor,'maintenance_apply','monitor',crypto.randomUUID(),'1',[],now))
    changed.push({id:monitor.id,revision:revision.revision})
  }
  await commit(env,statements)
  return {appliedAt:now,digest,windowId:planned.review.window.id,monitors:changed,preview:{...planned.review,digest}}
}
export async function cancelMaintenance(env:Bindings,input:any,actor:AuditActor) {
  if (typeof input?.windowId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(input.windowId)) throw Error('A maintenance window ID is required')
  const monitors = await selected(env,input), now = Date.now(), statements:D1PreparedStatement[] = [], changed = []
  for (const monitor of monitors) {
    if (input.revisions!==undefined && input.revisions?.[monitor.id]!==monitor.revision) throw conflict()
    const windows = monitor.definition.maintenanceWindows??[]
    if (!windows.some((window:any)=>window.id===input.windowId)) throw Error('The maintenance window is absent from a selected monitor')
    const definition = {...monitor.definition,maintenanceWindows:windows.filter((window:any)=>window.id!==input.windowId)}
    const revision = await revisionStatements(env,definition,monitor,monitor.id,now,actor,{keepHeartbeatToken:true})
    statements.push(...revision.statements,auditStatement(env,actor,'maintenance_cancel','monitor',crypto.randomUUID(),'1',[],now))
    changed.push({id:monitor.id,revision:revision.revision})
  }
  await commit(env,statements)
  return {cancelledAt:now,windowId:input.windowId,monitors:changed}
}
