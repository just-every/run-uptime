// The Worker's clock defines every time that sets a schedule: claim times, due times and the one-interval floor between starts.
// A runner's own clock may disagree with it by seconds, so each claim answer carries the Worker's time and the runner measures
// its offset from the exchange, excluding the Worker's claim-processing time. It keeps the offset of the quickest of its last
// twenty network exchanges, because a quick exchange bounds the error by half its network round trip, and reports every time it measured itself
// (the start and completion of an attempt, the timestamp of a signature) in the Worker's clock.
export function createClock({now = Date.now} = {}) {
  const recent = [];
  let best = null;
  const offsetMs = () => best?.offset ?? 0;
  const clock = {
    offsetMs,
    now: () => now() + offsetMs(),
    observe(sentAt, receivedAt, workerNow, workerReceivedAt = workerNow) {
      if (![sentAt, receivedAt, workerNow, workerReceivedAt].every(Number.isFinite)) return;
      const processingMs = workerNow - workerReceivedAt;
      const rtt = receivedAt - sentAt - processingMs;
      if (processingMs < 0 || rtt < 0) return;
      recent.push({rtt, offset: Math.round((workerReceivedAt - sentAt + workerNow - receivedAt) / 2)});
      if (recent.length > 20) recent.shift();
      best = recent.reduce((a, b) => b.rtt < a.rtt ? b : a);
    },
    // The attempt's own start and completion, in the Worker's clock. Both move by the same amount, so the attempt keeps its duration,
    // and an attempt never starts before the slot it answers was due: a few milliseconds of error in the measured offset cannot
    // make valid evidence look as if it began early.
    align(evidence, {dueAt} = {}) {
      const shift = Math.max(offsetMs(), Number.isFinite(dueAt) ? dueAt - evidence.startedAt : -Infinity);
      if (!shift) return evidence;
      return {...evidence, startedAt: evidence.startedAt + shift, completedAt: evidence.completedAt + shift, ...(evidence.claim ? {claim: {...evidence.claim, readAt: evidence.claim.readAt + shift}} : {}), ...(evidence.protocol?.transaction?{protocol:{...evidence.protocol,transaction:Object.fromEntries(Object.entries(evidence.protocol.transaction).map(([key,value])=>[key,['acceptedAt','receivedAt','cleanedAt'].includes(key)?value+shift:value]))}}:{}), ...(evidence.apiTransaction?{apiTransaction:{...evidence.apiTransaction,steps:evidence.apiTransaction.steps.map(step=>({...step,startedAt:step.startedAt+shift,completedAt:step.completedAt+shift}))}}:{}), ...(evidence.fixtures?{fixtures:{...evidence.fixtures,steps:evidence.fixtures.steps.map(step=>({...step,startedAt:step.startedAt+shift,completedAt:step.completedAt+shift}))}}:{}), ...(evidence.canary ? {canary: clock.align(evidence.canary, {dueAt})} : {})};
    },
  };
  return clock;
}
