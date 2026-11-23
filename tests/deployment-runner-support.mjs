import { execFile } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

// The documented command launches the real runner. Install only the test's
// in-process network routing at its entry point so it can take one scheduled job.
export async function runDeploymentRunner(directory, { origin, key, grants, httpPort, canaryPort, caPath }) {
 const cwd = join(directory, 'deployment-runner');
 const runner = join(cwd, 'runners/src');
 await Promise.all(['scripts', 'runners/src', '.rer/deploy'].map(path => mkdir(join(cwd, path), { recursive: true, mode: 0o700 })));
 await Promise.all([
  copyFile('scripts/runner-start.mjs', join(cwd, 'scripts/runner-start.mjs')),
  copyFile('runners/src/control-origin.mjs', join(runner, 'control-origin.mjs')),
  writeFile(join(cwd, '.rer/deploy/production.secrets.env'), `UPTIME_RUNNER_KEY=${key}\n`, { mode: 0o600 }),
  writeFile(join(runner, 'private-runner.mjs'), `
import assert from 'node:assert/strict';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import ${JSON.stringify(pathToFileURL(resolve('tests/private-network-routing.mjs')).href)};
import { runRunner } from ${JSON.stringify(pathToFileURL(resolve('runners/src/private-runner.mjs')).href)};

assert.equal(process.env.CLOUDFLARE_API_TOKEN, undefined);
assert.equal(process.env.NODE_OPTIONS, undefined);
assert.equal(process.env.UPTIME_LOCAL_REVIEW, undefined);
Object.assign(process.env, { PRIVATE_HTTP_PORT: ${httpPort}, PROTOCOL_HTTPS_PORT: ${canaryPort} });
const ca = await readFile(${JSON.stringify(caPath)});
const request = https.request;
https.request = (options, ...args) => request.call(https, { ...options, ca }, ...args);
const fetchControl = globalThis.fetch;
globalThis.fetch = (url, options) => {
 const route = new URL(url);
 assert.equal(route.origin, 'https://uptime.deployment.test');
 return fetchControl(new URL(route.pathname, ${JSON.stringify(origin)}), options);
};
await runRunner({ origin: process.env.UPTIME_CONTROL_ORIGIN, key: process.env.UPTIME_RUNNER_KEY, once: true });
`),
 ]);
 await promisify(execFile)(process.execPath, [resolve('node_modules/@runeditrun/rer/global/rer.mjs'),
  'run', '--script', 'scripts/runner-start.mjs', '--environment', 'production'], {
  cwd,
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
   UPTIME_CONTROL_ORIGIN: 'https://uptime.deployment.test', UPTIME_PRIVATE_GRANT_DIR: grants,
   CLOUDFLARE_API_TOKEN: 'sample-provider-key', NODE_OPTIONS: '--no-warnings',
   UPTIME_LOCAL_REVIEW: 'true', UPTIME_RUNNER_KEY: 'wrong-inherited-key-deliberately-ignored' },
 });
}
