import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { priorOwnerEmail } from './prior-owner.mjs';
import { installationFailure } from '../base-onboarding/failures.mjs';
import { selectLocalState } from '../base-onboarding/local/state.mjs';
import { privateDirectory } from '../base-onboarding/private-files.mjs';
import { syntheticPortFor } from '../local-ports.mjs';
export async function prepare({ root, input, store }) {
 await selectLocalState(root);
 if (await lstat(join(root, 'data/control')).catch(error => { if (error.code !== 'ENOENT') throw error; })) {
  store.report('Legacy state remains at data/control. Stop the old runtime and follow OPERATIONS.md to recover it explicitly; no data was moved.');
  throw installationFailure('command_failed', { step: 'setup' });
 }
 const email = await priorOwnerEmail(join(root, '.wrangler/state'));
 if (email && input.OWNER_EMAIL.toLowerCase() !== email) {
  store.report('The saved owner differs from the requested owner. Reuse that owner or export and explicitly reset.');
  throw installationFailure('command_failed', { step: 'setup' });
 }
 await privateDirectory(root, ['.wrangler', 'state']);
}
export async function runtimeTarget(context, development) {
 const { root, origin, vars, store, signal, runtimePort } = context;
 // Managed dev and preview serve the origin through a proxy to an internal loopback port.
 const hostname = runtimePort ? '127.0.0.1' : new URL(origin).hostname.replace(/^\[|\]$/g, '');
 const port = String(runtimePort ?? new URL(origin).port);
 const runtime = { ...process.env, UPTIME_LOCAL_ORIGIN: origin, UPTIME_LOCAL_HOST: hostname, UPTIME_LOCAL_PORT: port, UPTIME_LOCAL_PERSIST: join(root, '.wrangler/state'), UPTIME_LOCAL_SETTINGS: join(root, 'data/local-secrets.json') };
 const grantPath = join(root, '.wrangler/state/synthetic-grant.json');
 // Synthetic monitors name the synthetic port, so a relaunch keeps the port its grant records.
 const syntheticPort = await syntheticPortFor(process.env.UPTIME_SYNTHETIC_PORT, grantPath);
 // Product processes share the kit's capture, cancellation and cleanup.
 const synthetic = store.spawn('Starting the synthetic target', process.execPath, ['runners/src/synthetic.mjs'], { cwd: root, signal, env: { ...runtime, UPTIME_SYNTHETIC_PORT: String(syntheticPort), UPTIME_GRANT_FILE: grantPath } });
 let grant;
 await store.waitForReady('Waiting for the synthetic target', synthetic, async () => {
  try { grant = JSON.parse(await readFile(grantPath, 'utf8')); return grant.pid === synthetic.pid && grant.expiresAt > Date.now(); } catch { return false; }
 }, { signal });

 let runner;
 const ready = async (url, healthSignal) => {
  const response = await fetch(url, { signal: healthSignal });
  if (!response.ok || (await response.json()).status !== 'ok') return false;
  if (!runner) runner = store.spawn('Starting the private runner', process.execPath, ['runners/src/private-runner.mjs'], { cwd: root, signal, env: { ...runtime, UPTIME_CONTROL_ORIGIN: origin, UPTIME_LOCAL_REVIEW: 'true', UPTIME_RUNNER_KEY: vars.UPTIME_RUNNER_KEY, UPTIME_GRANT_FILE: grantPath } });
  return runner.exitCode === null;
 };
 const env = { ...runtime, UPTIME_SYNTHETIC_PORT: String(grant.port), ...(development ? { RER_DEV_ORIGIN: origin } : {}) };
 return development
  ? ['pnpm', ['exec', 'vite', 'dev', '--host', hostname, '--port', port, '--strictPort'], { env, ready }]
  : [process.execPath, ['scripts/local/worker.mjs'], { env, ready }];
}
