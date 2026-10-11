import { check } from './errors.mjs';
import { decode, encode, utf8 } from './crypto.mjs';
import { normalizeEmail } from '../index.mjs';
function object(part) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(part)));
  check(value && typeof value === 'object' && !Array.isArray(value)); return value;
}
export async function verifyIdToken(token, jwks, config, metadata, transaction, tokens, now) {
  check(typeof token === 'string' && token.length < 32768);
  const parts = token.split('.'); check(parts.length === 3);
  const [headerPart, bodyPart, signaturePart] = parts;
  const header = object(headerPart); const claims = object(bodyPart);
  check(metadata.algorithms.includes(header.alg) && (header.typ === undefined || header.typ === 'JWT'));
  check(typeof header.kid === 'string' && header.kid.length > 0 && header.kid.length <= 256);
  // Neither remote header keys nor critical/alternate payload semantics are used.
  check(!['crit', 'jku', 'jwk', 'x5u', 'b64', 'zip'].some(k => Object.hasOwn(header, k)));
  check(Array.isArray(jwks.keys) && jwks.keys.length > 0 && jwks.keys.length <= 100);
  const candidates = jwks.keys.filter(k => k && typeof k === 'object' && k.kid === header.kid);
  check(candidates.length === 1);
  const key = candidates[0];
  check((key.alg === undefined || key.alg === header.alg) && (key.use === undefined || key.use === 'sig') &&
    (key.key_ops === undefined || Array.isArray(key.key_ops) && key.key_ops.length === 1 && key.key_ops[0] === 'verify'));
  check(!['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(k => Object.hasOwn(key, k)));
  let algorithm; let publicKey;
  if (header.alg === 'RS256') {
    check(key.kty === 'RSA'); const n = decode(key.n); const e = decode(key.e);
    check(n.length >= 256 && n.length <= 1024 && n[0] >= 128 && e.length > 0 && e.length <= 4 && e[0] !== 0);
    const exponent = e.reduce((v, b) => v * 256 + b, 0); check(exponent >= 3 && exponent % 2 === 1);
    algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    publicKey = { kty: 'RSA', n: key.n, e: key.e };
  } else {
    check(header.alg === 'ES256' && key.kty === 'EC' && key.crv === 'P-256' && decode(key.x).length === 32 && decode(key.y).length === 32 && decode(signaturePart).length === 64);
    algorithm = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
    publicKey = { kty: 'EC', crv: 'P-256', x: key.x, y: key.y };
  }
  const imported = await crypto.subtle.importKey('jwk', publicKey, algorithm, false, ['verify']);
  check(await crypto.subtle.verify(algorithm, imported, decode(signaturePart), utf8.encode(`${headerPart}.${bodyPart}`)));
  check(claims.iss === config.issuer && typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 255);
  const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
  check(Array.isArray(audiences) && audiences.length > 0 && audiences.every(a => typeof a === 'string' && a.length > 0) && new Set(audiences).size === audiences.length && audiences.includes(config.clientId));
  check(audiences.every(a => a === config.clientId || config.additionalAudiences.includes(a)));
  check(audiences.length === 1 || claims.azp === config.clientId);
  check(claims.azp === undefined || claims.azp === config.clientId);
  const time = now / 1000; const skew = config.clockSkewSeconds;
  check(Number.isSafeInteger(claims.exp) && Number.isSafeInteger(claims.iat) && claims.exp > claims.iat && claims.exp > time - skew && claims.iat <= time + skew && claims.iat >= time - config.maxTokenAgeSeconds - skew);
  check(claims.nbf === undefined || Number.isSafeInteger(claims.nbf) && claims.nbf <= time + skew);
  check(claims.nonce === transaction.nonce);
  for (const [claim, value] of [['at_hash', tokens.access_token], ['c_hash', tokens.code]]) {
    if (claims[claim] !== undefined) {
      const hash = await crypto.subtle.digest('SHA-256', utf8.encode(value));
      check(claims[claim] === encode(new Uint8Array(hash).slice(0, 16)));
    }
  }
  // The core's deployment-configured association supplies the account for this
  // principal. Do not turn an association into a fictional verified email claim.
  if (Object.hasOwn(config.subjectEmails, claims.sub)) return { issuer: config.issuer, subject: claims.sub };
  check(claims.email_verified === true && typeof claims.email === 'string');
  return { issuer: config.issuer, subject: claims.sub, email: normalizeEmail(claims.email), emailVerified: true };
}
