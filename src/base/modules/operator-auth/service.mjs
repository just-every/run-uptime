import { linkMessage } from './mail.mjs';
import { AuthError, deny } from './errors.mjs';
import { configure } from './config.mjs';
import { opaqueToken, validToken, hashToken, constantEqual } from './crypto.mjs';
import { safeReturnTo, normalizeEmail, emailAllowed, isActiveOperator, defaultRolePolicy } from './policy.mjs';
import { requirePost, requireOrigin, requireLoopback, readCookie, sessionCookie } from './http.mjs';
import { AuthStore } from './store.mjs';
import { administration, displayName } from './admin.mjs';
import { identityAdmission } from './identity.mjs';
import { isLocalCli } from './local-cli.mjs';

export function createOperatorAuth({ db, config: input, mailSender, clientIp, rolePolicy = defaultRolePolicy, clock = Date.now }) {
  const config = configure(input);
  if (typeof clientIp !== 'function') throw new AuthError('client_ip_required', 503);
  const store = new AuthStore(db);
  const hash = (purpose, token) => hashToken(config.SESSION_SECRET, purpose, token);
  async function limit(request, email, scope) {
    // The CLI's own loopback sign-in and owner claim are not a person's attempts.
    if ((scope === 'magic' || scope === 'bootstrap') && await isLocalCli(request, config)) return;
    const ip = await clientIp(request);
    if (typeof ip !== 'string' || !ip || ip.length > 128) deny('client_ip_unavailable', 503);
    const keys = await Promise.all([hash('rate', `${scope}:ip:${ip}`), hash('rate', `${scope}:email:${email}`)]);
    const counts = await store.limits(keys, clock(), config.limitWindowSeconds * 1000);
    if (counts[0] > config.ipLimit || counts[1] > config.emailLimit) deny('rate_limited', 429);
  }
  async function newSession(kind = 'native') {
    const token = opaqueToken();
    const seconds = kind === 'review' ? config.reviewSeconds : config.sessionSeconds;
    return { id: crypto.randomUUID(), token, hash: await hash('session', token), expiresAt: clock() + seconds * 1000 };
  }
  async function newToken(kind, returnTo) {
    const token = opaqueToken();
    return { id: crypto.randomUUID(), token, hash: await hash('link', token), kind, returnTo, expiresAt: clock() + config.linkSeconds * 1000 };
  }
  function completed(session, record, returnTo) {
    if (!record) deny('invalid_or_expired', 400);
    return { session: { id: record.id, kind: record.kind, createdAt: record.createdAt, expiresAt: record.expiresAt }, operator: record.operator,
      cookie: sessionCookie(session.token, config, Math.max(0, Math.floor((record.expiresAt - clock()) / 1000))), returnTo: safeReturnTo(returnTo) };
  }
  async function authenticate(request) {
    requireOrigin(request, config);
    const token = readCookie(request, config);
    if (!token) return null;
    const digest = await hash('session', token);
    const session = await store.session(digest, clock());
    if (!session || !isActiveOperator(session.operator, config.allowList)) return null;
    if (session.kind === 'review') {
      requireLoopback(request);
      if (config.review?.enabled !== true || session.operator.email !== normalizeEmail(config.review.operatorEmail)) return null;
    }
    return { ...session, hash: digest };
  }
  async function sendLink(email, token) {
    if (!mailSender || !config.MAIL_FROM) {
      await store.run('UPDATE oa_tokens SET revoked_at=? WHERE id=?', [clock(), token.id]);
      deny('mail_unavailable', 503);
    }
    const url = new URL('/auth/confirm', config.origin);
    url.searchParams.set('token', token.token);
    let result;
    try {
      result = await mailSender.send({ deliveryId: token.id, from: config.MAIL_FROM, to: [email],
        ...linkMessage(config, token, url.href),
        headers: { 'Auto-Submitted': 'auto-generated' } });
    } catch {
      await store.run('UPDATE oa_tokens SET revoked_at=? WHERE id=?', [clock(), token.id]);
      deny('mail_unavailable', 503);
    }
    if (result?.status !== 'accepted' && !(result?.status === 'development' && config.local)) {
      // Even ambiguous delivery cannot leave a valid, unreported auth link.
      await store.run('UPDATE oa_tokens SET revoked_at=? WHERE id=?', [clock(), token.id]);
      deny('mail_unavailable', 503);
    }
  }
  async function authorizedLink(digest) {
    const link = await store.preview(digest, clock());
    if (!link || !emailAllowed(link.email, config.allowList)) return null;
    if (link.kind !== 'invite') return { link };
    const issuer = await store.operator(link.issuerId);
    if (!isActiveOperator(issuer, config.allowList) || issuer.version !== link.issuerVersion
      || !await rolePolicy({ actor: issuer, action: 'operators:invite', role: link.role })) return null;
    return { link, issuer };
  }
  const admin = administration({ config, store, clock, authorize: rolePolicy, authenticate, newToken, sendLink, limit });
  const external = identityAdmission({ config, store, clock, newSession, completed });
  return Object.freeze({
    ...admin,
    presentation: config.branding,
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
      const operator = await store.byEmail(email);
      if (!isActiveOperator(operator, config.allowList)) return { status: 'accepted' };
      const token = await newToken('magic', safeReturnTo(returnTo));
      if (await store.token({ ...token, operatorId: operator.id, now: clock() })) await sendLink(email, token);
      return { status: 'accepted' };
    },
    async previewLink(request, token) {
      requireOrigin(request, config);
      if (!['GET', 'HEAD'].includes(request.method)) deny('method_not_allowed', 405);
      if (!validToken(token)) return null;
      const result = await authorizedLink(await hash('link', token));
      return result ? { kind: result.link.kind, expiresInMinutes: Math.max(1, Math.ceil((result.link.expiresAt - clock()) / 60000)) } : null;
    },
    async confirmLink(request, { token }) {
      requirePost(request, config);
      await limit(request, typeof token === 'string' ? token.slice(0, 128) : '', 'confirmation');
      if (!validToken(token)) deny('invalid_or_expired', 400);
      const digest = await hash('link', token);
      const approval = await authorizedLink(digest);
      if (!approval) deny('invalid_or_expired', 400);
      const session = await newSession();
      const record = await store.consume(digest, clock(), session, config.allowList, approval.issuer);
      return completed(session, record, record?.returnTo);
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
      const session = await newSession('review');
      const record = await store.issue({ operatorId: operator.id, expectedVersion: operator.version, session, now: clock(), kind: 'review' });
      return completed(session, record, returnTo);
    },
    ...external,
    // Compatibility seam for an edition's real credential verifier. Never expose
    // this method as an HTTP endpoint accepting an unverified operator ID.
    async admitVerifiedPassword(request, operatorId, { returnTo } = {}) {
      requirePost(request, config);
      const operator = await store.operator(operatorId);
      if (!isActiveOperator(operator, config.allowList)) deny();
      const session = await newSession('password');
      const record = await store.issue({ operatorId, expectedVersion: operator.version, session, now: clock(), kind: 'password' });
      return completed(session, record, returnTo);
    },
  });
}
