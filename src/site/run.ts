import { runPricing } from '../base/run-pricing';
import type { RunData } from '../base/run-site';

export const ownerSignInGuide = 'For local setup, rer dev prints the private first-owner sign-in link on its own RER_OPEN line. After hosted setup with mail off, rer signin prints the one-time HTTPS owner sign-in link on its own line. Pass the hosted link to the business harness as sign_in in Uptime’s tools[i] entry in session.report. Never share either link in chat or save it to a file.';

/** Every string and command on the run site's Run page (/run). */
export const run: RunData = {
  name: 'Uptime',
  repository: 'https://github.com/just-every/run-uptime',
  clone: 'npx -y @runeditrun/rer dev just-every/run-uptime',
  licence: 'MIT',
  docs: true,
  paths: {
    product: null,
    requirementsExtra: 'The default local address is 127.0.0.1. For passkeys, use the localhost command in the getting-started guide. ' + ownerSignInGuide,
  },
  pricing: runPricing,
};
