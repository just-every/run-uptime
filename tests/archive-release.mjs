// Release-only projected high-bound proof. Ordinary roundtrip coverage stays in test:archive.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { freePort } from '../scripts/local-ports.mjs';
import { startLocalWorker } from '../scripts/local-worker.mjs';
import { restoreBounds } from './archive-restore-bounds.mjs';
const parent = new URL('../../tmp/', import.meta.url).pathname;
await mkdir(parent, { recursive: true });
const dir = await mkdtemp(join(parent, 'archive-release-')), port = await freePort();
const values = { UPTIME_LOCAL_REVIEW:'true', SESSION_SECRET:randomBytes(32).toString('base64url'), SETUP_TOKEN:randomBytes(32).toString('base64url'), UPTIME_RUNNER_KEY:randomBytes(32).toString('base64url'), UPTIME_ORIGIN:`http://127.0.0.1:${port}`, OWNER_EMAIL:'archive-owner@example.test', MAIL_PROVIDER:'development', MAIL_FROM:'auth@localhost.test' };
let worker;
async function migrate(path) {
 const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','uptime-local','--local','--persist-to',path], { stdio:'pipe' });
 let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
 assert.equal(await new Promise(resolve => child.once('exit', resolve)), 0, output);
}
async function installation(path) {
 worker = await startLocalWorker({ persist:path, port, bindings:values, assets:false });
 return { ...values, DB:await worker.getD1Database('DB') };
}
try { await restoreBounds({ dir, migrate, installation, dispose:async () => { await worker?.dispose(); worker = null; } }); }
finally { await worker?.dispose(); await rm(dir, { recursive:true, force:true }); }
