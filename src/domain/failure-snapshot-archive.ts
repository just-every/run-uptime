import {clock,identity,unique,type Tables} from './archive-schema.ts'
import {normalizeFailureSnapshot} from './failure-snapshot.mjs'
export function validateSnapshotArchive(t:Tables){
 unique(t.failure_snapshots,row=>row.observation_id,'failure snapshot')
 const slots=new Map(t.slots.map(row=>[row.id,row])),observations=new Map(t.observations.map(row=>[row.id,row]))
 for(const row of t.failure_snapshots){
  identity(row.observation_id,'failure snapshot');clock(row.captured_at,'snapshot capture');clock(row.expires_at,'snapshot expiry')
  const slot=slots.get(row.slot_id),observation=observations.get(row.observation_id)
  if(!slot||slot.monitor_id!==row.monitor_id||observation?.slot_id!==slot.id||row.expires_at<=row.captured_at)throw Error('Invalid failure snapshot reference')
  const evidence=JSON.parse(observation.evidence),snapshot=normalizeFailureSnapshot(JSON.parse(row.snapshot))
  if(evidence.outcome==='pass'||!['http','keyword'].includes(JSON.parse(slot.definition).type)||evidence.completedAt!==row.captured_at||!('unavailable' in snapshot)&&((evidence.status!==undefined?snapshot.status!==evidence.status:snapshot.status!==null&&!evidence.checks?.some((c:any)=>['timeout','connection','transport','encoding','body-limit'].includes(c.assertion)))||snapshot.durationMs!==evidence.durationMs)||JSON.stringify(snapshot)!==row.snapshot)throw Error('Invalid failure snapshot evidence')
 }
}
