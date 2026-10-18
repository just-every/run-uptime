import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {open, mkdir, mkdtemp, readFile, readdir, rm, writeFile, lstat} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {testAuthBindings, signInOwner, authRequest} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import {readProcessTable, sameProcess} from '@runeditrun/rer/internal/onboarding/process-table.mjs';

// Integration of the existing local-review browser suites, not hosted acceptance
// or the separate production signed-runner regression. Build first (pnpm verify).
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:15482';
const grantPath = join(root, 'data/synthetic-grant.json');
const children = new Set();
const results = [];
let worker, directory, evidence, mailLog, ownedGrant = false, interrupted = false;
const env = Object.fromEntries([
  'PATH', 'HOME', 'SystemRoot',
  'PLAYWRIGHT_BROWSERS_PATH', 'UPTIME_BROWSER_EXECUTABLE',
].filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
// Never pass inherited provider credentials, proxy configuration or Node hooks.
const bindings = {...testAuthBindings, UPTIME_RUNNER_KEY: `browser-suite-${randomUUID()}`, UPTIME_SYNTHETIC_PORT: '15481'};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function signalGroup(child, signal) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}
function groupExists(child) {
  if (!child.pid) return false;
  try { process.kill(-child.pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
async function stopChild(child) {
  child.custodyStopped = true;
  clearTimeout(child.custodyTimer);
  await child.custodyPending;
  await captureDescendants(child);
  signalGroup(child, 'SIGTERM');
  await signalDescendants(child, 'SIGTERM');
  const deadline = Date.now() + 10000;
  while (groupExists(child) && Date.now() < deadline) await pause(100);
  if (groupExists(child)) signalGroup(child, 'SIGKILL');
  await signalDescendants(child, 'SIGKILL');
  const killedDeadline = Date.now() + 5000;
  while (groupExists(child) && Date.now() < killedDeadline) await pause(100);
  assert.equal(groupExists(child), false, 'owned process group must stop');
  const descendantsRemain = async () => {
    const remaining = await readProcessTable();
    return [...child.groups.values()].some(identities => remaining.some(row => identities.some(old => sameProcess(row, old))));
  };
  const descendantsDeadline = Date.now() + 5000;
  while (await descendantsRemain() && Date.now() < descendantsDeadline) await pause(100);
  assert.equal(await descendantsRemain(), false, 'owned detached descendants must stop');
  await child.completion;
  children.delete(child);
  if (child.custodyError) throw child.custodyError;
}
async function captureDescendants(child) {
  if (!child.pid) return;
  // One numeric snapshot discovers ancestry and birth identities together.
  // Repeating a global scan for every group competes with browser startup.
  const table = await readProcessTable();
  const descendants = new Set([child.pid]);
  let changed;
  do {
    changed = false;
    for (const row of table) if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
      descendants.add(row.pid); changed = true;
    }
  } while (changed);
  for (const row of table) {
    if (!descendants.has(row.pid)) continue;
    const known = child.groups.get(row.pgid) ?? [];
    if (!known.some(old => sameProcess(row, old))) known.push(row);
    child.groups.set(row.pgid, known);
  }
}
async function signalDescendants(child, signal) {
  const table = await readProcessTable();
  for (const [group, identities] of child.groups) {
    for (const row of table) {
      if (row.pgid !== group || !identities.some(old => sameProcess(row, old))) continue;
      try { process.kill(row.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
}
function launch(label, script, extraEnv = {}) {
  if (interrupted) throw Error('Browser integration interrupted');
  const child = spawn(process.execPath, [join(root, script)], {
    cwd: root, env: {...env, ...extraEnv}, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.label = label;
  child.log = '';
  child.groups = new Map();
  // Chromium may own a detached group. Retain birth identities while its suite
  // is alive so abort cleanup still owns it after the suite leader exits.
  const observe = () => {
    child.custodyPending = captureDescendants(child).catch(error => {
      child.custodyError = error;
      signalGroup(child, 'SIGTERM');
    }).then(() => {
      if (child.exitCode === null && child.signalCode === null && !child.custodyError && !child.custodyStopped) child.custodyTimer = setTimeout(observe, 500);
    });
  };
  observe();
  // Logs stay private: do not print captured auth or capability URLs on failure.
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { child.log += chunk; });
  child.completion = new Promise(resolve => {
    child.once('error', error => resolve({error}));
    child.once('exit', (code, signal) => resolve({code, signal}));
  });
  children.add(child);
  return child;
}
async function waitFor(label, check, child, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (interrupted) throw Error('Browser integration interrupted');
    if (child && (child.exitCode !== null || child.signalCode !== null)) throw Error(`${label}: process exited`);
    try { if (await check()) return; } catch { /* readiness only; timeout fails */ }
    await pause(100);
  }
  throw Error(`${label}: readiness timed out`);
}
async function requireFreePort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
async function runSuite(script, variable, label) {
  const output = join(evidence, label);
  await mkdir(output, {mode: 0o700});
  console.log(`Running ${script}`);
  const child = launch(label, script, {[variable]: output,UPTIME_TEST_MAIL_LOG:mailLog});
  let killTimer;
  const timer = setTimeout(() => {
    signalGroup(child, 'SIGTERM');
    killTimer = setTimeout(() => signalGroup(child, 'SIGKILL'), 10000);
  }, 10 * 60 * 1000);
  let outcome;
  try { outcome = await child.completion; }
  finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    await stopChild(child);
    await writeFile(join(output, 'suite.log'), child.log, {mode: 0o600});
  }
  assert.equal(outcome.error, undefined, `${script}: process failed to start`);
  assert.equal(outcome.signal, null, `${script}: interrupted or timed out`);
  const failureLocation=[...child.log.matchAll(/(?:^|\n)\s+at [^\n]*?tests\/([^:\n]+\.mjs:\d+:\d+)/g)].at(-1)?.[1];
  assert.equal(outcome.code, 0, `${script}: failed${failureLocation?` at tests/${failureLocation}`:''}; inspect its private suite.log`);
  await validateArtifacts(output);
  results.push({script, passed: true});
}
async function validateArtifacts(path) {
  for (const name of await readdir(path)) {
    const file = join(path, name), info = await lstat(file);
    assert.ok(!info.isSymbolicLink(), 'browser evidence cannot contain symlinks');
    if (info.isDirectory()) { await validateArtifacts(file); continue; }
    assert.ok(info.isFile(), 'browser evidence must be regular files');
    if (name.endsWith('.json')) JSON.parse(await readFile(file, 'utf8'));
    else if (name.endsWith('.png')) assert.ok((await readFile(file)).subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'valid PNG evidence required');
    else assert.ok(name.endsWith('.log'), 'unexpected browser evidence type');
  }
  const result = JSON.parse(await readFile(join(path, 'RESULTS.json'), 'utf8'));
  assert.equal(result.externalNetwork, false, 'suite must report local-only evidence');
}
function interrupt() {
  interrupted = true;
  for (const child of children) signalGroup(child, 'SIGTERM');
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, interrupt);

try {
  // Existing browser suites fix these ports; never reuse another runtime.
  for (const port of [15481, 15482, 15493, 15494]) await requireFreePort(port);
  await mkdir(join(root, 'data'), {recursive: true});
  // Exclusive reservation protects an existing grant (including a symlink).
  const reservation = await open(grantPath, 'wx', 0o600);
  ownedGrant = true;
  await reservation.close();
  directory = await mkdtemp(join(tmpdir(), 'uptime-browser-suites-'));
  mailLog=join(directory,'mail.jsonl');
  // Browser profiles and sockets belong to this run's OS temporary directory.
  // Do not forward a caller's work-tree scratch path to Chromium.
  Object.assign(env, {TMPDIR: directory, TMP: directory, TEMP: directory});
  evidence = await mkdtemp(join(root, 'data/browser-suites-evidence-'));
  const synthetic = launch('synthetic', 'runners/src/synthetic.mjs', {
    UPTIME_SYNTHETIC_PORT: '15481', UPTIME_GRANT_FILE: grantPath,
  });
  await waitFor('synthetic custody', async () => {
    const grant = JSON.parse(await readFile(grantPath, 'utf8'));
    if (grant.pid !== synthetic.pid || grant.port !== 15481 || grant.expiresAt <= Date.now()) return false;
    return (await fetch('http://127.0.0.1:15481/health', {signal: AbortSignal.timeout(2000)})).status === 200;
  }, synthetic);
  worker = await startLocalWorker({root, port: 15482, persist: join(directory, 'control'), bindings,mailLog,
    outboundService: () => { throw Error('Browser suite Worker external requests prohibited'); },
  });
  const DB = await worker.getD1Database('DB');
  for (const name of (await readdir(join(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) {
    for (const statement of splitSql(await readFile(join(root, 'migrations', name), 'utf8'))) await DB.prepare(statement).run();
  }
  const cookie = await signInOwner(origin, {bindings,finishFirstRun:true});
  const call = authRequest(origin);
  const runner = launch('runner', 'runners/src/private-runner.mjs', {
    UPTIME_CONTROL_ORIGIN: origin, UPTIME_RUNNER_KEY: bindings.UPTIME_RUNNER_KEY,
    UPTIME_GRANT_FILE: grantPath, UPTIME_LOCAL_REVIEW: 'true',
  });
  await waitFor('authenticated runner contact', async () => {
    const response = await call('/api/overview', undefined, {cookie});
    return response.ok && (await response.json()).runner.contact.state === 'Fresh contact';
  }, runner);
  await runSuite('tests/operator-browser.mjs', 'UPTIME_UI_EVIDENCE', 'operator');
  await stopChild(runner);
  await worker.dispose(); worker = undefined;
  // Recovery owns its two independent Workers/runners, sharing only custody.
  await runSuite('tests/recovery-browser.mjs', 'UPTIME_RECOVERY_UI_EVIDENCE', 'recovery');
  await writeFile(join(evidence, 'RESULTS.json'), JSON.stringify({results, externalNetwork: false,
    scope: 'Existing local-review browser suites; separate from production signed-runner and hosted acceptance'}, null, 2), {mode: 0o600});
} finally {
  const cleanup = [];
  for (const child of [...children]) {
    try { await stopChild(child); }
    catch (error) { cleanup.push(error); }
    if (evidence) await writeFile(join(evidence, `${child.label}.log`), child.log, {mode: 0o600});
  }
  if (worker) { try { await worker.dispose(); } catch (error) { cleanup.push(error); } }
  if (directory) await rm(directory, {recursive: true, force: true});
  if (ownedGrant) await rm(grantPath, {force: true});
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(signal, interrupt);
  if (cleanup.length) throw new AggregateError(cleanup, 'Browser integration cleanup failed');
}
console.log(`Browser integration passed; owned runtime groups stopped and temporary grant/state removed. Private evidence: ${evidence}`);
