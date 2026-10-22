// PERF-001: one page-speed check, run the way FLOW-001 runs a flow: its own process with a sanitized environment and a lifeline,
// a fresh private browser folder (mode 0700, inside the runner's own flow folder, deleted afterwards), the browser's whole network
// through the filtering proxy, and a process-tree kill at the wall-clock limit. The proxy times each destination's DNS answer and
// TCP connect, since the browser reaches nothing except through it; the browser reports TLS, time to first byte, the waterfall,
// Core Web Vitals and its errors. A runner-side problem (no browser, no grant) is runner_error, which the control plane shows as
// Unknown; a page that never loads is a target failure; otherwise the budgets decide.
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, rm, chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {browserCapability} from '../flow/browser.mjs';
import {startFlowProxy} from '../flow/proxy.mjs';
import {killTree, killFolderHolders} from '../flow/processes.mjs';
import {readGrant} from '../grants.mjs';
import {RUNNER_VERSION} from '../../../src/domain/policy.mjs';
import {PAGESPEED_LIMITS, pageSpeedChecks, validatePageSpeedEvidence} from '../../../src/domain/pagespeed.mjs';

const here = new URL('./child.mjs', import.meta.url).pathname;
const MAX_CHILD_OUTPUT = 256 * 1024;

export async function runPageSpeed(definition, probe, {grantPath, controlPort, workspace, signal, privateAccess} = {}) {
  const startedAt = Date.now();
  const observation = data => { const completedAt = Date.now(); return {id: randomUUID(), probe, startedAt, completedAt, durationMs: completedAt - startedAt, runnerVersion: RUNNER_VERSION, ...data}; };
  const failed = (assertion, reason, outcome) => observation({outcome, checks: [{assertion, pass: false, reason}]});
  const interrupted = () => failed('runner', 'Runner stopped before the attempt completed', 'runner_error');
  if (signal?.aborted) return interrupted();
  const browser = await browserCapability('chromium');
  if (!browser.available) return failed('browser', browser.reason, 'runner_error');
  if (!workspace) return failed('browser', 'This runner has no private flow folder (UPTIME_FLOW_DIR must be a folder this runner owns)', 'runner_error');
  let grant = null;
  if (definition.network === 'synthetic') {
    try { grant = await readGrant(grantPath, controlPort); if (new URL(definition.url).origin !== `http://127.0.0.1:${grant.port}`) throw Error('Grant mismatch'); }
    catch { return failed('grant', 'The local synthetic grant is missing, expired or does not cover this page', 'runner_error'); }
  }
  const proxy = await startFlowProxy({grant, privateAccess: privateAccess ? (url, accessSignal) => privateAccess(url, AbortSignal.any([accessSignal, ...(signal ? [signal] : [])])) : undefined, maxBytes: PAGESPEED_LIMITS.maxBytes});
  let base;
  try { base = await mkdtemp(join(workspace, 'run-')); await chmod(base, 0o700); await mkdir(join(base, 'home'), {mode: 0o700}); }
  catch { await proxy.close(); if (base) await rm(base, {recursive: true, force: true}); return failed('browser', 'The flow folder on this runner could not be prepared', 'runner_error'); }
  const home = join(base, 'home'), wallMs = Math.min(definition.timeoutMs ?? PAGESPEED_LIMITS.wallMs, PAGESPEED_LIMITS.wallMs);
  let child, timer, killedForTime = false, output = '', done, stats;
  const stop = () => { if (child?.pid) void killTree(child.pid); };
  try {
    // The fourth pipe is the child's lifeline: when this process ends, however it ends, the child removes its browser and this folder.
    child = spawn(process.execPath, [here, base], {detached: true, stdio: ['pipe', 'pipe', process.env.UPTIME_FLOW_DEBUG ? 'inherit' : 'ignore', 'pipe'], cwd: home, env: {HOME: process.env.HOME, TMPDIR: home, LANG: 'C.UTF-8', ...(browser.browsersPath ? {PLAYWRIGHT_BROWSERS_PATH: browser.browsersPath} : {})}});
    const exited = new Promise(resolve => child.once('close', resolve));
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > MAX_CHILD_OUTPUT) { killTree(child.pid); return; }
      let i;
      while ((i = output.indexOf('\n')) >= 0) { const line = output.slice(0, i); output = output.slice(i + 1); try { const m = JSON.parse(line); if (m.t === 'done') done = m; } catch {} }
    });
    child.on('error', () => {}); child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({url: definition.url, network: definition.network, settings: definition.pagespeed, home, proxy: {port: proxy.port, username: proxy.username, password: proxy.password}, deadlineMs: wallMs - 3000}));
    signal?.addEventListener('abort', stop, {once: true});
    if (signal?.aborted) stop();
    timer = setTimeout(() => { killedForTime = true; killTree(child.pid); }, wallMs);
    await exited;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
    if (child?.pid) await killTree(child.pid);
    child?.stdio[3]?.destroy();
    await killFolderHolders(base);
    stats = proxy.stats();
    await proxy.close();
    await rm(base, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  }
  if (signal?.aborted) return interrupted();
  if (stats.blocked.some(b => b.class === 'private_grant_refused')) return failed('grant', 'Private network permission was unavailable for a page request; no forbidden destination was contacted', 'runner_error');
  if (done?.launchFailed || (!done && !killedForTime)) return failed('browser', done?.launchFailed ? 'The browser could not be started on this runner' : 'The browser process ended without a result', 'runner_error');
  if (stats.exceeded) return failed('response_limit', `The page transferred more than its ${PAGESPEED_LIMITS.maxBytes / 1048576} MiB limit`, 'target_failure');
  if (!done || done.navigation) return failed(!done || done.navigation === 'timeout' ? 'timeout' : 'connection', !done || done.navigation === 'timeout' ? `The page did not finish loading within ${wallMs / 1000} s` : 'The page could not be loaded', 'target_failure');
  // DNS and connect for the document's own origin, from the proxy; a refused destination is a browser error of the page.
  const start = new URL(definition.url), port = Number(start.port || (start.protocol === 'https:' ? 443 : 80));
  const first = stats.connections.find(c => c.host === start.hostname.replace(/^\[|\]$/g, '') && c.port === port);
  const refused = stats.blocked.filter(b => b.violation).map(b => ({kind: 'request', text: `A request to a forbidden destination was refused (${b.class.replace(/_/g, ' ')})`}));
  const errors = [...done.evidence.errors, ...refused], evidence = {...done.evidence, timings: {...done.evidence.timings, dnsMs: first?.dnsMs ?? null, connectMs: first?.connectMs ?? null},
    errors: errors.slice(0, PAGESPEED_LIMITS.maxErrors), errorCount: done.evidence.errorCount + refused.length};
  try { validatePageSpeedEvidence(evidence, definition); }
  catch (error) { return failed('browser', `The browser reported page-speed facts outside their bounds (${error.message})`.slice(0, 300), 'runner_error'); }
  const checks = pageSpeedChecks(definition, evidence);
  return observation({outcome: checks.every(c => c.pass) ? 'pass' : 'target_failure', checks, pagespeed: evidence});
}
