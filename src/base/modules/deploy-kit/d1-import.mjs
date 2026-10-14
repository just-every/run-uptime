import { createHash } from 'node:crypto';
import { assert, uuid } from './validation.mjs';

// Wrangler's remote --file protocol. D1 imports execute the whole file atomically,
// including trigger bodies; the query endpoint's semicolon splitting cannot.
export async function importD1({ envelope, upload }, id, sql) {
  assert(uuid(id) && typeof sql === 'string' && Buffer.byteLength(sql) <= 4 * 1024 * 1024, 'invalid-d1-import');
  const bytes = Buffer.from(sql), etag = createHash('md5').update(bytes).digest('hex');
  const post = async body => (await envelope(`/d1/database/${id}/import`, { method:'POST', body })).result;
  let response = await post({ action:'init', etag });
  if (response && Object.hasOwn(response, 'upload_url')) {
    assert(typeof response.filename === 'string' && response.filename.length > 0 && response.filename.length <= 1024 && !/[\x00-\x1f\x7f]/.test(response.filename), 'invalid-d1-import-filename');
    await upload(response.upload_url, bytes, etag);
    response = await post({ action:'ingest', filename:response.filename, etag });
  }
  for (let polls = 0; polls < 100; polls++) {
    // REST places errors on the envelope; validate nested errors when supplied.
    assert(response?.success === true && response.type === 'import' && (!Object.hasOwn(response, 'errors') || Array.isArray(response.errors) && !response.errors.length), 'd1-import-failed');
    if (response.status === 'complete') {
      assert(Number.isSafeInteger(response.result?.num_queries) && response.result.num_queries > 0 && typeof response.result.final_bookmark === 'string' && response.result.final_bookmark.length > 0, 'd1-import-invalid-result');
      return;
    }
    assert(response.status === 'active' && typeof response.at_bookmark === 'string' && response.at_bookmark.length > 0 && response.at_bookmark.length <= 1024, 'd1-import-uncertain');
    response = await post({ action:'poll', current_bookmark:response.at_bookmark });
  }
  throw new Error('d1-import-poll-limit');
}

export function importUploadURL(value) {
  assert(typeof value === 'string' && value.length <= 16384 && !/[\x00-\x20\x7f\\]/.test(value), 'invalid-d1-import-upload-url');
  let url;
  try { url = new URL(value); } catch { throw new Error('invalid-d1-import-upload-url'); }
  assert(url.protocol === 'https:' && /^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(url.hostname) && !url.port && !url.username && !url.password && !url.hash && url.pathname.length > 1 && url.search.length > 1, 'invalid-d1-import-upload-url');
  return url.href;
}
