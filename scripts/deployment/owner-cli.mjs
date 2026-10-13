import {existsSync} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { report } from '../../src/base/modules/deploy-kit/owner-cli.mjs';
import { validateAccount, ownerEnvironment } from './owner-settings.mjs';
import { prepareOwnerBuild, ownerProduct } from './owner-prepare.mjs';

export const kitCLI = 'src/base/modules/deploy-kit/owner-cli.mjs';
export const ownerArguments = (command,declaration='deploy.json',environment='production') => [command, '--declaration', declaration, '--environment', environment, '--product', ownerProduct];

export async function main(argv = process.argv.slice(2), env = process.env, { root = process.cwd(), run = execFileSync, store } = {}) {
  const [command, ...rest] = argv;
  // `pnpm run health -- --environment NAME` checks a deployment made with `rer deploy --environment NAME`.
  const environment = rest.length === 2 && rest[0] === '--environment' ? rest[1] : rest.length ? null : 'production';
  if (command !== 'health' || !environment || !/^[a-z][a-z0-9-]{0,39}$/.test(environment)) throw new Error('owner-usage');
  validateAccount(env, store);
  const options = { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 };
  // Package the already built product; health never runs a build.
  await prepareOwnerBuild(root);
  const output = run(process.execPath, [kitCLI, ...ownerArguments(command,existsSync(resolve(root,'.rer/deploy/declaration.json'))?'.rer/deploy/declaration.json':'deploy.json',environment)], { ...options, env: ownerEnvironment(env) });
  const result = JSON.parse(output);
  if (!result?.ok) throw new Error('owner-deploy-failed');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await main())); }
  catch (error) { console.error(JSON.stringify(report(error))); process.exitCode = 1; }
}
