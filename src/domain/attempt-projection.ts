// @ts-ignore Edition policy has public flow coverage.
import {evaluate} from './policy.mjs'
const evidence=(row:any)=>{
 const value=typeof row.evidence==='string'?JSON.parse(row.evidence):row.evidence;
 return row.received_at==null?value:{...value,receivedAt:row.received_at,...(value.canary?{canary:{...value.canary,receivedAt:row.received_at}}:{})}
}
const evidenceThrough=(observations:any[],now:number)=>observations.reduce((at,o)=>Math.max(at,o.completedAt,o.canary?.completedAt??0),now)
const completedAt=(o:any)=>Math.min(o.completedAt,o.receivedAt??o.completedAt)
export function finalAttempts(definition:any,observations:any[]){
 return definition.probes.flatMap((probe:string)=>{
  const chain=observations.filter(o=>o.probe===probe).sort((a,b)=>b.attempt-a.attempt)
  if(!chain.length)return [];
  // A terminal retry implies every preceding target failure was attempted.
  // Keep partial deliveries visible, but do not treat their missing evidence
  // (which can still contain a failed canary) as an incident decision.
  const retryComplete=chain.every((o,i)=>o.attempt===chain[0].attempt-i)&&chain.length===chain[0].attempt+1;
  // A failed canary removes this vantage for the whole slot, including when
  // a later target retry carries another canary sample. Retain all stored
  // evidence; only the projection selects the conservative network witness.
  const failedCanary=chain.find(o=>o.canary&&o.canary.outcome!=='pass')?.canary;
  return [{...chain[0],retryComplete,...(failedCanary?{canary:failedCanary}:{})}]
 })
}
export function terminalSlot(definition:any,observations:any[]){
 const finals=finalAttempts(definition,observations);
 return finals.length===definition.probes.length&&finals.every((o:any)=>o.retryComplete&&(o.outcome!=='target_failure'||o.attempt===definition.retries))
}
export type ProjectionCheckpoint={state:any;last:any[]}
export function observationsBySlot(observations:any[]){
 const grouped=new Map<string,any[]>();
 for(const row of observations){const values=grouped.get(row.slot_id)??[];values.push(evidence(row));grouped.set(row.slot_id,values)}
 return grouped
}
/** Fold each scheduled slot exactly once, preserving unbounded raw counters. Settled skipped slots are neutral without failure agreement;
 * unresolved slots bound streaks conservatively while later independent evidence can still confirm failure or complete recovery. */
export function foldAttempts(definition:any,slots:any[],observations:any[],checkpoint:ProjectionCheckpoint={state:{},last:[]}){
 const grouped=observationsBySlot(observations);
 let {state,last}=checkpoint;
 for(const slot of slots.filter(s=>!s.manual).sort((a,b)=>a.due_at-b.due_at||a.id.localeCompare(b.id))){
  const observed=finalAttempts(definition,grouped.get(slot.id)??[]);
  // An accepted future clock cannot age another witness out of confirmation.
  // Receipt clocks cap the historical fold, not the signed timestamps. Stored
  // receipt times keep replay and checkpoint counters stable after time passes.
  const at=Math.max(slot.due_at,...observed.flatMap((o:any)=>[completedAt(o),o.canary?completedAt(o.canary):0]));
  const decision=evaluate(definition,observed,state,at,true,evidenceThrough(observed,at));
  // Independent failure agreement is already a decision even when another
  // vantage is pending or skipped. An unresolved non-agreement might still
  // become a missing slot, so neither streak can cross it yet. Continue from
  // that lower bound, retaining confirmed failure until complete recovery.
  // Checkpoints stop before pending slots; settled replay restores exact
  // counters if the slot instead proves skipped and remains neutral.
  if(decision.candidate!=='Failing'){
   if(slot.pending){state={...state,failureStreak:0,recoveryStreak:0};continue;}
   if(slot.skipped)continue;
  }
  last=observed;
  state=decision;
 }
 return {state,last}
}
/** Read-time freshness never consumes a scheduled slot or overwrites the fold. */
export function projectAttempts(definition:any,slots:any[],observations:any[],now:number,checkpoint?:ProjectionCheckpoint){
 const {state,last}=foldAttempts(definition,slots,observations,checkpoint);
 // Pending classification bounds counters, not visible coverage. Show the
 // newest non-skipped slot's actual observations while historical eligibility
 // waits for a runner to advance or the fixed classification deadline to pass.
 const latest=slots.filter(s=>!s.manual&&!s.skipped).sort((a,b)=>b.due_at-a.due_at||b.id.localeCompare(a.id))[0];
 const visible=latest?finalAttempts(definition,observationsBySlot(observations).get(latest.id)??[]):last;
 // Every visible observation has passed completion admission. Keep accepted
 // target and canary clocks visible on later arrivals and reads, even when a
 // runner is slightly ahead. They cannot advance maintenance or evidence age.
 return evaluate(definition,visible,state,now,false,evidenceThrough(visible,now))
}
/** A newly claimed check has no result yet. Keep the latest scheduled evidence
 * visible during that open acceptance window, with its original freshness.
 * Any returned attempt or an expired window replaces it, even if incomplete.
 * This is owner-read visibility only; result admission and incident folding
 * continue to include every scheduled slot through projectAttempts. */
export function projectRecentAttempts(definition:any,slots:any[],observations:any[],now:number,checkpoint?:ProjectionCheckpoint){
 const grouped=observationsBySlot(observations),waiting=new Set<string>();
 for(const slot of slots.filter(s=>!s.manual&&!s.skipped).sort((a,b)=>b.due_at-a.due_at||b.id.localeCompare(a.id))){
  if(slot.lease_until<=now||grouped.get(slot.id)?.length)break;
  waiting.add(slot.id);
 }
 return projectAttempts(definition,slots.filter(s=>!waiting.has(s.id)),observations,now,checkpoint)
}
