import { extname } from 'node:path';
import { assert, hash, hexId, uuid } from './validation.mjs';
import { moduleType, assetType } from './artifact.mjs';
import { RUN_WORKER_FIRST } from './render.mjs';

export async function activeWorker(api, worker) {
  let settings;
  try { settings = await api.request(`/workers/scripts/${worker}/settings`); }
  catch (error) { if (error.status === 404) return null; throw error; }
  assert(Array.isArray(settings.bindings),'invalid-worker-settings');
  const result = await api.request(`/workers/scripts/${worker}/deployments`);
  assert(Array.isArray(result.deployments) && result.deployments.length > 0, 'invalid-deployments');
  const deployment = result.deployments[0];
  assert(uuid(deployment.id) && deployment.versions?.length === 1 && deployment.versions[0].percentage === 100 && uuid(deployment.versions[0].version_id), 'mixed-or-invalid-deployment');
  const versionId = deployment.versions[0].version_id;
  const version = await api.request(`/workers/scripts/${worker}/versions/${versionId}`);
  assert(version.id === versionId && typeof version.resources?.script?.etag === 'string' && version.resources.script.etag.length > 0, 'invalid-active-version');
  return {settings,versionId,deploymentId:deployment.id,etag:version.resources.script.etag,version};
}
/** Read authenticated runtime detection, never infer handlers from uploaded source text. */
export function verifyScheduledHandler(active, plan) {
  if (plan.crons.length) assert(Array.isArray(active?.version?.resources?.script?.handlers) && active.version.resources.script.handlers.includes('scheduled'), 'missing-scheduled-handler');
}
/** The build fingerprint a Worker's settings (or an upload's metadata) carry as a plain-text binding. */
export const deployedFingerprint = settings => settings?.bindings?.find(x => x.type === 'plain_text' && x.name === 'RER_DEPLOY_FINGERPRINT')?.text;
export async function durableNamespaces(api, plan, { requireAll = false } = {}) {
  if (!plan.durableObjects.length) return [];
  const rows = await api.list('/workers/durable_objects/namespaces');
  return plan.durableObjects.map(item => {
    const selected = rows.filter(x => x.script === plan.worker && x.class === item.className);
    assert(selected.length <= 1, 'ambiguous-durable-object');
    if (!selected.length) { assert(!requireAll,'missing-durable-object'); return {...item,id:null}; }
    const row = selected[0]; assert(hexId(row.id) && row.use_sqlite === (item.storage === 'sqlite'), 'incompatible-durable-object');
    return {...item,id:row.id};
  });
}
export function durableMigration(namespaces, current) {
  const missing = namespaces.filter(x => !x.id);
  if (!missing.length) return undefined;
  assert(missing.every(x => x.storage === 'sqlite'),'new-durable-objects-require-sqlite');
  const old = current?.settings.migration_tag ?? '';
  return {old_tag:old,new_tag:`rer-${hash({old,classes:missing.map(x => x.className)}).slice(0,24)}`,new_sqlite_classes:missing.map(x => x.className)};
}
export async function secretBindings(api, worker, plan, env, exists) {
  const present = exists ? await api.request(`/workers/scripts/${worker}/secrets`) : [];
  assert(Array.isArray(present) && present.every(x => typeof x.name === 'string' && x.type === 'secret_text'),'invalid-secret-list');
  const bindings = []; const names = present.map(x => x.name);
  for (const item of plan.secrets) {
    if (names.includes(item.binding)) bindings.push({type:'inherit',name:item.binding});
    else {
      assert(typeof env[item.environment] === 'string' && env[item.environment].trim(), `missing-secret-${item.environment}`);
      bindings.push({type:'secret_text',name:item.binding,text:env[item.environment]});
    }
  }
  return {bindings,names,missing:plan.secrets.filter(x => !names.includes(x.binding)).map(x => x.binding)};
}
export async function uploadAssets(api, worker, files) {
  const manifest = {}; const byHash = new Map();
  for (const file of files) {
    const digest = hash(file.base64 + extname(file.path).slice(1)).slice(0,32);
    manifest[`/${file.path}`] = {hash:digest,size:Buffer.from(file.base64,'base64').length};
    byHash.set(digest,file);
  }
  const session = await api.request(`/workers/scripts/${worker}/assets-upload-session`,{method:'POST',body:{manifest}});
  assert(typeof session.jwt === 'string' && session.jwt && Array.isArray(session.buckets),'invalid-asset-session');
  let completion = session.buckets.length ? null : session.jwt;
  const seen = new Set();
  for (const bucket of session.buckets) {
    assert(Array.isArray(bucket) && bucket.length,'invalid-asset-bucket');
    const data = new FormData();
    for (const key of bucket) {
      assert(byHash.has(key) && !seen.has(key),'invalid-asset-request'); seen.add(key);
      const file = byHash.get(key); data.set(key,new Blob([file.base64],{type:assetType(file.path)}),file.path.split('/').at(-1));
    }
    const uploaded = await api.request('/workers/assets/upload?base64=true',{method:'POST',body:data,assetToken:session.jwt});
    if (uploaded.jwt) completion = uploaded.jwt;
  }
  assert(typeof completion === 'string' && completion,'incomplete-asset-upload');
  return completion;
}
export async function uploadWorker(api, {plan,artifact,bindings,secrets,migration,fingerprint}) {
  const data = new FormData();
  const metadata = {main_module:artifact.main,compatibility_date:plan.compatibilityDate,compatibility_flags:plan.compatibilityFlags ?? [],bindings:[...bindings,...secrets.bindings],keep_bindings:['secret_text'],annotations:{'workers/message':`rer-deploy:${fingerprint}`}};
  if (migration) metadata.migrations = migration;
  if (artifact.assets.length) { metadata.assets = {jwt:await uploadAssets(api,plan.worker,artifact.assets),config:{run_worker_first:RUN_WORKER_FIRST}}; }
  data.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  for (const file of artifact.modules) data.set(file.path,new Blob([Buffer.from(file.base64,'base64')],{type:moduleType(file.path)}),file.path);
  await api.request(`/workers/scripts/${plan.worker}?bindings_inherit=strict`,{method:'PUT',body:data});
}
/** The workers.dev origin, enabling it when allowed. With `workersDev: false` the route is kept
 * off (a Worker reached only through service bindings) and there is no origin. */
export async function workerOrigin(api, worker, { enable = false, workersDev = true } = {}) {
  if (!workersDev) {
    const state = await api.request(`/workers/scripts/${worker}/subdomain`);
    assert(typeof state.enabled === 'boolean','invalid-worker-subdomain');
    if (state.enabled) { assert(enable,'worker-subdomain-enabled'); await api.request(`/workers/scripts/${worker}/subdomain`,{method:'POST',body:{enabled:false,previews_enabled:false}}); }
    return null;
  }
  const result = await api.request('/workers/subdomain');
  assert(typeof result.subdomain === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(result.subdomain),'invalid-account-subdomain');
  const state = await api.request(`/workers/scripts/${worker}/subdomain`);
  assert(typeof state.enabled === 'boolean','invalid-worker-subdomain');
  if (!state.enabled) { assert(enable,'worker-subdomain-disabled'); await api.request(`/workers/scripts/${worker}/subdomain`,{method:'POST',body:{enabled:true,previews_enabled:false}}); }
  return `https://${worker}.${result.subdomain}.workers.dev`;
}
