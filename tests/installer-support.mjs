import {completeBrowserSecondFactor} from './mfa-auth-support.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectionMs, readProcessTable } from '@runeditrun/rer/internal/onboarding/process-table.mjs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import {openGate} from './auth-test-support.mjs';

export const answers = { displayName: 'Installer Owner', OWNER_EMAIL: 'installer-owner@example.test' };
export async function until(observe, timeout = 20 * 60_000) {
 const end = Date.now() + timeout;
 while (Date.now() < end) { const value = await observe(); if (value) return value; await delay(250); }
 assert.fail('local journey did not reach its required state');
}
export async function assertPortFree(port) {
 const free = await new Promise(resolve => { const socket = createServer(); socket.once('error', () => resolve(false)); socket.listen(port, '127.0.0.1', () => socket.close(() => resolve(true))); });
 assert.equal(free, true, 'journey-owned port remains occupied');
}
export async function devSignIn(page, url, owner = answers, { finishSetup = true, key } = {}) {
 const origin=new URL(url).origin;
 await openGate(page.context(),origin,key);
 await page.goto(origin+'/auth/dev/enter?as=owner&returnTo=%2Fsetup');
 await completeBrowserSecondFactor(page,origin);await page.goto(origin+'/setup');
 await page.waitForURL(value=>['/app/monitors','/app/monitors/new','/setup'].includes(value.pathname));
 if(finishSetup&&new URL(page.url()).pathname==='/setup'){await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(value=>value.pathname.startsWith('/app'));}
 const response = await page.request.get(new URL('/auth/session', url).href);
 assert.equal(response.status(), 200);
 const session = await response.json();
 assert.equal(session.operator.role, 'owner');
 assert.equal(session.operator.email, owner.OWNER_EMAIL ?? owner.email);
 assert.equal(session.operator.displayName, owner.displayName);
 return session;
}
export async function smokeDocuments(page, origin) {
 assert.equal((await page.request.get(origin + '/app/monitors')).status(), 200);
 assert.equal((await page.request.get(origin + '/login')).status(), 200);
 assert.equal((await page.request.get(origin + '/journey-missing-document')).status(), 404);
 const unsigned = await page.context().browser().newContext();
 try {
  assert.equal((await unsigned.request.get(origin + '/login')).status(), 200);
  assert.equal((await unsigned.request.get(origin + '/')).status(), 200, 'public landing needs no session');
  assert.equal((await unsigned.request.get(origin + '/app', { maxRedirects: 0 })).status(), 303, 'console needs an owner session');
  assert.equal((await unsigned.request.get(origin + '/journey-missing-document')).status(), 404);
 } finally { await unsigned.close(); }
}

// Public-page hydration checks cannot reach this owner-only document. Exercise
// its real dev module graph and the form that hydration makes interactive.
export async function monitorHydration(ownerPage, origin, root) {
 const context = await ownerPage.context().browser().newContext({ storageState: await ownerPage.context().storageState() });
 const page = await context.newPage();
 const evidence = process.env.UPTIME_HYDRATION_EVIDENCE;
 if (evidence) await mkdir(evidence, { recursive: true });
 const errors = [], failed = [], cancellations = [], rows = [];
 const consoleError = message => { if (message.type() === 'error') errors.push(message.text()); };
 const pageError = error => errors.push(error.message);
 const badResponse = response => { if (response.status() >= 400) failed.push({ path: new URL(response.url()).pathname, status: response.status() }); };
 const failedRequest = request => {
  const item = { path: new URL(request.url()).pathname, error: request.failure()?.errorText };
  // Navigation and development StrictMode cleanup deliberately abort requests.
  // Keep that evidence separate; HTTP failures and every other failure fail.
  (item.error === 'net::ERR_ABORTED' ? cancellations : failed).push(item);
 };
 page.on('console', consoleError); page.on('pageerror', pageError); page.on('response', badResponse); page.on('requestfailed', failedRequest);
 try {
  const grant = JSON.parse(await readFile(join(root, '.wrangler/state/synthetic-grant.json'), 'utf8'));
  const target = `http://127.0.0.1:${grant.port}/health`;
  for (const width of [1440, 390]) {
   const name = `Hydration monitor ${width}`;
   await page.setViewportSize({ width, height: 900 });
   await page.goto(origin + '/app/monitors/new');
   assert.equal(new URL(page.url()).pathname, '/app/monitors/new', 'hydration proof must reach the authenticated editor');
   await page.getByLabel('Website URL', { exact: true }).fill(target);
   await page.waitForLoadState('networkidle');
   assert.equal(await page.evaluate(() => window.__rerHydration?.count ?? 0), 0, 'discovery has no recovered hydration mismatch');
   if (evidence) await page.screenshot({ path: join(evidence, `discovery-${width}.png`), fullPage: true });
   await page.getByRole('button', { name: 'Fill in the form yourself', exact: true }).click();
   await page.getByLabel('Monitor name', { exact: true }).fill(name);
   assert.equal(await page.getByLabel('Target URL', { exact: true }).inputValue(), target, 'discovery address reaches manual form');
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'manual form fits the viewport');
   if (evidence) await page.screenshot({ path: join(evidence, `manual-${width}.png`), fullPage: true });
   const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/monitors' && response.request().method() === 'POST');
   await page.getByRole('button', { name: 'Save monitor', exact: true }).click();
   const response = await saved; assert.equal(response.status(), 201, 'the UI saves through the real API');
   await page.waitForURL(/\/app\/monitors\/[^/]+$/);
   await page.getByRole('heading', { name, exact: true }).waitFor();
   await page.waitForLoadState('networkidle');
   const savedOverview = await page.request.get(origin + '/api/overview'); assert.equal(savedOverview.status(), 200);
   const monitor = (await savedOverview.json()).monitors.find(row => row.definition.name === name);
   assert.ok(monitor, 'the UI-created monitor is durably readable');
   await page.goto(origin + '/app/monitors/' + encodeURIComponent(monitor.id) + '/edit');
   await page.waitForFunction(() => document.documentElement.classList.contains('editor-ready'));
   await page.waitForLoadState('networkidle');
   assert.equal(await page.getByLabel('Monitor name', { exact: true }).inputValue(), name, 'saved name survives a fresh document load');
   assert.equal(await page.getByLabel('Target URL', { exact: true }).inputValue(), target, 'saved target survives a fresh document load');
   const overview = await page.request.get(origin + '/api/overview'); assert.equal(overview.status(), 200);
   const persisted = (await overview.json()).monitors.find(row => row.id === monitor.id);
   assert.equal(persisted.definition.name, name); assert.equal(persisted.definition.url, target);
   assert.equal(await page.evaluate(() => window.__rerHydration?.count ?? 0), 0, 'editor has no recovered hydration mismatch');
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'saved form fits the viewport');
   if (evidence) await page.screenshot({ path: join(evidence, `persisted-${width}.png`), fullPage: true });
   rows.push({ width, discovery: true, manual: true, saved: response.status(), persisted: true });
  }
  assert.deepEqual(errors, [], 'authenticated monitor journey has no console/page errors');
  assert.deepEqual(failed, [], 'authenticated monitor journey has no failed client requests');
  if (evidence) await writeFile(join(evidence, 'result.json'), JSON.stringify({ path: '/app/monitors/new', rows, errors, failed, cancellations }, null, 2));
  console.log('HYDRATION /app/monitors/new PASS: authenticated discovery/manual forms, UI save and reload persistence at 1440/390; zero console/page errors and failed client loads; navigation/effect cancellations recorded separately.');
 } catch (error) {
  if (evidence) await writeFile(join(evidence, 'failure.json'), JSON.stringify({ path: '/app/monitors/new', rows, errors, failed, cancellations }, null, 2));
  throw error;
 } finally {
  page.off('console', consoleError); page.off('pageerror', pageError); page.off('response', badResponse); page.off('requestfailed', failedRequest);
  await context.close();
 }
}

// Numeric metadata only: never inspect command lines, which may contain secrets.
// The native launcher gives each Worker/runner its own process group.
export async function descendantGroups(pid) {
 const { stdout } = await promisify(execFile)('/bin/ps', ['-ax', '-o', 'pid=', '-o', 'ppid=', '-o', 'pgid='], { timeout: 5000 });
 const rows = stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
 assert.ok(rows.every(row => row.length === 3 && row.every(Number.isSafeInteger)), 'could not read numeric process custody');
 const descendants = new Set([pid]);
 let changed;
 do { changed = false; for (const [id, parent] of rows) if (descendants.has(parent) && !descendants.has(id)) { descendants.add(id); changed = true; } } while (changed);
 return new Set(rows.filter(([id]) => descendants.has(id)).map(([, , group]) => group));
}
export async function assertGroupsGone(groups) {
 for (const group of groups) assert.equal((await readProcessTable(inspectionMs, group)).length, 0, 'journey left an owned descendant process group');
}
