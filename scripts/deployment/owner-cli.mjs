import {existsSync} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as deployKit, report } from '@runeditrun/rer/modules/deploy-kit/owner-cli';
import { validateAccount, ownerEnvironment } from './owner-settings.mjs';
import { ownerProduct } from './owner-prepare.mjs';

export async function main(argv = process.argv.slice(2), env = process.env, { root = process.cwd(), store } = {}) {
  const [command, ...forwarded] = argv;
  // pnpm can preserve its argument separator when forwarding script flags.
  const rest = forwarded[0] === '--' ? forwarded.slice(1) : forwarded;
  // `pnpm run health -- --environment NAME` checks a deployment made with `rer deploy --environment NAME`.
  const environment = rest.length === 2 && rest[0] === '--environment' ? rest[1] : rest.length ? null : 'production';
  if (command !== 'health' || !environment || !/^[a-z][a-z0-9-]{0,39}$/.test(environment)) throw new Error('owner-usage');
  validateAccount(env, store);
  // Read the artifact kept by deploy without replacing it while deploy is running.
  const declaration = existsSync(resolve(root,'.rer/deploy/declaration.json')) ? '.rer/deploy/declaration.json' : 'deploy.json';
  return deployKit([command, '--declaration', declaration, '--environment', environment, '--product', ownerProduct],
    ownerEnvironment(env), { cwd: root, signal: AbortSignal.timeout(15 * 60 * 1000) });
}

const retryAfterDeploy = new Set(['owner-state-locked', 'missing-owner-receipt']);
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await main())); }
  catch (error) {
    const failure = report(error);
    if (retryAfterDeploy.has(failure.code)) failure.message = 'Wait for rer deploy to finish successfully, then repeat this health command for the same environment.';
    else if (failure.code.startsWith('health-') && !failure.message) failure.message = 'If the deployment just finished, repeat this health command in a few seconds. If it still fails, inspect the Worker and D1 status in Cloudflare.';
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  }
}
