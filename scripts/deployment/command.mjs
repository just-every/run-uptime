import { saveOwnerDeclaration,selectMailDeclaration,withProviderKey } from './mail-config.mjs';
import { requiredConfiguration, validateConfiguration } from '../../src/domain/startup-config.mjs';
import { readPrivateFile } from '@runeditrun/rer/private-files';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ownerPlan, ownerWorkerName } from '@runeditrun/rer/modules/deploy-kit/owner';
import { packageBuild } from '@runeditrun/rer/modules/deploy-kit/prepare';
import { main, report } from '@runeditrun/rer/modules/deploy-kit/owner-cli';
import { secretsFile, ownerSecrets, environmentSecrets, ownerEnvironment, validateAccount } from './owner-settings.mjs';
import { prepareOwnerBuild, ownerProduct } from './owner-prepare.mjs';
import { missing, RerError } from '@runeditrun/rer/errors';
import { ownerDeploy } from '@runeditrun/rer/deploy';
export function deployment(lifecycle) {
 const sharedDeploy = ownerDeploy('deploy.json', lifecycle);
 return async context => {
  const { root, options, store, signal, operationToken } = context;
  if (options.remove || options.setSecret || options.unsetSecret) return sharedDeploy(context);
  const environment = options.environment ?? 'production', processEnv = withProviderKey(process.env);
  // The Worker learns its environment so first-run setup names that environment's settings file.
  const source = JSON.parse(await readFile(join(root, 'deploy.json'), 'utf8'));
  const declaration = { ...source, vars: { ...source.vars, UPTIME_DEPLOY_ENVIRONMENT: environment } };
  // Saved mail/optional inputs win on real repeats, so plan those same bindings.
  // Dry runs never require provider credentials or generate new private settings.
  let planningEnvironment = processEnv;
  if (options.dryRun) {
   let contents;
   try { contents = await readPrivateFile(join(root, secretsFile)); }
   catch (error) { if (error.code !== 'ENOENT') throw error; }
   if (contents !== undefined) {
    let saved;
    try { saved = JSON.parse(contents); } catch { throw missing('Invalid configuration: deployment secret settings must contain valid JSON'); }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw missing('Invalid configuration: deployment secret settings must contain an object');
    planningEnvironment = { ...processEnv, ...saved };
   }
  }
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
    let saved;
    try {
     const contents = await readPrivateFile(join(root, secretsFile));
     try { saved = JSON.parse(contents); } catch { throw Error('Invalid configuration: deployment secret settings must contain valid JSON'); }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!saved) for (const rule of requiredConfiguration(hosted, 'deploy')) {
     if (!['SESSION_SECRET', 'SETUP_TOKEN', 'UPTIME_RUNNER_KEY'].includes(rule.name) && hosted[rule.name] === undefined) throw missing(`Required deployment configuration is missing: ${rule.name}. See OPERATIONS.md.`);
    }
    if (saved) validateConfiguration({ ...hosted, ...saved }, { scope: 'deploy' });
    validateAccount(process.env, store);
    secrets = await ownerSecrets(root, { env: processEnv, store });
    secrets = { ...secrets, ...await environmentSecrets(root, environment, secrets, { store }) };
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
