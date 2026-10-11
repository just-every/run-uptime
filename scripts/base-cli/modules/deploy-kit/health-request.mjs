import { assert } from './validation.mjs';

async function bodyPrefix(response) {
  if (!response.body) return '';
  const reader = response.body.getReader(); let bytes = Buffer.alloc(0);
  try {
    while (bytes.length < 256) {
      const {done,value} = await reader.read();
      if (done) break;
      bytes = Buffer.concat([bytes,value.subarray(0,256-bytes.length)]);
    }
  } catch { /* HTTP status remains authoritative if its diagnostic body breaks. */ }
  finally { await reader.cancel().catch(() => {}); }
  return bytes.toString('utf8');
}

/** One credential-free, bounded request. Retain only bounded response evidence. */
export async function healthRequest({origin, receipt, versionId, request, timeoutMs, offsetMs}) {
  const attempt = {offsetMs,status:null,cfRay:null,contentType:null,body:'',errorClass:null};
  let response;
  try {
    response = await request(`${origin}/health`, {redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{'Cache-Control':'no-cache','Accept':'application/json'}});
  } catch {
    attempt.errorClass = 'health-transport-failed';
    return {attempt,transient:true};
  }
  attempt.status = response.status;
  attempt.cfRay = response.headers.get('cf-ray')?.slice(0,256) ?? null;
  attempt.contentType = response.headers.get('content-type')?.slice(0,256) ?? null;
  if (response.status !== 200 || response.redirected) {
    attempt.body = await bodyPrefix(response);
    attempt.errorClass = 'health-http-failed';
    return {attempt,transient:!response.redirected && (response.status === 404 || response.status >= 500 && response.status <= 599)};
  }
  let bytes = Buffer.alloc(0);
  try {
    assert(response.body,'empty-response');
    const reader = response.body.getReader();
    try {
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        bytes = Buffer.concat([bytes, value]);
        attempt.body = bytes.subarray(0,256).toString('utf8');
        assert(bytes.length <= 65536,'response-too-large');
      }
    } finally { await reader.cancel().catch(() => {}); }
  } catch (error) {
    attempt.errorClass = ['response-too-large','empty-response'].includes(error.message) ? error.message : 'health-transport-failed';
    // A redirect or permanent status can never become retryable via body IO.
    return {attempt,transient:attempt.errorClass === 'health-transport-failed' && (response.status === 200 || response.status === 404 || response.status >= 500 && response.status <= 599)};
  }
  let body;
  try { body = JSON.parse(bytes.toString('utf8')); }
  catch { attempt.errorClass = 'malformed-response'; return {attempt,transient:false}; }
  if (body?.ok !== true || body.deployment?.sourceSha !== receipt.source.sha || body.deployment?.fingerprint !== receipt.fingerprint || body.deployment?.versionId !== versionId) {
    attempt.errorClass = 'health-identity-mismatch';
  }
  return {attempt,transient:false};
}

/** Retries are spaced 1 s, doubling to a 10 s cap, never closer than the 2 s poll
 * interval of the standalone readiness window: 2, 2, 4, 8, 10, 10 ... seconds. */
const MIN_DELAY_MS = 2000, MAX_DELAY_MS = 10000;

/** The total bound includes requests, body reads and backoff; no request starts at the deadline.
 * Only a transient outcome is retried. Every attempt is recorded, in order, whatever the end. */
export async function waitHealth({origin,receipt,versionId,request,timeoutMs=30000,totalMs=90000,clock=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onAttempt=()=>{},single=false}) {
  assert(Number.isFinite(totalMs) && totalMs > 0 && totalMs <= 90000 && Number.isFinite(timeoutMs) && timeoutMs > 0,'invalid-health-bound');
  const start = clock(); const attempts = []; let delay = 1000;
  while (true) {
    const remaining = totalMs - (clock()-start);
    if (remaining <= 0) break;
    const result = await healthRequest({origin,receipt,versionId,request,timeoutMs:Math.max(1,Math.ceil(Math.min(timeoutMs,remaining))),offsetMs:Math.round(clock()-start)});
    attempts.push(result.attempt); await onAttempt(result.attempt,attempts);
    if (!result.attempt.errorClass) return {ok:true,versionId,attempts};
    if (single || !result.transient) break;
    const rest = totalMs - (clock()-start);
    if (rest <= 0) break;
    await sleep(Math.min(Math.max(delay,MIN_DELAY_MS),rest)); delay = Math.min(delay*2,MAX_DELAY_MS);
  }
  const last = attempts.at(-1);
  const error = new Error(`${last?.errorClass ?? 'health-timeout'}-last-status-${last?.status ?? 'transport'}`);
  error.attempts = attempts; error.status = last?.status ?? null;
  throw error;
}
