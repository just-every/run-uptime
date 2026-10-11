import { check, fail } from './errors.mjs';
import { endpoint } from './config.mjs';
// The deadline includes stream consumption; redirects never forward credentials.
export async function readJson(fetcher, uri, config, init = {}, maxBytes = 65536) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); }, config.timeoutMs); });
  let reader;
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetcher(uri, { ...init, redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json', ...init.headers } });
      check(response.status === 200 && !response.redirected && (!response.url || response.url === uri), 'oidc_provider_unavailable', 502);
      check(/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''), 'oidc_provider_unavailable', 502);
      const length = response.headers.get('content-length');
      check(!length || /^\d+$/.test(length) && Number(length) <= maxBytes, 'oidc_provider_unavailable', 502);
      check(response.body, 'oidc_provider_unavailable', 502);
      reader = response.body.getReader();
      let size = 0; const chunks = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; check(size <= maxBytes, 'oidc_provider_unavailable', 502); chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      check(body && typeof body === 'object' && !Array.isArray(body), 'oidc_provider_unavailable', 502);
      return body;
    })()]);
  } catch { fail('oidc_provider_unavailable', 502); }
  finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}
export async function discover(fetcher, config) {
  const discovery = `${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const d = await readJson(fetcher, discovery, config);
  check(d.issuer === config.issuer, 'oidc_issuer_mismatch', 502);
  check(Array.isArray(d.response_types_supported) && d.response_types_supported.includes('code'), 'oidc_provider_unsupported', 502);
  check(d.response_modes_supported === undefined || Array.isArray(d.response_modes_supported) && d.response_modes_supported.includes('query'), 'oidc_provider_unsupported', 502);
  check(d.grant_types_supported === undefined || Array.isArray(d.grant_types_supported) && d.grant_types_supported.includes('authorization_code'), 'oidc_provider_unsupported', 502);
  // Discovery may omit PKCE metadata (Google does). Always send S256 anyway;
  // never downgrade the method when the provider fails its token exchange.
  check(d.code_challenge_methods_supported === undefined || Array.isArray(d.code_challenge_methods_supported) && d.code_challenge_methods_supported.includes('S256'), 'oidc_provider_unsupported', 502);
  check(Array.isArray(d.id_token_signing_alg_values_supported) && config.algorithms.some(a => d.id_token_signing_alg_values_supported.includes(a)), 'oidc_provider_unsupported', 502);
  const methods = d.token_endpoint_auth_methods_supported ?? ['client_secret_basic'];
  check(Array.isArray(methods) && methods.includes(config.tokenAuthMethod), 'oidc_provider_unsupported', 502);
  check(d.authorization_response_iss_parameter_supported === undefined || typeof d.authorization_response_iss_parameter_supported === 'boolean', 'oidc_provider_unsupported', 502);
  return { authorization: endpoint(d.authorization_endpoint, config), token: endpoint(d.token_endpoint, config), jwks: endpoint(d.jwks_uri, config),
    algorithms: config.algorithms.filter(a => d.id_token_signing_alg_values_supported.includes(a)), responseIssuer: d.authorization_response_iss_parameter_supported === true };
}
export async function exchange(fetcher, metadata, config, code, verifier) {
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, client_id: config.clientId, code_verifier: verifier });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (config.tokenAuthMethod === 'client_secret_post') form.set('client_secret', config.clientSecret);
  if (config.tokenAuthMethod === 'client_secret_basic') {
    const formEncode = s => new URLSearchParams({ v: s }).toString().slice(2);
    headers.Authorization = `Basic ${btoa(`${formEncode(config.clientId)}:${formEncode(config.clientSecret)}`)}`;
  }
  const response = await readJson(fetcher, metadata.token, config, { method: 'POST', headers, body: form.toString() });
  check(!Object.hasOwn(response, 'error') && typeof response.id_token === 'string' && typeof response.access_token === 'string' && /^[\x21-\x7e]+$/.test(response.access_token) && typeof response.token_type === 'string' && response.token_type.toLowerCase() === 'bearer');
  return response;
}
