// The composed operator auth: identity (email link, OIDC providers) over
// Base's own accounts (the oa_ store), with dev sessions admitted only behind
// the local key gate.
import { linkMessage } from './identity/email-link/message.mjs';
import { AuthError, deny } from './errors.mjs';
import { configure } from './config.mjs';
import { opaqueToken, validToken, constantEqual } from './crypto.mjs';
import { safeReturnTo, normalizeEmail, emailDomain } from './policy.mjs';
import { requirePost, requireOrigin, requireLoopback, readCookie, sessionCookie } from './http.mjs';
import { AuthStore } from './accounts/store.mjs';
import { administration, displayName } from './accounts/admin.mjs';
import { emailAllowed, isActiveOperator, defaultRolePolicy } from './accounts/roles.mjs';
import { oaSessions, createOaAccounts } from './accounts/oa.mjs';
import { createAdmission, legacyAdmission } from './identity/admission.mjs';
import { createOidcProviders } from './identity/oidc/index.mjs';
import { isLocalCli } from './local-cli.mjs';
import { devAdmitted } from './dev-admission.mjs';

// Actions that need a fresh app-local email-link proof. A provider-issued
// session never satisfies one: an identity provider can assert any email.
export const STEP_UP_ACTIONS = Object.freeze(['providers:unlink', 'providers:relink', 'domains:change', 'owner:transfer', 'export', 'delete', 'credentials:mint']);
export const STEP_UP_SECONDS = 600;

export function createOperatorAuth({ db, config: input, mailSender, clientIp, rolePolicy = defaultRolePolicy, clock = Date.now, hooks = {}, fetch, waitUntil }) {
  const config = configure(input);
  if (typeof clientIp !== 'function') throw new AuthError('client_ip_required', 503);
  if (!hooks || typeof hooks !== 'object' || ['beforeMagicLink', 'afterConfirm'].some(name => hooks[name] !== undefined && typeof hooks[name] !== 'function')) throw new AuthError('invalid_configuration', 503);
  const store = new AuthStore(db);
  const sessions = oaSessions({ config, store, clock });
  const { hash, newSession, completed, authenticate } = sessions;
  const accounts = createOaAccounts({ config, store, clock, sessions, rolePolicy });
  const admission = createAdmission({ accounts, config, clock, hooks });
  const providers = config.providers.length ? createOidcProviders({ admission, db, clientIp, clock, waitUntil, ...(fetch ? { fetch } : {}),
    config: { origin: config.origin, local: config.local, transactionSecret: config.OIDC_TRANSACTION_SECRET, providers: config.providers, signInPath: config.branding.signInPath,
      timeoutMs: config.identityTimeoutMs, startLimit: config.identityStartLimit } }) : null;
  async function limit(request, email, scope) {
    // The CLI's own loopback sign-in and owner claim are not a person's attempts.
    if ((scope === 'magic' || scope === 'bootstrap') && await isLocalCli(request, config)) return;
    const ip = await clientIp(request);
    if (typeof ip !== 'string' || !ip || ip.length > 128) deny('client_ip_unavailable', 503);
    const keys = await Promise.all([hash('rate', `${scope}:ip:${ip}`), hash('rate', `${scope}:email:${email}`)]);
    const counts = await store.limits(keys, clock(), config.limitWindowSeconds * 1000);
    if (counts[0] > config.ipLimit || counts[1] > config.emailLimit) deny('rate_limited', 429);
  }
  async function newToken(kind, returnTo) {
    const token = opaqueToken();
    return { id: crypto.randomUUID(), token, hash: await hash('link', token), kind, returnTo, expiresAt: clock() + config.linkSeconds * 1000 };
  }
  // The email link: the app's own proof that a person holds an address.
  async function sendLink(email, token, revoke = () => store.run('UPDATE oa_tokens SET revoked_at=? WHERE id=?', [clock(), token.id])) {
    if (!mailSender || !config.MAIL_FROM) { await revoke(); deny('mail_unavailable', 503); }
    const url = new URL('/auth/confirm', config.origin);
    url.searchParams.set('token', token.token);
    let result;
    try {
      result = await mailSender.send({ deliveryId: token.id, from: config.MAIL_FROM, to: [email],
        ...linkMessage(config, token, url.href),
        headers: { 'Auto-Submitted': 'auto-generated' } });
    } catch { await revoke(); deny('mail_unavailable', 503); }
    if (result?.status !== 'accepted' && !(result?.status === 'development' && config.local)) {
      // Even ambiguous delivery cannot leave a valid, unreported auth link.
      await revoke(); deny('mail_unavailable', 503);
    }
  }
  // A domain's required provider refuses the email link and every other
  // non-provider route; owners are exempt.
  async function requireRoute(operator) {
    if (operator.role === 'owner' && operator.status === 'active') return;
    if (await accounts.requiredProvider(operator.email)) deny('provider_required');
  }
  async function requireFreshProof(actor) {
    if (!await store.steppedUp(actor, clock() - STEP_UP_SECONDS * 1000)) deny('step_up_required', 403);
  }
  async function authorizedLink(request, digest) {
    const link = await store.preview(digest, clock());
    if (!link || !emailAllowed(link.email, config.allowList)) return null;
    if (link.dev && !await devAdmitted(request)) return null;
    if (link.kind !== 'invite') return { link };
    const issuer = await store.operator(link.issuerId);
    if (!isActiveOperator(issuer, config.allowList) || issuer.version !== link.issuerVersion
      || !await rolePolicy({ actor: issuer, action: 'operators:invite', role: link.role })) return null;
    return { link, issuer };
  }
  const admin = administration({ config, store, clock, authorize: rolePolicy, authenticate, newToken, sendLink, limit, requireFreshProof, providers });
  const external = legacyAdmission({ admission, config });
  return Object.freeze({
    ...admin,
    presentation: config.branding,
    /** Identity providers (null when none is configured): routes, the sign-in page's list and owner actions. */
    providers,
    /** The admission identity methods use: a verified principal in, a session out. */
    admission,
    /** Base's accounts adapter over the oa_ store. */
    accounts,
    async getSession(request) {
      const value = await authenticate(request);
      if (!value) return null;
      const { hash: _, ...session } = value;
      return session;
    },
    async bootstrap(request, { token, displayName: name, returnTo }) {
      requirePost(request, config);
      await limit(request, config.OWNER_EMAIL, 'bootstrap');
      if (!config.SETUP_TOKEN || typeof token !== 'string' || token.length > 1024 || !constantEqual(await hash('setup', token), await hash('setup', config.SETUP_TOKEN))) deny('invalid_setup_token', 403);
      if (!emailAllowed(config.OWNER_EMAIL, config.allowList)) deny('email_not_allowed');
      const session = await newSession();
      const record = await store.bootstrap({ id: crypto.randomUUID(), email: config.OWNER_EMAIL, displayName: displayName(name), now: clock(), session });
      if (!record) deny('already_initialized', 409);
      return completed(session, record, returnTo);
    },
    async requestMagicLink(request, { email: raw, returnTo }) {
      requirePost(request, config);
      const email = normalizeEmail(raw);
      await limit(request, email, 'magic');
      // Configuration failure is uniform for all addresses; unknown addresses
      // otherwise have the same successful public response as admitted ones.
      if (!mailSender || !config.MAIL_FROM) deny('mail_unavailable', 503);
      // A domain rule is said for the whole domain, whoever asks.
      const required = await accounts.requiredProvider(email);
      const accepted = { status: 'accepted', ...(required ? { requiredProvider: required } : {}) };
      const operator = await store.byEmail(email);
      if (!isActiveOperator(operator, config.allowList)) return accepted;
      if (required && operator.role !== 'owner') return accepted;
      if (hooks.beforeMagicLink && await hooks.beforeMagicLink({ request, email, operator }) === false) return accepted;
      const token = await newToken('magic', safeReturnTo(returnTo));
      if (await store.token({ ...token, operatorId: operator.id, now: clock() })) await sendLink(email, token);
      return accepted;
    },
    async previewLink(request, token) {
      requireOrigin(request, config);
      if (!['GET', 'HEAD'].includes(request.method)) deny('method_not_allowed', 405);
      if (!validToken(token)) return null;
      const digest = await hash('link', token);
      const result = await authorizedLink(request, digest);
      if (result) return { kind: result.link.kind, expiresInMinutes: Math.max(1, Math.ceil((result.link.expiresAt - clock()) / 60000)) };
      const challenge = await store.stepUpPreview(digest, clock());
      return challenge ? { kind: 'step_up', expiresInMinutes: Math.max(1, Math.ceil((challenge.expiresAt - clock()) / 60000)) } : null;
    },
    async confirmLink(request, { token }) {
      requirePost(request, config);
      await limit(request, typeof token === 'string' ? token.slice(0, 128) : '', 'confirmation');
      if (!validToken(token)) deny('invalid_or_expired', 400);
      const digest = await hash('link', token);
      const approval = await authorizedLink(request, digest);
      if (!approval) {
        // A step-up link completes only in the session that asked for it.
        const actor = await authenticate(request);
        const proof = actor && await store.consumeStepUp(digest, actor, clock());
        if (!proof) deny('invalid_or_expired', 400);
        return { stepUp: proof.action, returnTo: safeReturnTo(proof.returnTo) };
      }
      await requireRoute({ email: approval.link.email, role: approval.link.role, status: approval.link.kind === 'invite' ? 'invited' : 'active' });
      const session = await newSession();
      const record = await store.consume(digest, clock(), session, config.allowList, approval.issuer);
      return admission.afterConfirm(request, completed(session, record, record?.returnTo), 'email');
    },
    async signOut(request) {
      requirePost(request, config);
      const token = readCookie(request, config);
      if (token) await store.run('UPDATE oa_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE token_hash=?', [clock(), await hash('session', token)]);
      return { cookie: sessionCookie('', config, 0) };
    },
    async issueReviewSession(request, { returnTo } = {}) {
      // Evaluate Host before flags so every non-loopback attempt is 403.
      requireLoopback(request);
      requirePost(request, config);
      if (config.review?.enabled !== true) deny('review_disabled', 403);
      const email = normalizeEmail(config.review.operatorEmail);
      await limit(request, email, 'review');
      const operator = await store.byEmail(email);
      if (!isActiveOperator(operator, config.allowList)) deny();
      await requireRoute(operator);
      const session = await newSession('review');
      const record = await store.issue({ operatorId: operator.id, expectedVersion: operator.version, session, now: clock(), kind: 'review' });
      return completed(session, record, returnTo);
    },
    ...external,
    // Compatibility seam for an edition's real credential verifier. Never expose
    // this method as an HTTP endpoint accepting an unverified operator ID. A
    // provider binding revokes the operator's password: it no longer admits.
    async admitVerifiedPassword(request, operatorId, { returnTo } = {}) {
      requirePost(request, config);
      const operator = await store.operator(operatorId);
      if (!isActiveOperator(operator, config.allowList)) deny();
      await requireRoute(operator);
      if (await store.hasBinding(operator.id)) deny('password_revoked');
      const session = await newSession('password');
      const record = await store.issue({ operatorId, expectedVersion: operator.version, session, now: clock(), kind: 'password' });
      return completed(session, record, returnTo);
    },
    /** Ask for a step-up proof: an email link to the signed-in operator's own address. */
    async requestStepUp(request, { action, returnTo } = {}) {
      requirePost(request, config);
      if (!STEP_UP_ACTIONS.includes(action)) throw new AuthError('invalid_action');
      const actor = await authenticate(request);
      if (!actor) deny('unauthenticated', 401);
      await limit(request, actor.operator.email, 'step-up');
      const token = await newToken('step_up', safeReturnTo(returnTo));
      if (!await store.stepUpChallenge({ id: token.id, hash: token.hash, action, returnTo: token.returnTo, now: clock(), expiresAt: token.expiresAt }, actor)) deny('authority_changed', 409);
      await sendLink(actor.operator.email, token, () => store.run('UPDATE oa_step_up_challenges SET expires_at=0 WHERE id=?', [token.id]));
      return { status: 'accepted' };
    },
    /** Server-side guard for a listed action: the session holds a fresh email-link proof. */
    async requireStepUp(request, action) {
      if (!STEP_UP_ACTIONS.includes(action)) throw new AuthError('invalid_action');
      const actor = await authenticate(request);
      if (!actor) deny('unauthenticated', 401);
      await requireFreshProof(actor);
      const { hash: _, ...session } = actor;
      return session;
    },
  });
}
