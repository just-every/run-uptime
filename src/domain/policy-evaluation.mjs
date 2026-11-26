import {activeMaintenance} from './planned-maintenance.mjs';
import {heartbeatEvaluation} from './heartbeat-job.mjs';
import {policyReason} from './policy-reason.mjs';

// evidenceThrough only admits already accepted target/canary timestamps; it
// never advances freshness ages, heartbeat receipt validity or maintenance.
export function evaluate(def, observations, previous = {}, now = Date.now(), advance = true, evidenceThrough = now) {
  const regions = def.probes.map(probe => {
    const observation = observations.find(o => o.probe === probe);
    const retryComplete=observation?.retryComplete!==false;
    const canary=observation?.canary;
    const canaryFresh=canary?(canary.outcome==='pass'&&canary.completedAt<=evidenceThrough&&now-canary.completedAt<=def.freshnessMs):!def.assignments?.[probe]?.canaryUrl;
    // Current job snapshots own their cron/period deadline and duration rule.
    // Legacy receipts have only a period age; they cannot prove a cron window.
    const heartbeatFresh=def.type!=='heartbeat'||observation?.outcome!=='pass'||(Number.isFinite(observation.heartbeatReceivedAt)&&observation.heartbeatReceivedAt<=now&&(observation.heartbeatJob?heartbeatEvaluation(def,observation.heartbeatJob,now).outcome==='pass':!def.heartbeat.cron&&now-observation.heartbeatReceivedAt<=def.heartbeat.maxAgeMs+(def.heartbeat.graceMs??0)));
    const fresh = canaryFresh && observation && (observation.outcome!=='pass'||retryComplete) && heartbeatFresh && now - observation.completedAt <= def.freshnessMs && observation.completedAt <= evidenceThrough && !['runner_error','interrupted'].includes(observation.outcome);
    return { probe, networkLabel:def.assignments?.[probe]?.networkLabel??'owner-network', canaryPassed:Boolean(canary&&canaryFresh),terminal:Boolean(observation)&&retryComplete&&(observation.outcome!=='target_failure'||observation.attempt===def.retries), state:!fresh?'Unknown':observation.outcome==='pass'?'Healthy':'Failing', observationId:observation?.id??null,observedAt:observation?.completedAt??null };
  });
  const fails=regions.filter(r=>r.state==='Failing').length,unknown=regions.filter(r=>r.state==='Unknown').length;
  const coverageState=unknown?'Incomplete':'Complete';
  const absentLabels=new Set(observations.filter(o=>o.canary&&o.canary.outcome!=='pass').map(o=>def.assignments?.[o.probe]?.networkLabel??'owner-network'));
  // A canary belongs to its whole network label, not just its probe or key.
  // Until every configured-canary peer has a contiguous terminal chain, a
  // missing attempt or a later retry can still exclude that label. Unconfigured
  // probes cannot invalidate a settled witness and need not hold it back.
  const pendingLabels=new Set(regions.filter(r=>def.assignments?.[r.probe]?.canaryUrl&&!r.terminal).map(r=>r.networkLabel));
  const failures=regions.filter(r=>r.state==='Failing'&&r.terminal&&!absentLabels.has(r.networkLabel)&&!pendingLabels.has(r.networkLabel));
  const failingVantages=new Set(failures.map(r=>r.networkLabel)).size;
  const witnessed=failures.some(r=>r.canaryPassed);
  const failedCanary=observations.some(o=>o.canary&&o.canary.outcome!=='pass'&&o.outcome==='target_failure');
  // Assignment-free revisions retain their historical quorum until an owner saves
  // a new revision. New saves always pass assignDefinition's network boundary.
  const legacy=!def.assignments;
  const agreement=legacy?failures.length>=def.failureQuorum:failingVantages>=2||witnessed;
  const candidate=agreement?'Failing':fails||failedCanary?'Degraded':unknown?'Unknown':'Healthy';
  const failureStreak=advance?(candidate==='Failing'?(previous.failureStreak??0)+1:0):(previous.failureStreak??0);
  const recoveryStreak=advance?(candidate==='Healthy'?(previous.recoveryStreak??0)+1:0):(previous.recoveryStreak??0);
  let targetState=candidate;
  if(candidate==='Failing'&&failureStreak<def.confirmSlots)targetState='Degraded';
  if(candidate==='Healthy'&&previous.confirmedFailure&&recoveryStreak<def.recoverSlots)targetState='Recovering';
  const confirmedFailure=targetState==='Failing'||(previous.confirmedFailure&&targetState!=='Healthy');
  const maintenance=Boolean(activeMaintenance(def,now));
  const explanation=policyReason(def,observations,{candidate,targetState,agreement,failureStreak,recoveryStreak,now,evidenceThrough});
  return {state:maintenance?'Maintenance':targetState,targetState,underlyingState:targetState,evidenceState:candidate,coverageState,candidate,regions,denominator:def.probes.length,fails,unknown,failingVantages,failureStreak,recoveryStreak,confirmedFailure,notificationOpen:previous.notificationOpen??false,maintenance,reason:`${explanation}${explanation?' ':''}${fails}/${def.probes.length} selected probes failed; ${unknown} unknown; coverage ${coverageState.toLowerCase()}. ${failingVantages} independent failing vantages; passing external check ${regions.some(r=>r.canaryPassed)?'present':'absent'}; scheduled-slot confirmation ${Math.min(failureStreak,def.confirmSlots)}/${def.confirmSlots}; recovery ${Math.min(recoveryStreak,def.recoverSlots)}/${def.recoverSlots}.`,evaluatedAt:now};
}
