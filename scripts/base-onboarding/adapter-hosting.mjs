import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { labels } from './adapter-labels.mjs';

// The optional hosting hook: deploy to the owner's own Cloudflare account with
// Base deploy-kit owner-account mode (modules/deploy-kit/owner-cli.mjs, copied
// by the seed), then check the deployed /health. It runs only when the owner
// chose the remote target in the shared hosting group, with the account id and
// API token from that group; `secrets(context)` adds the first-deploy secrets
// the declaration names. The token and those secrets reach only the deploy
// command's environment and are registered for redaction first.
export function ownerAccountHosting({ cli, declaration = 'deploy.json', environment = 'production', product, state, secrets, when = input => input.target === 'remote' } = {}) {
 if (typeof cli !== 'string' || !cli) throw new TypeError('Name the seed\'s copy of deploy-kit owner-cli.mjs.');
 return async context => {
  const { input, store, root } = context;
  if (!when(input)) { await store.step('Hosting was not requested; the application runs on this computer'); return; }
  const { accountId, apiToken } = input;
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || typeof apiToken !== 'string' || !apiToken || /[\r\n]/.test(apiToken)) {
   store.report?.(`${labels.hosting}: choose a Cloudflare account and supply its API token.`);
   throw context.fail('deploy');
  }
  const extra = typeof secrets === 'function' ? await secrets(context) : secrets ?? {};
  store.addSecrets?.([apiToken, ...Object.values(extra).filter(value => typeof value === 'string')]);
  const env = { ...process.env, ...extra, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken };
  const args = ['--declaration', declaration, '--environment', environment, ...(product ? ['--product', product] : []), ...(state ? ['--state', state] : [])];
  await context.run(labels.hosting, process.execPath, [cli, 'deploy', ...args], { step: 'deploy', env });
  await context.run('Checking the deployed application', process.execPath, [cli, 'health', ...args], { step: 'deploy', env });
  let receipt;
  try { receipt = JSON.parse(await readFile(resolve(root, state ?? join('.rer', 'deploy', `${environment}.json`)), 'utf8')).receipt; } catch {}
  const origin = typeof receipt?.origin === 'string' && /^https:\/\/[^\s/]+$/.test(receipt.origin) ? receipt.origin : undefined;
  if (origin) context.hostedUrl = origin;
  await store.step(origin ? `Deployed to ${origin}` : 'Deployed to your Cloudflare account');
 };
}

