import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { privateDirectory } from '../base-onboarding/private-files.mjs';
import { assertCredentialFree } from '../../src/base/modules/deploy-kit/prepare.mjs';
import { buildEnvironment } from '../deployment/owner-settings.mjs';

export async function buildCommand(context) {
 const { root, store, signal } = context;
 // Vite reads dotenv even with a clean environment. Refuse rather than inspect
 // private file contents; the shared lifecycle already hides declared settings.
 if ((await readdir(root)).some(name => name === '.env' || name.startsWith('.env.'))) throw Error('owner-build-dotenv-forbidden');
 const directory = await privateDirectory(root, ['.rer', 'local']);
 const home = await mkdtemp(join(directory, 'build-home-'));
 store.ownCleanup(signal, () => rm(home, { recursive: true, force: true }));
 const env = { ...buildEnvironment(), HOME: home };
 assertCredentialFree(env);
 return ['pnpm', ['run', 'build:app'], { env }];
}
export const migrationCommand = persist => ['node', ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'uptime-local', '--local', '--persist-to', persist]];
