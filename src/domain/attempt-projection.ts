// @ts-ignore Edition policy has public flow coverage.
import {evaluate} from './policy.mjs'
const evidence=(row:any)=>typeof row.evidence==='string'?JSON.parse(row.evidence):row.evidence
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
const skippedProbes=(slot:any)=>{
 const value=typeof slot.skipped_probes==='string'?JSON.parse(slot.skipped_probes):slot.skipped_probes;
 return new Set(Array.isArray(value)?value.filter((probe:any)=>typeof probe==='string'):[])
}
/** Fold each scheduled slot exactly once, preserving unbounded raw counters. A skipped runner's missing part cannot reset a streak or
 * advance recovery. Other timely evidence in that slot can still confirm failure when it independently meets the configured quorum. */
export function foldAttempts(definition:any,slots:any[],observations:any[],checkpoint:ProjectionCheckpoint={state:{},last:[]}){
 const grouped=observationsBySlot(observations);
 let {state,last}=checkpoint;
 for(const slot of slots.filter(s=>!s.manual).sort((a,b)=>a.due_at-b.due_at||a.id.localeCompare(b.id))){
  const observed=finalAttempts(definition,grouped.get(slot.id)??[]);
  const at=Math.max(slot.due_at,...observed.flatMap((o:any)=>[o.completedAt,o.canary?.completedAt??0]));
  if(skippedProbes(slot).size&&evaluate(definition,observed,state,at,false).candidate!=='Failing')continue;
  last=observed;
  state=evaluate(definition,last,state,at);
 }
 return {state,last}
}
/** Read-time freshness never consumes a scheduled slot or overwrites the fold. */
export function projectAttempts(definition:any,slots:any[],observations:any[],now:number,checkpoint?:ProjectionCheckpoint){
 const {state,last}=foldAttempts(definition,slots,observations,checkpoint);
 return evaluate(definition,last,state,now,false)
}
