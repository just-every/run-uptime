import { AuthError, deny } from './errors.mjs';
import { DEFAULT_ROLES, normalizeEmail, safeReturnTo, emailAllowed } from './policy.mjs';
import { requirePost } from './http.mjs';
import { operatorColumns } from './store.mjs';
export function administration(context) {
  const { config, store, clock, authorize, authenticate, newToken, sendLink, limit } = context;
  async function actorFor(request, action, target, role, mutation = true) {
    if (mutation) requirePost(request, config);
    const actor = await authenticate(request);
    if (!actor) deny('unauthenticated', 401);
    if (!await authorize({ actor: actor.operator, action, target, role })) deny();
    return actor;
  }
  async function targetFor(id) {
    const target = typeof id === 'string' ? await store.operator(id) : null;
    if (!target) deny('operator_not_found', 404);
    return target;
  }
  return {
    async invite(request, input) {
      const role = input.role ?? 'member';
      if (!DEFAULT_ROLES.includes(role)) throw new AuthError('invalid_role');
      const actor = await actorFor(request, 'operators:invite', undefined, role);
      const email = normalizeEmail(input.email);
      await limit(request, email, 'invite');
      if (!emailAllowed(email, config.allowList)) deny('email_not_allowed');
      const existing = await store.byEmail(email);
      const reinviting = existing?.status === 'inactive' && !!await store.cancellation(existing.id);
      if (existing && (existing.role !== role || (!reinviting && existing.status !== 'invited'))) deny('invitation_conflict', 409);
      const now = clock();
      const token = await newToken('invite', safeReturnTo(input.returnTo));
      const created = await store.invite({ operatorId: existing?.id ?? crypto.randomUUID(), expectedVersion: existing?.version ?? 1, reinviting, email, displayName: displayName(input.displayName), role, token, now }, actor);
      if (!created) deny('invitation_conflict', 409);
      await sendLink(email, token);
      return { status: 'accepted' };
    },
    async listOperators(request) {
      const actor = await actorFor(request, 'operators:list', undefined, undefined, false);
      const fence = store.actorFence(actor, clock());
      const rows = await store.statement(`SELECT ${operatorColumns} FROM oa_operators WHERE ${fence.sql} ORDER BY created_at,id`, fence.args).all();
      return rows.results;
    },
    async cancelInvitation(request, operatorId) {
      const target = await targetFor(operatorId);
      const actor = await actorFor(request, 'operators:deactivate', target);
      if (target.status !== 'invited') deny('invitation_conflict', 409);
      const fence = store.actorFence(actor, clock());
      // The guarded write and version trigger are one transaction: cancellation
      // invalidates every outstanding link and cannot deactivate a raced join.
      // Read the ledger to fail closed if its migration is missing. A previous
      // cancellation remains guarded throughout reinvitation; cancelling again
      // refreshes that marker through the existing database trigger.
      await store.cancellation(target.id);
      const result = await store.run(`UPDATE oa_operators SET status='inactive' WHERE id=? AND status='invited' AND version=?
        AND ${fence.sql}`,
        [target.id, target.version, ...fence.args]);
      if (result.meta.changes < 1) deny('authority_changed', 409);
      return store.operator(target.id);
    },
    async setOperatorStatus(request, operatorId, status) {
      if (status !== 'active' && status !== 'inactive') throw new AuthError('invalid_status');
      const target = await targetFor(operatorId);
      const actor = await actorFor(request, status === 'active' ? 'operators:reactivate' : 'operators:deactivate', target);
      if (target.status === 'invited') deny('invitation_required', 409);
      const fence = store.actorFence(actor, clock());
      try {
        const result = await store.run(`UPDATE oa_operators SET status=? WHERE id=? AND version=? AND ${fence.sql}`, [status, target.id, target.version, ...fence.args]);
        if (result.meta.changes < 1) deny('authority_changed', 409);
      } catch (e) {
        if (String(e).includes('last_owner')) deny('last_owner', 409);
        if (String(e).includes('invitation_required')) deny('invitation_required', 409);
        throw e;
      }
      return store.operator(target.id);
    },
    async setRole(request, operatorId, role) {
      if (!DEFAULT_ROLES.includes(role)) throw new AuthError('invalid_role');
      const target = await targetFor(operatorId);
      const actor = await actorFor(request, 'operators:role', target, role);
      const fence = store.actorFence(actor, clock());
      try {
        const result = await store.run(`UPDATE oa_operators SET role=? WHERE id=? AND version=? AND ${fence.sql}`, [role, target.id, target.version, ...fence.args]);
        if (result.meta.changes < 1) deny('authority_changed', 409);
      } catch (e) { if (String(e).includes('last_owner')) deny('last_owner', 409); throw e; }
      return store.operator(target.id);
    },
    async listSessions(request, operatorId) {
      const current = await authenticate(request);
      if (!current) deny('unauthenticated', 401);
      const target = await targetFor(operatorId ?? current.operator.id);
      const actor = await actorFor(request, 'sessions:list', target, undefined, false);
      const now = clock();
      const fence = store.actorFence(actor, now);
      const rows = await store.statement(`SELECT s.id,s.kind,s.created_at AS createdAt,s.expires_at AS expiresAt,
        CASE WHEN s.revoked_at IS NOT NULL OR s.operator_version!=o.version OR o.status!='active' OR s.expires_at<=? THEN 0 ELSE 1 END AS active
        FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.operator_id=? AND o.version=? AND ${fence.sql} ORDER BY s.created_at DESC,s.id`, [now, target.id, target.version, ...fence.args]).all();
      return rows.results.map((r) => ({ ...r, active: !!r.active }));
    },
    async revokeSession(request, sessionId) {
      const row = await store.first('SELECT operator_id AS operatorId FROM oa_sessions WHERE id=?', [sessionId]);
      if (!row) deny('session_not_found', 404);
      const target = await targetFor(row.operatorId);
      const actor = await actorFor(request, 'sessions:revoke', target);
      const now = clock();
      const fence = store.actorFence(actor, now);
      const result = await store.run(`UPDATE oa_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=?) AND ${fence.sql}`, [now, sessionId, target.id, target.version, ...fence.args]);
      if (result.meta.changes < 1) deny('authority_changed', 409);
    },
  };
}
export function displayName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[\x00-\x1f]/.test(value)) throw new AuthError('invalid_display_name');
  return value.trim();
}
