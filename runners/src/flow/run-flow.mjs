// Runs one flow in its own process, the way the brief for FLOW-001 requires: a fresh private context and browser temporary directory (mode 0700, inside
// the runner's own flow folder, deleted afterwards), a sanitized environment, one flow at a time (the runner awaits this), the
// browser's whole network through the filtering proxy, and a process-tree kill at the wall-clock limit. Returns an observation in the
// evidence format; it never throws for a failing flow, and it reports a runner-side problem (no browser, missing credential) as
// runner_error, which the control plane shows as Unknown, never as a pass or a failure. No credential value leaves this function:
// every URL, expectation and reason it returns has each named value replaced, in whatever encoding the site gave it.
import {demoMode} from '../demo-policy.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, rm, chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {browserCapability} from './browser.mjs';
import {readFlowSecret, credentialRedactor} from './secrets.mjs';
import {startFlowProxy} from './proxy.mjs';
import {killTree, killFolderHolders} from './processes.mjs';
import {FLOW_LIMITS, describeExpectation, flowDigest, plainUrl} from '../../../src/domain/flow.mjs';
import {RUNNER_VERSION} from '../../../src/domain/policy.mjs';
import {CredentialBindingRequired} from '../credential-diagnostic.mjs';
import {readGrant} from '../grants.mjs';
import {flowProfile} from '../../../src/domain/flow-profile.mjs';

const here = new URL('./child.mjs', import.meta.url).pathname;
const MAX_CHILD_OUTPUT = 256 * 1024;

const reasonText = (failure, flow, wallMs) => {
  const at = failure.step !== undefined ? `Step ${failure.step + 1}` : 'The run';
  const named = failure.step !== undefined && failure.step < flow.steps.length ? flow.steps[failure.step] : flow.outcomes[failure.step - flow.steps.length];
  const what = named?.what ? ` (${describeExpectation(named)})` : named?.kind ? ` (${named.kind})` : '';
  switch (failure.reason) {
    case 'expectation_not_met': return `${at}${what} did not see what the flow expects`;
    case 'element_missing': return `${at}${what} found no matching element on the page`;
    case 'outcome_missing': return `Required outcome${what ? what : ''} was not observed`;
    case 'http_status': return `${at}: the page answered HTTP ${failure.status ?? 'error'}`;
    case 'wall_time_exceeded': return `The flow ran past its ${wallMs / 1000} s time limit (wallMs)`;
    case 'steps_limit': case 'pages_limit': case 'bytes_limit': case 'trace_limit': return `The flow exceeded its ${failure.limit} limit`;
    case 'blocked_request': return `${at}: the page tried to reach a forbidden network address (${failure.blocked?.replace(/_/g, ' ') ?? 'blocked'}); nothing was fetched`;
    case 'undeclared_origin': return `${at}: the page tried to leave the origins the flow declares`;
    case 'extra_page': return `${at}: the page tried to open a second window`;
    case 'navigation_timeout': return `${at}: the page did not finish loading within the bounded step timeout`;
    case 'navigation_failed': return `${at}: the page could not be loaded`;
    case 'credential_origin_mismatch': return `${at}: the named credential is bound to a different origin than the page`;
    default: return `The flow failed (${failure.reason})`;
  }
};

export async function runFlow(definition, probe, {grantPath, controlPort, workspace, credentialDir = process.env.UPTIME_CREDENTIAL_DIR, capability, monitorId, signal, privateAccess} = {}) {
  const startedAt = Date.now(), flow = definition.flow, profile = flowProfile(flow);
  const observation = data => ({id: randomUUID(), probe, startedAt, completedAt: Date.now(), durationMs: 0, runnerVersion: RUNNER_VERSION, ...data});
  const finish = o => ({...o, durationMs: o.completedAt - o.startedAt});
  const runnerError = (assertion, reason) => finish(observation({outcome: 'runner_error', checks: [{assertion, pass: false, reason}]}));
  const interrupted = () => runnerError('runner', 'Runner stopped before the attempt completed');
  if (signal?.aborted) return interrupted();
  const browser = capability ?? await browserCapability(profile.browser);
  if (signal?.aborted) return interrupted();
  if (!browser.available) return runnerError('browser', browser.reason);
  if (!workspace) return runnerError('browser', 'This runner has no private flow folder (UPTIME_FLOW_DIR must be a folder this runner owns)');
  let grant = null;
  if (definition.network === 'synthetic') {
    try {
      grant = await readGrant(grantPath, controlPort);
      const origin = new URL(definition.url).origin;
      if (origin !== `http://127.0.0.1:${grant.port}`) throw Error('Grant mismatch');
    } catch { return runnerError('grant', 'The local synthetic grant is missing, expired or does not cover this flow'); }
  }
  const credentials = {};
  try { for (const ref of new Set(flow.steps.filter(s => s.kind === 'fill').map(s => s.credentialRef))) credentials[ref] = await readFlowSecret(ref, credentialDir, monitorId); }
  catch (error) { if (error instanceof CredentialBindingRequired) return {...runnerError('credential', error.message), credentialBinding: error.diagnostic}; return runnerError('credential', 'A credential this flow names is missing or invalid on this runner'); }

  if (signal?.aborted) return interrupted();
  const deadlineMs = Math.min(definition.timeoutMs ?? FLOW_LIMITS.wallMs, FLOW_LIMITS.wallMs);
  // The proxy starts first, so the run folder exists for as short a time as possible before the process that cleans it up does.
  const proxy = await startFlowProxy({grant,privateAccess:privateAccess?(url,accessSignal)=>privateAccess(url,AbortSignal.any([accessSignal,...(signal?[signal]:[])])):undefined, maxBytes: FLOW_LIMITS.maxBytes});
  let base;
  try { base = await mkdtemp(join(workspace, 'run-')); await chmod(base, 0o700); await mkdir(join(base, 'home'), {mode: 0o700}); }
  catch { await proxy.close(); if (base) await rm(base, {recursive: true, force: true}); return runnerError('browser', 'The flow folder on this runner could not be prepared'); }
  const home = join(base, 'home');
  let child, timer, killedForTime = false, output = '', tooMuch = false, stats;
  const entries = [], arrivals = [];
  let done;
  const stop = () => { if (child?.pid) void killTree(child.pid); };
  try {
    // The fourth pipe is the child's lifeline: it closes only when this process ends, however it ends, and the child then removes
    // its browser and this run's folder itself.
    child = spawn(process.execPath, [here, base], {detached: true, stdio: ['pipe', 'pipe', process.env.UPTIME_FLOW_DEBUG ? 'inherit' : 'ignore', 'pipe'], cwd: home, env: {HOME: process.env.HOME, TMPDIR: home, LANG: 'C.UTF-8', ...(browser.browsersPath ? {PLAYWRIGHT_BROWSERS_PATH: browser.browsersPath} : {})}});
    const exited = new Promise(resolve => child.once('close', resolve));
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > MAX_CHILD_OUTPUT) { tooMuch = true; killTree(child.pid); return; }
      let i;
      while ((i = output.indexOf('\n')) >= 0) {
        const line = output.slice(0, i); output = output.slice(i + 1);
        try { const m = JSON.parse(line); if (m.t === 'entry') { entries.push(m.entry); arrivals.push(Date.now()); } else if (m.t === 'done') done = m; } catch {}
      }
    });
    child.on('error', () => {});
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({demo:demoMode(),network:definition.network,flow, profile, url: definition.url, home, proxy: {port: proxy.port, username: proxy.username, password: proxy.password}, credentials, deadlineMs: deadlineMs - 3000, maxPages: FLOW_LIMITS.maxPages}));
    signal?.addEventListener('abort', stop, {once: true});
    if (signal?.aborted) stop();
    timer = setTimeout(() => { killedForTime = true; killTree(child.pid); }, deadlineMs);
    await exited;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
    if (child?.pid) await killTree(child.pid);
    child?.stdio[3]?.destroy();
    // A browser whose child process was killed outright is no longer below it, but still names its profile in this folder.
    await killFolderHolders(base);
    stats = proxy.stats();
    await proxy.close();
    await rm(base, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  }
  if (signal?.aborted) return interrupted();
  if(stats.blocked.some(b=>b.class==='private_grant_refused'))return runnerError('grant','Private network permission was unavailable for a page request; no forbidden destination was contacted');
  const completedAt = Date.now();
  if (tooMuch || (!done && !killedForTime) || done?.launchFailed || done?.crashed) return runnerError('browser', done?.launchFailed ? 'The browser could not be started on this runner' : 'The browser process ended without a result');
  // Reasons and the step they belong to, in the order of authority: the clock, the byte limit, what the proxy refused, then the page.
  let failure = done?.failure ?? undefined;
  const stepAt = at => Math.min(arrivals.filter(a => a <= at).length, flow.steps.length + flow.outcomes.length - 1);
  const violation = stats.blocked.find(b => b.violation);
  if (violation && !(failure && ['undeclared_origin', 'extra_page'].includes(failure.reason))) failure = {step: stepAt(violation.at), reason: 'blocked_request', blocked: violation.class};
  if (stats.exceeded) failure = {step: failure?.step ?? stepAt(completedAt), reason: 'bytes_limit', limit: 'maxBytes'};
  if (killedForTime || done?.failure?.reason === 'wall_time_exceeded') failure = {step: failure?.reason === 'wall_time_exceeded' ? failure.step : stepAt(completedAt), reason: 'wall_time_exceeded', limit: 'wallMs'};
  // The step a failure belongs to shows that failure's reason, whichever way the page first showed it.
  const redact = credentialRedactor(credentials), text = value => redact(value, 300);
  const trace = entries.map(e => ({...e, ...(e.url !== undefined ? {url: text(e.url)} : {}), ...(e.expect !== undefined ? {expect: text(e.expect)} : {})}))
    .map(e => failure && failure.step === e.i ? {...e, outcome: 'fail', reason: failure.reason} : e);
  if (failure && !trace.some(e => e.i === failure.step) && failure.step < flow.steps.length + flow.outcomes.length) trace.push({i: failure.step, kind: failure.step < flow.steps.length ? flow.steps[failure.step].kind : 'outcome', outcome: 'fail', ms: 0, reason: failure.reason});
  trace.sort((a, b) => a.i - b.i);
  const outcomes = flow.outcomes.map(o => ({id: o.id, observed: !failure && Boolean(done?.outcomes?.find(x => x.id === o.id)?.observed)}));
  const passed = !failure && outcomes.every(o => o.observed) && trace.every(e => e.outcome !== 'fail');
  if (!passed && !failure) failure = {step: trace.find(e => e.outcome === 'fail')?.i, reason: 'outcome_missing'};
  let result = {digest: await flowDigest(flow), profile, trace, outcomes, ...(failure ? {failure: Object.fromEntries(Object.entries(failure).filter(([, v]) => v !== undefined))} : {}), finalUrl: text(done?.finalUrl ?? plainUrl(definition.url)), pages: Math.min(done?.pages ?? 0, FLOW_LIMITS.maxPages + 1), bytes: stats.bytes};
  if (JSON.stringify(result).length > FLOW_LIMITS.traceBytes) {
    // Over the cap: keep the first entries and fail naming the limit; the trace never grows past its bound.
    result = {...result, trace: result.trace.slice(0, 10).map(({expect, ...e}) => e), failure: {reason: 'trace_limit', limit: 'traceBytes', ...(failure?.step !== undefined ? {step: failure.step} : {})}};
  }
  const ok = !result.failure && passed;
  const reason = ok ? `All ${flow.steps.length} steps passed and ${flow.outcomes.length} required outcome${flow.outcomes.length === 1 ? ' was' : 's were'} observed` : redact(reasonText(result.failure, flow, deadlineMs), 290);
  return finish(observation({completedAt, outcome: ok ? 'pass' : 'target_failure', checks: [{assertion: 'flow', pass: ok, reason}], flow: result}));
}
