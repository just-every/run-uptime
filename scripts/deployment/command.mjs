import { saveOwnerDeclaration,selectMailDeclaration,withProviderKey } from './mail-config.mjs';
import { requiredConfiguration, validateConfiguration } from '../../src/domain/startup-config.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ownerPlan, ownerWorkerName } from '@runeditrun/rer/modules/deploy-kit/owner';
import { packageBuild } from '@runeditrun/rer/modules/deploy-kit/prepare';
import { main, report } from '@runeditrun/rer/modules/deploy-kit/owner-cli';
import { ownerSecrets, ownerEnvironment, validateAccount } from './owner-settings.mjs';
import { prepareOwnerBuild, ownerProduct } from './owner-prepare.mjs';
import { missing, RerError } from '@runeditrun/rer/errors';
import { ownerDeploy } from '@runeditrun/rer/deploy';
import { deployCommand } from '@runeditrun/rer/internal/cli/deploy-command.mjs';
import { migrateSecrets, savedInputs } from './secret-custody.mjs';
function upload(lifecycle) {
 const sharedDeploy = ownerDeploy('deploy.json', lifecycle);
 return async context => {
  const { root, options, store, signal, operationToken } = context;
  if (options.remove || options.setSecret || options.unsetSecret) return sharedDeploy(context);
  const environment = options.environment ?? 'production', processEnv = withProviderKey(process.env);
  // The Worker learns its environment so first-run setup names that environment's settings file.
  const source = JSON.parse(await readFile(join(root, 'deploy.json'), 'utf8'));
  const declaration = { ...source, vars: { ...source.vars, UPTIME_DEPLOY_ENVIRONMENT: environment } };
  const planningEnvironment = processEnv;
  const selectedDeclaration=selectMailDeclaration(declaration,planningEnvironment);
  const declared = new Set([declaration.originVar, ...selectedDeclaration.secrets.map(item => item.binding), ...declaration.d1.map(item => item.binding)]);
  for (const rule of requiredConfiguration({...planningEnvironment,UPTIME_LOCAL_REVIEW:'false'},'worker')) {
   if (!declared.has(rule.name)) throw missing(`Missing deployment configuration declaration: ${rule.name}`);
  }
  let secrets;
  if (!options.dryRun) {
   try {
    // Owner deployments always use hosted mail, irrespective of local shell flags.
    const hosted = { ...processEnv, UPTIME_LOCAL_REVIEW: 'false' };
    validateConfiguration(hosted, { scope: 'deploy', suppliedOnly: true });
    validateAccount(process.env, store);
    secrets = await ownerSecrets(root, environment, { env: processEnv, store });
    validateConfiguration({ ...hosted, ...secrets }, { scope: 'deploy' });
   } catch (error) {
    if (error.message.startsWith('Invalid')) throw missing(error.message);
    if (error.message === 'missing-input') throw missing(`Required deployment configuration is missing: ${error.inputs.join(', ')}. See OPERATIONS.md.`);
    throw error;
   }
  }
  await lifecycle.run(root, {}, store, () => {}, signal, { verb: 'build', operationToken, privateSettings: ['data/local-secrets.json'] });
  await prepareOwnerBuild(root);
  if (options.dryRun) {
   const worker = ownerWorkerName(declaration.project, environment);
   const artifact = await packageBuild({ root, source: { sha: '0'.repeat(40), tree: '0'.repeat(40) }, runIdentity: { id: '0', attempt: '1' }, productDirectory: ownerProduct });
   // Cloudflare assigns the origin during deployment. Validate the remaining
   // plan without inventing an origin, and name its pending variable explicitly.
   const { originVar, ...planningDeclaration } = selectedDeclaration;
   const validated = ownerPlan({ project: declaration.project, environment, worker }, planningDeclaration, artifact);
   const plan = { ...validated, d1: validated.d1.map(database => ({ ...database,
    migrations: database.migrations.map(({ sql, ...migration }) => migration),
   })) };
   const pendingVariables = originVar ? [originVar] : [];
   store.report(`deploy: resource plan (provider state not queried):\n${JSON.stringify({ environment, plan, pendingVariables }, null, 2)}`);
   if (originVar) store.report(`deploy: Cloudflare assigns the hosted origin and ${originVar} during deployment.`);
   store.report('deploy: dry run complete; no deployment occurred and no provider request was made.');
   return { dryRun: true, deployed: false, environment, plan, pendingVariables };
  }
  const env = ownerEnvironment({ ...processEnv, ...secrets });
  const selected=await saveOwnerDeclaration(root,declaration,env);
  const args = ['--declaration', selected, '--environment', environment, '--product', ownerProduct];
  // A kit failure keeps its sanitized code and the stage it stopped in; its saved state lets the same command resume.
  const kit = async (stage, command) => {
   try { return await main([command, ...args], env, { cwd: root }); }
   catch (error) { const failure = report(error); throw new RerError('owner_deploy_failed', `Owner deployment stopped during ${stage}: ${failure.code}${failure.resource ? ` (${failure.resource})` : ''}. Its saved state in .rer/deploy/${environment}.json is kept; run the same command again to resume.`, 1); }
  };
  const result = await kit('provisioning, migrations and upload', 'deploy');
  await kit('the health check', 'health');
  store.report(`deploy: ${result.origin} (Worker ${result.worker}, environment ${environment})`);
  // rer claims the owner with this token when it cannot read the kit record, and never prints it.
  return { deployed: true, origin: result.origin, worker: result.worker, environment, state: result.state, setupToken: secrets.SETUP_TOKEN };
 };
}

// rer normally plans generated values before calling a custom upload hook. This
// boundary hands old custody over first, then uses that same real rer workflow.
export function deployment(lifecycle) {
 const hook = upload(lifecycle), sharedDeploy = ownerDeploy('deploy.json', lifecycle);
 return Object.assign(async context => {
  if (context.options.rotateSecret) return sharedDeploy(context);
  const targets = await migrateSecrets(context.root, { store: context.store, dryRun: context.options.dryRun });
  const inputs = await savedInputs(context.root, context.options.environment ?? 'production', targets);
  context.store.addSecrets?.(Object.values(inputs));
  const previous = { ...process.env };
  try {
   Object.assign(process.env, inputs);
   return await deployCommand({ ...context, adapter: { ...context.adapter, deploy: hook } });
  } finally {
   for (const name of Object.keys(process.env)) if (!Object.hasOwn(previous, name)) delete process.env[name];
   Object.assign(process.env, previous);
  }
 }, { managesHostedOwner: true, declaration: 'deploy.json' });
}
