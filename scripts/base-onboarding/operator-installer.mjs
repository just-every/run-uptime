import { join } from 'node:path';
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
  start: ({ root, origin }) => ['pnpm', ['exec', 'wrangler', 'dev', '--inspector-port', '0', '--config', 'dist/server/wrangler.json', '--env-file', join(root, '.dev.vars'), '--local', '--persist-to', '.wrangler/state', '--ip', new URL(origin).hostname.replace(/^\[|\]$/g, ''), '--port', new URL(origin).port, '--show-interactive-dev-session=false'], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' } }],
  owner: { existingOwnerViaSignIn: true, displayName: input => input.displayName || 'Owner' },
  signIn: { emailKey: 'OWNER_EMAIL', returnTo: '/setup' },
 });
 return {...lifecycle,localPrerequisites:async({root,vars,email})=>vars.AUTH_LOCAL==='true'&&vars.MAIL_PROVIDER==='development'&&Boolean(vars.SESSION_SECRET)&&await operatorPrerequisites(root,email),install:(root,input,store,onApp,signal)=>installOperator(root,input,store,onApp,signal,lifecycle.hooks)};
}

export const developmentTarget = ({ origin, runtimePort }) => ['pnpm', ['exec', 'vite', 'dev', '--host', runtimePort ? '127.0.0.1' : new URL(origin).hostname.replace(/^\[|\]$/g, ''), '--port', String(runtimePort ?? new URL(origin).port), '--strictPort'], { env: { ...process.env, RER_DEV_ORIGIN: origin, WRANGLER_SEND_METRICS: 'false' } }];

export const previewTarget = ({ origin, runtimePort }) => [process.execPath, [fileURLToPath(new URL('./production-runtime.mjs', import.meta.url))], { env: { ...process.env, RER_DEV_ORIGIN: origin, RER_RUNTIME_PORT: String(runtimePort), WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' } }];
