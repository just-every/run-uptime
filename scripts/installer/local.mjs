import { localInstaller } from '../base-onboarding/adapter.mjs';
import { commandAdapter as createCommandAdapter } from '../base-cli/cli/adapter.mjs';
import { deployment } from '../deployment/command.mjs';
import { settingsDefinition } from '../local-settings.mjs';
import { features } from './ui/seed.mjs';
import { prepare, runtimeTarget } from '../local/targets.mjs';
import { portability } from '../local/portability.mjs';
import { buildCommand, migrationCommand } from '../local/commands.mjs';
export const lifecycle = localInstaller({
 features, node: '22.20.0', tools: ['pnpm', 'node'], prepare,
 secrets: settingsDefinition(), build: buildCommand, migrate: migrationCommand('.wrangler/state'),
 start: context => runtimeTarget(context, false),
 owner: { existingOwnerViaSignIn: true, displayName: input => input.displayName, returnTo: '/setup' },
 signIn: { emailKey: 'OWNER_EMAIL', returnTo: '/setup' },
});
export const commandAdapter = createCommandAdapter(lifecycle, {
 dev: context => runtimeTarget(context, true), preview: context => runtimeTarget(context, false), verify: ['pnpm', ['run', 'verify:app']],
 deploy: deployment(lifecycle), portability,
 settings: ['data/local-secrets.json'], setup: { manifestFile: 'rer-setup.json' },
 browserModule: 'scripts/installer/ui/seed.mjs', product: 'Uptime',
 input: { names: { email: 'OWNER_EMAIL', name: 'displayName' } },
});
