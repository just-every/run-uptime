import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { populateArchiveFixture } from './archive-fixture.mjs';
import { archive as productArchive } from '../src/domain/archive.server.ts';
import { chromium } from 'playwright';
import { scratchInstallation, machineAvailable } from './scratch-installation.mjs';
import { openGate, readCheckoutKey } from './auth-test-support.mjs';
import { until, assertPortFree, devSignIn, smokeDocuments, monitorHydration, descendantGroups, assertGroupsGone } from './installer-support.mjs';
import { definitionsJourney } from './definitions-journey.mjs';
const scratch = await scratchInstallation();
let dev, browser, origin; const groups = new Set();
try {
 // The installed rer: the @runeditrun/rer entry this checkout pins. On the fresh scratch checkout describe, check and install
 // install the pinned package first, and every verb then runs with the scratch's own pinned rer.
 const rer = fileURLToPath(new URL('../node_modules/@runeditrun/rer/global/rer.mjs', import.meta.url));
 const invoke = args => scratch.run('node', [rer, ...args]);
 await invoke(['describe', '--json']);
 await invoke(['check', '--profile', 'first-party']);
 await invoke(['install']);
 const missing = scratch.start('node', [rer, 'setup', '--non-interactive', '--json']);
 try { assert.equal((await missing.done).code, 3); } finally { await scratch.stop(missing); }
 // The owner's website is a private-file answer; it reaches the Worker through the installation's own settings.
 const startSite = 'https://start-site.example.test/';
 await writeFile(join(scratch.root, 'answers.json'), JSON.stringify({ UPTIME_START_URL: startSite }), { mode: 0o600 });
 const setup = await invoke(['setup', '--owner-email', 'journey@example.test', '--owner-name', 'Command Owner', '--non-interactive', '--answers', 'answers.json']);
 origin = setup.match(/RER_SETUP_READY (http:\/\/127\.0\.0\.1:\d+)/)?.[1]; assert.ok(origin);
 await assertPortFree(Number(new URL(origin).port));
 const settingsPath = join(scratch.root, 'data/local-secrets.json'), settings = await readFile(settingsPath);
 assert.equal((await stat(settingsPath)).mode & 0o777, 0o600);
 assert.equal(JSON.parse(settings).UPTIME_START_URL, startSite, 'the website reached the installation settings');
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

 const conflicting = scratch.start('node', [rer, 'setup', '--owner-email', 'another@example.test', '--non-interactive']);
 try { assert.equal((await conflicting.done).code, 4); } finally { await scratch.stop(conflicting); }
 await machineAvailable(); dev = scratch.start('node', [rer, 'dev', '--foreground']);
 // The launcher's separate startup writes can arrive in different output chunks.
 await until(() => {
  assert.equal(dev.exitCode, null);
  return dev.output.includes('RER_READY ' + origin)
   && dev.output.includes('RER_SIGNED_IN journey@example.test')
   && dev.output.includes('RER_OPEN ' + origin + '/__dev/key#rer-dev=');
 });
 // dev opens signed in: the owner it names and the key-carrying link (whose key stays in the fragment).
 assert.ok(dev.output.includes('RER_SIGNED_IN journey@example.test'));
 assert.ok(dev.output.includes('RER_OPEN ' + origin + '/__dev/key#rer-dev='));
 assert.equal((await fetch(origin + '/__dev/outbox')).status, 404, 'the removed development outbox stays absent');
 const client = await fetch(origin + '/@vite/client');
 assert.equal(client.status, 200, 'real Vite asset/HMR support');
 // The client's own imports (Vite 8 names its env module by package-store path) must reach the browser too, or nothing hydrates.
 const imports = [...(await client.text()).matchAll(/^import "(\/[^"]+)";/gm)];
 assert.ok(imports.length > 0, 'the Vite client imports its env module');
 for (const [, specifier] of imports) assert.equal((await fetch(origin + specifier)).status, 200, 'the Vite client import ' + specifier + ' is served');
 const resetActive = scratch.start('node', [rer, 'reset', '--yes', '--non-interactive']);
 try { assert.equal((await resetActive.done).code, 4); } finally { await scratch.stop(resetActive); }
 browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
 const devKey = await readCheckoutKey(scratch.root);
 await openGate(page.context(), origin, devKey);
 await devSignIn(page, origin + '/__dev/key', { displayName: 'Command Owner', OWNER_EMAIL: 'journey@example.test' }, { finishSetup: false, key: devKey });
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
  const unfinishedPage = await page.request.get(origin + '/setup', { maxRedirects: 0 });
  assert.equal(unfinishedPage.status(), 200, 'denied completion left first-run unfinished');
  assert.ok((await unfinishedPage.text()).includes(startSite), 'setup says which site Uptime is checking');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'setup fits the viewport');
  if (setupEvidence) await page.screenshot({ path: join(setupEvidence, `setup-${width}.png`), fullPage: true });
 }
 // The actual first-run form works without JavaScript or hydration.
 const nativeSetup = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() });
 try {
  const p = await nativeSetup.newPage(); await p.goto(origin + '/setup');
  await p.getByRole('button', { name: 'Finish setup', exact: true }).click(); await p.waitForURL(url => url.origin === origin && url.pathname === '/app/monitor' && url.searchParams.has('discovery'));
  const job = await page.request.get(origin + '/api/discoveries/' + new URL(p.url()).searchParams.get('discovery'));
  assert.equal(job.status(), 200); assert.equal((await job.json()).url, startSite, 'finishing setup lands on the discovery of the owner\'s website');
 } finally { await nativeSetup.close(); }
 const finished = await page.request.get(origin + '/setup', { maxRedirects: 0 });
 assert.equal(finished.status(), 303); assert.equal(finished.headers().location, '/app');
 await page.goto(origin + '/app');
 if (setupEvidence) await writeFile(join(setupEvidence, 'RESULTS.json'), JSON.stringify({ widths: [1440, 390], freshRerSetup: true, devReturn: '/setup', unfinishedRoutes: true, unsignedReturn: true, csrfRefused: true, nativeCompletion: true, finishedReturn: '/app' }, null, 2));
 await smokeDocuments(page, origin);
 await monitorHydration(page, origin, scratch.root);
 await definitionsJourney(page, origin);
 const before = await page.request.get(origin + '/api/archive'); assert.equal(before.status(), 200);
 let expected = await before.json();
 for (const group of await descendantGroups(dev.pid)) groups.add(group);
 await scratch.stop(dev); dev = undefined; await assertGroupsGone(groups);
 // The local definitions command: export the current definitions to a new file; its preview is all unchanged.
 await scratch.run('node', ['scripts/definitions.mjs', 'export', '--output', 'exports/uptime.monitors.json']);
 const exportedFile = JSON.parse(await readFile(join(scratch.root, 'exports/uptime.monitors.json'), 'utf8'));
 const exported = JSON.parse((await scratch.run('node', ['scripts/definitions.mjs', 'preview', '--input', 'exports/uptime.monitors.json', '--json'])).split('\n').find(line => line.startsWith('{"kind"')));
 assert.ok(exportedFile.monitors.length >= 6); assert.deepEqual(exported.counts, { create: 0, unchanged: exportedFile.monitors.length, change: 0, refused: 0, unsupported: 0 });
 // Preview serves the fixed production build on the same origin, then stops with its owned processes.
 await machineAvailable(); let preview = scratch.start('node', [rer, 'preview']);
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
 // Establish receiving authority and private settings while product data is empty.
 await invoke(['setup', '--owner-email', 'receiving@example.test', '--non-interactive']);
 await invoke(['import', '--input', 'exports/product.rer', '--yes']);
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
  assert.equal(target.definition_batches.length, 2); assert.ok(target.definition_batches.every(row => row.undone_at !== null && row.restored_at !== null), 'applied-and-undone batches arrive as restored history');
  for (const name of ['monitors', 'slots', 'outbox', 'notification_destinations', 'notification_jobs', 'integration_deliveries']) for (const original of source[name]) {
   const current = target[name].find(row => row.id === original.id);
   if (JSON.stringify(current) !== JSON.stringify(original)) assert.ok(target.archive_history.some(row => row.table_name === name && row.record === JSON.stringify(original)));
  }
 } finally { await native.dispose(); }
 for (const value of Object.values(JSON.parse(settings))) if (typeof value === 'string' && value.length >= 32) assert.ok(!setup.includes(value));
 console.log('COMMAND-JOURNEY passed: explicit owner, teardown, exact rerun, conflicts, foreground Vite/HMR, dev identity/native forms, active reset refusal, private archive, confirmed reset/import/export and retained receipts.');
} finally { await scratch.stop(dev); await browser?.close(); await scratch.close(); }
