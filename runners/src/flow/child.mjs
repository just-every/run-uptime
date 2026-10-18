// The browser process of one flow run. Started by run-flow.mjs with the run's folder as its argument, the signed-in account HOME and a private temporary directory, a sanitized environment, and the job on stdin (the flow, the credentials its fill steps name, the filtering proxy to use). It
// reports one JSON line per finished step and a last line with the result, and exits. It evaluates nothing the flow's author wrote:
// every step is one fixed Playwright call chosen by the step's kind. When the runner ends without ending this process (SIGKILL, a
// crash), at any moment from this process's start, its lifeline pipe closes and this process ends the browser and removes the run's
// folder, profile and session included, before it exits.
import net from 'node:net';
import {effectSuccess} from '../../../src/base/modules/demo/responses.mjs';
import {rm} from 'node:fs/promises';
import {descendants, killFolderHolders} from './processes.mjs';

const base = process.argv[2];
let context, browser, abandoned = false;
const lifeline = new net.Socket({fd: 3, readable: true, writable: false});
lifeline.on('error', () => {});
lifeline.once('close', async () => {
  abandoned = true;
  setTimeout(() => process.exit(0), 10000).unref();
  await Promise.race([browser?.close().catch(() => {}), new Promise(r => setTimeout(r, 2000))]);
  for (const pid of (await descendants(process.pid)).reverse()) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  await killFolderHolders(base);
  await rm(base, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}).catch(() => {});
  process.exit(0);
});
lifeline.resume();
// Once the lifeline has closed, only its cleanup ends this process. Killing the browser makes whatever the run was doing fail (a
// launch still starting, a page call, a top-level await), and that failure must not end the process before the run's folder is removed.
process.on('uncaughtException', error => { if (abandoned) return; process.stderr.write(`${error?.stack ?? error}\n`); process.exit(1); });
// A runner that is gone closes the read end of stdout; a write then fails, and must not end this process before its cleanup.
process.stdout.on('error', () => {});

const engines = await import('playwright');
const {flowLaunchOptions, disableDirectTransports} = await import('./launch.mjs');
const {describeExpectation, plainUrl, FLOW_LIMITS} = await import('../../../src/domain/flow.mjs');
const {credentialRedactor} = await import('./secrets.mjs');
const read = async () => { const chunks = []; for await (const c of process.stdin) chunks.push(c); return JSON.parse(Buffer.concat(chunks).toString('utf8')); };
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
// A job cut short means the runner died while handing it over: the lifeline's cleanup ends this process.
const job = await read().catch(() => null);
if (!job) { setTimeout(() => { if (!abandoned) process.exit(1); }, 1000); await new Promise(() => {}); }
const {flow, profile, url: startUrl, proxy, credentials, deadlineMs, maxPages, home} = job;
const origins = new Set(flow.origins);
// The page's URL as this process reports it: without query or fragment, every credential value removed, and only then cut.
const redact = credentialRedactor(credentials), shownUrl = () => redact(plainUrl(page.url()), 300);
const started = Date.now(), remaining = () => deadlineMs - (Date.now() - started);
let failure, pages = 0, step = 0, current = null;
const fail = (reason, extra = {}) => { failure ??= {step, reason, ...extra}; };
const sleepless = ms => Math.max(500, Math.min(ms, 10000, remaining()));

const target = (page, t) => t.css !== undefined ? page.locator(`css=${t.css}`) : t.text !== undefined ? page.getByText(t.text) : t.label !== undefined ? page.getByLabel(t.label) : page.getByRole(t.role, {name: t.name});
const urlMatches = (page, value, match) => { try { const p = new URL(page.url()).pathname; return match === 'prefix' ? p.startsWith(value) : p === value; } catch { return false; } };

try {
  browser = await engines[profile.browser].launch(flowLaunchOptions(profile.browser, {home, proxy}));
  context = await browser.newContext({acceptDownloads:false,serviceWorkers:'block',ignoreHTTPSErrors:false,
    viewport:profile.viewport,deviceScaleFactor:profile.device==='mobile'?3:1,hasTouch:profile.device==='mobile',
    ...(profile.browser!=='firefox'?{isMobile:profile.device==='mobile'}:{}),locale:'en-US',timezoneId:'UTC'});
  await context.addInitScript(disableDirectTransports);
} catch { await browser?.close().catch(()=>{}); if (abandoned) await new Promise(() => {}); emit({t: 'done', launchFailed: true}); process.exit(0); }

const page = context.pages()[0] ?? await context.newPage();
// A second page (a popup or window.open) is a second origin the flow did not declare.
context.on('page', p => { if (p !== page) { fail('extra_page'); p.close().catch(() => {}); } });
page.on('dialog', d => d.dismiss().catch(() => {}));
// A request whose frame does not exist yet belongs to a window the flow did not open.
const mainNavigation = q => { if (!q.isNavigationRequest()) return false; try { return q.frame() === page.mainFrame(); } catch { return null; } };
let proxyChallengePending=false;
// Firefox exposes the proxy challenge before retrying with its bound credential.
// Only a later navigation response clears it; an unresolved challenge is Unknown.
page.on('response', r => {const q=r.request();if(mainNavigation(q)!==true)return;
 if(r.status()===407&&r.headers()['proxy-authenticate']==='Basic realm=\"flow\"'){proxyChallengePending=true;return}
 proxyChallengePending=false;if(r.status()>=400)fail('http_status',{status:r.status()});
});
await context.route('**/*', route => {
  const q = route.request(), u = new URL(q.url());
  if (!['http:', 'https:', 'data:', 'blob:', 'about:'].includes(u.protocol)) { fail('blocked_request'); return route.abort('blockedbyclient'); }
  const main = mainNavigation(q);
  if (main === null) { fail('extra_page'); return route.abort('blockedbyclient'); }
  if (main && ['http:', 'https:'].includes(u.protocol)) {
    if (!origins.has(u.origin)) { fail('undeclared_origin'); return route.abort('blockedbyclient'); }
    if (++pages > maxPages) { fail('pages_limit', {limit: 'maxPages'}); return route.abort('blockedbyclient'); }
  }
  if (job.demo && ['http:', 'https:'].includes(u.protocol) && (!['GET','HEAD','OPTIONS'].includes(q.method()) || u.hostname==='hooks.slack.com' || ['discord.com','discordapp.com'].includes(u.hostname)&&u.pathname.startsWith('/api/webhooks/') || u.hostname==='slack.com'&&u.pathname==='/api/chat.postMessage' || u.hostname==='api.telegram.org'&&/\/(?:sendMessage|sendPhoto|sendDocument)$/.test(u.pathname))) {
    return effectSuccess(new Request(q.url(),{method:q.method(),...(q.postData()?{body:q.postData()}:{}),headers:q.headers()})).then(async response=>route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()}));
  }
  return route.continue();
});

const entry = (i, kind, started0, data = {}) => {
  const e = {i, kind, outcome: data.outcome ?? 'pass', ms: Math.max(0, Date.now() - started0), ...(data.expect ? {expect: data.expect} : {}), ...(data.matched !== undefined ? {matched: data.matched} : {}), ...(data.url ? {url: data.url} : {}), ...(data.reason ? {reason: data.reason} : {})};
  emit({t: 'entry', entry: e});
};

async function expectation(item, timeout) {
  if (item.what === 'text') await page.getByText(item.value).first().waitFor({state: 'visible', timeout});
  else if (item.what === 'element') await target(page, item.target).first().waitFor({state: 'visible', timeout});
  else await page.waitForURL(() => urlMatches(page, item.value, item.match), {timeout, waitUntil: 'commit'});
}

try {
  for (const [i, s] of flow.steps.entries()) {
    step = i; current = s;
    if (failure) break;
    if (remaining() < 500) { fail('wall_time_exceeded', {limit: 'wallMs'}); break; }
    const t0 = Date.now(), timeout = sleepless(remaining() - 500);
    // One entry per step: a failure recorded while the step ran (a refused request, a 4xx page, a second window) makes it a failed step.
    const record = data => failure ? entry(i, s.kind, t0, {outcome: 'fail', ...(data?.url ? {url: data.url} : {}), ...(s.what ? {expect: describeExpectation(s), matched: false} : {}), reason: failure.reason}) : entry(i, s.kind, t0, data);
    try {
      if (s.kind === 'goto') {
        const response = await page.goto(s.url, {waitUntil: 'load', timeout});
        if (!failure && response && response.status() >= 400) fail('http_status', {status: response.status()});
        record({url: shownUrl()});
      } else if (s.kind === 'click') {
        await target(page, s.target).first().click({timeout});
        await page.waitForLoadState('load', {timeout: sleepless(3000)}).catch(() => {});
        record({url: shownUrl()});
      } else if (s.kind === 'fill') {
        const credential = credentials[s.credentialRef];
        if (!credential) fail('credential_unavailable');
        else if (new URL(page.url()).origin !== credential.origin) fail('credential_origin_mismatch');
        else await target(page, s.target).first().fill(credential.value, {timeout});
        record();
      } else {
        const text = describeExpectation(s);
        await expectation(s, s.kind === 'expect' ? Math.min(timeout, 5000) : timeout);
        record({expect: text, matched: true, ...(s.what === 'url' ? {url: shownUrl()} : {})});
      }
    } catch (error) {
      if (!failure) {
        const timedOut = error?.name === 'TimeoutError';
        const reason = s.kind === 'goto' ? 'navigation_failed' : (s.kind === 'click' || s.kind === 'fill') ? 'element_missing' : 'expectation_not_met';
        if (remaining() < 600) fail('wall_time_exceeded', {limit: 'wallMs'}); else fail(timedOut || s.kind !== 'goto' ? reason : 'navigation_failed');
      }
      record({url: shownUrl()});
    }
  }
  if(proxyChallengePending)throw Error('The filtering proxy did not authenticate the browser');
  const outcomes = [];
  if (!failure) {
    for (const [k, o] of flow.outcomes.entries()) {
      const t0 = Date.now();
      let observed = false;
      try { await expectation(o, sleepless(Math.min(5000, remaining() - 300))); observed = true; } catch { observed = false; }
      outcomes.push({id: o.id, observed});
      entry(flow.steps.length + k, 'outcome', t0, {outcome: observed ? 'pass' : 'fail', expect: `${o.id}: ${describeExpectation(o)}`, matched: observed, ...(observed ? {} : {reason: 'outcome_missing'})});
      if (!observed && !failure) { step = flow.steps.length + k; fail('outcome_missing'); }
    }
  } else for (const o of flow.outcomes) outcomes.push({id: o.id, observed: false});
  emit({t: 'done', failure, finalUrl: shownUrl(), pages: Math.min(pages, FLOW_LIMITS.maxPages + 1), outcomes});
} catch {
  emit({t: 'done', crashed: true});
} finally {
  await browser.close().catch(() => {});
}
if (!abandoned) process.exit(0);
