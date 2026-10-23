import {createHash, randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

// The CLI uses the same authenticated import transport as the console. Credentials
// come from the environment, never from command arguments or definition files.
export async function remoteDefinitions(command, options, text) {
 const url = new URL(options.origin);
 if (url.pathname !== '/' || url.search || url.hash || url.username || url.password ||
     (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw Error('Use an HTTPS installation origin (HTTP is allowed only on loopback).');
 const origin = url.origin, token=process.env.UPTIME_CI_TOKEN, cookie = process.env.UPTIME_SESSION_COOKIE;
 if(!token&&!cookie)throw Error('Set UPTIME_CI_TOKEN or UPTIME_SESSION_COOKIE to the authorized installation credential.');
 if(token&&(!options.environment||!options.environment.trim()))throw Error('CI commands require an explicit --environment.');
 if(token&&!['validate','test','preview','apply'].includes(command))throw Error('CI credentials support preview, validation/test and apply only.');
 const authority=token?{authorization:'Bearer '+token,'x-uptime-environment':options.environment}:{cookie};
 async function call(path, body, headers = {}) {
  const response = await fetch(origin + path, {method: body === undefined ? 'GET' : 'POST', redirect: 'error',
   headers: {origin, ...authority, ...(body === undefined ? {} : {'content-type': 'application/json'}), ...headers}, body});
  const result = await response.json();
  if (!response.ok) throw Object.assign(Error(`The import door refused (HTTP ${response.status}).`),{code:result.error==='catchup_required'?'catchup_required':'refused',status:response.status});
  return result;
 }
 const door = (namespace, step, body) => call('/api/operator/import/' + step, JSON.stringify(body), {'x-import-source': namespace});
 const hash = bytes => createHash('sha256').update(bytes).digest('hex');
 if (command === 'export') {
  await writeFile(options.output, JSON.stringify(await call('/api/definitions/export'), null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return {output: options.output};
 }
 if (!['validate', 'test', 'preview', 'apply'].includes(command)) throw Error('Remote definitions support validate, test, preview, apply and export.');
 const recognised = await call('/api/definitions/recognise?source=' + encodeURIComponent(options.source ?? 'auto'), text);
 const namespace = recognised.namespace ?? (recognised.source === 'uptime.monitors' ? `uptime.monitors:${randomUUID()}` : recognised.source);
 const bytes = Buffer.from(JSON.stringify(recognised.text) + '\n'), totalChunks = Math.ceil(bytes.length / 65536);
 let uploadId;
 for (let index = 0; index < totalChunks; index++) {
  const chunk = bytes.subarray(index * 65536, (index + 1) * 65536);
  ({uploadId} = await door(namespace, 'uploads', {uploadId, name: 'definitions.ndjson', bundleSha256: hash(bytes), totalBytes: bytes.length,
   totalChunks, index, chunkSha256: hash(chunk), base64: chunk.toString('base64')}));
 }
 let planned;
 try { planned = await door(namespace, 'plan', {uploadId}); }
 catch (error) { if (error.code!=='catchup_required') throw error; planned = await door(namespace, 'plan', {uploadId, catchup: true}); }
 const preview = await call('/api/definitions/plans/' + encodeURIComponent(planned.planId));
 const cancel = async () => { if (!preview.applied) await door(namespace, 'undo', {planId: preview.planId}); };
 if (command !== 'apply') { await cancel(); return command==='test'?{...preview,test:{kind:'schema-and-plan-validation',runtimeProbesExecuted:false}}:preview; }
 if (preview.reviewDigest !== options.digest) { await cancel(); throw Error('The installation or file changed since preview. Preview again.'); }
 if (preview.kind !== 'definitions' || preview.counts.refused || preview.counts.unsupported) { await cancel(); throw Error('The preview contains refused or unsupported entries.'); }
 if (!preview.counts.create && !preview.counts.change) { await cancel(); return {unchanged: true, preview}; }
 for (let n = 0; n < 100; n++) {
  const {job} = await door(namespace, 'apply', {planId: preview.planId, reviewedFingerprint: preview.digest});
  if (job.state === 'completed') {
   const report = await door(namespace, 'reconcile', {planId: preview.planId});
   if (!report.ok) throw Error('The import did not retain the reviewed definitions.');
   return {batchId: 'business:' + preview.planId, job, preview, report};
  }
  if (!['queued', 'applying'].includes(job.state)) throw Error('The import stopped: ' + job.state);
 }
 throw Error('The import did not finish.');
}
