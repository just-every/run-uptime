import { AuthError } from './errors.mjs';
export const DEFAULT_ROLES = Object.freeze(['owner', 'admin', 'member']);
export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new AuthError('invalid_email');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+$/.test(email)) throw new AuthError('invalid_email');
  return email;
}
export function safeReturnTo(value, fallback = '/app') {
  const safeFallback = fallback === '/app' ? '/app' : safeReturnTo(fallback);
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) return safeFallback;
  // Decode repeatedly to reject encoded slash/backslash/control redirect tricks.
  let decoded = value;
  for (let i = 0; i < 4; i++) {
    try { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; } catch { return safeFallback; }
    if (decoded.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(decoded)) return safeFallback;
  }
  return value;
}
export function emailAllowed(email, allowList) {
  return allowList === undefined || allowList.includes(email);
}
export function isActiveOperator(operator, allowList) {
  return !!operator && operator.status === 'active' && emailAllowed(operator.email, allowList);
}
// Default applied: owner/admin/member. A product can replace this pure policy,
// but never the active-session guard or the database's final-owner protection.
export function defaultRolePolicy({ actor, action, target, role }) {
  if (!isActiveOperator(actor) || !['operators:list', 'operators:invite', 'operators:deactivate', 'operators:reactivate', 'operators:role', 'sessions:list', 'sessions:revoke'].includes(action)) return false;
  if (action === 'sessions:list' || action === 'sessions:revoke') {
    if (target?.id === actor.id) return true;
  }
  if (actor.role === 'owner') return true;
  if (actor.role !== 'admin') return false;
  if (action === 'operators:list') return true;
  if (action === 'operators:invite') return role === 'member';
  if (target?.role !== 'member') return false;
  return action !== 'operators:role' || role === 'member';
}
