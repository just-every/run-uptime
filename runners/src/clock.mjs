// The Worker's clock defines every time that sets a schedule: claim times, due times and the one-interval floor between starts.
// A runner's own clock may disagree with it by seconds, so each claim answer carries the Worker's time and the runner measures
// its offset from the exchange (the Worker's time minus the midpoint of the request). It keeps the offset of the quickest of its last
// twenty exchanges, because a quick exchange bounds the error by half its round trip, and reports every time it measured itself
// (the start and completion of an attempt, the timestamp of a signature) in the Worker's clock.
export function createClock({now = Date.now} = {}) {
  const recent = [];
  let best = null;
  const offsetMs = () => best?.offset ?? 0;
  const clock = {
    offsetMs,
    now: () => now() + offsetMs(),
    observe(sentAt, receivedAt, workerNow) {
      if (![sentAt, receivedAt, workerNow].every(Number.isFinite) || receivedAt < sentAt) return;
      recent.push({rtt: receivedAt - sentAt, offset: Math.round(workerNow - (sentAt + receivedAt) / 2)});
      if (recent.length > 20) recent.shift();
      best = recent.reduce((a, b) => b.rtt < a.rtt ? b : a);
    },
    // The attempt's own start and completion, in the Worker's clock. Both move by the same amount, so the attempt keeps its duration,
    // and an attempt never starts before the slot it answers was due: a few milliseconds of error in the measured offset cannot
    // make valid evidence look as if it began early.
    align(evidence, {dueAt} = {}) {
      const shift = Math.max(offsetMs(), Number.isFinite(dueAt) ? dueAt - evidence.startedAt : -Infinity);
      if (!shift) return evidence;
      return {...evidence, startedAt: evidence.startedAt + shift, completedAt: evidence.completedAt + shift, ...(evidence.canary ? {canary: clock.align(evidence.canary, {dueAt})} : {})};
    },
  };
  return clock;
}
