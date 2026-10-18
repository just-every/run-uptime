// Shared by HTTP capture and signed intake. This is text evidence, never HTML.
export const FAILURE_SNAPSHOT_LIMITS = Object.freeze({version: 1, bodyBytes: 16384, totalBytes: 32768, redirects: 10, headers: 32, urlBytes: 2048, masks: 20, maskLength: 128});
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
function card(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return value;
  let sum = 0, double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double && (n *= 2) > 9) n -= 9;
    sum += n; double = !double;
  }
  return sum % 10 === 0 ? REDACTED : value;
}
function redact(text, secrets = []) {
  for (const secret of secrets) text = text.split(secret).join(REDACTED);
  return text
    .replace(/\b(?:Bearer|Basic)\s+[^\s"'<>;,]+/gi, REDACTED)
    .replace(/(\b(?:set-cookie|cookie)\b["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n<>]*)/gi, `$1${REDACTED}`)
    .replace(/(\b(?:authorization|proxy-authorization|(?:x[-_])?api[-_]?(?:key|token)|access[-_]?token|refresh[-_]?token|token|password|passwd|secret|client[-_]?secret)\b["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s<,;}&]+)/gi, `$1${REDACTED}`)
    .replace(/(<(?:password|secret|token|api[-_]?key)>)[\s\S]*?(?=<\/)/gi, `$1${REDACTED}`)
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, REDACTED)
    .replace(/(?<!\d)(?:\d[ -]?){12,18}\d(?![ -]?\d)/g, card);
}
function urlText(value, secrets = []) {
  if (typeof value !== 'string' || bytes(value) > 8192) fail();
  let url;
  try { url = new URL(value); } catch { fail(); }
  if (!['http:', 'https:'].includes(url.protocol)) fail();
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
function headers(value, response, secrets = [], strict = false) {
  const entries = typeof Headers !== 'undefined' && value instanceof Headers ? [...value] : plain(value) ? Object.entries(value) : fail();
  if (strict && entries.length > L.headers) fail();
  const result = new Map();
  for (const [name, raw] of entries.slice(0, L.headers)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/.test(name) || (strict && (typeof raw !== 'string' || bytes(raw) > 256))) fail();
    const key = name.toLowerCase();
    if (result.has(key)) fail();
    const text = response && safeHeaders.has(key) ? redact(String(raw).replace(/[\x00-\x1f\x7f]/g, ''), secrets) : REDACTED;
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
export function captureFailureSnapshot({method, url, redirects = [], requestHeaders = {}, responseHeaders = {}, status = null, body = '', durationMs, requestSecrets = [], masks = []}) {
  const known=literals(requestSecrets,128,16384,true).flatMap(secret=>{const token=secret.replace(/^(?:Bearer|Basic)\s+/i,'');return [secret,token,encodeURIComponent(secret),encodeURIComponent(token)]});
  const secrets=[...new Set([...known,...literals(masks,L.masks,L.maskLength)])].filter(Boolean).sort((a,b)=>b.length-a.length);
  if (typeof method !== 'string' || !/^[A-Za-z]{1,16}$/.test(method) || !Array.isArray(redirects) || redirects.length > L.redirects || typeof body !== 'string') fail();
  if ((status !== null && (!Number.isInteger(status) || status < 100 || status > 599)) || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > 3600000) fail();
  let excerpt = clip(body, L.bodyBytes);
  const truncated = bytes(body) > L.bodyBytes;
  // Mask a literal that crosses the excerpt boundary, including its visible prefix.
  let boundary = excerpt.length;
  if (truncated) for (const secret of secrets) {
    const start = body.slice(0, excerpt.length + secret.length).indexOf(secret, Math.max(0, excerpt.length - secret.length + 1));
    if (start >= 0 && start < excerpt.length && start + secret.length > excerpt.length) boundary = Math.min(boundary, start);
  }
  if (boundary < excerpt.length) excerpt = excerpt.slice(0, boundary) + REDACTED;
  const redacted = redact(excerpt, secrets);
  return bounded({version: L.version, method: method.toUpperCase(), url: urlText(url, secrets), redirects: redirects.map(v => urlText(v, secrets)),
    requestHeaders: headers(requestHeaders, false, secrets), responseHeaders: headers(responseHeaders, true, secrets), status, durationMs,
    body: clip(redacted, L.bodyBytes), bodyTruncated: truncated || bytes(redacted) > L.bodyBytes});
}
export function normalizeFailureSnapshot(value) {
  if(plain(value)&&Object.keys(value).join(',')==='unavailable'&&value.unavailable==='capture_limit')return {unavailable:'capture_limit'};
  if (!plain(value) || Object.keys(value).length !== fields.length || fields.some(k => !Object.hasOwn(value, k)) || value.version !== L.version) fail();
  if (typeof value.body !== 'string' || bytes(value.body) > L.bodyBytes || typeof value.bodyTruncated !== 'boolean') fail();
  if (!Array.isArray(value.redirects) || value.redirects.length > L.redirects || bytes(JSON.stringify(value)) > L.totalBytes) fail();
  const requestHeaders = headers(value.requestHeaders, false, [], true), responseHeaders = headers(value.responseHeaders, true, [], true);
  const requestSecrets = Object.values(value.requestHeaders).filter(v => v && v !== REDACTED);
  const normalized = captureFailureSnapshot({...value, requestHeaders, responseHeaders, requestSecrets});
  normalized.bodyTruncated ||= value.bodyTruncated;
  return normalized;
}
export const validateFailureSnapshot = normalizeFailureSnapshot;

export function tryCaptureFailureSnapshot(input) {try{return captureFailureSnapshot(input)}catch{return {unavailable:'capture_limit'}}}
