// DISCOVERY-001 portability: authorized sources (identifiers only, never a credential), the derived snapshots of finished runs and
// the owner's decisions. Restore makes every source inactive, so nothing is read until the receiving owner authorizes it again.
// @ts-ignore Shared source and run validation; edition JavaScript.
import {SOURCE_KINDS,validateSourceInput,validateSourceRun} from './discovery-sources.mjs'
export const discoveryArchiveColumns:Record<string,string[]>={
 discovery_sources:['id','kind','label','identifiers','authorized_by','authorized_at','state'],
 discovery_source_runs:['id','source_id','started_at','finished_at','since','status','result','error'],
 discovery_decisions:['source_id','candidate_key','decision','monitor_id','run_id','decided_at','actor_id'],
}
// Monitor erasure removes the decisions that name the monitor; operator erasure removes the operator from sources and decisions.
export const discoveryMonitorErasureTables=['discovery_decisions']
export const discoveryOperatorErasure=['UPDATE discovery_sources SET authorized_by=NULL WHERE authorized_by=?','UPDATE discovery_decisions SET actor_id=NULL WHERE actor_id=?']
export function restoreDiscoverySources(t:Record<string,any[]>){for(const row of t.discovery_sources)row.state='inactive'}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const clock=(value:any)=>Number.isSafeInteger(value)&&value>=0
const ref=(value:any)=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[\x00-\x1f\x7f]/.test(value)
export function validateDiscoveryArchive(t:Record<string,any[]>){
 const fail=()=>{throw Error('Invalid discovery source archive')},sources=new Map<string,any>(),runs=new Map<string,any>()
 for(const row of t.discovery_sources){
  if(!uuid.test(row.id)||sources.has(row.id)||!Object.hasOwn(SOURCE_KINDS,row.kind)||!['active','inactive'].includes(row.state)||!clock(row.authorized_at)||!(row.authorized_by===null||ref(row.authorized_by)))fail()
  let checked;try{checked=validateSourceInput({kind:row.kind,label:row.label,identifiers:JSON.parse(row.identifiers)})}catch{fail()}
  if(checked.label!==row.label||JSON.stringify(checked.identifiers)!==row.identifiers)fail()
  sources.set(row.id,{...row,identifiers:checked.identifiers})
 }
 for(const row of t.discovery_source_runs){
  const source=sources.get(row.source_id)
  if(!uuid.test(row.id)||runs.has(row.id)||!source||!clock(row.started_at)||!clock(row.finished_at)||row.finished_at<row.started_at||!(row.since===null||clock(row.since))||!['done','failed'].includes(row.status))fail()
  if(row.status==='failed'){if(row.result!==null||typeof row.error!=='string'||!row.error||row.error.length>200)fail()}
  else{
   if(row.error!==null||typeof row.result!=='string')fail()
   try{validateSourceRun(JSON.parse(row.result),{source:row.source_id})}catch{fail()}
  }
  runs.set(row.id,row)
 }
 const monitors=new Set(t.monitors.map(row=>row.id)),seen=new Set<string>()
 for(const row of t.discovery_decisions){
  const key=`${row.source_id}:${row.candidate_key}`,run=runs.get(row.run_id)
  if(!sources.has(row.source_id)||seen.has(key)||typeof row.candidate_key!=='string'||!/^[a-z0-9-]{1,80}$/.test(row.candidate_key)||!run||run.source_id!==row.source_id||!['rejected','adopted'].includes(row.decision)||!clock(row.decided_at)||!(row.actor_id===null||ref(row.actor_id)))fail()
  if(row.decision==='adopted'?!monitors.has(row.monitor_id):row.monitor_id!==null)fail()
  seen.add(key)
 }
}
