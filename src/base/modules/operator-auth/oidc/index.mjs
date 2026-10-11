// Server-only entry. Never include this module or its configuration in a browser bundle.
import { safeReturnTo, securityHeaders, requireLoopback } from '../index.mjs';
import { configure } from './config.mjs';
import { check, OidcError } from './errors.mjs';
import { random, isRandom, digest, keyedHash, seal, unseal } from './crypto.mjs';
import { storage } from './store.mjs';
import { discover, exchange, readJson } from './network.mjs';
import { verifyIdToken } from './jwt.mjs';
export { OidcError } from './errors.mjs';

function cookieName(config, state) { return `${config.local ? 'oa_oidc_local_' : '__Host-oa_oidc_'}${state}`; }
function cookie(config, state, value, age = config.transactionSeconds) {
  return `${cookieName(config, state)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${config.secure ? '; Secure' : ''}`;
}
function bindingCookie(request, config, state) {
  const header = request.headers.get('cookie') ?? '';
  check(header.length <= 16384, 'oidc_invalid_correlation');
  const prefix = `${cookieName(config, state)}=`;
  const matches = header.split(';').map(s => s.trim()).filter(s => s.startsWith(prefix));
  check(matches.length === 1 && isRandom(matches[0].slice(prefix.length)), 'oidc_invalid_correlation');
  return matches[0].slice(prefix.length);
}
function redirect(location, cookies) {
  const headers = new Headers({ ...securityHeaders(), Location: location });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}
function errorResponse(error, clearCookie) {
  const known = error instanceof OidcError;
  const headers = new Headers(securityHeaders());
  if (clearCookie) headers.append('Set-Cookie', clearCookie);
  return Response.json({ error: known ? error.code : 'oidc_unavailable' }, { status: known ? error.status : 503, headers });
}
function boundary(request, config, post) {
  const url = new URL(request.url); const host = request.headers.get('host');
  check(url.origin === config.origin && (!host || host.toLowerCase() === url.host.toLowerCase()), 'oidc_invalid_origin', 403);
  if (config.local) { try { requireLoopback(request); } catch { throw new OidcError('oidc_invalid_origin', 403); } }
  if (post) {
    check(request.method === 'POST', 'oidc_method_not_allowed', 405);
    check(request.headers.get('origin') === config.origin && request.headers.get('sec-fetch-site') !== 'cross-site', 'oidc_invalid_origin', 403);
  }
}

export function createOidcClient({ auth, db, config: input, clientIp, fetch: fetcher = globalThis.fetch, clock = Date.now }) {
  const config = configure(input);
  check(auth && typeof auth.createIdentityAdmission === 'function' && db && typeof db.prepare === 'function' && typeof clientIp === 'function' && typeof fetcher === 'function' && typeof clock === 'function', 'oidc_invalid_configuration', 503);
  let admit;
  try {
    admit = auth.createIdentityAdmission({ issuer: config.issuer, subjectEmails: config.subjectEmails });
    check(typeof admit === 'function', 'oidc_invalid_configuration', 503);
  } catch { throw new OidcError('oidc_invalid_configuration', 503); }
  const store = storage(db);
  // Changes to credentials, issuer, callback or policy invalidate outstanding logins.
  const fingerprint = keyedHash(config.transactionSecret, 'configuration', JSON.stringify(config));
  return Object.freeze({
    startPath: config.startPath, callbackPath: new URL(config.redirectUri).pathname,
    async begin(request, { returnTo } = {}) {
      try {
        boundary(request, config, true);
        const startUrl = new URL(request.url);
        check(startUrl.pathname === config.startPath && !startUrl.search, 'oidc_invalid_route', 404);
        const ip = await clientIp(request);
        check(typeof ip === 'string' && ip.length > 0 && ip.length <= 256, 'oidc_client_address_unavailable', 503);
        const now = clock();
        const window = Math.floor(now / 900000);
        const bucket = await keyedHash(config.transactionSecret, 'start-limit', `${config.issuer}\0${config.clientId}\0${ip}\0${window}`);
        await store.limit(bucket, (window + 1) * 900000, config.startLimit);
        const metadata = await discover(fetcher, config);
        const state = random(); const binding = random(); const verifier = random(); const nonce = random();
        const stateHash = await keyedHash(config.transactionSecret, 'state', state);
        const expiresAt = clock() + config.transactionSeconds * 1000;
        const payload = await seal(config.transactionSecret, stateHash, { nonce, verifier, returnTo: safeReturnTo(returnTo), metadata, expiresAt });
        await store.put({ stateHash, bindingHash: await keyedHash(config.transactionSecret, 'binding', binding), configHash: await fingerprint, payload, expiresAt });
        const authorization = new URL(metadata.authorization);
        const params = { response_type: 'code', response_mode: 'query', client_id: config.clientId, redirect_uri: config.redirectUri,
          scope: 'openid email', state, nonce, code_challenge: await digest(verifier), code_challenge_method: 'S256' };
        for (const [key, value] of Object.entries(params)) authorization.searchParams.set(key, value);
        return redirect(authorization.href, [cookie(config, state, binding)]);
      } catch (e) { return errorResponse(e); }
    },
    async callback(request) {
      let clearCookie;
      try {
        boundary(request, config, false);
        check(request.method === 'GET', 'oidc_method_not_allowed', 405);
        check(request.url.length <= 12288, 'oidc_invalid_response');
        const url = new URL(request.url);
        check(url.origin + url.pathname === config.redirectUri && !url.hash, 'oidc_invalid_route', 404);
        for (const name of url.searchParams.keys()) check(url.searchParams.getAll(name).length === 1);
        const state = url.searchParams.get('state'); check(isRandom(state), 'oidc_invalid_correlation');
        const binding = bindingCookie(request, config, state);
        const stateHash = await keyedHash(config.transactionSecret, 'state', state);
        const row = await store.consume(stateHash, await keyedHash(config.transactionSecret, 'binding', binding), await fingerprint, clock());
        check(row, 'oidc_invalid_correlation');
        clearCookie = cookie(config, state, '', 0);
        let transaction;
        try { transaction = await unseal(config.transactionSecret, stateHash, row.payload); }
        catch { throw new OidcError('oidc_storage_unavailable', 503); }
        const { metadata } = transaction;
        const issuer = url.searchParams.get('iss');
        check(issuer === null ? !metadata.responseIssuer : issuer === config.issuer, 'oidc_issuer_mismatch');
        if (url.searchParams.has('error')) { check(!url.searchParams.has('code')); throw new OidcError('oidc_provider_denied', 401); }
        const code = url.searchParams.get('code');
        check(typeof code === 'string' && code.length <= 4096 && /^[\x21-\x7e]+$/.test(code));
        const tokens = await exchange(fetcher, metadata, config, code, transaction.verifier);
        const jwks = await readJson(fetcher, metadata.jwks, config, {}, 262144);
        let identity;
        try { identity = await verifyIdToken(tokens.id_token, jwks, config, metadata, transaction, { ...tokens, code }, clock()); }
        catch { throw new OidcError('oidc_invalid_response'); }
        check(clock() < transaction.expiresAt, 'oidc_invalid_correlation');
        let result;
        try { result = await admit(request, identity, { returnTo: transaction.returnTo }); }
        catch { throw new OidcError('oidc_admission_denied', 403); }
        return redirect(result.returnTo, [clearCookie, result.cookie]);
      } catch (e) { return errorResponse(e, clearCookie); }
    },
  });
}

// Exact routes only: mount ahead of the core /auth/* dispatcher.
export function createOidcHandler(client) {
  return async request => {
    const path = new URL(request.url).pathname;
    if (path === client.callbackPath) return client.callback(request);
    if (path !== client.startPath) return null;
    try {
      check(request.method === 'POST', 'oidc_method_not_allowed', 405);
      const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      check(type === 'application/x-www-form-urlencoded' || type === 'application/json', 'oidc_unsupported_media_type', 415);
      // Read a bounded stream, never unbounded request.json()/formData().
      const reader = request.body?.getReader(); let bytes = 0; const chunks = [];
      if (reader) { try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; check(bytes <= 4096, 'oidc_input_too_large', 413); chunks.push(value); } } finally { void reader.cancel().catch(() => {}); } }
      const all = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(all);
      let input;
      if (type === 'application/json') input = JSON.parse(text);
      else { const form = new URLSearchParams(text); check(form.getAll('returnTo').length <= 1); input = { returnTo: form.get('returnTo') ?? undefined }; }
      check(input && typeof input === 'object' && !Array.isArray(input));
      return client.begin(request, { returnTo: input.returnTo });
    } catch (e) { return errorResponse(e instanceof OidcError ? e : new OidcError('oidc_invalid_input')); }
  };
}
