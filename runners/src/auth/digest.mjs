import {createHash, randomBytes} from 'node:crypto';
import {credentialError, integer} from './validation.mjs';
import {assertCredentialOrigin} from './context.mjs';
const algorithms = new Map([
  ['SHA-512-256', {hash: 'sha512-256', rank: 3}], ['SHA-256', {hash: 'sha256', rank: 2}], ['MD5', {hash: 'md5', rank: 1}],
]);
function split(value) {
  const parts = []; let start = 0, quoted = false, escaped = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (escaped) { escaped = false; continue; }
    if (quoted && c === '\\') { escaped = true; continue; }
    if (c === '"') quoted = !quoted;
    if (!quoted && c === ',') { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  if (quoted || escaped) throw credentialError();
  parts.push(value.slice(start).trim());
  if (parts.length > 64) throw credentialError();
  return parts;
}
function challenges(headers) {
  let raw = typeof headers?.get === 'function' ? headers.get('www-authenticate') : Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === 'www-authenticate')?.[1];
  if (Array.isArray(raw)) raw = raw.join(', ');
  if (typeof raw !== 'string' || !raw || Buffer.byteLength(raw) > 8192 || /[\r\n\x00]/.test(raw)) throw credentialError();
  const result = []; let current;
  for (let part of split(raw)) {
    const scheme = /^[a-z][a-z0-9_-]*\s*=/i.test(part) ? null : /^([a-z][a-z0-9_-]*)\s+(.*)$/i.exec(part);
    if (scheme) { current = scheme[1].toLowerCase() === 'digest' ? Object.create(null) : null; if (current) result.push(current); part = scheme[2]; }
    if (!current) continue;
    const parameter = /^([a-z][a-z0-9_-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s",]+))$/i.exec(part);
    if (!parameter) throw credentialError();
    const key = parameter[1].toLowerCase();
    if (Object.hasOwn(current, key)) throw credentialError();
    current[key] = parameter[2] !== undefined ? parameter[2].replace(/\\(.)/g, '$1') : parameter[3];
    if (Object.keys(current).length > 16) throw credentialError();
  }
  if (result.length > 8) throw credentialError();
  return result;
}
const quote = value => '"' + value.replace(/["\\]/g, '\\$&') + '"';
export function digestChallengeAuthorization(credential, {url, method, body, responseHeaders, nonceCount}) {
  if (credential.auth?.type !== 'digest') return null;
  try {
    assertCredentialOrigin(credential, url); integer(nonceCount, 1, 0xffffffff);
    if (typeof method !== 'string' || !/^[A-Z]+$/.test(method)) throw credentialError();
    const auth = credential.auth;
    const candidates = challenges(responseHeaders).filter(c => c.realm === auth.realm && c.nonce && c.nonce.length <= 2048).map(c => {
      const name = (c.algorithm ?? 'MD5').toUpperCase(), session = name.endsWith('-SESS'), base = session ? name.slice(0, -5) : name;
      return {...c, name: base + (session ? '-sess' : ''), session, algorithm: algorithms.get(base)};
    }).filter(c => c.algorithm && (c.charset === undefined || c.charset.toLowerCase() === 'utf-8') && (c.userhash === undefined || ['true', 'false'].includes(c.userhash.toLowerCase())));
    candidates.sort((a, b) => b.algorithm.rank - a.algorithm.rank);
    const selected = candidates[0]; if (!selected) throw credentialError();
    const encoding = selected.charset ? 'utf8' : 'latin1';
    if (encoding === 'latin1' && [...auth.username + auth.password + auth.realm].some(c => c.codePointAt(0) > 255)) throw credentialError();
    const hash = value => createHash(selected.algorithm.hash).update(typeof value === 'string' ? Buffer.from(value, encoding) : value).digest('hex');
    const qops = selected.qop?.split(',').map(value => value.trim().toLowerCase()), qop = qops?.includes('auth') ? 'auth' : qops?.includes('auth-int') ? 'auth-int' : undefined;
    if (qops && !qop) throw credentialError();
    const target = new URL(url), uri = target.pathname + target.search, cnonce = randomBytes(16).toString('hex'), nc = nonceCount.toString(16).padStart(8, '0');
    let a1 = hash(`${auth.username}:${auth.realm}:${auth.password}`);
    if (selected.session) a1 = hash(`${a1}:${selected.nonce}:${cnonce}`);
    if (body !== undefined && typeof body !== 'string' && !(body instanceof Uint8Array)) throw credentialError();
    const a2 = hash(`${method}:${uri}${qop === 'auth-int' ? ':' + hash(Buffer.from(body ?? '')) : ''}`);
    const response = hash(`${a1}:${selected.nonce}:${qop ? `${nc}:${cnonce}:${qop}:` : ''}${a2}`);
    const userhash = selected.userhash?.toLowerCase() === 'true';
    const username = !userhash && selected.charset && /[^\x20-\x7e]/.test(auth.username)
      ? `username*=UTF-8''${encodeURIComponent(auth.username).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`
      : `username=${quote(userhash ? hash(`${auth.username}:${auth.realm}`) : auth.username)}`;
    const parts = [username, `realm=${quote(auth.realm)}`, `nonce=${quote(selected.nonce)}`, `uri=${quote(uri)}`, `response=${quote(response)}`, `algorithm=${selected.name}`];
    if (selected.opaque !== undefined) parts.push(`opaque=${quote(selected.opaque)}`);
    if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce=${quote(cnonce)}`);
    else if (selected.session) parts.push(`cnonce=${quote(cnonce)}`);
    if (userhash) parts.push('userhash=true');
    const header = `Digest ${parts.join(', ')}`;
    if (Buffer.byteLength(header) > 8192 || /[\x00-\x1f\x7f]/.test(header)) throw credentialError();
    return header;
  } catch { throw credentialError(); }
}
