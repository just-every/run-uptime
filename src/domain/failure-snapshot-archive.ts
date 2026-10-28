import {clock,identity,unique,type Tables} from './archive-schema.ts'
import {DIAGNOSTIC_PROTOCOLS,validateProtocolDiagnosticSnapshot} from './network-diagnostics.mjs'
import {normalizeFailureSnapshot} from './failure-snapshot.mjs'
export function validateSnapshotArchive(t:Tables){
 unique(t.failure_snapshots,row=>row.observation_id,'failure snapshot')
 const slots=new Map(t.slots.map(row=>[row.id,row])),observations=new Map(t.observations.map(row=>[row.id,row]))
 for(const row of t.failure_snapshots){
  identity(row.observation_id,'failure snapshot');clock(row.captured_at,'snapshot capture');clock(row.expires_at,'snapshot expiry')
  const slot=slots.get(row.slot_id),observation=observations.get(row.observation_id)
  if(!slot||slot.monitor_id!==row.monitor_id||observation?.slot_id!==slot.id||row.expires_at<=row.captured_at)throw Error('Invalid failure snapshot reference')
  const evidence=JSON.parse(observation.evidence),type=JSON.parse(slot.definition).type,snapshot=normalizeFailureSnapshot(JSON.parse(row.snapshot))
  if(evidence.outcome==='pass'||!['http','keyword','flow',...DIAGNOSTIC_PROTOCOLS].includes(type)||evidence.completedAt!==row.captured_at||JSON.stringify(snapshot)!==row.snapshot)throw Error('Invalid failure snapshot evidence')
  if(!('unavailable' in snapshot)){
   const protocol=DIAGNOSTIC_PROTOCOLS.includes(type);
   if(protocol)validateProtocolDiagnosticSnapshot(snapshot,JSON.parse(slot.definition),evidence);
   const validStatus=protocol?snapshot.status===null:type==='flow'?snapshot.status===null:evidence.status!==undefined?snapshot.status===evidence.status:snapshot.status===null||evidence.checks?.some((c:any)=>['timeout','connection','transport','encoding','body-limit'].includes(c.assertion));
   if(!validStatus||snapshot.durationMs!==evidence.durationMs||type!=='flow'&&snapshot.artifacts)throw Error('Invalid failure snapshot evidence')
  }
 }
}
