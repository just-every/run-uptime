import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {flowDigest} from '../src/domain/flow.mjs';
const exec = promisify(execFile);

// Execute the checked-in workflow's whole shell step, with fixture-owned
// installation authority. No GitHub or external installation is contacted.
export async function workflowImport({folder, owner, compiled, ok}) {
 const workflow = await readFile('.github/workflows/import-playwright.yml', 'utf8');
 const shell = workflow.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
 const invoke = async attempt => {
  const {stdout} = await exec('/bin/bash', ['-euo', 'pipefail', '-c', shell], {env: {...process.env,
   UPTIME_CHECKOUT: process.cwd(), UPTIME_SUITE_DIR: resolve(folder), UPTIME_ORIGIN: owner.controlOrigin,
   UPTIME_SESSION_COOKIE: owner.cookie, RUNNER_TEMP: resolve(folder), GITHUB_RUN_ID: 'synthetic-uptime-1', GITHUB_RUN_ATTEMPT: String(attempt)}});
  const preview = JSON.parse(await readFile(join(folder, `uptime-playwright-synthetic-uptime-1-${attempt}.json.preview`), 'utf8'));
  const result = JSON.parse(stdout.trim().split('\n').at(-1));
  return {preview, result};
 };
 const {preview, result} = await invoke(1);
 assert.equal(preview.counts.create, 3); assert.equal(result.report.ok, true);
 for (const entry of preview.entries) {
  const monitor = (await ok('/api/overview')).monitors.find(m => m.definition.name === entry.name);
  assert.deepEqual(monitor.definition.flow.source, compiled.monitors.find(m => m.name === entry.name).flow.source);
  assert.equal(entry.target.flow.digest, await flowDigest(monitor.definition.flow), 'preview names the exact immutable retained flow digest');
 }
 const before = (await ok('/api/overview')).monitors.map(m => [m.id, m.revision]);
 const repeated = await invoke(2);
 assert.equal(repeated.result.unchanged, true);
 assert.deepEqual((await ok('/api/overview')).monitors.map(m => [m.id, m.revision]), before, 'reapplying the workflow with the same source digests writes no revision');
}
