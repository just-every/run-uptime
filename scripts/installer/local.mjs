import {demoEnvironment,runtimeEnvironment} from '../local/demo-state.mjs';
import { localInstaller } from '@runeditrun/rer/local-installer';
import { commandAdapter as createCommandAdapter } from '@runeditrun/rer/adapter';
import { deployment } from '../deployment/command.mjs';
import { settingsDefinition } from '../local-settings.mjs';
import { features } from './ui/seed.mjs';
import { prepare, runtimeTarget } from '../local/targets.mjs';
import { portability } from '../local/portability.mjs';
import { buildCommand, migrationCommand } from '../local/commands.mjs';
export const lifecycle = localInstaller({
 features, node: '22.20.0', tools: ['pnpm', 'node'], prepare,
 secrets: settingsDefinition(), build: buildCommand, migrate: async ({demo}) => {const [command,args]=migrationCommand(demo?.state ?? '.wrangler/state', !demo);return [command,args,{env:{...runtimeEnvironment(),...await demoEnvironment(demo)}}]},
 start: context => runtimeTarget(context, false),
 owner: { existingOwnerViaSignIn: true, displayName: input => input.displayName ?? 'Owner', returnTo: '/setup' },
 signIn: { emailKey: 'OWNER_EMAIL', returnTo: '/setup' },
});
export const commandAdapter = createCommandAdapter(lifecycle, {
 dev: context => runtimeTarget(context, true), preview: context => runtimeTarget(context, false), verify: ['pnpm', ['run', 'verify:app']],
 deploy: deployment(lifecycle), portability,
 settings: ['data/local-secrets.json'], setup: { manifestFile: 'rer-setup.json' },
 // Local dev identity: the local-only Worker entry, the build output rer build scans for the dev layer, and the kept end-to-end email-link test.
 devIdentity: { entry: 'src/server.dev.ts', output: ['dist'], emailLinkTest: 'tests/command-journey.mjs' }, localOnlyKeys: ['RER_DEV_ORIGIN', 'RER_DEV_IDENTITY'],
 browserModule: 'scripts/installer/ui/seed.mjs', product: 'Uptime',
 // The run site (run-uptime.com): rer build --site renders the approved homepage, /run and the docs into dist/site.
 // The hydration check's pages: the Lobby is plain HTML, so name the docs React hydrates.
 publicPages: ['/', '/docs', '/docs/install'],
 site: { entry: 'src/site/pages.tsx', output: 'dist/site', declaration: 'deploy-site.json', config: 'vite.site.config.ts' },
 input: { names: { email: 'OWNER_EMAIL', name: 'displayName' } },
});
