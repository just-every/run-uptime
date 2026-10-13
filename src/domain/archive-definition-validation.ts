import {clock,object,type Tables} from './archive-schema.ts'
// Definition batches are portable history: who applied which file, when, and the revisions it produced. They hold no
// definitions, names, URLs or credentials; every entry must name a monitor and revisions present in the same archive.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const optionalClock=(v:any,label:string)=>{if(v!==null)clock(v,label)}
export function validateDefinitionBatches(t:Tables){
 const batches=new Set<string>(),monitors=new Set(t.monitors.map(m=>m.id)),revisions=new Set(t.revisions.map(r=>`${r.monitor_id}:${r.revision}`)),entries=new Set<string>()
 for(const b of t.definition_batches){
  if(!uuid.test(b.id)||batches.has(b.id)||!['operator','feature','anonymized'].includes(b.actor_kind)||(b.actor_kind==='feature'?b.actor_ref!=='local-cli':!uuid.test(b.actor_ref))||typeof b.source!=='string'||!/^[a-z][a-z0-9.-]{0,40}$/.test(b.source)||typeof b.plan_digest!=='string'||!/^[0-9a-f]{64}$/.test(b.plan_digest)||typeof b.counts!=='string')throw Error('Invalid archive definition batch')
  const counts=JSON.parse(b.counts);if(!object(counts)||Object.values(counts).some(n=>!Number.isSafeInteger(n)||Number(n)<0))throw Error('Invalid archive definition batch counts')
  clock(b.created_at,'definition batch');optionalClock(b.undone_at,'definition batch undo');optionalClock(b.restored_at,'definition batch restore');batches.add(b.id)
 }
 for(const e of t.definition_batch_entries){
  const key=`${e.batch_id}:${e.monitor_id}`
  if(!batches.has(e.batch_id)||!monitors.has(e.monitor_id)||entries.has(key)||!['create','change'].includes(e.action)||!revisions.has(`${e.monitor_id}:${e.revision}`)||(e.action==='create'?e.previous_revision!==null:!revisions.has(`${e.monitor_id}:${e.previous_revision}`))||(e.undo_outcome!==null&&!['paused','restored','edited-since','enabled-since','missing'].includes(e.undo_outcome)))throw Error('Invalid archive definition batch entry')
  entries.add(key)
 }
}
