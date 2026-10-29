import {normalizeFlowArtifacts} from './flow-artifacts.mjs';
import {redactFailureText} from './failure-snapshot-text.mjs';
import {normalizeFailurePage} from './failure-page.mjs';
import {normalizeNetworkDiagnostics,normalizeDiagnosticPhases} from './network-diagnostics.mjs';
// Shared by HTTP capture and signed intake. This is text evidence, never HTML.
export const FAILURE_SNAPSHOT_LIMITS = Object.freeze({version: 1, bodyBytes: 16384, totalBytes: 393216, redirects: 10, headers: 32, urlBytes: 2048, masks: 20, maskLength: 128});
const L = FAILURE_SNAPSHOT_LIMITS, REDACTED = '[redacted]', encoder = new TextEncoder();
const fields = ['version', 'method', 'url', 'redirects', 'requestHeaders', 'responseHeaders', 'status', 'durationMs', 'body', 'bodyTruncated'];
const safeHeaders = new Set(['content-type', 'content-length', 'server', 'retry-after']);
const bytes = text => encoder.encode(text).length;
const fail = () => { throw new Error('Invalid failure snapshot'); };
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function clip(text, limit) {
  const encoded = encoder.encode(text);
  if (encoded.length <= limit) return text;
  let end = limit;
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(encoded.subarray(0, end));
}
function literals(values, count, length, empty = false) {
  if (!Array.isArray(values) || values.length > count || values.some(v => typeof v !== 'string' || v.length > length || (!empty && !v.length))) fail();
  return values.filter(Boolean).sort((a, b) => b.length - a.length);
}
const redact=redactFailureText;
function urlText(value, secrets = []) {
  if (typeof value !== 'string' || bytes(value) > 8192) fail();
  let url;
  try { url = new URL(value); } catch { fail(); }
  if (!['http:','https:','tcp:','tls:','dns:','udp:','ping:','smtp:','smtps:','pop3:','pop3s:','imap:','imaps:'].includes(url.protocol)) fail();
  url.username = ''; url.password = ''; url.hash = '';
  const query = [...url.searchParams].map(([name]) => [redact(name, secrets), REDACTED]);
  url.search = '';
  for (const [name, value] of query) url.searchParams.append(name, value);
  // Decode each segment so a URL-encoded request secret cannot survive in a path.
  url.pathname = url.pathname.split('/').map(segment => {
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { fail(); }
    return decoded === redact(decoded, secrets) ? segment : encodeURIComponent(redact(decoded, secrets));
  }).join('/');
  if (bytes(url.href) > L.urlBytes) fail();
  return url.href;
}
function headers(value, response, secrets = [], strict = false, safe=[],allowEmail=false) {
  const entries = typeof Headers !== 'undefined' && value instanceof Headers ? [...value] : plain(value) ? Object.entries(value) : fail();
  if (strict && entries.length > L.headers) fail();
  const result = new Map();
  for (const [name, raw] of entries.slice(0, L.headers)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/.test(name) || (strict && (typeof raw !== 'string' || bytes(raw) > 256))) fail();
    const key = name.toLowerCase();
    if (result.has(key)) fail();
    const text = (safe.includes(key)||response&&safeHeaders.has(key)) ? redact(String(raw).replace(/[\x00-\x1f\x7f]/g, ''), secrets,allowEmail) : REDACTED;
    result.set(key, clip(text, 256));
  }
  return Object.fromEntries([...result].sort(([a], [b]) => a.localeCompare(b)));
}
function bounded(value) {
  const size = () => bytes(JSON.stringify(value));
  if (size() <= L.totalBytes) return value;
  const body = value.body;
  value.body = ''; value.bodyTruncated = true;
  if (size() > L.totalBytes) fail();
  let low = 0, high = bytes(body);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    value.body = clip(body, middle);
    if (size() <= L.totalBytes) low = middle; else high = middle - 1;
  }
  value.body = clip(body, low);
  return value;
}
export function captureFailureSnapshot({method, url, redirects = [], requestHeaders = {}, responseHeaders = {}, status = null, body = '', durationMs, requestSecrets = [], masks = [], phases, diagnostics,safeValues,screenshot,policyVersion,artifacts}) {
  const safe=normalizeSafeValues(safeValues);
  if(policyVersion!==undefined&&(!Number.isSafeInteger(policyVersion)||policyVersion<0))fail();
  const known=literals(requestSecrets,128,16384,true).flatMap(secret=>{const token=secret.replace(/^(?:Bearer|Basic)\s+/i,'');return [secret,token,encodeURIComponent(secret),encodeURIComponent(token)]});
  const secrets=[...new Set([...known,...literals(masks,L.masks,L.maskLength)])].filter(Boolean).sort((a,b)=>b.length-a.length);
  if (typeof method !== 'string' || !/^[A-Za-z]{1,16}$/.test(method) || !Array.isArray(redirects) || redirects.length > L.redirects || typeof body !== 'string') fail();
  if ((status !== null && (!Number.isInteger(status) || status < 100 || status > 599)) || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > 3600000) fail();
  const truncated=bytes(body)>L.bodyBytes;
  const redacted=redact(body,secrets,safe.email,clip(body,L.bodyBytes).length);
  return bounded({version: L.version, method: method.toUpperCase(), url: urlText(url, secrets), redirects: redirects.map(v => urlText(v, secrets)),
    requestHeaders: headers(requestHeaders, false, secrets,false,safe.requestHeaders,safe.email), responseHeaders: headers(responseHeaders, true, secrets,false,safe.responseHeaders,safe.email), status, durationMs,
    body: clip(redacted, L.bodyBytes), bodyTruncated: truncated || bytes(redacted) > L.bodyBytes,...(safeValues?{safeValues:safe}:{}),...(policyVersion!==undefined?{policyVersion}:{}),...(screenshot?{screenshot:normalizeFailurePage(screenshot)}:{}),...(artifacts!==undefined?{artifacts:normalizeFlowArtifacts(artifacts,{secrets,allowEmail:safe.email})}:{}),...(phases?{phases:normalizeDiagnosticPhases(phases)}:{}),...(diagnostics?{diagnostics:normalizeNetworkDiagnostics(diagnostics)}:{})});
}
export function normalizeFailureSnapshot(value) {
  if(plain(value)&&Object.keys(value).join(',')==='unavailable'&&value.unavailable==='capture_limit')return {unavailable:'capture_limit'};
  if (!plain(value) || Object.keys(value).some(k=>![...fields,'phases','diagnostics','safeValues','screenshot','policyVersion','artifacts'].includes(k)) || fields.some(k => !Object.hasOwn(value, k)) || value.version !== L.version) fail();
  if (typeof value.body !== 'string' || bytes(value.body) > L.bodyBytes || typeof value.bodyTruncated !== 'boolean') fail();
  if (!Array.isArray(value.redirects) || value.redirects.length > L.redirects || bytes(JSON.stringify(value)) > L.totalBytes) fail();
  const safe=normalizeSafeValues(value.safeValues);
  const requestHeaders = headers(value.requestHeaders, false, [], true,safe.requestHeaders,safe.email), responseHeaders = headers(value.responseHeaders, true, [], true,safe.responseHeaders,safe.email);
  const requestSecrets = Object.entries(value.requestHeaders).filter(([name,v]) => !safe.requestHeaders.includes(name)&&v&&v!==REDACTED).map(([,v])=>v);
  const normalized = captureFailureSnapshot({...value, requestHeaders, responseHeaders, requestSecrets});
  normalized.bodyTruncated ||= value.bodyTruncated;
  return normalized;
}
export const validateFailureSnapshot = normalizeFailureSnapshot;

export function tryCaptureFailureSnapshot(input) {try{return captureFailureSnapshot(input)}catch{return {unavailable:'capture_limit'}}}

export function normalizeSafeValues(value){
 if(value===undefined)return {requestHeaders:[],responseHeaders:[],email:false};
 if(!plain(value)||Object.keys(value).sort().join(',')!=='email,requestHeaders,responseHeaders'||typeof value.email!=='boolean')fail();
 const names=list=>{if(!Array.isArray(list)||list.length>10||list.some(name=>typeof name!=='string'||!/^[a-z0-9!#$%&'*+.^_`|~-]{1,64}$/.test(name)||/authorization|cookie|token|secret|api.?key|password/i.test(name))||new Set(list).size!==list.length)fail();return [...list].sort()};
 return {requestHeaders:names(value.requestHeaders),responseHeaders:names(value.responseHeaders),email:value.email};
}
export function redactSnapshotText(text,{requestSecrets=[],masks=[],allowEmail=false}={}){
 const secrets=[...requestSecrets,...masks].filter(v=>typeof v==='string'&&v.length&&v.length<=16384).flatMap(v=>[v,v.replace(/^(?:Bearer|Basic)\s+/i,'')]).sort((a,b)=>b.length-a.length);
 return redact(String(text),secrets,allowEmail);
}
