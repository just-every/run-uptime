import {completeSecondFactor} from '../mfa-auth-support.mjs';

// Test-owned native sessions stay in this process and never enter fixture JSON.
export const memberSessions = new Map();
// The disposable hosted ingress supplies the same source-IP header as the
// production Cloudflare edge. This is a network fixture, never an auth bypass.
export const edgeHeaders = {'cf-connecting-ip': '192.0.2.42'};

export function cookies(response) {
 const result = response.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
 if (!result || response.redirected) throw new Error('Native authentication did not return its session.');
 return result;
}

export function nativeHttp({request, origin, cookie}) {
 const send = (path, body, {method = body === undefined ? 'GET' : 'POST', headers = {}} = {}) => request(new URL(path, origin).href, {
  method, redirect: 'manual', headers: {...edgeHeaders, origin, cookie, 'content-type': 'application/json', ...headers},
  ...(body === undefined ? {} : {body: JSON.stringify(body)}),
 });
 const json = async (path, body, options) => {
  const response = await send(path, body, options);
  if (!response.ok) {
   const diagnostic = await response.json().catch(() => ({}));
   console.error('Native fixture ' + (options?.method ?? (body === undefined ? 'GET' : 'POST')) + ' ' + new URL(path, origin).pathname + ': HTTP ' + response.status + ' ' + String(diagnostic.code ?? diagnostic.error ?? '').slice(0, 200));
   throw new Error('Native fixture request was refused.');
  }
  return response.json();
 };
 return {send, json};
}

export async function freshFactor({request, origin, cookie}) {
 return completeSecondFactor(origin, cookie, (url, init) => request(url, {...init, headers: {...edgeHeaders, ...init.headers}}));
}
