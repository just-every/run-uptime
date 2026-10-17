const failedChecks=observation=>[observation?.status?`HTTP ${observation.status}`:'',observation?.checks?.filter(check=>!check.pass).map(check=>check.reason).join('; ')||'no passing result'].filter(Boolean).join('; ');

// Explain the policy separately from the numerical evidence. These are existing
// signed, sanitized diagnostics, never response bodies or external-check URLs.
export function policyReason(def,observations,{candidate,targetState,agreement,failureStreak,recoveryStreak,now,evidenceThrough}){
 const reasons=[];
 if(targetState==='Degraded'&&candidate==='Failing')reasons.push(`Failure agreement reached; waiting for scheduled confirmation ${failureStreak}/${def.confirmSlots}.`);
 else if(candidate==='Degraded'&&!agreement)reasons.push('Target failure is visible, but independent failure agreement is not established.');
 else if(targetState==='Recovering')reasons.push(`Passing scheduled checks are restoring coverage; waiting for recovery ${recoveryStreak}/${def.recoverSlots}.`);
 else if(candidate==='Unknown')reasons.push(observations.length?'Scheduled evidence is missing, stale or incomplete.':'Waiting for scheduled check evidence; no result means Unknown.');
 for(const probe of def.probes){
  const label=def.assignments?.[probe]?.runnerId==='self-00000000-0000-4000-8000-000000000019'?'Cloudflare Worker':`Check ${def.probes.indexOf(probe)+1}`;
  const observation=observations.find(row=>row.probe===probe);
  if(!observation)continue;
  if(observation.outcome==='pass'&&def.type==='heartbeat'&&observation.heartbeatJob?.late)reasons.push(`${label}: Late job success received.`);
  if(observation.outcome!=='pass')reasons.push(`${label}: ${failedChecks(observation)}.`);
  if(observation.retryComplete===false)reasons.push(`${label} has incomplete retry evidence.`);
  const canary=observation.canary;
  if(def.assignments?.[probe]?.canaryUrl&&!canary)reasons.push(`External check for ${label} has no result; this network cannot confirm a target outage.`);
  else if(canary?.outcome!=='pass'&&canary)reasons.push(`External check for ${label}: ${failedChecks(canary)}. This network cannot confirm a target outage.`);
  else if(canary&&(canary.completedAt>evidenceThrough||now-canary.completedAt>def.freshnessMs))reasons.push(`External check for ${label} has no fresh passing result; this network cannot confirm a target outage.`);
 }
 if(candidate==='Degraded'&&!agreement&&!observations.some(row=>row.canary)&&!def.probes.some(probe=>def.assignments?.[probe]?.canaryUrl))reasons.push('Use a second independent network or a passing external check to confirm the failure.');
 return reasons.join(' ');
}
