// FLOW-001 through the public doors: the emitted Worker, the production runner (two vantages, each with a real browser), a local sign-in
// app behind its grant, and the monitor API. A healthy flow passes and keeps a trace without any query string or credential, also where
// the site puts the signed-in account in the URL path, escapes only part of it, or puts it across the 300-character cut; the same flow with a wrong password fails at the step that shows it, confirms an
// incident and sends one email through a destination, and editing it into a heartbeat recovers that incident only as a changed
// definition. A runner killed outright mid-flow leaves no profile behind, one lost with its browser (a power loss) leaves none past its
// next start, and concurrent creates never take the installation past its flow limit. PERF-001's page-speed checks and real-user
// beacon run beside the flows on the same Worker, runners and fixture (tests/pagespeed-support.mjs), and a populated installation
// upgrades to the beacon tables by one additive migration.
import assert from 'node:assert/strict';
import {spawn, execFile} from 'node:child_process';
import {once} from 'node:events';
import {mkdir, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {testAuthBindings} from './auth-test-support.mjs';
import {availablePorts, cleanupDirectory, migratedWorker, ownerAPI, root, runtimeDirectory, waitFor} from './notify-acceptance-runtime.mjs';
import {FIXTURE_EMAIL, FIXTURE_PASSWORD, startFlowFixture} from './flow-fixture.mjs';
import {importedCheckout} from './playwright-import-support.mjs';
import {FLOW_LIMITS} from '../src/domain/flow.mjs';
import {startPageSpeed, provePageSpeed, proveRumUpgrade} from './pagespeed-support.mjs';

const directory = await runtimeDirectory(), persist = join(directory, 'worker'), grantPath = join(directory, 'grant.json'), credentials = join(directory, 'credentials');
const [port, fixturePort] = await availablePorts(2), origin = `http://127.0.0.1:${port}`;
const bindings = {...testAuthBindings, UPTIME_SYNTHETIC_PORT: String(fixturePort), MAIL_PROVIDER: 'development'};
const owner = ownerAPI(origin), children = [], flowDirs = [join(directory, 'flows-a'), join(directory, 'flows-b')];
let worker, DB, fixture;
const runner = (key, runnerId, flowDir) => {
  const child = spawn(process.execPath, [join(root, 'runners/src/private-runner.mjs')], {cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, UPTIME_CONTROL_ORIGIN: origin, UPTIME_RUNNER_KEY: key, ...(runnerId ? {UPTIME_RUNNER_ID: runnerId} : {}), UPTIME_GRANT_FILE: grantPath, UPTIME_LOCAL_REVIEW: 'true', UPTIME_CREDENTIAL_DIR: credentials, UPTIME_FLOW_DIR: flowDir}});
  child.log = ''; for (const s of [child.stdout, child.stderr]) s.on('data', c => { child.log += c; });
  children.push(child); return child;
};
// The run folders (profile and home of one flow run each) under a runner's flow folder, and the processes that still name one.
const runs = async dir => (await Promise.all((await readdir(dir).catch(() => [])).map(async w => (await readdir(join(dir, w)).catch(() => [])).map(r => join(dir, w, r))))).flat();
const processes = async () => (await promisify(execFile)('ps', ['-A', '-ww', '-o', 'pid=,ppid=,command='], {maxBuffer: 16 * 1024 * 1024})).stdout.split('\n').map(l => /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(l)).filter(Boolean).map(([, pid, ppid, command]) => ({pid: Number(pid), ppid: Number(ppid), command}));
const holders = async folder => (await processes()).filter(p => p.command.includes(folder));
const below = async pid => { const all = await processes(), out = [], walk = id => { for (const p of all) if (p.ppid === id) { out.push(p.pid); walk(p.pid); } }; walk(pid); return out; };
try {
  ({worker, DB} = await migratedWorker({port, persist, bindings, cf: {country: 'US'}}));
  fixture = await startFlowFixture({port: fixturePort, grantPath});
  await mkdir(credentials, {mode: 0o700});
  await owner.signIn(bindings);
  const {api} = owner, ok = async (path, method = 'GET', body, headers) => { const r = await api(path, method, body, headers); assert.ok(r.status >= 200 && r.status < 300, `${path}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
  // Two vantages: a failing flow becomes an incident when two network labels agree.
  const second = await ok('/api/runners', 'POST', {networkLabel: 'second-test-network'});
  const keys = [[bindings.UPTIME_RUNNER_KEY, undefined], [second.key, second.runnerId]];
  const runners = keys.map(([key, id], i) => runner(key, id, flowDirs[i]));
  await ok('/api/notifications/destinations', 'POST', {name: 'Flow inbox', kind: 'email', address: 'qa-inbox@example.test'});
  const signIn = (scenario, password) => [
    {kind: 'goto', url: `${fixture.origin}/s/${scenario}/login`},
    {kind: 'fill', target: {label: 'Email'}, credentialRef: 'login-email'},
    {kind: 'fill', target: {label: 'Password'}, credentialRef: password},
    {kind: 'click', target: {role: 'button', name: 'Sign in'}},
    {kind: 'waitFor', what: 'text', value: 'Welcome back'},
  ];
  const flow = (scenario, password) => ({
    intent: 'Sign in and confirm an order',
    steps: [...signIn(scenario, password), {kind: 'click', target: {text: 'Confirm order'}}, {kind: 'expect', what: 'url', value: `/s/${scenario}/confirm`}],
    outcomes: [{id: 'order-confirmed', what: 'text', value: 'Order confirmed'}],
  });
  // The site signs in to /u/<email>/dashboard: the account's address is in the URL the trace and final URL record. Its settings page
  // escapes the '@' of the sub-addressed sign-in but keeps the '+', its mailbox lowercases the accented address, and its full profile
  // puts the address across the 300-character cut.
  const accountFlow = {intent: 'Sign in to the account page', steps: [...signIn('profile-path', 'login-password'), {kind: 'expect', what: 'url', value: '/s/profile-path/u/', match: 'prefix'},
    {kind: 'click', target: {text: 'Account settings'}}, {kind: 'waitFor', what: 'text', value: 'Account settings'},
    {kind: 'click', target: {text: 'Mailbox'}}, {kind: 'waitFor', what: 'text', value: 'Your mailbox'}, {kind: 'click', target: {text: 'Full profile'}}], outcomes: [{id: 'profile', what: 'text', value: 'Full profile'}]};
  const create = async (name, scenario, body, extra = {}) => {
    const prefix = crypto.randomUUID();
    const scoped = {...body, steps: body.steps.map(step => step.kind === 'fill' ? {...step, credentialRef: `${prefix}-${step.credentialRef}`} : step)};
    const created = await ok('/api/monitors', 'POST', {name, type: 'flow', url: `${fixture.origin}/s/${scenario}/login`, network: 'synthetic', probes: ['local-a', 'local-b'], intervalMs: 300000, freshnessMs: 900000, confirmSlots: 1, recoverSlots: 1, flow: scoped, ...extra, enabled: false});
    for (const [ref, value] of [['login-email', FIXTURE_EMAIL], ['login-password', FIXTURE_PASSWORD], ['wrong-password', 'not-the-password']]) await writeFile(join(credentials, `${prefix}-${ref}.json`), JSON.stringify({monitorId: created.id, origin: fixture.origin, value}), {mode: 0o600});
    await ok(`/api/monitors/${created.id}`, 'PATCH', {...created.definition, enabled: extra.enabled ?? true});
    return created.id;
  };
  const imported = await importedCheckout({directory,fixture,owner:{cookie:owner.cookie,controlOrigin:origin},ok,credentials,observations:async id=>(await ok(`/api/monitors/${id}/history`)).flatMap(s=>s.observations),waitFor});
  const good=imported.id, bad = await create('Checkout flow, wrong password', 'wrong-password', flow('wrong-password', 'wrong-password'));
  const account = await create('Account flow', 'profile-path', accountFlow);
  // A page that opens a tunnel to the fixture's port fails the run: nothing on a tunnel could prove it is the fixture.
  const tunnel = await create('Tunnel flow', 'tunnel', {intent: 'Open the tunnel page', steps: [{kind: 'goto', url: `${fixture.origin}/s/tunnel/tunnel`}, {kind: 'waitFor', what: 'text', value: 'Tunnel page'}], outcomes: [{id: 'page', what: 'text', value: 'Tunnel page'}]});
  const observations = async id => (await ok(`/api/monitors/${id}/history`)).flatMap(slot => slot.observations);
  for (const id of [good, bad, account, tunnel]) await waitFor(async () => (await observations(id)).length >= 2, 'the flow ran on both runners', 120000);
  // PERF-001's checks start once the flows have run, so they never queue the flows behind their own browser runs.
  const speed = await startPageSpeed({ok, fixture});
  const overview = await ok('/api/overview'), state = id => overview.monitors.find(m => m.id === id).state;
  for (const id of [good, account]) {
    for (const o of await observations(id)) {
      assert.equal(o.outcome, 'pass');
      assert.ok(o.flow.trace.every(step => step.outcome === 'pass'), 'every step passed');
      assert.ok(o.flow.outcomes.every(x => x.observed), 'every required outcome was observed');
      assert.ok(!/[?#]/.test(o.flow.finalUrl), 'the final URL keeps no query or fragment');
      if (id === account) assert.ok(o.flow.trace.filter(step => step.url && !step.url.endsWith('/login')).every(step => step.url.includes('[credential]')) && o.flow.finalUrl.includes('[credential]'), 'every signed-in page put the address in its URL, and each stored URL shows it removed');
    }
    assert.equal(state(id).state, 'Healthy');
  }
  for (const o of await observations(bad)) {
    assert.equal(o.outcome, 'target_failure');
    assert.equal(o.flow.failure.reason, 'expectation_not_met');
    assert.equal(o.flow.failure.step, 4, 'the failing step is the one that waits for the signed-in page');
    assert.equal(o.flow.trace.at(-1).outcome, 'fail');
  }
  assert.equal(state(bad).state, 'Failing');
  for (const o of await observations(tunnel)) assert.deepEqual([o.outcome, o.flow.failure?.reason, o.flow.failure?.blocked], ['target_failure', 'blocked_request', 'custody'], 'a tunnel to the fixture port is refused as a custody violation');
  // One email, accepted by the network-edge provider fixture, for the incident of the failing flow only.
  await waitFor(async () => (await DB.prepare("SELECT state FROM notification_jobs WHERE kind='email' AND json_extract(event,'$.monitorName')=?").bind('Checkout flow, wrong password').first())?.state === 'accepted', 'the incident email was sent', 60000);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM notification_jobs WHERE json_extract(event,'$.monitorName')=?").bind('Checkout flow').first()).n, 0, 'a passing flow sends nothing');

  await imported.finish();
  await provePageSpeed({ids: speed, ok, api, DB, fixture, origin, owner, waitFor, observations});

  // Editing the failing flow into a heartbeat that then passes recovers the incident only as a changed definition: a heartbeat
  // requires none of the flow's outcomes.
  await ok(`/api/monitors/${bad}`, 'PATCH', {name: 'Checkout flow, wrong password', type: 'heartbeat', probes: ['local-a', 'local-b'], intervalMs: 5000, freshnessMs: 60000, confirmSlots: 1, recoverSlots: 1, heartbeat: {maxAgeMs: 60000}});
  const changed = (await ok('/api/overview')).monitors.find(m => m.id === bad).state.definitionChange;
  assert.equal(changed?.fromRevision, overview.monitors.find(m => m.id === bad).revision, 'while the incident is open the state names the revision it began under');
  assert.ok(changed.removed.some(r => r.includes('order-confirmed')), 'the flow outcome the heartbeat no longer requires is named');
  const {token} = await ok(`/api/monitors/${bad}/heartbeat-key`, 'POST', {});
  await ok(`/api/heartbeats/${bad}`, 'POST', {}, {authorization: `Bearer ${token}`, 'x-heartbeat-sequence': '1'});
  const recovery = await waitFor(async () => (await ok('/api/overview')).alerts.find(a => a.monitor_id === bad && a.kind === 'recovery'), 'the heartbeat recovered the incident', 60000);
  assert.match(recovery.event.explanation, /Changed definition/, 'the recovery notice says the definition changed');
  assert.equal((await ok(`/api/monitors/${bad}/revisions`)).find(r => r.definition.type === 'heartbeat' && r.flowChange)?.flowChange.change, 'shrank', 'the revision history shows the flow requirements were removed');

  // No credential value, in any encoding a URL gives it, reaches the control plane or the runners' logs, nor any 16 characters of one
  // (what a cut or a partly escaped value leaves).
  const everything = (JSON.stringify([(await api('/api/archive')).data, (await api('/api/overview')).data, await observations(good), await observations(account), await observations(bad)]) + children.map(c => c.log).join('')).toLowerCase();
  for (const secret of [FIXTURE_EMAIL, FIXTURE_PASSWORD, 'not-the-password']) for (const form of new Set([secret, encodeURIComponent(secret), encodeURIComponent(secret.toLowerCase()), encodeURI(secret), secret.replace('@', '%40')])) {
    for (let i = 0; i + 16 <= form.length; i++) assert.ok(!everything.includes(form.slice(i, i + 16).toLowerCase()), `a credential value stayed on the runner (${i} characters into one form)`);
  }

  // Hard stops mid-flow, while each runner's browser is signed in to a page that takes 20 s to answer.
  await create('Slow checkout flow', 'slow', flow('slow', 'login-password'));
  // Mid-flow: each runner's actual browser is running with its temporary profile in the owned run folder.
  const signedIn = async dir => { const r = await runs(dir); return r.length === 1 && (await holders(r[0])).some(process=>process.command.includes('--remote-debugging-pipe')) && r[0]; };
  const live = await waitFor(async () => { const r = await Promise.all(flowDirs.map(signedIn)); return r.every(Boolean) && r; }, 'both runners started the slow flow', 60000);
  // What is left of a run folder, for a failure message.
  const left = async (dir, folder) => JSON.stringify({folders: await runs(dir), processes: (await holders(folder)).map(p => p.command.slice(0, 200))});
  // The first runner is killed outright: its flow process removes the browser and the run folder itself.
  runners[0].kill('SIGKILL'); await once(runners[0], 'exit');
  await waitFor(async () => !(await runs(flowDirs[0])).length && !(await holders(live[0])).length, 'a runner killed outright left no profile and no browser', 30000)
    .catch(async error => { throw Error(`${error.message}: ${await left(flowDirs[0], live[0])}`); });
  // The second is lost with its browser (a power loss): its folder outlives it, and the next start removes it.
  const group = [runners[1].pid, ...await below(runners[1].pid), ...(await holders(live[1])).map(p => p.pid)];
  for (const pid of group) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  await waitFor(async () => (await Promise.all(group.map(pid => { try { process.kill(pid, 0); return true; } catch { return false; } }))).every(alive => !alive), 'the second runner and its browser are gone', 10000);
  assert.deepEqual(await runs(flowDirs[1]), [live[1]], 'a power loss leaves the run folder until the runner starts again');
  runner(...keys[1], flowDirs[1]);
  await waitFor(async () => !(await runs(flowDirs[1])).length, 'the next start removed the profile a power loss left', 30000)
    .catch(async error => { throw Error(`${error.message}: ${await left(flowDirs[1], live[1])}`); });

  // The flow limit holds under concurrency: of ten simultaneous creates, exactly the room left succeeds and the rest name the limit.
  const flows = Number((await DB.prepare("SELECT COUNT(*) n FROM monitors WHERE json_extract(definition,'$.type')='flow'").first()).n);
  const results = await Promise.all(Array.from({length: 10}, (_, i) => api('/api/monitors', 'POST', {name: `Concurrent flow ${i}`, type: 'flow', url: `${fixture.origin}/s/healthy/login`, network: 'synthetic', probes: ['local-a', 'local-b'], intervalMs: 300000, enabled: false, flow: flow('healthy', 'login-password')})));
  assert.equal(results.filter(r => r.status === 201).length, FLOW_LIMITS.maxFlowsPerInstallation - flows, 'exactly the room left was created');
  assert.ok(results.filter(r => r.status !== 201).every(r => r.status === 400 && /limit/.test(r.data.error)), 'every refused create names the limit');
  assert.equal(Number((await DB.prepare("SELECT COUNT(*) n FROM monitors WHERE json_extract(definition,'$.type')='flow'").first()).n), FLOW_LIMITS.maxFlowsPerInstallation);
  console.log('FLOW-001 passed: browser flow through the production runner and Worker; healthy traces keep no query or credential, also with the account in the URL path; wrong password failed at its step and sent an incident email; a type change recovered only as a changed definition; hard stops left no profile; concurrent creates kept the flow limit; a tunnel to the fixture port failed as a custody violation.');
  console.log('PERF-001 passed: mobile and desktop page-speed checks retained DNS/connect/TLS/TTFB, the waterfall, vitals and the mobile browser error; the slow mobile checkout breached its budgets and opened an incident with its email while desktop passed and the health endpoint stayed Healthy; the consented beacon counted real visitors by route, device and country with owner sampling and exclusions, sent nothing without consent, with GPC, from a bot, outside the sample or on an excluded path, kept no identifier, query or address, and its report kept its own denominator beside the synthetic one; the console showed both at 1440 and 390.');
} finally {
  for (const c of children) if (c.exitCode === null && c.signalCode === null) { c.kill('SIGTERM'); await once(c, 'exit'); }
  await fixture?.close(); await worker?.dispose(); await cleanupDirectory(directory);
}
await proveRumUpgrade();
await (await import('./pagespeed-timing-support.mjs')).provePageSpeedTimings();
console.log('PERF-001 upgrade passed: a populated installation gained the beacon tables by one additive migration that rewrote nothing.');
await import('./flow-profiles.mjs');

await import('./flow-artifact-journey.mjs');
