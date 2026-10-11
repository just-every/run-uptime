export const pins = Object.freeze({ node: '22.20.0', pnpm: '10.12.4' });
export const commonFlags = ['--help', '--cwd', '--non-interactive', '--json'];
const definitions = {
 install: [[], 'Frozen dependency installation; no setup or global tool changes.'],
 setup: [['--owner-email', '--owner-name', '--port', '--host', '--answers'], 'Build, migrate, prepare private settings and first owner; stop the temporary app.'],
 dev: [['--port', '--host', '--idle-timeout', '--stop', '--as', '--login'], 'Foreground development with assets, HMR and the declared scheduled triggers run locally on their schedule. With devIdentity it opens signed in as the owner (--as PERSONA picks another start, --login uses the outbox sign-in instead); otherwise ordinary owner sign-in through the outbox.'],
 preview: [['--port', '--host', '--idle-timeout', '--stop'], 'Foreground fixed production output; reuse intact build, preserve owner/state, idle timeout and explicit stop.'],
 build: [[], 'Production build with private local settings excluded and restored.'],
 verify: [[], 'Run the complete internal verification target.'],
 reset: [['--yes'], 'Confirmed removal of the declared local inventory only.'],
 deploy: [['--environment', '--dry-run'], 'Owner-account deployment and health; dry run performs local validation/build only.'],
 export: [['--target', '--output', '--origin', '--session-file'], 'Complete supported installation archive with integrity and exclusions.'],
 import: [['--target', '--input', '--origin', '--session-file', '--yes'], 'Confirmed atomic restore into an empty destination.'],
 outbox: [['--port', '--host', '--owner-email', '--open'], 'Credential-free local outbox URL; optional ordinary sign-in request and explicit browser opening.'],
 doctor: [[], 'Read-only installed tool, configuration and state diagnostics.'],
 describe: [[], 'Read-only description of actual command capabilities.'],
 check: [['--profile'], 'Read-only structural command contract and operations validation.'],
};
export const verbs = Object.fromEntries(Object.entries(definitions).map(([name, [flags, effects]]) => [name, { flags: [...commonFlags, ...flags, ...(['install','setup','dev','preview','build','verify','deploy','export','import'].includes(name)?['--no-queue']:[])], effects }]));
export const aliases = Object.fromEntries([...Object.keys(verbs).filter(v => v !== 'install'), 'release', 'deps', 'rer'].map(name => [name, name === 'deps' ? 'install' : name === 'rer' ? null : name]));
export const releaseFlags = ['--repo', '--project', '--repository', '--output', '--ref', '--dry-run', '--tag', '--clean-history', '--onto', '--env-file', '--no-queue'];
export const requiredHooks = ['preview', 'dependencies', 'build', 'migrate', 'start', 'health', 'owner', 'signIn', 'verify', 'deploy', 'portability', 'state', 'settings', 'input'];
