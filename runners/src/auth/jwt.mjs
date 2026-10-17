import {createHmac, createPrivateKey, sign, randomUUID} from 'node:crypto';
import {fields, text, integer, object, credentialError} from './validation.mjs';
const reserved = new Set(['iss', 'sub', 'aud', 'iat', 'nbf', 'exp', 'jti', '__proto__', 'constructor', 'prototype']);
function keyOf(auth) {
  if (auth.algorithm === 'HS256') { if (Buffer.byteLength(auth.key) < 32) throw credentialError(); return auth.key; }
  const key = createPrivateKey(auth.key), details = key.asymmetricKeyDetails;
  if (auth.algorithm === 'RS256' && (key.asymmetricKeyType !== 'rsa' || details?.modulusLength < 2048)) throw credentialError();
  if (auth.algorithm === 'ES256' && (key.asymmetricKeyType !== 'ec' || details?.namedCurve !== 'prime256v1')) throw credentialError();
  return key;
}
function claim(value, depth = 0) {
  if (depth > 4) throw credentialError();
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value === 'string') { if (value.length > 1024) throw credentialError(); return; }
  if (Array.isArray(value)) { if (value.length > 16) throw credentialError(); for (const item of value) claim(item, depth + 1); return; }
  if (!object(value) || Object.keys(value).length > 32) throw credentialError();
  for (const [key, item] of Object.entries(value)) { text(key, 80); if (reserved.has(key)) throw credentialError(); claim(item, depth + 1); }
}
export function validateJwt(auth) {
  fields(auth, ['type', 'algorithm', 'key', 'issuer', 'subject', 'audience', 'lifetimeSeconds'], ['keyId', 'claims']);
  if (!['HS256', 'RS256', 'ES256'].includes(auth.algorithm)) throw credentialError();
  // PEM is multiline; it is never passed to a header or an error.
  if (typeof auth.key !== 'string' || !auth.key || Buffer.byteLength(auth.key) > 16384) throw credentialError();
  text(auth.issuer, 1024); text(auth.subject, 1024); integer(auth.lifetimeSeconds, 1, 3600);
  const audiences = Array.isArray(auth.audience) ? auth.audience : [auth.audience];
  if (!audiences.length || audiences.length > 16) throw credentialError();
  for (const audience of audiences) text(audience, 1024);
  if (auth.keyId !== undefined) text(auth.keyId, 128);
  if (auth.claims !== undefined) { if (!object(auth.claims) || Buffer.byteLength(JSON.stringify(auth.claims)) > 4096) throw credentialError(); claim(auth.claims); }
  keyOf(auth);
}
export function jwtAuthorization(auth) {
  const now = Math.floor(Date.now() / 1000), encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = {alg: auth.algorithm, typ: 'JWT', ...(auth.keyId !== undefined ? {kid: auth.keyId} : {})};
  const payload = {...auth.claims, iss: auth.issuer, sub: auth.subject, aud: auth.audience, iat: now, exp: now + auth.lifetimeSeconds, jti: randomUUID()};
  const unsigned = `${encode(header)}.${encode(payload)}`, key = keyOf(auth);
  const signature = auth.algorithm === 'HS256' ? createHmac('sha256', key).update(unsigned).digest() : sign('sha256', Buffer.from(unsigned), {key, ...(auth.algorithm === 'ES256' ? {dsaEncoding: 'ieee-p1363'} : {})});
  const authorization = `Bearer ${unsigned}.${signature.toString('base64url')}`;
  if (Buffer.byteLength(authorization) > 16384) throw credentialError();
  return authorization;
}
