import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { contained } from './project.mjs';
import { missing, invalid } from './errors.mjs';
import { ownerPlan, ownerWorkerName } from '../modules/deploy-kit/owner.mjs';
import { packageBuild } from '../modules/deploy-kit/prepare.mjs';

export function ownerDeploy(declarationPath, lifecycle) {
 return async ({ root, options, store, signal, operationToken }) => {
  const path = await contained(root, declarationPath);
  let declaration; try { declaration = JSON.parse(await readFile(path, 'utf8')); } catch { throw invalid('Malformed owner-account deploy declaration.'); }
  const environment = options.environment ?? 'production';
  await lifecycle.run(root, {}, store, () => {}, signal, { verb: 'build', operationToken });
  if (options.dryRun) {
   // Locally validate the real declaration/artifact without ownerTarget's
   // account lookup. This synthetic target is validation data, not a provider.
   const worker = ownerWorkerName(declaration.project, environment);
   const artifact = await packageBuild({ root, source: { sha: '0'.repeat(40), tree: '0'.repeat(40) }, runIdentity: { id: '0', attempt: '1' }, productDirectory: '' });
   ownerPlan({ project: declaration.project, environment, worker, origin: `https://${worker}.example.invalid` }, declaration, artifact);
   store.report('deploy: dry run complete; no deployment occurred and no provider request was made.');
   return { dryRun: true, deployed: false };
  }
  const names = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
  if (names.some(name => !process.env[name]?.trim())) throw missing('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required. See the deploy-kit owner-account instructions.');
  const { main } = await import('../modules/deploy-kit/owner-cli.mjs');
  const argv = ['deploy', '--declaration', declarationPath, '--environment', environment];
  const result = await main(argv, process.env, { cwd: root });
  await main(['health', ...argv.slice(1)], process.env, { cwd: root });
  return { deployed: true, origin: result.origin };
 };
}
