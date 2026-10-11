import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { populateArchiveFixture } from './archive-fixture.mjs';
import { archive as productArchive } from '../src/domain/archive.server.ts';
import { chromium } from 'playwright';
import { scratchInstallation, machineAvailable } from './scratch-installation.mjs';
import { openGate, readCheckoutKey } from './auth-test-support.mjs';
import { until, assertPortFree, signInThroughOutbox, smokeDocuments, descendantGroups, assertGroupsGone } from './installer-support.mjs';
const scratch = await scratchInstallation();
let dev, browser, origin; const groups = new Set();
try {
 const invoke = args => scratch.run('node', ['scripts/rer.mjs', ...args]);
 await invoke(['describe', '--json']);
 await invoke(['check', '--profile', 'first-party']);
 await invoke(['install']);
 const missing = scratch.start('node', ['scripts/rer.mjs', 'setup', '--non-interactive', '--json']);
 try { assert.equal((await missing.done).code, 3); } finally { await scratch.stop(missing); }
 const setup = await invoke(['setup', '--owner-email', 'journey@example.test', '--owner-name', 'Command Owner', '--non-interactive']);
 origin = setup.match(/RER_SETUP_READY (http:\/\/127\.0\.0\.1:\d+)/)?.[1]; assert.ok(origin);
 await assertPortFree(Number(new URL(origin).port));
 const settingsPath = join(scratch.root, 'data/local-secrets.json'), settings = await readFile(settingsPath);
 assert.equal((await stat(settingsPath)).mode & 0o777, 0o600);
 await invoke(['setup', '--owner-email', 'journey@example.test', '--non-interactive']);
 assert.ok((await readFile(settingsPath)).equals(settings));
 // Inspect the real production output of setup after it built with saved keys.
 // Credentials are compared in memory and never included in diagnostics.
 const keys = ['SESSION_SECRET', 'SETUP_TOKEN', 'UPTIME_RUNNER_KEY'].map(name => JSON.parse(settings)[name]);
 async function inspectBuild(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
   const path = join(directory, entry.name);
   if (entry.isDirectory()) await inspectBuild(path);
   else if (entry.isFile()) { const bytes = await readFile(path); assert.ok(keys.every(key => !bytes.includes(key)), 'production build includes private installation credentials'); }
  }
 }
 await inspectBuild(join(scratch.root, 'dist'));

 const conflicting = scratch.start('node', ['scripts/rer.mjs', 'setup', '--owner-email', 'another@example.test', '--non-interactive']);
 try { assert.equal((await conflicting.done).code, 4); } finally { await scratch.stop(conflicting); }
 await machineAvailable(); dev = scratch.start('node', ['scripts/rer.mjs', 'dev']);
 await until(() => { assert.equal(dev.exitCode, null); return dev.output.includes('RER_READY ' + origin); });
 // dev opens signed in: the owner it names and the key-carrying link (whose key stays in the fragment).
 assert.ok(dev.output.includes('RER_SIGNED_IN journey@example.test'));
 assert.ok(dev.output.includes('RER_OPEN ' + origin + '/#rer-dev='));
 assert.equal((await fetch(origin + '/__dev/outbox')).status, 404, 'the outbox answers only a request that holds the key');
 assert.equal((await fetch(origin + '/@vite/client')).status, 200, 'real Vite asset/HMR support');
 await invoke(['outbox']);
 const resetActive = scratch.start('node', ['scripts/rer.mjs', 'reset', '--yes', '--non-interactive']);
 try { assert.equal((await resetActive.done).code, 4); } finally { await scratch.stop(resetActive); }
 browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
 await openGate(page.context(), origin, await readCheckoutKey(scratch.root));
 await page.goto(origin + '/__dev/outbox'); await page.getByRole('link', { name: 'Read message' }).first().click();
 await signInThroughOutbox(page, page.url(), { displayName: 'Command Owner', OWNER_EMAIL: 'journey@example.test' }, { finishSetup: false });
 assert.equal(new URL(page.url()).pathname, '/setup', 'rer sign-in returns the unfinished owner to setup');
 const unsigned = await browser.newContext();
 try {
  for (const method of ['get', 'post']) {
   const denied = await unsigned.request[method](origin + '/setup', { headers: { origin }, maxRedirects: 0 });
   assert.equal(denied.status(), 303);
   assert.equal(denied.headers().location, '/login?returnTo=%2Fsetup');
  }
  await unsigned.newPage().then(async p => { await p.goto(origin + '/setup'); assert.equal(new URL(p.url()).pathname, '/login'); });
 } finally { await unsigned.close(); }
 for (const headers of [{ origin: 'https://attacker.example.test' }, { origin, 'sec-fetch-site': 'cross-site' }, {}]) {
  const refused = await page.request.post(origin + '/setup', { headers, maxRedirects: 0 });
  assert.equal(refused.status(), 403, 'first-run completion rejects cross-origin and missing-Origin requests');
 }
 const setupEvidence = process.env.UPTIME_SETUP_EVIDENCE;
 if (setupEvidence) await mkdir(setupEvidence, { recursive: true });
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 900 });
  for (const path of ['/app', '/app/', '/app/monitor', '/app/monitor/', '/_serverFn/private']) {
   await page.goto(origin + path); assert.equal(new URL(page.url()).pathname, '/setup', 'unfinished owner stays in setup');
  }
  assert.equal((await page.request.get(origin + '/setup', { maxRedirects: 0 })).status(), 200, 'denied completion left first-run unfinished');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'setup fits the viewport');
  if (setupEvidence) await page.screenshot({ path: join(setupEvidence, `setup-${width}.png`), fullPage: true });
 }
 // The actual first-run form works without JavaScript or hydration.
 const nativeSetup = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() });
 try {
  const p = await nativeSetup.newPage(); await p.goto(origin + '/setup');
  await p.getByRole('button', { name: 'Finish setup', exact: true }).click(); await p.waitForURL(origin + '/app');
 } finally { await nativeSetup.close(); }
 const finished = await page.request.get(origin + '/setup', { maxRedirects: 0 });
 assert.equal(finished.status(), 303); assert.equal(finished.headers().location, '/app');
 await page.goto(origin + '/app');
 if (setupEvidence) await writeFile(join(setupEvidence, 'RESULTS.json'), JSON.stringify({ widths: [1440, 390], freshRerSetup: true, outboxReturn: '/setup', unfinishedRoutes: true, unsignedReturn: true, csrfRefused: true, nativeCompletion: true, finishedReturn: '/app' }, null, 2));
 await smokeDocuments(page, origin);
 // Native form POST remains usable without hydration; ordinary links are one-use.
 const noScript = await browser.newContext({ javaScriptEnabled: false });
 try { const p = await noScript.newPage(); await p.goto(origin + '/login'); await p.getByLabel('Email address', { exact: true }).fill('journey@example.test'); await p.getByRole('button', { name: 'Send sign-in link', exact: true }).click(); assert.ok(p.url().startsWith(origin)); } finally { await noScript.close(); }
 const before = await page.request.get(origin + '/api/archive'); assert.equal(before.status(), 200);
 let expected = await before.json();
 for (const group of await descendantGroups(dev.pid)) groups.add(group);
 await scratch.stop(dev); dev = undefined; await assertGroupsGone(groups);
 // Preview serves the fixed production build on the same origin, then stops with its owned processes.
 await machineAvailable(); let preview = scratch.start('node', ['scripts/rer.mjs', 'preview']);
 try {
  await until(() => { assert.equal(preview.exitCode, null); return preview.output.includes('RER_READY ' + origin); });
  const landing = await fetch(origin + '/'); assert.equal(landing.status, 200);
  assert.ok(!(await landing.text()).includes('/@vite/client'), 'preview serves production output, not the Vite dev client');
  for (const group of await descendantGroups(preview.pid)) groups.add(group);
 } finally { await scratch.stop(preview); preview = undefined; }
 await assertGroupsGone(groups);
 const { startLocalWorker } = await import(pathToFileURL(join(scratch.root, 'scripts/local-worker.mjs')));
 const values = JSON.parse(settings);
 let native = await startLocalWorker({ root: scratch.root, persist: join(scratch.root, '.wrangler/state'), bindings: values, assets: false });
 try { const env = { ...values, DB: await native.getD1Database('DB') }; await populateArchiveFixture(env); expected = await productArchive(env); }
 finally { await native.dispose(); }
 const archive = join(scratch.root, 'exports/product.rer');
 await invoke(['export', '--output', 'exports/product.rer']); assert.equal((await stat(archive)).mode & 0o777, 0o600);
 await mkdir(join(scratch.root, '.rer/deploy'), { recursive: true }); await writeFile(join(scratch.root, '.rer/deploy/receipt'), 'retained');
 await invoke(['reset', '--yes', '--non-interactive']);
 assert.equal(await readFile(join(scratch.root, '.rer/deploy/receipt'), 'utf8'), 'retained');
 await invoke(['reset', '--yes', '--non-interactive']);
 await invoke(['import', '--input', 'exports/product.rer', '--yes']);
 await invoke(['setup', '--owner-email', 'receiving@example.test', '--non-interactive']);
 await invoke(['export', '--output', 'exports/restored.rer']);
 const receiving = JSON.parse(await readFile(settingsPath));
 native = await startLocalWorker({ root: scratch.root, persist: join(scratch.root, '.wrangler/state'), bindings: receiving, assets: false });
 try {
  const restored = await productArchive({ ...receiving, DB: await native.getD1Database('DB') });
  const source = { ...expected.payload.tables, ...expected.payload.productTables }, target = { ...restored.payload.tables, ...restored.payload.productTables };
  for (const name of ['observations', 'integration_attempts', 'integration_resolutions', 'integration_replays']) assert.deepEqual(target[name], source[name]);
  for (const name of ['monitors', 'slots', 'outbox', 'notification_destinations', 'notification_jobs', 'integration_deliveries']) assert.equal(target[name].length, source[name].length);
  for (const revision of source.revisions) assert.deepEqual(target.revisions.find(row => row.monitor_id === revision.monitor_id && row.revision === revision.revision), revision);
  assert.ok(target.monitors.every(row => JSON.parse(row.definition).enabled === false));
  assert.ok(target.notification_destinations.every(row => row.enabled === 0));
  assert.ok(target.notification_jobs.every(row => row.state === 'imported-inactive'));
  assert.ok(target.outbox.every(row => row.status === 'imported-inactive'));
  for (const name of ['monitors', 'slots', 'outbox', 'notification_destinations', 'notification_jobs', 'integration_deliveries']) for (const original of source[name]) {
   const current = target[name].find(row => row.id === original.id);
   if (JSON.stringify(current) !== JSON.stringify(original)) assert.ok(target.archive_history.some(row => row.table_name === name && row.record === JSON.stringify(original)));
  }
 } finally { await native.dispose(); }
 for (const value of Object.values(JSON.parse(settings))) if (typeof value === 'string' && value.length >= 32) assert.ok(!setup.includes(value));
 console.log('COMMAND-JOURNEY passed: explicit owner, teardown, exact rerun, conflicts, foreground Vite/HMR, outbox/native forms, active reset refusal, private archive, confirmed reset/import/export and retained receipts.');
} finally { await scratch.stop(dev); await browser?.close(); await scratch.close(); }
