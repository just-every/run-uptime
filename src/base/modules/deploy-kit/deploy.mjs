import { verifyServiceGrants } from './service-grants.mjs';
import { assert, hash, validatePlan } from './validation.mjs';
import { validateArtifact, publicAssetPaths } from './artifact.mjs';
import { validateMigrations, migrate } from './migrations.mjs';
import { reconcileResources, reconcileTriggers, checkCronOwnership } from './resources.mjs';
import { activeWorker, secretBindings, uploadWorker, durableNamespaces, durableMigration, workerOrigin, verifyScheduledHandler } from './worker.mjs';
import { renderConfig, bindingsFor, verifyBindings } from './render.mjs';
import { verifyHealth } from './health.mjs';

/** Controller-owned plan, inert validated artifact bytes; no project imports or subprocesses.
 * `createResources` defaults to creating only without a prior receipt. Owner-account
 * mode creates owned resources itself first, then passes false. `uploadWithoutReceipt`
 * re-uploads an identical build when no receipt survived, instead of refusing the no-op. */
export async function deploy({api,plan,artifact,artifactSha256,previousReceipt,repeatOnly=false,createResources=!previousReceipt,uploadWithoutReceipt=false,onReceipt,onHealth,readiness={},env={},fetch=globalThis.fetch,healthOptions={}}) {
  validatePlan(plan); validateArtifact(artifact);
  await verifyServiceGrants(api, plan);
  for (const item of plan.d1) validateMigrations(item.migrations);
  const existing = await activeWorker(api,plan.worker);
  // An ordinary upgrade must not publish code or apply migrations before
  // detecting schedules outside this plan. Check again at trigger reconciliation.
  if (existing) await checkCronOwnership(api,plan);
  // Resolve missing secrets before resource writes. Existing opaque values are retained unchanged.
  const secrets = await secretBindings(api,plan.worker,plan,env,Boolean(existing));
  const resources = await reconcileResources(api,plan,{create:createResources});
  const baseConfig = renderConfig(plan,resources,api.accountId,artifact.source.sha,'',artifact.main,artifact.assets.length > 0);
  const fingerprint = hash({plan,config:baseConfig,source:artifact.source,modules:artifact.modules.map(({path,sha256}) => ({path,sha256})),assets:artifact.assets.map(({path,sha256}) => ({path,sha256}))});
  const config = renderConfig(plan,resources,api.accountId,artifact.source.sha,fingerprint,artifact.main,artifact.assets.length > 0);
  const bindings = bindingsFor(config,resources,plan);
  const namespaces = await durableNamespaces(api,plan);
  const migration = durableMigration(namespaces,existing);
  const priorFingerprint = existing?.settings.bindings.find(x => x.type === 'plain_text' && x.name === 'RER_DEPLOY_FINGERPRINT')?.text;
  const authenticated = previousReceipt?.fingerprint === fingerprint && previousReceipt.accountId === api.accountId && previousReceipt.worker === plan.worker && previousReceipt.provider?.versionId === existing?.versionId && previousReceipt.provider?.etag === existing?.etag && previousReceipt.provider?.deploymentId === existing?.deploymentId;
  const unchanged = priorFingerprint === fingerprint && secrets.missing.length === 0 && !migration && !(uploadWithoutReceipt && !authenticated);
  if (repeatOnly) assert(unchanged && previousReceipt?.fingerprint === fingerprint && previousReceipt?.provider?.versionId === existing?.versionId && previousReceipt?.provider?.etag === existing?.etag, 'repeat-deployment-drift');
  const migrations = [];
  for (const item of plan.d1) migrations.push({binding:item.binding,...await migrate(api,resources.d1.find(x => x.binding === item.binding).id,item.migrations,{apply:!unchanged})});
  if (unchanged) {
    assert(previousReceipt?.fingerprint === fingerprint && previousReceipt.accountId === api.accountId && previousReceipt.worker === plan.worker && previousReceipt.provider?.versionId === existing.versionId && previousReceipt.provider?.etag === existing.etag && previousReceipt.provider?.deploymentId === existing.deploymentId, 'no-op-requires-authenticated-prior-receipt');
    verifyBindings(existing.settings.bindings,bindings);
  }
  else await uploadWorker(api,{plan,artifact,bindings,secrets,migration,fingerprint});
  const published = unchanged ? existing : await activeWorker(api,plan.worker); assert(published,'missing-deployed-worker');
  verifyBindings(published.settings.bindings,bindings);
  verifyScheduledHandler(published,plan);
  // Finish routing activation before applying schedules to this deployment.
  const origin = await workerOrigin(api,plan.worker,{enable:!unchanged,workersDev:plan.workersDev !== false});
  await reconcileTriggers(api,plan,resources,{mutate:!unchanged,reapplyCrons:!unchanged});
  const active = await activeWorker(api,plan.worker); assert(active,'missing-deployed-worker');
  assert(active.versionId === published.versionId && active.deploymentId === published.deploymentId && active.etag === published.etag,'deployment-changed-during-triggers');
  verifyBindings(active.settings.bindings,bindings);
  verifyScheduledHandler(active,plan);
  const receipt = {version:1,accountId:api.accountId,worker:plan.worker,origin,source:artifact.source,run:artifact.run,artifactSha256,configSha256:hash(config),fingerprint,config,resources,
    durableObjects:await durableNamespaces(api,plan,{requireAll:true}),secrets:plan.secrets.map(x => x.binding),migrations,
    provider:{versionId:active.versionId,deploymentId:active.deploymentId,etag:active.etag},changed:!unchanged};
  if (onReceipt) await onReceipt(receipt);
  // One built file proves the Worker hands static assets to the browser (assets run behind it).
  const asset = publicAssetPaths(artifact.assets.map(x => x.path))[0];
  if (unchanged) await verifyHealth({...healthOptions,api,plan,receipt,fetch,asset});
  else await firstHealth({api,plan,receipt,fetch,healthOptions,readiness,onHealth,asset});
  return receipt;
}

/** After an upload the route may take a while to appear: wait for /health with a bound and
 * record every attempt in `receipt.health`. `onHealth(receipt)` runs after each attempt and at the end. */
async function firstHealth({api,plan,receipt,fetch,healthOptions,readiness,onHealth,asset}) {
  receipt.health = {ok:false,attempts:[]};
  const {now,sleep,...options} = healthOptions;
  const wait = {...(now ? {clock:now} : {}),...(sleep ? {sleep} : {}),...readiness,onAttempt:async (_attempt,attempts) => {
    receipt.health.attempts = [...attempts];
    if (onHealth) await onHealth(receipt);
  }};
  try { receipt.health = await verifyHealth({...options,api,plan,receipt,fetch,readiness:wait,asset}); }
  catch (error) {
    receipt.health.ok = false; receipt.health.errorClass = error.message;
    if (onHealth) await onHealth(receipt);
    error.receipt = receipt;
    throw error;
  }
  if (onHealth) await onHealth(receipt);
}
