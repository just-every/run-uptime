/** Missing, failed, expired, manual and foreign-revision evidence breaks a
 * consecutive window and can never close a degradation. Each slot contributes
 * one sample per selected location, never one per retry. */
export function slowEvaluation(definition,slots,observations,now){
 const policy=definition.slow;if(!policy)return null;
 const selected=policy.locations==='all'?definition.probes:policy.locations;
 const recent=slots.filter(s=>!s.manual).sort((a,b)=>b.due_at-a.due_at).slice(0,policy.slots);
 if(recent.length<policy.slots)return null;
 const values=[];
 for(let index=0;index<recent.length;index++){
  const slot=recent[index];
  if(slot.missed_count>0)return null;
  if(now-slot.due_at>definition.freshnessMs+index*definition.intervalMs)return null;
  const sample=[];
  for(const probe of selected){
   const attempts=observations.filter(o=>o.slot_id===slot.id&&o.probe===probe).map(o=>typeof o.evidence==='string'?JSON.parse(o.evidence):o.evidence).sort((a,b)=>b.attempt-a.attempt);
   const result=attempts[0];
   if(!result||result.outcome!=='pass'||result.canary&&result.canary.outcome!=='pass'||!Number.isFinite(result.durationMs))return null;
   sample.push(result.durationMs);
  }
  values.push(sample);
 }
 if(policy.mode==='consecutive')return {slow:values.every(sample=>sample.some(ms=>ms>policy.thresholdMs)),valueMs:Math.max(...values.flat()),locations:selected};
 const ordered=values.flat().sort((a,b)=>a-b),valueMs=ordered[Math.max(0,Math.ceil(ordered.length*policy.percentile/100)-1)];
 return {slow:valueMs>policy.thresholdMs,valueMs,locations:selected};
}
