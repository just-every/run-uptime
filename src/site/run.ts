import type { RunData } from '../base/run-site';

/** Every string and command on the run site's Run page (/run). */
export const run: RunData = {
  name: 'Uptime',
  repository: 'https://github.com/just-every/run-uptime',
  clone: 'npx -y @runeditrun/rer dev just-every/run-uptime',
  folder: 'run-uptime',
  requirements: 'Runs on macOS, Linux or Windows with WSL2, with git. The installer brings Node when it is missing, and rer brings pnpm.',
  licence: 'MIT',
  docs: true,
  hosted: [],
};
