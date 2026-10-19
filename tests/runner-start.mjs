import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmod, link, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launchRunner } from '../scripts/runner-start.mjs';

test('runner launch uses only kept environment authority, refuses unsafe custody and confines its child', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'uptime-runner-start-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, '.rer', 'deploy');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(join(root, '.rer'), 0o700);
  const file = join(directory, 'production.secrets.env');
  const report = join(root, 'child-report.json');
  const runnerPath = join(root, 'fixture-runner.mjs');
  const signalSource = new EventEmitter();
  const origin = 'https://uptime.example.test';
  const key = 'runner-start-test-only-key-with-#-and-=';
  const namedKey = 'runner-start-named-environment-test-only-key';
  const env = {
    PATH: process.env.PATH ?? '', HOME: root, TMPDIR: root, LANG: 'C', LC_ALL: 'C', TZ: 'UTC',
    UPTIME_CONTROL_ORIGIN: origin, UPTIME_RUNNER_KEY: 'inherited-authority-is-refused',
    SESSION_SECRET: 'test-only-unrelated-secret', CLOUDFLARE_API_TOKEN: 'test-only-provider-secret',
    NODE_OPTIONS: '--require=/must-not-run.cjs', NODE_PATH: '/must-not-load',
    NODE_EXTRA_CA_CERTS: '/must-not-trust', NODE_V8_COVERAGE: join(root, 'must-not-write'),
    UPTIME_RUNNER_PATH: '/must-not-execute',
  };
  const options = { root, env, runnerPath, signalSource, stdio: 'ignore' };
  const noListeners = () => {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'exit']) assert.equal(signalSource.listenerCount(signal), 0);
  };
  const missingReport = () => assert.rejects(stat(report), { code: 'ENOENT' });
  const refused = async (override = {}) => {
    await assert.rejects(launchRunner({ ...options, ...override }), /Runner settings require|Runner start requires|UPTIME_CONTROL_ORIGIN must/);
    await missingReport();
    noListeners();
  };
  const save = async bytes => {
    await writeFile(file, bytes, { mode: 0o600 });
    await chmod(file, 0o600);
  };
  const bytes = `# Kept deployment authority\r\nSESSION_SECRET=test-only-other-kept-value\r\nUPTIME_RUNNER_KEY="${key}"\r\n`;
  await writeFile(runnerPath, "import { writeFile } from 'node:fs/promises'; await writeFile('child-report.json', JSON.stringify(process.env)); process.exitCode = 7;\n");

  // Legacy JSON alone must never grant authority or be rewritten by a read.
  const legacy = join(directory, 'production-secrets.json');
  const legacyBytes = JSON.stringify({ UPTIME_RUNNER_KEY: key });
  await writeFile(legacy, legacyBytes, { mode: 0o600 });
  await refused();
  assert.equal(await readFile(legacy, 'utf8'), legacyBytes);
  await save(bytes);
  for (const [environment, expectedKey] of [['production', key], ['staging', namedKey]]) {
    if (environment === 'staging') await writeFile(join(directory, 'staging.secrets.env'), `UPTIME_RUNNER_KEY=${namedKey}\n`, { mode: 0o600 });
    assert.deepEqual(await launchRunner({ ...options, environment }), { code: 7, signal: null });
    const child = JSON.parse(await readFile(report, 'utf8'));
    assert.ok(child.UPTIME_RUNNER_KEY === expectedKey, 'child receives the selected environment authority');
    assert.equal(child.UPTIME_CONTROL_ORIGIN, origin);
    assert.ok(!child.SESSION_SECRET && !child.CLOUDFLARE_API_TOKEN, 'unrelated installation and provider authority never reaches the runner');
    assert.ok(!child.NODE_OPTIONS && !child.NODE_PATH && !child.NODE_EXTRA_CA_CERTS && !child.NODE_V8_COVERAGE, 'Node injection cannot cross the runner boundary');
    await rm(report);
    noListeners();
  }
  assert.equal(await readFile(file, 'utf8'), bytes);
  await chmod(file, 0o400);
  assert.deepEqual(await launchRunner(options), { code: 7, signal: null });
  assert.equal((await stat(file)).mode & 0o777, 0o400, 'a read never repairs authority permissions');
  await rm(report);

  for (const mode of [0o644, 0o700]) {
    await chmod(file, mode);
    await refused();
    assert.equal((await stat(file)).mode & 0o777, mode);
    assert.equal(await readFile(file, 'utf8'), bytes);
  }
  for (const malformed of [legacyBytes, `UPTIME_RUNNER_KEY=${key}\nUPTIME_RUNNER_KEY=${namedKey}\n`, 'UPTIME_RUNNER_KEY=short\n', 'SESSION_SECRET=test-only\n', `UPTIME_RUNNER_KEY=${key}\n${'#'.repeat(65536)}`]) {
    await save(malformed);
    await refused();
    assert.equal(await readFile(file, 'utf8'), malformed, 'refusal preserves the kept bytes');
  }
  await save(bytes);
  const outside = join(root, 'unrelated.env');
  await writeFile(outside, bytes, { mode: 0o600 });
  await rm(file);
  await symlink(outside, file);
  await refused();
  await rm(file);
  await link(outside, file);
  await refused();
  assert.equal(await readFile(outside, 'utf8'), bytes);
  assert.equal((await stat(outside)).mode & 0o777, 0o600);
  await rm(file);
  await mkdir(file, { mode: 0o700 });
  await refused();
  await rm(file, { recursive: true });
  await save(bytes);
  await chmod(join(root, '.rer'), 0o722);
  await refused();
  await chmod(join(root, '.rer'), 0o700);
  const moved = join(root, 'kept-deploy');
  await rename(directory, moved);
  await symlink(moved, directory);
  await refused();
  await rm(directory);
  await rename(moved, directory);
  assert.equal(await readFile(file, 'utf8'), bytes);
  await refused({ environment: '../production' });
  await refused({ env: { ...env, UPTIME_CONTROL_ORIGIN: origin + '/path' } });

  // Forward only to the fixture child; the test process receives no OS signal.
  await writeFile(runnerPath, "import { writeFile } from 'node:fs/promises'; setInterval(() => {}, 1000); await writeFile('child-report.json', '{}');\n");
  let completed = false;
  const running = launchRunner({ ...options, terminationGraceMs: 1000 }).finally(() => { completed = true; });
  const deadline = Date.now() + 5000;
  try {
    for (;;) {
      try { await stat(report); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      assert.ok(!completed && Date.now() < deadline, 'fixture child starts');
      await delay(10);
    }
    signalSource.emit('SIGTERM');
    assert.deepEqual(await running, { code: null, signal: 'SIGTERM' });
    noListeners();
  } finally {
    if (!completed) signalSource.emit('exit');
    await running;
  }
});
