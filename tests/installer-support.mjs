import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectionMs, readProcessTable } from '../scripts/base-onboarding/process-table.mjs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { openOutboxMessage } from './auth-test-support.mjs';

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
export async function signInThroughOutbox(page, url, owner = answers, { finishSetup = true, key } = {}) {
 await page.goto(url);
 await openOutboxMessage(page, new URL(url).origin, { email: owner.OWNER_EMAIL ?? owner.email, key });
 await page.getByRole('link', { name: 'Open this link', exact: true }).click();
 await page.getByRole('button', { name: 'Confirm', exact: true }).click();
 await page.waitForURL(value=>['/app','/setup'].includes(value.pathname));
 if(finishSetup&&new URL(page.url()).pathname==='/setup'){await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.waitForURL(new URL('/app', url).href);}
 const response = await page.request.get(new URL('/auth/session', url).href);
 assert.equal(response.status(), 200);
 const session = await response.json();
 assert.equal(session.operator.role, 'owner');
 assert.equal(session.operator.email, owner.OWNER_EMAIL ?? owner.email);
 assert.equal(session.operator.displayName, owner.displayName);
 return session;
}
export async function smokeDocuments(page, origin) {
 assert.equal((await page.request.get(origin + '/app')).status(), 200);
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
