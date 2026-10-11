import { verbs, releaseFlags } from './contract.mjs';

// Declarative seed boundary; all spawning, secret custody and readiness live in
// the existing onboarding kit. No adapter gets a second executor.
export function commandAdapter(lifecycle, options) {
 const result = { version: 1, ...lifecycle, ...options, state: '.wrangler/state', settings: options.settings ?? ['.dev.vars', '.dev.vars.previous'] };
 result.verbs = Object.fromEntries(Object.entries(verbs).filter(([verb]) => !['export', 'import'].includes(verb) || typeof result.portability?.[verb] === 'function').map(([verb, definition]) => [verb, { flags: [...definition.flags] }]));
 result.verbs.release = { flags: [...releaseFlags] };
 return result;
}
