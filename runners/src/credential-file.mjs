import {join} from 'node:path';
import {validateHeaderName, validateHeaderValue} from 'node:http';
import {validReference, validMonitorId} from '../../src/domain/credential-binding.mjs';
import {ownedDirectory, readOwned} from './auth/files.mjs';
import {validateAuth} from './auth/schema.mjs';
import {clientTls} from './auth/tls.mjs';
import {credentialError, integer} from './auth/validation.mjs';
const forbidden = new Set(['host','connection','upgrade','content-length','transfer-encoding','te','trailer','expect','accept-encoding','proxy-authorization','proxy-connection']);
export async function openCredential(directory, reference) {
  let source;
  try {
    if (!directory || !validReference(reference)) throw credentialError();
    const root = await ownedDirectory(directory), path = join(root, `${reference}.json`);
    source = await readOwned(path, 65536);
    const {file, stat, bytes} = source, input = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    validateCredential(input);
    // Adding a monitor identity must not invalidate an otherwise valid boundary-size legacy file.
    const identityBytes = input.monitorId === undefined ? 0 : JSON.stringify({monitorId: input.monitorId}).length;
    if ('value' in input && stat.size - identityBytes > 4096) throw credentialError();
    return {file, stat, input, path, root, bytes};
  } catch { await source?.file.close(); throw credentialError(); }
}
export function validateCredential(input) {
 try {
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(k => !['monitorId','origin','headers','body','auth','value','tls','expiresAt','allowUnverifiedTls'].includes(k))) throw credentialError();
  if (input.monitorId !== undefined && !validMonitorId(input.monitorId)) throw Error();
  const origin = new URL(input.origin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== input.origin) throw Error();
  if ('value' in input) {
    if (Object.keys(input).some(k => !['monitorId','origin','value'].includes(k)) || typeof input.value !== 'string' || !input.value || input.value.length > 1024) throw Error();
  } else {
    if (input.expiresAt !== undefined) integer(input.expiresAt, 1, Number.MAX_SAFE_INTEGER);
    if (input.allowUnverifiedTls !== undefined && typeof input.allowUnverifiedTls !== 'boolean') throw credentialError();
    if ((input.tls !== undefined || ['oauth2', 'jwt'].includes(input.auth?.type)) && origin.protocol !== 'https:') throw credentialError();
    httpCredential(input);
  }
 } catch { throw credentialError(); }
}
export function httpCredential(input) {
 try {
  if ('value' in input) throw Error();
  const headers = {};
  if (input.headers !== undefined) {
    if (!input.headers || Array.isArray(input.headers) || typeof input.headers !== 'object' || Object.keys(input.headers).length > 30) throw Error();
    for (const [name, value] of Object.entries(input.headers)) {
      const key = name.toLowerCase(); validateHeaderName(name); validateHeaderValue(name, value);
      if (forbidden.has(key) || key in headers || typeof value !== 'string' || value.length > 4096) throw Error();
      headers[key] = value;
    }
  }
  if (input.auth !== undefined) {
    const a = input.auth;
    if (!a || headers.authorization) throw Error();
    validateAuth(a);
    if (a.type === 'bearer') headers.authorization = `Bearer ${a.token}`;
    else if (a.type === 'basic') headers.authorization = `Basic ${Buffer.from(`${a.username}:${a.password}`).toString('base64')}`;
    if (headers.authorization !== undefined) validateHeaderValue('authorization', headers.authorization);
  }
  if (input.body !== undefined && (typeof input.body !== 'string' || Buffer.byteLength(input.body) > 16384)) throw Error();
  if (!Object.keys(headers).length && input.body === undefined && input.auth === undefined && input.tls === undefined) throw credentialError();
  return {headers, body: input.body, ...(input.auth !== undefined ? {auth: input.auth} : {}), ...(input.tls !== undefined ? {tls: clientTls(input.tls)} : {}), allowUnverifiedTls: input.allowUnverifiedTls ?? false, ...(input.expiresAt !== undefined ? {expiresAt: input.expiresAt} : {})};
 } catch { throw credentialError(); }
}
