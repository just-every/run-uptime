import { runPricing } from '../base/run-pricing';
import type { RunData } from '../base/run-site';

/** Every string and command on the run site's Run page (/run). */
export const run: RunData = {
  name: 'Uptime',
  repository: 'https://github.com/just-every/run-uptime',
  clone: 'npx -y @runeditrun/rer dev just-every/run-uptime',
  licence: 'MIT',
  docs: true,
  paths: { product: null },
  pricing: runPricing,
};
