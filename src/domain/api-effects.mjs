// API-004: effects that need an owner's exact, time-limited grant. A step is live when the owner marks it with an effect, when
// it is a refund, when anything it sends has the shape of a Stripe live-mode key, or when its response says livemode: true.
// Stripe test mode and the buyer's own sandbox resources need no grant. Shared by the Worker (grant records) and the runner
// (refusal before a request is sent, and on every attempt).
export const API_EFFECTS = Object.freeze(['live-payment', 'refund', 'destructive-write']);
export const GRANT_LIMITS = Object.freeze({maxMs: 24 * 60 * 60 * 1000, maxSpend: 100000000});
const LIVE_KEY = /\b(?:sk|rk)_live_[0-9A-Za-z]{8,}/;
export const liveCredentialShape = values => values.some(value => typeof value === 'string' && LIVE_KEY.test(value));
/** The effect a step declares by itself: the owner's mark, or a refund path. Live mode is found at run time. */
export function declaredEffect(step) {
  if (step.effect) return step.effect;
  try { return /\/refunds?(?:\/|$)/i.test(new URL(step.url.replace(/\{\{[A-Za-z0-9_]+\}\}/g, 'value')).pathname) ? 'refund' : null; } catch { return null; }
}
/** A live request spends its integer `amount` (JSON or form body, minor currency units), and at least 1. */
export function stepSpend(body) {
  if (typeof body !== 'string' || !body) return 1;
  let amount;
  try { amount = JSON.parse(body)?.amount; } catch { amount = Number(new URLSearchParams(body).get('amount')); }
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 1;
}
export const responseLivemode = body => { try { return JSON.parse(body)?.livemode === true; } catch { return false; } };
/** The grant a claim names for an effect, unexpired at `now`, or null. Revocation and the spend left are checked by the control
 * plane when a request spends it; a claim carries no allowance a runner could spend by itself. */
export const activeGrant = (grants, effect, now) => (grants ?? []).find(g => g.effect === effect && g.expiresAt > now) ?? null;
export function validateGrantInput(input, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['effect', 'spendLimit', 'expiresAt'].includes(key))) throw Error('A grant names one effect, an integer spend limit and an expiry');
  if (!API_EFFECTS.includes(input.effect)) throw Error(`A grant effect is one of ${API_EFFECTS.join(', ')}`);
  if (!Number.isSafeInteger(input.spendLimit) || input.spendLimit < 1 || input.spendLimit > GRANT_LIMITS.maxSpend) throw Error(`A grant spend limit is a whole number from 1 to ${GRANT_LIMITS.maxSpend}`);
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now || input.expiresAt > now + GRANT_LIMITS.maxMs) throw Error('A grant expires within 24 hours');
  return {effect: input.effect, spendLimit: input.spendLimit, expiresAt: input.expiresAt};
}
