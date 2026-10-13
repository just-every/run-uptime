import { verifyServiceGrants } from './service-grants.mjs';
import { assert, stable } from './validation.mjs';
import { boundedJSON } from './provider.mjs';
import { activeWorker, workerOrigin, durableNamespaces, verifyScheduledHandler } from './worker.mjs';
import { reconcileResources, reconcileTriggers } from './resources.mjs';
import { migrate } from './migrations.mjs';
import { bindingsFor, verifyBindings } from './render.mjs';
import { waitHealth } from './health-request.mjs';

function healthError(message, code, lastResult) {
  const error = new Error(message); error.code = code; error.lastResult = lastResult; return error;
}

/** Cloudflare may publish the route/bindings shortly after an upload succeeds.
 * Only 404, 503 and network failures are retried, inside one bounded window;
 * every other status, including redirects, is terminal and never healthy. */
export async function waitForDeploymentHealth(url, {
  timeoutMs = 30_000,
  intervalMs = 2_000,
  attemptTimeoutMs = 5_000,
  headers,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const deadline = now() + timeoutMs;
  let lastResult = 'no response';
  while (now() < deadline) {
    let response;
    try {
      response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(Math.max(1, Math.min(attemptTimeoutMs, deadline - now()))), ...(headers ? { headers } : {}) });
    } catch {
      lastResult = 'network error';
    }
    if (response) {
      if (response.ok) return response;
      lastResult = `HTTP ${response.status}`;
      await response.body?.cancel().catch(() => {});
      if (response.status !== 404 && response.status !== 503) {
        throw healthError(`Deployment health check failed at ${url}: ${lastResult}.`, 'health-http-failed', lastResult);
      }
    }
    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(intervalMs, remaining));
  }
  throw healthError(`Deployment did not become healthy at ${url} within ${timeoutMs}ms; last result: ${lastResult}.`, lastResult === 'network error' ? 'health-transport-failed' : 'health-http-failed', lastResult);
}

/** One unauthenticated GET of a built file; anything but 200 means the browser gets no assets. */
async function servedAsset(origin, path, request, timeoutMs) {
  let response;
  try { response = await request(`${origin}/${path.split('/').map(encodeURIComponent).join('/')}`,{redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{'Cache-Control':'no-cache'}}); }
  catch { throw new Error('asset-transport-failed'); }
  await response.body?.cancel().catch(() => {});
  assert(response.status === 200 && !response.redirected,'asset-http-failed');
  return {path,status:response.status};
}

/** Authenticated provider readback, then the unauthenticated account-derived /health.
 * Without `readiness`, /health gets the single bounded window of waitForDeploymentHealth.
 * With `readiness` (deploy after an upload) it gets the recorded 90-second wait of health-request.mjs.
 * `asset`, a built file's path, is then requested once and must answer 200. */
export async function verifyHealth({api,plan,receipt,fetch:request=globalThis.fetch,timeoutMs=30000,intervalMs=2000,now,sleep,readiness,asset}) {
  assert(receipt?.version === 1 && receipt.accountId === api.accountId && receipt.worker === plan.worker,'receipt-target-mismatch');
  await verifyServiceGrants(api, plan);
  const current = await activeWorker(api,plan.worker);
  assert(current && current.versionId === receipt.provider.versionId && current.deploymentId === receipt.provider.deploymentId && current.etag === receipt.provider.etag,'active-deployment-mismatch');
  verifyScheduledHandler(current,plan);
  const origin = await workerOrigin(api,plan.worker,{workersDev:plan.workersDev !== false});
  assert(origin === receipt.origin,'health-origin-mismatch');
  const resources = await reconcileResources(api,plan,{create:false});
  assert(stable(resources) === stable(receipt.resources),'resource-identity-drift');
  verifyBindings(current.settings.bindings,bindingsFor(receipt.config,resources,plan));
  await reconcileTriggers(api,plan,resources,{mutate:false});
  const namespaces = await durableNamespaces(api,plan,{requireAll:true});
  assert(stable(namespaces) === stable(receipt.durableObjects),'durable-object-identity-drift');
  for (const item of plan.d1) await migrate(api,resources.d1.find(x => x.binding === item.binding).id,item.migrations,{apply:false});
  const secrets = await api.request(`/workers/scripts/${plan.worker}/secrets`);
  assert(Array.isArray(secrets) && plan.secrets.every(x => secrets.some(y => y.name === x.binding && y.type === 'secret_text')),'missing-deployed-secret');
  let health;
  // A Worker without a public route (reached only through service bindings) has no /health to request.
  if (plan.workersDev === false) health = {ok:true,versionId:current.versionId,route:'none'};
  else if (readiness) health = await waitHealth({origin,receipt,versionId:current.versionId,request,timeoutMs,...readiness});
  else {
    let response;
    try {
      response = await waitForDeploymentHealth(`${origin}/health`,{timeoutMs,intervalMs,attemptTimeoutMs:timeoutMs,headers:{'Cache-Control':'no-cache','Accept':'application/json'},fetchImpl:request,...(now ? {now} : {}),...(sleep ? {sleep} : {})});
    } catch (error) { throw new Error(error.code ?? 'health-transport-failed'); }
    assert(response.ok && response.status === 200 && !response.redirected,'health-http-failed');
    const body = await boundedJSON(response,65536);
    assert(body?.ok === true && body.deployment?.sourceSha === receipt.source.sha && body.deployment?.fingerprint === receipt.fingerprint && body.deployment?.versionId === current.versionId,'health-identity-mismatch');
    health = {ok:true,versionId:current.versionId};
  }
  if (asset && origin) health.asset = await servedAsset(origin,asset,request,timeoutMs);
  const after = await activeWorker(api,plan.worker);
  assert(after.versionId === current.versionId && after.deploymentId === current.deploymentId && after.etag === current.etag,'deployment-changed-during-health');
  await verifyServiceGrants(api, plan);
  return health;
}
