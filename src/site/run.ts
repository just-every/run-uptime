import type { RunData } from '../base/run-site';

/** Every string and command on the run site's Run page (/run). */
export const run: RunData = {
  name: 'Uptime',
  repository: 'https://github.com/just-every/run-uptime',
  clone: 'git clone https://github.com/just-every/run-uptime.git uptime',
  folder: 'uptime',
  requirements: 'Needs Node 22 or later and pnpm 10.12.4, on macOS, Linux or Windows with WSL2.',
  licence: 'MIT',
  docs: true,
  hosted: [],
};
