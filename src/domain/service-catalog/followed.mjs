// DEPENDENCY-002: every scheduled check of a followed service. The runner (or a hosted demo's Worker) reads the part its
// definition names with the same status-source reader as the live check, finding the provider's component or product by the
// id that check saved. The observation carries only derived facts, the provider's claim: who states it, about which part and
// region, what it states, from which address and when. A source over the reader's bound, a redirect, a moved catalog address,
// an unexpected shape or a missing part is Unknown evidence (dependency-status.mjs), never operational.
import {followedTarget} from './index.mjs';
import {readParts} from './parts.mjs';
import {STATUS_SOURCE_READ_LIMIT, statusSourceReader} from './reader/read.mjs';
import {dependencyMissingCheck} from '../dependency-status.mjs';
const UNKNOWN = {unreachable: 'source', moved: 'moved', shape: 'shape', 'too-large': 'too-large', 'component-missing': 'component'};
async function readFollowed(definition, {transport, signal}) {
  const followed = followedTarget(definition);
  if (!followed) return {problem: 'moved'};
  const reader = statusSourceReader({transport, signal, timeoutMs: definition.timeoutMs});
  let bytes = 0;
  const outcome = await readParts(followed.entry, [followed.target], async (...document) => { const read = await reader(...document); bytes += read.bytes ?? 0; return read; }, [definition.catalog.ref]);
  if (outcome.problem) return outcome;
  const [fact] = outcome.targets, component = followed.target.component;
  return {bytes, claim: {provider: definition.service, part: component?.name ?? null, region: component?.region ?? null, state: fact.state, stated: fact.stated, source: definition.url}};
}
const what = claim => `${claim.provider}${claim.part ? ` ${claim.part}` : ''}${claim.region ? ` (${claim.region})` : ''}`;
// The one check a claim yields; the Worker recomputes it from the claim, so a runner cannot pair a claim with another verdict.
export const claimChecks = (definition, claim) => [{assertion: 'claim', pass: claim.state === 'operational',
  reason: `${what(claim)}: the provider's own status source states “${claim.stated}”${claim.state === 'operational' ? '' : ', not operational'}. This is the provider's claim, not application health.`.slice(0, 300)}];
export async function probeFollowed(definition, probe, {transport, signal, runnerVersion}) {
  const startedAt = Date.now();
  let read;
  try { read = await readFollowed(definition, {transport, signal}); }
  catch (error) { if (signal?.aborted) throw error; read = {problem: 'unreachable'}; }
  const completedAt = Date.now(), base = {id: crypto.randomUUID(), probe, startedAt, completedAt, durationMs: completedAt - startedAt, runnerVersion};
  if (read.problem) return {...base, outcome: 'runner_error', checks: [dependencyMissingCheck(definition, UNKNOWN[read.problem])]};
  const claim = {...read.claim, readAt: completedAt};
  return {...base, outcome: claim.state === 'operational' ? 'pass' : 'target_failure', status: 200, bytes: read.bytes, claim, checks: claimChecks(definition, claim)};
}
const text = (value, max) => typeof value === 'string' && value.length >= 1 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const CLAIM_KEYS = 'part,provider,readAt,region,source,state,stated';
// What the Worker accepts as a followed service's claim observation.
export function validateClaimEvidence(o, definition) {
  const claim = o.claim;
  if (!definition.catalog || !claim || typeof claim !== 'object' || Array.isArray(claim) || Object.keys(claim).sort().join() !== CLAIM_KEYS ||
      claim.provider !== definition.service || claim.source !== definition.url || !['operational', 'issue'].includes(claim.state) || !text(claim.stated, 60) ||
      !(claim.part === null || text(claim.part, 100)) || !(claim.region === null || text(claim.region, 100)) ||
      !Number.isSafeInteger(claim.readAt) || claim.readAt < o.startedAt || claim.readAt > o.completedAt ||
      o.status !== 200 || !Number.isInteger(o.bytes) || o.bytes < 0 || o.bytes > STATUS_SOURCE_READ_LIMIT ||
      o.outcome !== (claim.state === 'operational' ? 'pass' : 'target_failure') || JSON.stringify(o.checks) !== JSON.stringify(claimChecks(definition, claim))) throw Error('Invalid provider claim evidence');
}
