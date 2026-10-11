import { normalizeEmail, isLoopbackHost } from '../index.mjs';
import { check } from './errors.mjs';
function url(value, https = true) {
  const u = new URL(value);
  check(typeof value === 'string' && u.href === value && !u.username && !u.password && !u.hash && !u.search && (!https || u.protocol === 'https:'), 'oidc_invalid_configuration', 503);
  return u;
}
function integer(value, defaultValue, min, max) {
  const v = value ?? defaultValue;
  check(Number.isSafeInteger(v) && v >= min && v <= max, 'oidc_invalid_configuration', 503); return v;
}
export function configure(input) {
  try {
    const origin = new URL(input.origin);
    check(origin.origin === input.origin && !origin.username && !origin.password);
    const local = input.local === true;
    check(local ? isLoopbackHost(origin.hostname) && ['http:', 'https:'].includes(origin.protocol) : origin.protocol === 'https:');
    // Issuer identifiers can omit the trailing slash; retain their exact spelling.
    const issuer = new URL(input.issuer);
    check(typeof input.issuer === 'string' && issuer.protocol === 'https:' && !issuer.username && !issuer.password && !issuer.search && !issuer.hash && !/[\s\\]/.test(input.issuer));
    const redirect = url(input.redirectUri, false);
    check(redirect.origin === input.origin);
    const startPath = input.startPath ?? '/auth/oidc/start';
    check(typeof startPath === 'string' && /^\/[A-Za-z0-9/_-]+$/.test(startPath) && startPath !== redirect.pathname);
    check(typeof input.clientId === 'string' && input.clientId.length > 0 && input.clientId.length <= 512 && !/[\x00-\x1f\x7f]/.test(input.clientId));
    check(typeof input.transactionSecret === 'string' && input.transactionSecret.length >= 32 && input.transactionSecret.length <= 1024);
    const tokenAuthMethod = input.tokenAuthMethod ?? 'client_secret_basic';
    check(['none', 'client_secret_basic', 'client_secret_post'].includes(tokenAuthMethod));
    check(tokenAuthMethod === 'none' ? input.clientSecret === undefined : typeof input.clientSecret === 'string' && input.clientSecret.length > 0 && input.clientSecret.length <= 4096);
    const algorithms = input.algorithms ?? ['RS256'];
    check(Array.isArray(algorithms) && algorithms.length > 0 && algorithms.every(a => ['RS256', 'ES256'].includes(a)));
    const additionalAudiences = input.additionalAudiences ?? [];
    check(Array.isArray(additionalAudiences) && additionalAudiences.length <= 10 && additionalAudiences.every(a => typeof a === 'string' && a.length > 0 && a.length <= 512));
    const endpointOrigins = input.endpointOrigins ?? [issuer.origin];
    check(Array.isArray(endpointOrigins) && endpointOrigins.length > 0 && endpointOrigins.every(o => { const u = new URL(o); return u.origin === o && u.protocol === 'https:'; }));
    const subjectEmails = Object.fromEntries(Object.entries(input.subjectEmails ?? {}).map(([subject, email]) => {
      check(subject.length > 0 && subject.length <= 255); return [subject, normalizeEmail(email)];
    }));
    return Object.freeze({ origin: input.origin, issuer: input.issuer, clientId: input.clientId, clientSecret: input.clientSecret,
      redirectUri: redirect.href, startPath, local, secure: origin.protocol === 'https:', transactionSecret: input.transactionSecret,
      tokenAuthMethod, algorithms: Object.freeze([...new Set(algorithms)]), endpointOrigins: Object.freeze([...new Set(endpointOrigins)]),
      additionalAudiences: Object.freeze([...new Set(additionalAudiences)]), subjectEmails: Object.freeze(subjectEmails), transactionSeconds: integer(input.transactionSeconds, 600, 60, 900),
      timeoutMs: integer(input.timeoutMs, 5000, 100, 15000), clockSkewSeconds: integer(input.clockSkewSeconds, 30, 0, 120),
      maxTokenAgeSeconds: integer(input.maxTokenAgeSeconds, 600, 60, 3600), startLimit: integer(input.startLimit, 30, 1, 1000),
    });
  } catch { check(false, 'oidc_invalid_configuration', 503); }
}
export function endpoint(value, config) {
  try { const u = url(value); check(config.endpointOrigins.includes(u.origin)); return u.href; }
  catch { check(false, 'oidc_untrusted_endpoint', 503); }
}
