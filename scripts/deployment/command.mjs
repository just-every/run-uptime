import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ownerPlan, ownerWorkerName } from '../../src/base/modules/deploy-kit/owner.mjs';
import { packageBuild } from '../../src/base/modules/deploy-kit/prepare.mjs';
import { main } from '../../src/base/modules/deploy-kit/owner-cli.mjs';
import { ownerSecrets, ownerEnvironment, validateAccount } from './owner-settings.mjs';
import { prepareOwnerBuild, ownerProduct } from './owner-prepare.mjs';
import { missing } from '../base-cli/cli/errors.mjs';
export function deployment(lifecycle) {
 return async ({ root, options, store, signal, operationToken }) => {
  const declaration = JSON.parse(await readFile(join(root, 'deploy.json'), 'utf8'));
  const environment = options.environment ?? 'production';
  await lifecycle.run(root, {}, store, () => {}, signal, { verb: 'build', operationToken, privateSettings: ['data/local-secrets.json'] });
  await prepareOwnerBuild(root);
  if (options.dryRun) {
   const worker = ownerWorkerName(declaration.project, environment);
   const artifact = await packageBuild({ root, source: { sha: '0'.repeat(40), tree: '0'.repeat(40) }, runIdentity: { id: '0', attempt: '1' }, productDirectory: ownerProduct });
   ownerPlan({ project: declaration.project, environment, worker, origin: `https://${worker}.example.invalid` }, declaration, artifact);
   store.report('deploy: dry run complete; no deployment occurred and no provider request was made.');
   return { dryRun: true, deployed: false };
  }
  let secrets;
  try {
   validateAccount(process.env, store);
   secrets = await ownerSecrets(root, { store });
  } catch (error) {
   if (error.message === 'missing-input') throw missing(`Required deployment configuration is missing: ${error.inputs.join(', ')}. See OPERATIONS.md.`);
   throw error;
  }
  const env = ownerEnvironment({ ...process.env, ...secrets });
  const args = ['--declaration', 'deploy.json', '--environment', environment, '--product', ownerProduct];
  const result = await main(['deploy', ...args], env, { cwd: root });
  await main(['health', ...args], env, { cwd: root });
  return { deployed: true, origin: result.origin };
 };
}
