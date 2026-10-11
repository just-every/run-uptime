import { normalizeEmail } from '../../policy.mjs';
import { isLoopbackHost } from '../../http.mjs';
import { check } from './errors.mjs';
import { PRESETS, MINIMUM_PROVIDER_VERSION, compareVersions, validVersion } from './presets.mjs';

function integer(value, defaultValue, min, max) {
  const v = value ?? defaultValue;
  check(Number.isSafeInteger(v) && v >= min && v <= max, 'oidc_invalid_configuration', 503); return v;
}
function httpsUrl(value) {
  const u = new URL(value);
  check(typeof value === 'string' && u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && !/[\s\\]/.test(value));
  return u;
}
// A private JWK for private_key_jwt. Its public half is what the provider holds.
function privateKey(jwk, algorithm) {
  check(jwk && typeof jwk === 'object' && typeof jwk.kid === 'string' && jwk.kid.length > 0 && jwk.kid.length <= 256 && typeof jwk.d === 'string');
  check(algorithm === 'ES256' ? jwk.kty === 'EC' && jwk.crv === 'P-256' : jwk.kty === 'RSA');
  return Object.freeze({ ...jwk });
}

function provider(input, origin) {
  check(input && typeof input === 'object' && typeof input.id === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(input.id));
  const preset = PRESETS[input.preset];
  check(preset && Object.hasOwn(PRESETS, input.preset));
  let issuer = preset.issuer ?? input.issuer;
  if (preset.tenantIssuer) {
    // A tenant-specific issuer only: never common, organizations or consumers.
    check(typeof input.tenant === 'string' && /^[A-Za-z0-9-]{1,64}(\.[A-Za-z0-9-]{1,63})*$/.test(input.tenant) && !['common', 'organizations', 'consumers'].includes(input.tenant.toLowerCase()));
    issuer = preset.tenantIssuer(input.tenant);
  }
  check(input.issuer === undefined || input.issuer === issuer);
  const issuerUrl = httpsUrl(issuer);
  check(typeof input.clientId === 'string' && input.clientId.length > 0 && input.clientId.length <= 512 && !/[\x00-\x1f\x7f]/.test(input.clientId));
  const tokenAuthMethod = input.tokenAuthMethod ?? preset.methods[0];
  check(preset.methods.includes(tokenAuthMethod));
  check(tokenAuthMethod === 'private_key_jwt' ? input.clientSecret === undefined : input.privateKey === undefined);
  check(!tokenAuthMethod.startsWith('client_secret') || typeof input.clientSecret === 'string' && input.clientSecret.length > 0 && input.clientSecret.length <= 4096);
  const keyAlgorithm = tokenAuthMethod === 'private_key_jwt' ? input.privateKey?.alg ?? (input.privateKey?.kty === 'EC' ? 'ES256' : 'RS256') : undefined;
  check(keyAlgorithm === undefined || ['ES256', 'RS256'].includes(keyAlgorithm));
  const additionalAudiences = input.additionalAudiences ?? [];
  check(Array.isArray(additionalAudiences) && additionalAudiences.length <= 10 && additionalAudiences.every(a => typeof a === 'string' && a.length > 0 && a.length <= 512));
  const endpointOrigins = input.endpointOrigins ?? preset.endpointOrigins ?? [issuerUrl.origin];
  check(Array.isArray(endpointOrigins) && endpointOrigins.length > 0 && endpointOrigins.every(o => { const u = new URL(o); return u.origin === o && u.protocol === 'https:'; }));
  const subjectEmails = Object.fromEntries(Object.entries(input.subjectEmails ?? {}).map(([subject, email]) => {
    check(subject.length > 0 && subject.length <= 255); return [subject, normalizeEmail(email)];
  }));
  const minimumVersion = preset.interface ? input.minimumVersion ?? MINIMUM_PROVIDER_VERSION : undefined;
  check(minimumVersion === undefined || validVersion(minimumVersion) && compareVersions(minimumVersion, MINIMUM_PROVIDER_VERSION) >= 0);
  const label = input.label ?? preset.label;
  check(typeof label === 'string' && label.length > 0 && label.length <= 60 && !/[\x00-\x1f\x7f]/.test(label));
  return Object.freeze({ id: input.id, preset: input.preset, label, issuer, clientId: input.clientId, tokenAuthMethod,
    clientSecret: input.clientSecret, privateKey: keyAlgorithm ? privateKey(input.privateKey, keyAlgorithm) : undefined, keyAlgorithm,
    algorithms: Object.freeze([...preset.algorithms]), email: preset.email, scope: preset.scope, interface: preset.interface, minimumVersion,
    additionalAudiences: Object.freeze([...new Set(additionalAudiences)]), endpointOrigins: Object.freeze([...new Set(endpointOrigins)]), subjectEmails: Object.freeze(subjectEmails),
    // Each provider has its own redirect URI; its state is bound to it.
    startPath: `/auth/oidc/${input.id}/start`, redirectUri: `${origin}/auth/oidc/${input.id}/callback` });
}

export function configure(input) {
  try {
    const origin = new URL(input.origin);
    check(origin.origin === input.origin && !origin.username && !origin.password);
    const local = input.local === true;
    check(local ? isLoopbackHost(origin.hostname) && ['http:', 'https:'].includes(origin.protocol) : origin.protocol === 'https:');
    check(typeof input.transactionSecret === 'string' && input.transactionSecret.length >= 32 && input.transactionSecret.length <= 1024);
    check(Array.isArray(input.providers) && input.providers.length <= 8);
    const providers = input.providers.map(entry => provider(entry, input.origin));
    check(new Set(providers.map(p => p.id)).size === providers.length);
    return Object.freeze({ origin: input.origin, local, secure: origin.protocol === 'https:', transactionSecret: input.transactionSecret, providers: Object.freeze(providers),
      signInPath: input.signInPath ?? '/signin',
      transactionSeconds: integer(input.transactionSeconds, 600, 60, 900), timeoutMs: integer(input.timeoutMs, 5000, 100, 15000),
      clockSkewSeconds: integer(input.clockSkewSeconds, 30, 0, 120), maxTokenAgeSeconds: integer(input.maxTokenAgeSeconds, 600, 60, 3600),
      startLimit: integer(input.startLimit, 30, 1, 1000) });
  } catch { check(false, 'oidc_invalid_configuration', 503); }
}

export function endpoint(value, provider) {
  try { const u = new URL(value); check(typeof value === 'string' && u.href === value && u.protocol === 'https:' && !u.username && !u.password && !u.hash && !u.search && provider.endpointOrigins.includes(u.origin)); return u.href; }
  catch { check(false, 'oidc_untrusted_endpoint', 503); }
}
