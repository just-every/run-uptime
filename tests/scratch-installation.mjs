import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, realpath, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { loadavg, tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createCommands } from '@runeditrun/rer/commands';
import { inspectionMs, readProcessTable } from '@runeditrun/rer/internal/onboarding/process-table.mjs';
import { servingLoadThreshold } from '@runeditrun/rer/server-resources';

export const repository = fileURLToPath(new URL('../', import.meta.url));
// rer dev and preview start only at or below the serving load threshold; wait for it as an owner would.
export async function machineAvailable(timeout = 20 * 60_000) {
 const threshold = servingLoadThreshold(), end = Date.now() + timeout;
 while (loadavg()[0] > threshold) { assert.ok(Date.now() < end, `machine load stayed above ${threshold}`); await delay(5000); }
}
const excluded = new Set(['.git', 'node_modules', 'dist', 'data', '.seed', '.rer', '.wrangler', '.dev.vars', '.dev.vars.previous', 'test-results', 'playwright-report', '.exports', 'exports', '.rer-tools', 'delivery-artifact', 'rer-package']);
// Copy the current candidate bytes and isolate the installation.
export async function scratchInstallation({ mirror = false } = {}) {
 const directory = await realpath(await mkdtemp(join(tmpdir(), 'uptime-local-journey-')));
 const root = join(directory, mirror ? 'mirror' : 'uptime');
 const temporary = join(directory, 'temporary');
 await mkdir(temporary, { mode: 0o700 });
 const env = { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', RER_SERVER_JOURNEY: '1', TMPDIR: temporary, TMP: temporary, TEMP: temporary,
  npm_config_child_concurrency: '1', npm_config_network_concurrency: '2', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(temporary, 'wrangler.log'),
  ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH } : {}) };
 // Clean installer commands still need the host's network proxy and CA trust.
 // These standard transport settings carry no product/provider credential authority.
 for(const name of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'])if(process.env[name]!==undefined)env[name]=process.env[name];
 const children = new Set();
 const commands = await createCommands(temporary, { logs: [] }, { terminal: () => {} });
 function start(command, args, { cwd = root, environment = {}, stdio = ['ignore', 'pipe', 'pipe'] } = {}) {
  const options = { cwd, env: { ...env, ...environment }, detached: true, stdio };
  // A finite README block uses fd 3 to retain its literal `cd`. Both launch
  // forms use the same rer command custody and cancellation.
  const child = stdio.length > 3
   ? spawn('nice', ['-n', '15', command, ...args], options)
   : commands.spawn('Scratch command', 'nice', ['-n', '15', command, ...args], options);
  if (stdio.length > 3) commands.track('Scratch command', child);
  children.add(child); child.output = '';
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', data => { child.output += data; });
  child.done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  // Long-running commands can fail before a caller starts awaiting their exit.
  child.done.catch(() => {});
  return child;
 }
 async function stop(child) {
  if (!child) return;
  await commands.stop(child);
  assert.equal((await readProcessTable(inspectionMs, child.pid)).length, 0, 'scratch command left an owned process group');
  children.delete(child);
 }
 async function run(command, args, options) {
  const child = start(command, args, options);
  try { const result = await child.done;
   if(result.code!==0){
    // Retain the cause after cleanup without exposing this installation's
    // generated credentials or a newly issued session in an assertion.
    const settings=await readFile(join(root,'data/local-secrets.json'),'utf8').then(JSON.parse).catch(()=>({}));
    let diagnostic=child.output;
    for(const value of [...Object.values(settings),env.UPTIME_ACCESS_COOKIE])if(typeof value==='string'&&value)diagnostic=diagnostic.replaceAll(value,'[private]');
    diagnostic=diagnostic.replace(/\b[A-Za-z0-9_-]{24,}\b/g,'[private]');
    assert.equal(result.code,0,'scratch command failed: '+diagnostic.slice(-2400));
   }
   return child.output;
  }
  finally { await stop(child); }
 }
 async function close() {
  const failures = [];
  for (const child of children) try { await stop(child); } catch (error) { failures.push(error); }
  try { await commands.closeCommands(); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, 'scratch process cleanup failed');
  await rm(directory, { recursive: true, force: true });
 }
 try {
  await cp(repository, root, { recursive: true, filter: path => !excluded.has(basename(path)) });
  if (mirror) {
   await run('git', ['init', '--initial-branch=main']);
   await run('git', ['add', '.']);
   await run('git', ['-c', 'user.name=Uptime local proof', '-c', 'user.email=proof@example.test', 'commit', '-m', 'Candidate working-copy snapshot']);
  }
  return { directory, root, env, start, run, stop, close };
 } catch (error) { await close(); throw error; }
}
