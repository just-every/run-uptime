// DEPENDENCY-002 portability: followed services, dependency notice acknowledgements and the dependency context of notices.
// Followed services restore with their monitors, paused and inactive: nothing here carries authority or resumes a send.
export const dependencyArchiveColumns:Record<string,string[]>={
 followed_services:['monitor_id','entry_id','catalog_version','scope','component_key','followed_at','checked_at'],
 dependency_acks:['notice_id','monitor_id','acknowledged_at','actor_id','via_incident_id'],
}
// Monitor erasure removes a monitor's own rows in these tables.
export const dependencyMonitorErasureTables=['followed_services','dependency_acks']
export const DEPENDENCY_KINDS=['dependency','dependency_recovery']
const object=(value:any)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const clock=(value:any)=>Number.isSafeInteger(value)&&value>=0
const text=(value:any,max:number)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value)
export function validateDependencyEvent(event:any){
 const isNotice=DEPENDENCY_KINDS.includes(event.kind)
 if(event.dependency===undefined){if(isNotice)throw Error('Invalid dependency notice');return}
 const context=event.dependency,fail=()=>{throw Error('Invalid dependency notice context')}
 if(!isNotice||!object(context)||Object.keys(context).sort().join(',')!=='catalogVersion,component,entryId,provider,scope,source,stated')fail()
 if(!text(context.entryId,80)||!Number.isSafeInteger(context.catalogVersion)||context.catalogVersion<1||!text(context.provider,100)||!(context.component===null||text(context.component,100))||!['whole','component'].includes(context.scope)||(context.scope==='component')!==(context.component!==null)||!text(context.stated,60)||!text(context.source,2048))fail()
}
export function validateDependencyArchive(t:Record<string,any[]>){
 const fail=()=>{throw Error('Invalid dependency archive')},monitors=new Set(t.monitors.map(row=>row.id)),followed=new Set<string>(),entries=new Set<string>()
 for(const row of t.followed_services){
  if(!monitors.has(row.monitor_id)||followed.has(row.monitor_id)||!text(row.entry_id,80)||!Number.isSafeInteger(row.catalog_version)||row.catalog_version<1||!['whole','component'].includes(row.scope)||(row.scope==='component')!==(row.component_key!==null)||!(row.component_key===null||text(row.component_key,80))||!clock(row.followed_at)||!(row.checked_at===null||clock(row.checked_at)))fail()
  const key=`${row.entry_id}:${row.scope}:${row.component_key??''}`;if(entries.has(key))fail()
  followed.add(row.monitor_id);entries.add(key)
 }
 const notices=new Map(t.outbox.filter(row=>row.kind==='dependency').map(row=>[row.id,row]))
 const seen=new Set<string>()
 for(const row of t.dependency_acks){
  const notice=notices.get(row.notice_id)
  if(!notice||notice.monitor_id!==row.monitor_id||seen.has(row.notice_id)||!clock(row.acknowledged_at)||!(row.actor_id===null||text(row.actor_id,512))||!(row.via_incident_id===null||text(row.via_incident_id,512)))fail()
  seen.add(row.notice_id)
 }
 for(const row of t.outbox)if(DEPENDENCY_KINDS.includes(row.kind)&&!followed.has(row.monitor_id))fail()
}
