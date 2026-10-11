#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
let seconds = 300;
for (let i = 0; i < args.length; i++) {
  const raw = args[i] === '--timeout-seconds' ? args[i + 1] : args[i].startsWith('--timeout-seconds=') ? args[i].slice(18) : null;
  if (raw !== null && Number(raw) > 0 && Number(raw) <= 7200) seconds = Number(raw);
}
const scratch = mkdtempSync(join(tmpdir(), 'publish-check-'));
const output = join(scratch, 'report.json');
const fd = openSync(output, 'wx', 0o600);
let child, reason, timer;
const stop = value => {
  reason ??= value;
  // The child remains unreaped until its close handler; descendants (native
  // Git and Gitleaks) share the private process group and this total deadline.
  if (child?.pid) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already stopped */ }
  }
};
const interrupt = () => stop('scan.interrupted');
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
let report, code = 2;
try {
  child = spawn('python3', ['-B', new URL('./publish-check/cli.py', import.meta.url).pathname, ...args], {
    detached: true, stdio: ['ignore', fd, 'ignore'], env: { ...process.env, TMPDIR: scratch },
  });
  closeSync(fd);
  timer = setTimeout(() => stop('scan.deadline-exceeded'), seconds * 1000);
  const result = await new Promise(resolve => {
    child.once('error', () => resolve(null));
    child.once('close', value => resolve(value));
  });
  if (!reason && [0, 1, 2].includes(result)) {
    report = JSON.parse(readFileSync(output, 'utf8'));
    code = result;
  } else reason ??= 'scan.worker-incomplete';
} catch { reason ??= 'scan.worker-incomplete'; }
finally {
  clearTimeout(timer);
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  rmSync(scratch, { recursive: true, force: true });
}
if (reason) report = {
  schema: 'rer.publish-check/v3', status: 'INCOMPLETE', complete: false, source: null,
  findings: [{ rule: reason, path: '.', commit: null, scope: 'newly-public' }],
  preExisting: [], warnings: [], fixtures: [], reviewed: [], info: [],
  history: { commits: 0, trees: 0, blobs: 0 },
  guarantees: { historyScanned: false, visualRecognition: false, environmentChecked: false },
};
process.stdout.write(JSON.stringify(report) + '\n');
process.exitCode = code;
