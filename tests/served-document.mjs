import {testAuthBindings,signInOwner} from './auth-test-support.mjs';
import {migratedWorker} from './notify-acceptance-runtime.mjs';
import assert from 'node:assert/strict';
import {readFile, access, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Serve the emitted Worker with its real asset precedence, without a browser,
// target probes or monitor-data mutation. Bootstrap authenticates the document.
for (const path of ['public/index.html', 'dist/client/index.html']) {
  await assert.rejects(access(path), {code: 'ENOENT'}, `${path} must not shadow Start's root route`);
}
const persist=await mkdtemp(join(tmpdir(), 'uptime-served-document-'));
const {worker} = await migratedWorker({port:15519,persist,bindings:testAuthBindings});
try {
  const cookie=await signInOwner('http://127.0.0.1:15519',{finishFirstRun:true});
  const response = await worker.dispatchFetch('http://127.0.0.1:15519/app',{headers:{host:'127.0.0.1:15519',cookie}});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /class="app"/);
  assert.doesNotMatch(html, /id="access-form"|id="owner-token"/);
  assert.match(html, /<script[^>]*type="module"[^>]*src="\/app.js"/);
  const appScripts = html.match(/<script[^>]*src="\/app.js"[^>]*>/g) ?? [];
  assert.equal(appScripts.length, 1);
  assert.match(appScripts[0], /type="module"/);
  const app = await worker.dispatchFetch('http://127.0.0.1:15519/app.js');
  assert.equal(app.status, 200);
  assert.equal(await app.text(), await readFile('public/app.js', 'utf8'));
  for(const path of ['/notification-dialogs.js','/editor-units.mjs']){const asset=await worker.dispatchFetch('http://127.0.0.1:15519'+path);assert.equal(asset.status,200);assert.equal(await asset.text(),await readFile('public'+path,'utf8'));}
  const helper = await worker.dispatchFetch('http://127.0.0.1:15519/action-feedback.mjs');
  assert.equal(helper.status, 200);
  console.log('SERVED-DOCUMENT-001 passed: Start root, single module controller and served import dependency; authenticated native document; no browser proof.');
} finally { await worker.dispose();await rm(persist,{recursive:true,force:true}); }
