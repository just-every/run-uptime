import { AuthError, deny } from './errors.mjs';
import { normalizeEmail, isActiveOperator } from './policy.mjs';
import { requireOrigin } from './http.mjs';

// Server-only admission. Protocol verification belongs to the calling adapter;
// account association belongs to a closed-over deployment configuration.
export function identityAdmission({ config, store, clock, newSession, completed }) {
  async function admit(request, identity, { returnTo } = {}, association) {
    requireOrigin(request, config);
    if (!identity || !config.externalIssuers.includes(identity.issuer) || typeof identity.subject !== 'string'
      || !identity.subject || identity.subject.length > 255 || association && identity.issuer !== association.issuer) deny('invalid_identity');
    const associatedEmail = association?.subjects.get(identity.subject);
    if (associatedEmail === undefined && identity.emailVerified !== true) deny('invalid_identity');
    const email = associatedEmail ?? normalizeEmail(identity.email);
    const operator = await store.byEmail(email);
    if (!isActiveOperator(operator, config.allowList)) deny();
    const session = await newSession('oidc');
    const record = await store.external({ identity, email, associatedEmail, expectedVersion: operator.version, session, now: clock() });
    return completed(session, record, returnTo);
  }
  return {
    // Existing API: verified email may establish only the first external binding.
    admitVerifiedIdentity: (request, identity, input) => admit(request, identity, input),
    createIdentityAdmission(input) {
      try {
        if (!input || !config.externalIssuers.includes(input.issuer)) throw new Error();
        const entries = input.subjectEmails ?? {};
        if (typeof entries !== 'object' || Array.isArray(entries) || entries === null) throw new Error();
        const subjects = new Map(Object.entries(entries).map(([subject, email]) => {
          if (!subject || subject.length > 255) throw new Error();
          return [subject, normalizeEmail(email)];
        }));
        const association = { issuer: input.issuer, subjects };
        // Neither request input nor token claims can replace this snapshot or opt
        // into association. The returned function is bound to this exact issuer.
        return (request, identity, options) => admit(request, identity, options, association);
      } catch { throw new AuthError('invalid_configuration', 503); }
    },
  };
}
