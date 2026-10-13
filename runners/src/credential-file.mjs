import {open, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {validateHeaderName, validateHeaderValue} from 'node:http';
import {validReference, validMonitorId} from '../../src/domain/credential-binding.mjs';
const forbidden = new Set(['host','connection','upgrade','content-length','transfer-encoding','te','trailer','expect','accept-encoding','proxy-authorization','proxy-connection']);
export async function openCredential(directory, reference) {
  if (!directory || !validReference(reference)) throw Error('Credential unavailable');
  const root = await realpath(directory), path = join(root, `${reference}.json`);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o077) || stat.uid !== process.getuid() || stat.size > 32768 + 544) throw Error();
    const input = JSON.parse(await file.readFile('utf8'));
    validateCredential(input);
    // Adding a monitor identity must not invalidate an otherwise valid boundary-size legacy file.
    const identityBytes = input.monitorId === undefined ? 0 : JSON.stringify({monitorId: input.monitorId}).length;
    if (stat.size - identityBytes > ('value' in input ? 4096 : 32768)) throw Error();
    return {file, stat, input, path, root};
  } catch { await file.close(); throw Error('Credential unavailable or invalid'); }
}
export function validateCredential(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(k => !['monitorId','origin','headers','body','auth','value'].includes(k))) throw Error();
  if (input.monitorId !== undefined && !validMonitorId(input.monitorId)) throw Error();
  const origin = new URL(input.origin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== input.origin) throw Error();
  if ('value' in input) {
    if (Object.keys(input).some(k => !['monitorId','origin','value'].includes(k)) || typeof input.value !== 'string' || !input.value || input.value.length > 1024) throw Error();
  } else httpCredential(input);
}
export function httpCredential(input) {
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
    if (a.type === 'bearer' && Object.keys(a).sort().join(',') === 'token,type' && typeof a.token === 'string' && a.token.length > 0 && a.token.length <= 4096) headers.authorization = `Bearer ${a.token}`;
    else if (a.type === 'basic' && Object.keys(a).sort().join(',') === 'password,type,username' && typeof a.username === 'string' && !a.username.includes(':') && typeof a.password === 'string') headers.authorization = `Basic ${Buffer.from(`${a.username}:${a.password}`).toString('base64')}`;
    else throw Error();
    validateHeaderValue('authorization', headers.authorization);
  }
  if (input.body !== undefined && (typeof input.body !== 'string' || Buffer.byteLength(input.body) > 16384)) throw Error();
  return {headers, body: input.body};
}
