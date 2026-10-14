import { saveOwnerDeclaration,selectMailDeclaration } from './mail-config.mjs';
import { requiredConfiguration, validateConfiguration } from '../../src/domain/startup-config.mjs';
import { readPrivateFile } from '@runeditrun/rer/private-files';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ownerPlan, ownerWorkerName } from '@runeditrun/rer/modules/deploy-kit/owner';
import { packageBuild } from '@runeditrun/rer/modules/deploy-kit/prepare';
import { main, report } from '@runeditrun/rer/modules/deploy-kit/owner-cli';
import { secretsFile, ownerSecrets, ownerEnvironment, validateAccount } from './owner-settings.mjs';
import { prepareOwnerBuild, ownerProduct } from './owner-prepare.mjs';
import { missing, RerError } from '@runeditrun/rer/errors';
export function deployment(lifecycle) {
 return async ({ root, options, store, signal, operationToken }) => {
  const declaration = JSON.parse(await readFile(join(root, 'deploy.json'), 'utf8'));
  const environment = options.environment ?? 'production';
  // Dry runs inspect the deploy schema without accepting or requiring provider credentials.
  const selectedDeclaration=selectMailDeclaration(declaration,process.env);
  const declared = new Set([declaration.originVar, ...selectedDeclaration.secrets.map(item => item.binding), ...declaration.d1.map(item => item.binding)]);
  for (const rule of requiredConfiguration({...process.env,UPTIME_LOCAL_REVIEW:'false'},'worker')) {
   if (!declared.has(rule.name)) throw missing(`Missing deployment configuration declaration: ${rule.name}`);
  }
  let secrets;
  if (!options.dryRun) {
   try {
    // Owner deployments always use hosted mail, irrespective of local shell flags.
    const hosted = { ...process.env, UPTIME_LOCAL_REVIEW: 'false' };
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
    secrets = await ownerSecrets(root, { store });
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
   ownerPlan({ project: declaration.project, environment, worker, origin: `https://${worker}.example.invalid` }, selectMailDeclaration(declaration,process.env), artifact);
   store.report('deploy: dry run complete; no deployment occurred and no provider request was made.');
   return { dryRun: true, deployed: false };
  }
  const env = ownerEnvironment({ ...process.env, ...secrets });
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
  return { deployed: true, origin: result.origin, worker: result.worker, environment };
 };
}
