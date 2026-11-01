import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the shipped CLI against real production output in an isolated restore
// directory. Reuse checkout metadata read-only; no commits or test registrations.
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = value => execFileSync('git', ['rev-parse', value], { cwd: root, encoding: 'utf8' }).trim();
const directory = await mkdtemp(join(tmpdir(), 'uptime-shared-build-proof-'));
const checkout = join(directory, 'checkout'), bundle = join(directory, 'bundle');
const env = { ...process.env, CI: 'true', GITHUB_SHA: git('HEAD'),
 GITHUB_RUN_ID: process.env.GITHUB_RUN_ID || '1', GITHUB_RUN_ATTEMPT: '1',
 GITHUB_WORKFLOW: process.env.GITHUB_WORKFLOW || 'Verify' };
function cli(mode, environment = env) {
 const result = spawnSync(process.execPath, [join(checkout, '.github/scripts/verify-build.mjs'), mode, bundle],
  { cwd: checkout, env: environment, encoding: 'utf8' });
 assert.ifError(result.error);
 return result;
}
function passed(mode, environment) {
 const result = cli(mode, environment);
 assert.equal(result.status, 0, result.stderr);
 assert.match(result.stdout, /Shared verification build .* passed/);
}
try {
 await mkdir(join(checkout, '.github/scripts'), { recursive: true });
 await mkdir(join(checkout, '.wrangler/deploy'), { recursive: true });
 await cp(join(root, '.github/scripts/verify-build.mjs'), join(checkout, '.github/scripts/verify-build.mjs'));
 await writeFile(join(checkout, '.git'), `gitdir: ${git('--absolute-git-dir')}\n`);
 await cp(join(root, 'dist'), join(checkout, 'dist'), { recursive: true });
 await cp(join(root, '.wrangler/deploy/config.json'), join(checkout, '.wrangler/deploy/config.json'));
 passed('create');
 const manifest = JSON.parse(await readFile(join(bundle, 'build.json'), 'utf8'));
 passed('restore');
 const rerun = { ...env, GITHUB_RUN_ATTEMPT: '2' };
 passed('restore', rerun);
 passed('check', rerun);
 // Every identity refusal happens before replacement of existing output.
 const sentinel = join(checkout, 'dist/client/shared-build-proof.txt');
 await writeFile(sentinel, 'preserve on refusal');
 for (const [label, change] of [
  ['source SHA', value => { value.source.sha = '0'.repeat(40); }],
  ['source tree', value => { value.source.tree = '0'.repeat(40); }],
  ['workflow SHA', value => { value.workflow.sha = '0'.repeat(40); }],
  ['run id', value => { value.workflow.runId += '0'; }],
  ['workflow', value => { value.workflow.name = 'Another workflow'; }],
  ['future attempt', value => { value.workflow.runAttempt = '3'; }],
  ['invalid attempt', value => { value.workflow.runAttempt = '0'; }],
  ['missing attempt', value => { delete value.workflow.runAttempt; }],
 ]) {
  const changed = structuredClone(manifest); change(changed);
  await writeFile(join(bundle, 'build.json'), JSON.stringify(changed));
  const result = cli('restore', rerun);
  assert.equal(result.status, 1, `${label} must refuse`);
  assert.match(result.stderr, /Shared build (?:source|workflow)/, label);
  assert.equal(await readFile(sentinel, 'utf8'), 'preserve on refusal', label);
 }
 await writeFile(join(bundle, 'build.json'), JSON.stringify(manifest));
 passed('restore', rerun);
 passed('check', rerun);
 console.log('Shared build CLI proof passed: attempt 1 -> 2 restore/check; eight identity refusals preserve output');
} finally {
 await rm(directory, { recursive: true, force: true });
}
