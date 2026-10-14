import { recordDeployFailure } from './diagnostics.mjs';
import { importD1, importUploadURL } from './d1-import.mjs';
import { assert, hexId } from './validation.mjs';

async function boundedText(response, limit = 4 * 1024 * 1024, onReadError) {
  assert(response.body, 'empty-response');
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try { while (true) {
    let chunk;
    // Only a failed stream read is transport failure; retain size/shape codes.
    try { chunk = await reader.read(); } catch (cause) { throw onReadError ? onReadError(cause) : cause; }
    const { done, value } = chunk; if (done) break;
    length += value.length; assert(length <= limit, 'response-too-large'); chunks.push(value);
  } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function boundedJSON(response, limit) {
  try { return JSON.parse(await boundedText(response,limit)); } catch (error) { if (error instanceof SyntaxError) throw new Error('malformed-response'); throw error; }
}
function transportOutput(error) {
  const lines = []; const seen = new Set();
  for (let cause = error; cause && !seen.has(cause) && seen.size < 4; cause = cause.cause) {
    seen.add(cause);
    lines.push([typeof cause.code === 'string' ? cause.code : '', typeof cause.message === 'string' ? cause.message : ''].filter(Boolean).join(': '));
  }
  return lines.filter(Boolean).join('\n');
}
/** Only this fixed origin and the explicitly selected account ever receive the token. */
export function cloudflare({ accountId, token, fetch: request = globalThis.fetch, timeoutMs = 30000, maxRequests = 500 }) {
  assert(hexId(accountId), 'invalid-cloudflare-account-id');
  assert(typeof token === 'string' && token.trim() && !/[\r\n]/.test(token), 'invalid-cloudflare-api-token');
  let requests = 0;
  // `zone` scope: the zone-level API (/zones/...), for a run site's zone lookup and redirect rule.
  async function envelope(path, { method = 'GET', body, assetToken, zone = false } = {}) {
    assert(typeof path === 'string' && /^\/[a-z0-9/_?=&.,%-]+$/i.test(path) && !path.includes('..') && !path.split('?')[0].includes('%'), 'invalid-provider-path');
    assert(!zone || /^\/zones(?:[/?]|$)/.test(path), 'invalid-provider-path');
    assert(++requests <= maxRequests, 'provider-request-budget');
    assert(!assetToken || path === '/workers/assets/upload?base64=true', 'invalid-asset-auth-target');
    // Asset-session credentials are discovered at runtime, outside the CLI env.
    // Preserve complete text for the CLI's remaining redaction before truncation.
    const redactAuth = text => /\/d1\/database\/[^/]+\/import$/.test(path) ? '[D1 import details omitted]' : [accountId,token,assetToken].filter(Boolean).flatMap(value=>[value,encodeURIComponent(value),JSON.stringify(value).slice(1,-1)]).sort((a,b)=>b.length-a.length).reduce((value,secret)=>value.split(secret).join('[REDACTED]'),text);
    const transportFailure = cause => recordDeployFailure(new Error('provider-transport-failed'),{output:redactAuth(transportOutput(cause))});
    const signal = AbortSignal.timeout(timeoutMs);
    let response;
    try { response = await request(zone ? `https://api.cloudflare.com/client/v4${path}` : `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
      method, redirect: 'error', signal, headers: { Authorization: `Bearer ${assetToken ?? token}`, ...(body && !(body instanceof FormData) ? { 'Content-Type':'application/json' } : {}) },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    }); } catch (cause) { throw transportFailure(cause); }
    const output = response.body ? await boundedText(response,undefined,transportFailure) : '';
    let payload;
    try { payload = JSON.parse(output); } catch { if (response.ok) throw new Error('malformed-response'); }
    if (!response.ok || payload?.success === false) {
      const error = new Error(response.ok ? 'provider-unsuccessful-or-malformed' : `provider-http-${response.status}`);
      error.status = response.status;
      throw recordDeployFailure(error,{providerCodes:(Array.isArray(payload?.errors) ? payload.errors : []).filter(x => Number.isSafeInteger(x?.code)).map(x=>x.code).slice(0,8),
        output:redactAuth(Array.isArray(payload?.errors) ? payload.errors.filter(x=>typeof x?.message==='string').map(x=>x.message).join('\n') : output)});
    }
    assert(payload?.success === true && Object.hasOwn(payload,'result') && (!payload.errors || Array.isArray(payload.errors) && !payload.errors.length), 'provider-unsuccessful-or-malformed');
    if (/^\/d1\/database\/[^/]+\/query$/.test(path) && Array.isArray(payload.result)) {
      const failed = payload.result.filter(row => row?.success === false);
      if (failed.length) {
        // D1 can fail inside a successful HTTP/API envelope. Read only typed
        // error fields; query results and metadata are never diagnostic output.
        const errors = failed.flatMap(row => [typeof row.error === 'string' ? {message:row.error} : row.error, ...(Array.isArray(row.errors) ? row.errors : [])]);
        throw recordDeployFailure(new Error('d1-query-failed'),{providerCodes:errors.filter(error=>Number.isSafeInteger(error?.code)).map(error=>error.code).slice(0,8),
          output:redactAuth(errors.filter(error=>typeof error?.message==='string').map(error=>error.message).join('\n'))});
      }
    }
    return payload;
  }
  async function list(path, { field, pagination = 'page' } = {}) {
    if (pagination === 'single') {
      assert(path === '/workers/scripts' || /^\/queues\/[a-f0-9]{32}\/consumers$/.test(path),'invalid-single-list');
      const data = await envelope(path);
      assert(Array.isArray(data.result) && data.result.length <= 10000,'provider-invalid-list');
      const info = data.result_info;
      if (info != null) {
        assert(typeof info === 'object' && !Array.isArray(info),'provider-incomplete-pagination');
        for (const key of ['count','total_count']) if (Object.hasOwn(info,key)) assert(info[key] === data.result.length,'provider-partial-list');
        assert([undefined,null,''].includes(info.cursor) &&
          (info.total_pages === undefined || info.total_pages === 1 || info.total_pages === 0 && data.result.length === 0) &&
          (info.page === undefined || info.page === 1),'provider-incomplete-pagination');
      }
      return data.result;
    }
    assert(['page','cursor','r2-bounded'].includes(pagination),'invalid-list-pagination');
    const r2Bounded = pagination === 'r2-bounded';
    assert(!r2Bounded || path === '/r2/buckets' && field === 'buckets', 'invalid-r2-bounded-list');
    const result = []; const seen = new Set(); let cursor; let total;
    for (let page = 1; page <= 100; page++) {
      const suffix = r2Bounded || pagination === 'cursor' ? (path === '/r2/buckets' ? `?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}` : (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '')) : `?page=${page}&per_page=100`;
      const data = await envelope(path + suffix); const rows = field ? data.result?.[field] : data.result;
      assert(Array.isArray(rows), 'provider-invalid-list');
      result.push(...rows); assert(result.length <= 10000, 'provider-list-too-large');
      if (r2Bounded) {
        const info = data.result_info;
        assert(rows.length <= 1000, 'provider-partial-list');
        // Only this endpoint's explicit bounded strategy uses the requested
        // limit when metadata is absent. Never invent metadata for other modes.
        if (info === undefined || info === null) {
          assert(rows.length < 1000, 'provider-incomplete-pagination');
          assert(total === undefined || result.length === total, 'provider-partial-list');
          return result;
        }
        assert(typeof info === 'object' && !Array.isArray(info) && Number.isSafeInteger(info.per_page) && info.per_page > 0 && info.per_page <= 1000, 'provider-incomplete-pagination');
        assert(rows.length <= info.per_page, 'provider-partial-list');
        if (Object.hasOwn(info, 'count')) assert(info.count === rows.length, 'provider-partial-list');
        if (Object.hasOwn(info, 'total_count')) {
          assert(Number.isSafeInteger(info.total_count) && info.total_count >= 0, 'provider-incomplete-pagination');
          total ??= info.total_count; assert(total === info.total_count, 'provider-pagination-changed');
        }
        assert(total === undefined || result.length <= total, 'provider-partial-list');
        assert(info.cursor === undefined || typeof info.cursor === 'string', 'provider-invalid-cursor');
        if (!info.cursor) {
          assert(rows.length < info.per_page && (total === undefined || result.length === total), 'provider-partial-list');
          return result;
        }
        assert(total === undefined || result.length < total, 'provider-partial-list');
        cursor = info.cursor; assert(/^[a-zA-Z0-9_+\/=-]+$/.test(cursor) && !seen.has(cursor), 'provider-invalid-cursor'); seen.add(cursor);
      } else if (pagination === 'cursor') {
        const info = data.result_info;
        // R2's terminal short page may explicitly report null pagination. The
        // requested documented limit supplies the bound; a full page is ambiguous.
        if (path === '/r2/buckets' && info === null) { assert(rows.length < 1000, 'provider-incomplete-pagination'); return result; }
        assert(info && Number.isSafeInteger(info.per_page) && info.per_page > 0, 'provider-incomplete-pagination');
        if (!info.cursor) { assert(rows.length < info.per_page, 'provider-partial-list'); return result; }
        cursor = info.cursor; assert(typeof cursor === 'string' && /^[a-zA-Z0-9_+\/=-]+$/.test(cursor) && !seen.has(cursor), 'provider-invalid-cursor'); seen.add(cursor);
      } else {
        const info = data.result_info;
        assert(info && info.page === page && Number.isSafeInteger(info.total_count) && info.total_count >= 0, 'provider-incomplete-pagination');
        total ??= info.total_count; assert(total === info.total_count, 'provider-pagination-changed');
        assert(result.length <= total, 'provider-partial-list');
        if (result.length === total) return result;
        assert(rows.length > 0 && (info.total_pages === undefined || page < info.total_pages), 'provider-partial-list');
      }
    }
    throw new Error('provider-pagination-limit');
  }
  async function upload(url, bytes, etag) {
    const destination = importUploadURL(url);
    assert(++requests <= maxRequests, 'provider-request-budget');
    let response;
    try {
      response = await request(destination, { method:'PUT', redirect:'error', signal:AbortSignal.timeout(timeoutMs), headers:{'Content-Length':String(bytes.length)}, body:bytes });
    } catch { throw new Error('d1-import-upload-transport-failed'); }
    // Upload bodies and signed URLs are never diagnostics, including on failure.
    await response.body?.cancel().catch(() => {});
    assert(response.status === 200, 'd1-import-upload-failed');
    assert(response.headers.get('etag')?.replace(/^"|"$/g, '') === etag, 'd1-import-upload-etag-mismatch');
  }
  return { accountId, envelope, list, importSql(id, sql) { return importD1({envelope,upload}, id, sql); }, async request(path, options) { return (await envelope(path, options)).result; },
    async zoneRequest(path, options = {}) { return (await envelope(path, { ...options, zone: true })).result; } };
}
