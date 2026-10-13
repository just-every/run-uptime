import { ingressBindings } from './container-config.mjs';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assert, hash, identifier, resourceName, validatePlan } from './validation.mjs';
import { regularBytes } from './artifact.mjs';
import { resourceKinds, findResource, checkCronOwnership } from './resources.mjs';
import { secretBindings, activeWorker, deployedFingerprint } from './worker.mjs';
import { validateMigrations } from './migrations.mjs';
import { deploy } from './deploy.mjs';
import { verifyHealth } from './health.mjs';

/* Owner-account mode: the owner's own Cloudflare account, token and account id.
 * Names are derived from the project id and the owner's environment. A local
 * state file records what this kit created; a same-named resource it did not
 * create is refused, never adopted. */

const segment = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const STATE_KIND = 'rer-deploy-owner-state';
const KINDS = ['d1','r2','kv','queues'];
const DECLARATION_KEYS = ['version','project','compatibilityDate','compatibilityFlags','d1','r2','kv','queues','durableObjects','secrets','crons','vars','originVar','services','workersDev','platforms','container'];
const ENTRY_KEYS = {d1:['binding'],r2:['binding','locationHint'],kv:['binding'],queues:['binding','consumer','deadLetterQueue'],durableObjects:['binding','className','storage'],secrets:['binding','environment'],services:['binding','project','entrypoint','allowedHosts','grant']};

function refuse(code, kind, name) { const error = new Error(code); error.resource = `${kind}:${name}`; return error; }

export function ownerWorkerName(project, environment) {
  assert(typeof project === 'string' && /^(?:[a-z0-9][a-z0-9-]*\/)?[a-z0-9-]+$/.test(project) && segment.test(project.split('/').at(-1)), 'invalid-owner-project');
  assert(typeof environment === 'string' && environment.length <= 32 && segment.test(environment), 'invalid-owner-environment');
  const worker = `${project.split('/').at(-1)}-${environment}`;
  assert(resourceName(worker), 'owner-name-too-long');
  return worker;
}
/** `JOBS_DEAD` on Worker `penny-production` is named `penny-production-jobs-dead`. */
export function ownerResourceName(worker, binding) {
  assert(identifier(binding), 'duplicate-or-invalid-binding');
  const slug = binding.toLowerCase().replaceAll('_','-');
  assert(segment.test(slug), 'invalid-owner-binding');
  assert(resourceName(`${worker}-${slug}`), 'owner-name-too-long');
  return `${worker}-${slug}`;
}
/* A 401 or 403 on a known path names the token permission that failed, never the request. */
const SCOPES = [[/^\/d1\//,'d1'],[/^\/r2\//,'r2'],[/^\/storage\/kv\//,'kv'],[/^\/queues(?:[/?]|$)/,'queues'],[/^\/workers\//,'workers']];
export function withScopeHints(api) {
  if (api.scopeHints) return api;
  const hint = (path, error) => {
    const scope = (error.status === 401 || error.status === 403) && SCOPES.find(([pattern]) => pattern.test(path));
    if (scope) error.message = `token-scope-missing-${scope[1]}`;
    throw error;
  };
  const guard = method => async (path, ...rest) => { try { return await api[method](path, ...rest); } catch (error) { return hint(path, error); } };
  return {...api, scopeHints:true, request:guard('request'), envelope:guard('envelope'), list:guard('list')};
}
/** Reads the account's workers.dev subdomain; no other provider request. */
export async function ownerTarget(provider, {project, environment}) {
  const api = withScopeHints(provider);
  const worker = ownerWorkerName(project, environment);
  let result;
  try { result = await api.request('/workers/subdomain'); }
  catch (error) { if (error.status === 404) throw new Error('workers-subdomain-missing'); throw error; }
  assert(typeof result?.subdomain === 'string' && result.subdomain, 'workers-subdomain-missing');
  assert(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(result.subdomain),'invalid-account-subdomain');
  return {accountId:api.accountId,project,environment,worker,origin:`https://${worker}.${result.subdomain}.workers.dev`};
}

function entries(declaration, key) {
  const list = declaration[key] ?? [];
  assert(Array.isArray(list) && list.every(item => item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).every(k => ENTRY_KEYS[key].includes(k))), 'invalid-owner-declaration');
  return list;
}
/* RER_DEV_KEY opens local dev identity; it and every key a seed adapter declares
 * local-only never become a deployed binding, secret or secret source. */
export const LOCAL_ONLY_KEYS = Object.freeze(['RER_DEV_KEY', 'RER_MODELS_KEY', 'RER_MODELS_SERVICE', '.rer/local/models.json']);
export function localOnlyBinding(declaration, localOnlyKeys = []) {
  const refused = new Set([...LOCAL_ONLY_KEYS, ...localOnlyKeys]);
  const names = [...Object.keys(declaration?.vars ?? {}), declaration?.originVar, ...(Array.isArray(declaration?.secrets) ? declaration.secrets.flatMap(item => [item?.binding, item?.environment]) : [])];
  return names.find(name => refused.has(name)) ?? null;
}
/** A seed declares bindings, never names. Migrations come from the packaged artifact. */
export function ownerPlan(target, declaration, artifact, { localOnlyKeys = [] } = {}) {
  assert(declaration?.version === 1 && typeof declaration === 'object' && Object.keys(declaration).every(key => DECLARATION_KEYS.includes(key)), 'invalid-owner-declaration');
  if (declaration.platforms !== undefined) assert(Array.isArray(declaration.platforms) && declaration.platforms.length > 0 && new Set(declaration.platforms).size === declaration.platforms.length && declaration.platforms.every(item => ['workers','container'].includes(item)), 'invalid-platforms');
  if (declaration.container !== undefined) {
    const config=declaration.container;
    assert(config&&typeof config==='object'&&!Array.isArray(config)&&Object.keys(config).every(key=>['engine','cacheContract','runner','hostVariables','ingress'].includes(key))&&['node','workerd'].includes(config.engine),'invalid-container');
    if(config.ingress!==undefined)ingressBindings(config.ingress);
    assert(config.hostVariables===undefined||Array.isArray(config.hostVariables)&&config.hostVariables.every(name=>/^[A-Z][A-Z0-9_]*$/.test(name)),'invalid-container-host-variables');
    assert(config.cacheContract===undefined||config.cacheContract==='lamp-retained-v1','invalid-container-cache');
    if(config.runner!==undefined){const runner=config.runner,relative=path=>typeof path==='string'&&!path.startsWith('/')&&path.split('/').every(part=>part&&!['.','..'].includes(part));assert(runner&&Object.keys(runner).every(key=>['entry','files'].includes(key))&&relative(runner.entry)&&Array.isArray(runner.files)&&runner.files.length>0&&runner.files.every(relative),'invalid-container-runner');}
  }
  const local = localOnlyBinding(declaration, localOnlyKeys);
  if (local) throw refuse('local-only-binding', 'binding', local);
  assert(declaration.project === undefined || declaration.project === target.project, 'owner-project-mismatch');
  const name = binding => ownerResourceName(target.worker, binding);
  const d1 = entries(declaration,'d1');
  assert(artifact.migrations.every(migration => d1.some(item => item.binding === migration.binding)), 'undeclared-migration-binding');
  const queues = entries(declaration,'queues');
  for (const item of queues) assert(item.deadLetterQueue === undefined || queues.some(other => other.binding === item.deadLetterQueue), 'invalid-dead-letter-queue');
  const vars = {...(declaration.vars ?? {})};
  if (declaration.originVar !== undefined) {
    assert(identifier(declaration.originVar) && !Object.hasOwn(vars,declaration.originVar), 'invalid-owner-origin-variable');
    vars[declaration.originVar] = target.origin;
  }
  const kv = entries(declaration,'kv').map(({binding}) => ({binding,name:name(binding)}));
  // A service binding names another project; its Worker name derives from the same environment.
  const services = entries(declaration,'services').map(({binding,project,entrypoint,allowedHosts,grant}) => ({binding,service:ownerWorkerName(project,target.environment),
    ...(grant === undefined ? {} : {grant}),...(entrypoint === undefined ? {} : {entrypoint}),...(allowedHosts === undefined ? {} : {props:{allowedHosts}})}));
  assert(declaration.workersDev === undefined || declaration.workersDev === false, 'invalid-owner-declaration');
  return validatePlan({version:1,worker:target.worker,compatibilityDate:declaration.compatibilityDate,compatibilityFlags:declaration.compatibilityFlags ?? [],
    d1:d1.map(({binding}) => ({binding,name:name(binding),migrations:artifact.migrations.filter(x => x.binding === binding).map(({binding:_,...rest}) => rest)})),
    r2:entries(declaration,'r2').map(item => ({...item,name:name(item.binding)})),
    ...(kv.length ? {kv} : {}),
    queues:queues.map(item => ({...item,name:name(item.binding),...(item.deadLetterQueue === undefined ? {} : {deadLetterQueue:name(item.deadLetterQueue)})})),
    durableObjects:entries(declaration,'durableObjects').map(item => ({...item})),
    secrets:entries(declaration,'secrets').map(item => ({...item})),
    crons:[...(declaration.crons ?? [])],vars,
    // Only declarations using these add the keys, so earlier plans and fingerprints are unchanged.
    ...(services.length ? {services} : {}),...(declaration.workersDev === false ? {workersDev:false} : {})});
}
function assertOwnerNames(target, plan) {
  assert(plan.worker === target.worker, 'owner-plan-name-mismatch');
  for (const kind of KINDS) for (const item of resourceKinds[kind].items(plan)) assert(item.name === ownerResourceName(target.worker,item.binding), 'owner-plan-name-mismatch');
}

function emptyState(target) {
  return {version:1,kind:STATE_KIND,accountId:target.accountId,project:target.project,environment:target.environment,worker:target.worker,
    owned:{worker:null,d1:{},r2:{},kv:{},queues:{}},receipt:null};
}
export async function readOwnerState(path, target) {
  let bytes;
  try { bytes = await regularBytes(path, 4 * 1024 * 1024); }
  catch (error) { if (error.code === 'ENOENT') return emptyState(target); throw error; }
  let state; try { state = JSON.parse(bytes); } catch { throw new Error('invalid-owner-state'); }
  assert(state?.version === 1 && state.kind === STATE_KIND && state.owned && typeof state.owned === 'object'
    && (state.owned.worker === null || ['pending','created'].includes(state.owned.worker?.status))
    && KINDS.every(kind => state.owned[kind] && typeof state.owned[kind] === 'object' && Object.values(state.owned[kind]).every(entry => ['pending','created'].includes(entry?.status))), 'invalid-owner-state');
  assert(state.pendingUpload === undefined || typeof state.pendingUpload?.fingerprint === 'string' && typeof state.pendingUpload?.build === 'string', 'invalid-owner-state');
  assert(state.accountId === target.accountId && state.project === target.project && state.environment === target.environment && state.worker === target.worker, 'owner-state-target-mismatch');
  return state;
}
async function writeOwnerState(path, state) {
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});
  await rename(temporary,path);
}
const resourceId = (kind, row) => ({d1:row.uuid,r2:row.creation_date,kv:row.id,queues:row.queue_id})[kind];

function checkResourceIdentity(kind, name, row, entry) {
  if (row) {
    if (!entry) throw refuse('resource-name-collision',kind,name);
    if (entry.status !== 'created') throw refuse('uncertain-resource-create',kind,name);
    // A state file from before bucket identities were recorded has no id to compare.
    if ((kind !== 'r2' || entry.id !== undefined) && entry.id !== resourceId(kind,row)) throw refuse('owned-resource-replaced',kind,name);
  } else if (entry?.status === 'created') throw refuse('owned-resource-missing',kind,name);
}

/** Read-only: every declared name is either created by this kit or absent. */
async function ownedResourcesToCreate(api, plan, state) {
  const create = [];
  for (const kind of KINDS) {
    const items = resourceKinds[kind].items(plan);
    if (!items.length) continue;
    const rows = await resourceKinds[kind].list(api);
    for (const item of items) {
      const row = findResource(rows,kind,item.name);
      const entry = state.owned[kind][item.name];
      checkResourceIdentity(kind,item.name,row,entry);
      if (!row) create.push({kind,item});
    }
  }
  return create;
}
/** Re-read every saved resource, including resources omitted from a later plan. */
async function checkSavedResourceIdentities(api, state) {
  for (const kind of KINDS) {
    const entries = Object.entries(state.owned[kind]);
    if (!entries.length) continue;
    const rows = await resourceKinds[kind].list(api);
    for (const [name,entry] of entries) checkResourceIdentity(kind,name,findResource(rows,kind,name),entry);
  }
}
/** Read-only: a bound service Worker must already exist in the account; deploy it first. */
async function checkServiceWorkers(api, plan) {
  for (const {service} of plan.services ?? []) if (await workerSettings(api, service) === null) throw refuse('service-worker-missing','service',service);
}
async function workerSettings(api, worker) {
  try { return await api.request(`/workers/scripts/${worker}/settings`); }
  catch (error) { if (error.status === 404) return null; throw error; }
}
/** The fingerprint an upload is about to write, read from its own metadata part. */
async function uploadFingerprint(body) {
  const metadata = JSON.parse(await body.get('metadata').text());
  const fingerprint = deployedFingerprint(metadata);
  assert(typeof fingerprint === 'string' && fingerprint, 'invalid-upload-metadata');
  return fingerprint;
}
const sameDeployment = (a, b) => a?.versionId === b?.versionId && a?.deploymentId === b?.deploymentId && a?.etag === b?.etag;

/** A completed receipt or the exact identity of an interrupted successful upload proves ownership.
 * Only the first upload, with no receipt, may recover a lost response by its pending build. */
async function checkWorkerIdentity(api, plan, artifact, state) {
  const live = await activeWorker(api, plan.worker);
  const pending = state.pendingUpload;
  const expected = pending?.provider ?? state.receipt?.provider;
  if (expected) {
    if (!sameDeployment(live, expected)) throw refuse('owned-resource-replaced','worker',plan.worker);
  } else {
    const mine = state.owned.worker?.status === 'pending' && pending?.build === hash({plan,artifact}) && pending.fingerprint === deployedFingerprint(live?.settings);
    if (!mine) throw refuse('uncertain-resource-create','worker',plan.worker);
  }
  return live;
}
async function checkOwnedWorker(api, plan, artifact, state) {
  const settings = await workerSettings(api, plan.worker);
  if (settings === null) {
    if (state.owned.worker?.status === 'created') throw refuse('owned-resource-missing','worker',plan.worker);
    return null;
  }
  if (!state.owned.worker) throw refuse('resource-name-collision','worker',plan.worker);
  return checkWorkerIdentity(api, plan, artifact, state);
}

/** One deploy at a time per state file: an exclusive lock file for the whole run. */
async function withStateLock(path, run) {
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const lock = `${path}.lock`;
  let handle;
  try { handle = await open(lock,'wx',0o600); }
  catch (error) { throw error.code === 'EEXIST' ? new Error('owner-state-locked') : error; }
  try {
    await handle.writeFile(`${process.pid}\n`);
    await handle.close();
    return await run();
  } finally { try { await handle.close(); } finally { await rm(lock,{force:true}); } }
}

/** Find or create every declared resource under the owner's account, migrate, upload and check health.
 * Ownership preflight precedes provider writes. A re-run of the same build writes nothing. */
export async function ownerDeploy({api: provider, target, plan, artifact, statePath, env = {}, fetch = globalThis.fetch, healthOptions = {}, readiness = {}}) {
  assert(typeof statePath === 'string' && statePath.length, 'missing-owner-state-path');
  const api = withScopeHints(provider);
  assert(target?.accountId === api.accountId, 'owner-account-mismatch');
  validatePlan(plan); assertOwnerNames(target, plan);
  for (const item of plan.d1) validateMigrations(item.migrations);
  return withStateLock(statePath, () => deployLocked({api, target, plan, artifact, statePath, env, fetch, healthOptions, readiness}));
}
async function deployLocked({api, target, plan, artifact, statePath, env, fetch, healthOptions, readiness}) {
  const state = await readOwnerState(statePath, target);
  const save = () => writeOwnerState(statePath, state);
  await checkServiceWorkers(api, plan);
  const priorWorker = await checkOwnedWorker(api, plan, artifact, state);
  const exists = priorWorker !== null;
  const create = await ownedResourcesToCreate(api, plan, state);
  if (exists) await checkCronOwnership(api, plan);
  await secretBindings(api, plan.worker, plan, env, exists);
  // Record intent before each create. A failed or lost response leaves it pending:
  // absent on resume means create again; present means an uncertain outcome to inspect.
  for (const {kind,item} of create) {
    state.owned[kind][item.name] = {status:'pending'}; await save();
    const row = await resourceKinds[kind].create(api,item);
    assert(findResource([row],kind,item.name) === row, 'invalid-created-resource');
    state.owned[kind][item.name] = {status:'created',...(resourceId(kind,row) === undefined ? {} : {id:resourceId(kind,row)})}; await save();
  }
  if (!exists && !state.owned.worker) { state.owned.worker = {status:'pending'}; await save(); }
  const upload = `/workers/scripts/${plan.worker}?bindings_inherit=strict`;
  const observed = {...api, async request(path, options) {
    const sending = path === upload && options?.method === 'PUT';
    if (sending) {
      await checkSavedResourceIdentities(api, state);
      const current = await checkOwnedWorker(api, plan, artifact, state);
      if (!sameDeployment(priorWorker,current)) throw refuse('owned-resource-replaced','worker',plan.worker);
      state.pendingUpload = {fingerprint:await uploadFingerprint(options.body),build:hash({plan,artifact})}; await save();
    }
    const result = await api.request(path, options);
    if (sending) {
      const active = await activeWorker(api, plan.worker);
      assert(active && deployedFingerprint(active.settings) === state.pendingUpload.fingerprint, 'uploaded-worker-drift');
      state.pendingUpload.provider = {versionId:active.versionId,deploymentId:active.deploymentId,etag:active.etag};
      state.owned.worker = {status:'created'}; await save();
    }
    return result;
  }};
  const receipt = await deploy({api:observed, plan, artifact, artifactSha256:hash(artifact), previousReceipt:state.receipt ?? undefined,
    createResources:false, uploadWithoutReceipt:true, env, fetch, healthOptions, readiness,
    onReceipt: async candidate => { if (candidate.changed || !state.receipt) { state.receipt = candidate; delete state.pendingUpload; await save(); } },
    // Keep each first-health attempt beside the identity it belongs to.
    onHealth: async candidate => { if (candidate.changed) { state.receipt = candidate; await save(); } }});
  return {receipt, created:create.map(({kind,item}) => `${kind}:${item.name}`)};
}

/** Independent read-only health of the last owner deployment recorded in the state file. */
export async function ownerHealth({api: provider, target, plan, statePath, fetch = globalThis.fetch, healthOptions = {}}) {
  const api = withScopeHints(provider);
  validatePlan(plan); assertOwnerNames(target, plan);
  const state = await readOwnerState(statePath, target);
  assert(state.receipt, 'missing-owner-receipt');
  return verifyHealth({...healthOptions, api, plan, receipt:state.receipt, fetch});
}
