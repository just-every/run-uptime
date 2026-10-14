import { readLocalSettings, validateLocalConfiguration } from '../local-settings.mjs';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { priorOwnerEmails } from './prior-owner.mjs';
import { installationFailure } from '@runeditrun/rer/failures';
import { selectLocalState } from '@runeditrun/rer/local/state';
import { privateDirectory } from '@runeditrun/rer/private-files';
import { syntheticPortFor } from '../local-ports.mjs';
import { migrationCommand } from './commands.mjs';
export async function prepare({ root, input, store }) {
 await selectLocalState(root);
 let saved;
 if (await lstat(join(root, 'data/local-secrets.json')).catch(error => { if (error.code !== 'ENOENT') throw error; })) saved = await readLocalSettings(join(root, 'data/local-secrets.json'));
 validateLocalConfiguration({ ...input, UPTIME_LOCAL_REVIEW: 'true' }, { scope: 'settings', suppliedOnly: true });
 if (await lstat(join(root, 'data/control')).catch(error => { if (error.code !== 'ENOENT') throw error; })) {
  store.report('Legacy state remains at data/control. Stop the old runtime and follow OPERATIONS.md to recover it explicitly; no data was moved.');
  throw installationFailure('command_failed', { step: 'setup' });
 }
 const emails = await priorOwnerEmails(join(root, '.wrangler/state'));
 // Transfer preparation has no input; its configured owner comes from saved settings.
 const email = input?.OWNER_EMAIL ?? saved?.OWNER_EMAIL;
 if (emails.size > 1 && email === undefined) {
  store.report('More than one prior owner exists; configure OWNER_EMAIL with an active owner before setup.');
  throw installationFailure('command_failed', { step: 'setup' });
 }
 if (emails.size && typeof email === 'string' && !emails.has(email.toLowerCase())) {
  store.report('The saved owner differs from the requested owner. Reuse that owner or export and explicitly reset.');
  throw installationFailure('command_failed', { step: 'setup' });
 }
 await privateDirectory(root, ['.wrangler', 'state']);
}
export async function runtimeTarget(context, development) {
 const { root, origin, vars, store, signal, runtimePort, devKey, devLogin, demo } = context;
 const state = demo?.state ?? join(root, '.wrangler/state');
 const demoEnv = demo ? {RER_DEMO:'1',RER_DEMO_EXPIRES:demo.ends,RER_STATE_DIR:state,UPTIME_FLOW_DIR:join(state,'flows'),UPTIME_CREDENTIAL_DIR:join(state,'credentials'),UPTIME_DEMO_LOG:join(state,'blocked.jsonl')} : {};
 if(demo) { const {mkdir}=await import('node:fs/promises'); for(const folder of ['flows','credentials'])await mkdir(join(state,folder),{recursive:true,mode:0o700}); }
 validateLocalConfiguration({ ...vars, UPTIME_LOCAL_REVIEW: 'true', ...(devKey ? { RER_DEV_KEY: devKey } : {}) }, { scope: 'settings' });
 // Setup migrates before it starts the app. A dev or preview start on a copy that has since pulled a new migration does the
 // same before anything serves, so saved data never meets a Worker that expects a newer schema. Nothing pending is a no-op.
 if (!demo && ['dev', 'preview'].includes(context.verb)) { const [command, args] = migrationCommand(state); await context.run('Applying database migrations', command, args, { step: 'start' }); }
 // Managed dev and preview serve the origin through a proxy to an internal loopback port.
 const hostname = runtimePort ? '127.0.0.1' : new URL(origin).hostname.replace(/^\[|\]$/g, '');
 const port = String(runtimePort ?? new URL(origin).port);
 const runtime = { ...process.env, ...demoEnv, X_LOCAL_EXPLORER: 'false', UPTIME_LOCAL_ORIGIN: origin, UPTIME_LOCAL_HOST: hostname, UPTIME_LOCAL_PORT: port, UPTIME_LOCAL_PERSIST: state, UPTIME_LOCAL_SETTINGS: join(root, 'data/local-secrets.json') };
 const grantPath = join(state, 'synthetic-grant.json');
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
 // Only the control runtime receives the checkout's dev key (the synthetic target and the private runner never do).
 const env = { ...runtime, UPTIME_SYNTHETIC_PORT: String(grant.port), ...(development ? { RER_DEV_ORIGIN: origin } : {}), ...(devKey ? { RER_DEV_KEY: devKey, ...(development ? { RER_DEV_IDENTITY: devLogin ? 'off' : 'on' } : {}) } : {}) };
 return development
  ? ['pnpm', ['exec', 'vite', 'dev', '--host', hostname, '--port', port, '--strictPort'], { env, ready }]
  : [process.execPath, ['scripts/local/worker.mjs'], { env, ready }];
}
