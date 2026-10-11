import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// The only relocation boundary. The portable inventory mirrors Base's cli,
// modules and operations topology, while reusing the seed's one onboarding copy.
const portable = basename(dirname(fileURLToPath(new URL('../', import.meta.url)))) === 'scripts';
export const onboardingURL = new URL(portable ? '../../base-onboarding/' : '../onboarding/', import.meta.url);
export const shared = file => import(new URL(file, onboardingURL));
