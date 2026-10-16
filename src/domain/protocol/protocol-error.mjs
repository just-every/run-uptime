// A protocol check that ended before it had facts to evaluate: `category` is the evidence's error category (see
// evidence.server.ts: refused, timeout and unresolved are about the target; registry, vantage, dns, network and runner
// are about the monitor's own infrastructure and stay Unknown) and `reason` is the plain sentence the console shows.
export class ProtocolError extends Error{constructor(category,reason){super(reason??category);this.category=category;this.reason=reason}}
