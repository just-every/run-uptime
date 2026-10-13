import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : stable(value)).digest('hex');
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function assert(value, code) { if (!value) throw new Error(code); }
export const identifier = value => typeof value === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
export const resourceName = value => typeof value === 'string' && /^[a-z][a-z0-9-]{2,62}$/.test(value);
export const uuid = value => typeof value === 'string' && /^(?!00000000-0000-0000-0000-000000000000)[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
export const hexId = value => typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value) && !/^0+$/.test(value);
export function localPath(value) { assert(typeof value === 'string' && value.length && !value.startsWith('/') && !value.includes('\\') && value.split('/').every(x => x && x !== '.' && x !== '..') && !/[\x00-\x1f]/.test(value), 'invalid-local-path'); return value; }
/** Declared KV namespaces; absent means none. */
export const kvOf = plan => plan.kv ?? [];
export function validatePlan(plan) {
  assert(plan?.version === 1 && resourceName(plan.worker) && /^\d{4}-\d{2}-\d{2}$/.test(plan.compatibilityDate), 'invalid-plan');
  for (const key of ['d1','r2','queues','durableObjects','secrets','crons']) assert(Array.isArray(plan[key]), 'invalid-plan-resources');
  // KV is optional so plans written before KV support keep their exact shape.
  assert(plan.kv === undefined || Array.isArray(plan.kv), 'invalid-plan-resources');
  const kv = kvOf(plan);
  const bindings = new Set(['RER_DEPLOY_SOURCE','RER_DEPLOY_FINGERPRINT','RER_VERSION']);
  // Service bindings and the workers.dev opt-out are optional so earlier plans keep their exact shape.
  assert(plan.services === undefined || Array.isArray(plan.services) && plan.services.length, 'invalid-plan-resources');
  assert(plan.workersDev === undefined || plan.workersDev === false, 'invalid-plan');
  for (const entry of [...plan.d1,...plan.r2,...kv,...plan.queues,...plan.durableObjects,...plan.secrets,...(plan.services ?? [])]) {
    assert(identifier(entry.binding) && !bindings.has(entry.binding), 'duplicate-or-invalid-binding'); bindings.add(entry.binding);
  }
  for (const entry of [...plan.d1,...plan.r2,...kv,...plan.queues]) assert(resourceName(entry.name), 'invalid-resource-name');
  for (const list of [plan.d1,plan.r2,kv,plan.queues]) assert(new Set(list.map(x => x.name)).size === list.length, 'duplicate-resource-name');
  for (const entry of plan.d1) assert(Array.isArray(entry.migrations), 'invalid-migrations');
  for (const entry of plan.durableObjects) assert(identifier(entry.className) && ['sqlite','classic'].includes(entry.storage), 'invalid-durable-object');
  for (const secret of plan.secrets) assert(identifier(secret.environment), 'invalid-secret-environment');
  for (const item of plan.services ?? []) assert(Object.keys(item).every(k => ['binding','service','entrypoint','props','grant'].includes(k)) && resourceName(item.service) && item.service !== plan.worker
    && (item.entrypoint === undefined || identifier(item.entrypoint))
    && (item.props === undefined || Object.keys(item.props).join() === 'allowedHosts' && Array.isArray(item.props.allowedHosts)
      && item.props.allowedHosts.every(host => typeof host === 'string' && /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host))), 'invalid-service-binding');
  for (const item of plan.services ?? []) if (item.grant !== undefined) {
    const grant = item.grant;
    assert(item.entrypoint && !item.props && grant && Object.keys(grant).sort().join() === 'allowedHosts,fingerprint,provider,sourceSha'
      && /^[a-f0-9]{40}$/.test(grant.sourceSha) && /^[a-f0-9]{64}$/.test(grant.fingerprint)
      && grant.provider && Object.keys(grant.provider).sort().join() === 'deploymentId,etag,versionId'
      && uuid(grant.provider.versionId) && uuid(grant.provider.deploymentId) && typeof grant.provider.etag === 'string' && grant.provider.etag.length > 0
      && (grant.allowedHosts === null || Array.isArray(grant.allowedHosts) && new Set(grant.allowedHosts).size === grant.allowedHosts.length
        && grant.allowedHosts.every(host => typeof host === 'string' && /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host))), 'invalid-service-grant');
  }
  for (const cron of plan.crons) assert(typeof cron === 'string' && /^[\d*/,-]+(?: [\d*/,-]+){4}$/.test(cron), 'invalid-cron');
  assert(new Set(plan.crons).size === plan.crons.length, 'duplicate-cron');
  for (const [key,value] of Object.entries(plan.vars ?? {})) assert(identifier(key) && !bindings.has(key) && typeof value === 'string', 'invalid-public-variable');
  for (const queue of plan.queues) {
    if (queue.deadLetterQueue !== undefined) assert(queue.consumer && resourceName(queue.deadLetterQueue) && queue.deadLetterQueue !== queue.name && plan.queues.some(x => x.name === queue.deadLetterQueue && !x.consumer), 'invalid-dead-letter-queue');
    if (queue.consumer) {
    assert(Object.keys(queue.consumer).every(k => ['batch_size','max_retries','max_wait_time_ms','max_concurrency','retry_delay'].includes(k)), 'invalid-consumer-setting');
    assert(Object.values(queue.consumer).every(x => Number.isSafeInteger(x) && x >= 0), 'invalid-consumer-setting');
  }
  }
  return plan;
}
