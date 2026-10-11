// BASE-SECRET-002: Public emitted Worker door. The envelope only transports HTTPS and configuration
// changes into local workerd; auth, health, assets, cron and D1 are the real build.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions, Log, LogLevel } from 'miniflare';
import { requiredConfiguration } from '../src/domain/startup-config.mjs';
import { splitSql } from './migration-support.mjs';
const temporary = await mkdtemp(join(tmpdir(), 'uptime-startup-'));
const emitted = resolve('dist/server'), config = JSON.parse(await readFile(join(emitted, 'wrangler.json'), 'utf8'));
const sentinel = 'startup-private-sentinel';
const bindings = { UPTIME_ORIGIN: 'https://startup.example.test', OWNER_EMAIL: 'owner@example.test',
 SESSION_SECRET: `${sentinel}-session-0123456789`, SETUP_TOKEN: `${sentinel}-setup-0123456789`,
 UPTIME_RUNNER_KEY: `${sentinel}-runner-0123456789`, MAIL_FROM: 'sender@example.test', SENDGRID_API_KEY: `${sentinel}-mail` };
const wrapper = join(temporary, 'envelope.mjs');
await writeFile(wrapper, `import app from ${JSON.stringify(relative(dirname(wrapper), join(emitted, config.main)))};
export default {async fetch(request,env,ctx){const input=await request.json();const settings={...env,...input.settings};if(input.remove)delete settings[input.remove];if(input.cron){try{await app.scheduled({},settings,ctx);return new Response('scheduled')}catch(error){return new Response(error.message,{status:503})}}return app.fetch(new Request(input.url,{headers:{'cf-connecting-ip':'192.0.2.1'}}),settings,ctx)}};`);
const captured = [];
class CapturedLog extends Log { log(message) { captured.push(String(message)); } }
let worker;
try {
 worker = new Miniflare(convertV4MiniflareOptions({ scriptPath: wrapper, modulesRoot: parse(emitted).root,
  modules: [{ type: 'ESModule', path: wrapper }, { type: 'ESModule', path: join(emitted, config.main) }, ...(await readdir(join(emitted, 'assets'))).filter(name => name.endsWith('.js')).map(name => ({ type: 'ESModule', path: join(emitted, 'assets', name) }))],
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
  host: '127.0.0.1', port: 0, bindings, d1Databases: { DB: 'startup' }, log: new CapturedLog(LogLevel.DEBUG),
  assets: { directory: resolve(emitted, config.assets.directory), binding: 'ASSETS', routerConfig: { has_user_worker: true }, run_worker_first: true },
  outboundService: () => { throw Error('Startup checks prohibit outbound requests'); }, unsafeLocalExplorer: false, unsafeObservability: false,
 }));
 await worker.ready;
 const DB = await worker.getD1Database('DB');
 for (const name of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) for (const sql of splitSql(await readFile(join('migrations', name), 'utf8'))) await DB.prepare(sql).run();
 const call = input => worker.dispatchFetch('http://localhost/', { method: 'POST', body: JSON.stringify(input) });
 for (const mode of ['hosted', 'local']) {
  const settings = mode === 'local' ? { UPTIME_LOCAL_REVIEW: 'true', UPTIME_ORIGIN: 'http://127.0.0.1:8787', MAIL_PROVIDER: 'development' } : {};
  const complete = { ...bindings, ...settings };
  assert.equal((await call({ settings, url: complete.UPTIME_ORIGIN + '/health' })).status, 200, `${mode} complete health`);
  for (const { name } of requiredConfiguration(complete)) {
   for (const path of ['/health', '/app.js', '/auth/session', '/__dev/key']) {
    const response = await call({ settings, remove: name, url: complete.UPTIME_ORIGIN + path });
    assert.equal(response.status, 503, `${mode} ${name} ${path}`);
    const body = await response.text(); assert.ok(body.includes(name)); assert.ok(!body.includes(sentinel));
   }
   const scheduled = await call({ settings, remove: name, cron: true });
   assert.equal(scheduled.status, 503); assert.ok((await scheduled.text()).includes(name));
   const malformed = await call({ settings: { ...settings, [name]: sentinel + '\n' }, url: complete.UPTIME_ORIGIN + '/health' });
   assert.equal(malformed.status, 503); const body = await malformed.text(); assert.ok(body.includes(name)); assert.ok(!body.includes(sentinel));
   console.log(`PASS ${mode} ${name}: missing routes/cron and malformed health 503; names only`);
  }
 }
 assert.ok(captured.every(line => !line.includes(sentinel)), 'runtime logs contain no malformed value or credential sentinel');
 console.log('BASE-SECRET-002 STARTUP-CONFIG passed: complete health 200; every required binding fails closed; logs retain no sentinel');
} finally { await worker?.dispose(); await rm(temporary, { recursive: true, force: true }); }
