import {fileURLToPath} from 'node:url';
import { privateDirectory } from './private-files.mjs';
import { localInstaller } from './adapter.mjs';
import { selectLocalState, LocalStateSafetyError } from './local/state.mjs';
import {operatorPrerequisites} from './operator-prerequisites.mjs';
import { installOperator } from './operator-install.mjs';

export function operatorInstaller({ database, features, prepare }) {
 const lifecycle=localInstaller({
  features, node: '22.20.0',
  failure: (error,{store})=>error instanceof LocalStateSafetyError ? store.redact(error.message) : undefined,
  async prepare(context) { context.localState = await selectLocalState(context.root); await privateDirectory(context.root, ['.wrangler', 'state']); await prepare?.(context); },
  guard: async ({ root }) => { await selectLocalState(root); },
  secrets: {
   keepExisting: true, originKey: 'AUTH_ORIGIN',
   values: ({ origin }) => ({ AUTH_LOCAL: 'true', AUTH_ORIGIN: origin, MAIL_PROVIDER: 'development', MAIL_FROM: 'auth@localhost.test' }),
  },
  build: ['pnpm', ['run', 'build:app']],
  migrate: ['pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', database, '--local', '--persist-to', '.wrangler/state', '--config', 'dist/server/wrangler.json']],
  // Setup's temporary app is the fixed production runtime preview uses: it has
  // no trigger handlers or Local Explorer for a person or proxy to reach.
  start: previewTarget,
  owner: { existingOwnerViaSignIn: true, displayName: input => input.displayName || 'Owner' },
  signIn: { emailKey: 'OWNER_EMAIL', returnTo: '/setup' },
 });
 return {...lifecycle,localPrerequisites:async({root,vars,email})=>vars.AUTH_LOCAL==='true'&&vars.MAIL_PROVIDER==='development'&&Boolean(vars.SESSION_SECRET)&&await operatorPrerequisites(root,email),install:(root,input,store,onApp,signal)=>installOperator(root,input,store,onApp,signal,lifecycle.hooks)};
}

// Only local runtimes receive the dev key; vite.config.ts passes it to `vite dev` alone.
// No runtime rer starts serves the Local Explorer: it reads and writes the store
// without the key. trafficProxy also refuses /cdn-cgi/* on the public listener.
const devBindings = (devKey, devLogin) => devKey ? { RER_DEV_KEY: devKey, RER_DEV_IDENTITY: devLogin ? 'off' : 'on' } : {};
const hostname = origin => new URL(origin).hostname.replace(/^\[|\]$/g, '');
export const developmentTarget = ({ origin, runtimePort, devKey, devLogin }) => ['pnpm', ['exec', 'vite', 'dev', '--host', runtimePort ? '127.0.0.1' : hostname(origin), '--port', String(runtimePort ?? new URL(origin).port), '--strictPort'], { env: { ...process.env, RER_DEV_ORIGIN: origin, WRANGLER_SEND_METRICS: 'false', X_LOCAL_EXPLORER: 'false', ...devBindings(devKey, devLogin) } }];

// Behind rer's proxy (dev, preview) on the internal port; for setup's temporary app, on the origin itself.
export const previewTarget = ({ origin, runtimePort, devKey }) => [process.execPath, [fileURLToPath(new URL('./production-runtime.mjs', import.meta.url))], { env: { ...process.env, RER_DEV_ORIGIN: origin, RER_RUNTIME_HOST: runtimePort ? '127.0.0.1' : hostname(origin), RER_RUNTIME_PORT: String(runtimePort ?? new URL(origin).port), WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false', X_LOCAL_EXPLORER: 'false', ...(devKey ? { RER_DEV_KEY: devKey } : {}) } }];
