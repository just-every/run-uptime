// PERF-001: the browser process of one page-speed check. Started by run.mjs exactly as a flow's browser process is (FLOW-001): the
// run's folder as its argument, a sanitized environment, the job on stdin and a lifeline on fd 3. It loads one page with the
// monitor's device (viewport, pixel ratio, touch, CPU slowdown) and network profile, reads the browser's own timing entries and
// Core Web Vitals, keeps the errors the page produced, and reports one JSON line. It evaluates nothing the page's owner wrote.
// When the runner ends without ending this process, the lifeline closes and this process removes its browser and the run's folder.
import net from 'node:net';
import {rm} from 'node:fs/promises';
import {descendants, killFolderHolders} from '../flow/processes.mjs';

const base = process.argv[2];
let browser, abandoned = false;
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
process.on('uncaughtException', error => { if (abandoned) return; process.stderr.write(`${error?.stack ?? error}\n`); process.exit(1); });
process.stdout.on('error', () => {});

const {chromium} = await import('playwright');
const {flowLaunchOptions, disableDirectTransports} = await import('../flow/launch.mjs');
const {numericRequestRefusal} = await import('../flow/request-policy.mjs');
const {PAGESPEED_LIMITS, PAGESPEED_PROFILES, PAGESPEED_NETWORKS, RESOURCE_TYPES, shownResourceUrl, shownErrorText} = await import('../../../src/domain/pagespeed.mjs');
const read = async () => { const chunks = []; for await (const c of process.stdin) chunks.push(c); return JSON.parse(Buffer.concat(chunks).toString('utf8')); };
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const job = await read().catch(() => null);
if (!job) { setTimeout(() => { if (!abandoned) process.exit(1); }, 1000); await new Promise(() => {}); }
const {url, network, settings, home, proxy, deadlineMs} = job, profile = PAGESPEED_PROFILES[settings.device];
const started = Date.now(), remaining = () => deadlineMs - (Date.now() - started);

// Installed before the page's own scripts: the browser's paint, layout-shift and long-task entries as they arrive.
function observeVitals() {
  const lcp = [], shifts = [], tasks = [];
  const watch = (type, into) => { try { new PerformanceObserver(list => { into.push(...list.getEntries()); }).observe({type, buffered: true}); } catch {} };
  watch('largest-contentful-paint', lcp); watch('layout-shift', shifts); watch('longtask', tasks);
  Object.defineProperty(globalThis, '__uptimePageSpeed', {configurable: false, enumerable: false, writable: false, value: () => {
    const nav = performance.getEntriesByType('navigation')[0], fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    // CLS: the largest session window of shifts without recent input (1 s gap, 5 s window).
    let cls = 0, windowSum = 0, first = 0, last = 0;
    for (const s of shifts) { if (s.hadRecentInput) continue; if (windowSum && (s.startTime - last > 1000 || s.startTime - first > 5000)) windowSum = 0; if (!windowSum) first = s.startTime; windowSum += s.value; last = s.startTime; cls = Math.max(cls, windowSum); }
    // TBT: what each long task after the first contentful paint blocked past 50 ms, up to the end of this measurement.
    const tbt = tasks.filter(t => fcp === null || t.startTime >= fcp).reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);
    const largest = lcp.at(-1);
    return {nav: nav ? {requestStart: nav.requestStart, responseStart: nav.responseStart, responseEnd: nav.responseEnd, secureConnectionStart: nav.secureConnectionStart, connectEnd: nav.connectEnd, loadEventEnd: nav.loadEventEnd, transferSize: nav.transferSize, status: nav.responseStatus ?? null} : null,
      fcp, lcp: largest ? largest.renderTime || largest.loadTime || largest.startTime : null, cls, tbt,
      resources: performance.getEntriesByType('resource').map(r => ({url: r.name, type: r.initiatorType, start: r.startTime, duration: r.duration, bytes: r.transferSize, status: r.responseStatus ?? null}))};
  }});
}

let context;
try {
  browser = await chromium.launch(flowLaunchOptions('chromium', {home, proxy}));
  context = await browser.newContext({acceptDownloads: false, serviceWorkers: 'block', ignoreHTTPSErrors: false, viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.isMobile, hasTouch: profile.hasTouch, locale: 'en-US', timezoneId: 'UTC'});
  await context.addInitScript(disableDirectTransports);
  await context.addInitScript(observeVitals);
} catch { await browser?.close().catch(() => {}); if (abandoned) await new Promise(() => {}); emit({t: 'done', launchFailed: true}); process.exit(0); }

const page = await context.newPage(), errors = [];
let errorCount = 0;
const error = (kind, text) => { errorCount++; if (errors.length < PAGESPEED_LIMITS.maxErrors) errors.push({kind, text: shownErrorText(text)}); };
page.on('pageerror', e => error('exception', e?.message ?? String(e)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) error('console', m.text()); });
page.on('requestfailed', q => { if (q.failure()?.errorText !== 'net::ERR_BLOCKED_BY_CLIENT') error('request', `${shownResourceUrl(q.url())} failed (${q.failure()?.errorText ?? 'no response'})`); });
page.on('response', r => { if (r.status() >= 400) error('http', `${shownResourceUrl(r.url())} answered HTTP ${r.status()}`); });
page.on('dialog', d => d.dismiss().catch(() => {}));
context.on('page', p => { if (p !== page) p.close().catch(() => {}); });
await context.route('**/*', route => {
  const u = new URL(route.request().url());
  if (!['http:', 'https:', 'data:', 'blob:', 'about:'].includes(u.protocol)) return route.abort('blockedbyclient');
  if (numericRequestRefusal(u, {network, startUrl: url})) { error('request', `A request to a forbidden destination was refused (${shownResourceUrl(u.href)})`); return route.abort('blockedbyclient'); }
  return route.continue();
});
try {
  const cdp = await context.newCDPSession(page), conditions = PAGESPEED_NETWORKS[settings.throttle];
  if (conditions) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', {offline: false, ...conditions}); }
  if (profile.cpuSlowdown > 1) await cdp.send('Emulation.setCPUThrottlingRate', {rate: profile.cpuSlowdown});
  let response;
  try { response = await page.goto(url, {waitUntil: 'load', timeout: Math.max(1000, remaining() - PAGESPEED_LIMITS.settleMs - 1000)}); }
  catch (e) { emit({t: 'done', navigation: e?.name === 'TimeoutError' ? 'timeout' : 'failed'}); throw null; }
  await page.waitForTimeout(Math.min(PAGESPEED_LIMITS.settleMs, Math.max(0, remaining() - 1000)));
  const facts = await page.evaluate(() => globalThis.__uptimePageSpeed());
  const ms = value => value === null || value === undefined || !Number.isFinite(value) ? null : Math.max(0, Math.round(value));
  const nav = facts.nav, status = response?.status() ?? nav?.status ?? 0;
  const type = value => value === 'link' || value === 'css' ? 'stylesheet' : value === 'img' ? 'image' : value === 'xmlhttprequest' || value === 'beacon' ? 'fetch' : value === 'video' || value === 'audio' ? 'media' : RESOURCE_TYPES.includes(value) ? value : 'other';
  const subresources = facts.resources.map(r => ({url: shownResourceUrl(r.url), type: type(r.type), startMs: ms(r.start), durationMs: ms(r.duration), bytes: ms(r.bytes) ?? 0, status: Number.isInteger(r.status) && r.status >= 100 ? r.status : null})).sort((a, b) => a.startMs - b.startMs);
  const documentRow = {url: shownResourceUrl(url), type: 'document', startMs: 0, durationMs: ms(nav?.responseEnd) ?? 0, bytes: ms(nav?.transferSize) ?? 0, status};
  const tls = nav && nav.secureConnectionStart > 0 ? ms(nav.connectEnd - nav.secureConnectionStart) : null;
  emit({t: 'done', evidence: {device: settings.device, throttle: settings.throttle, status,
    timings: {dnsMs: null, connectMs: null, tlsMs: tls, ttfbMs: nav ? ms(nav.responseStart - nav.requestStart) : null},
    vitals: {fcpMs: ms(facts.fcp), lcpMs: ms(facts.lcp), cls: Math.round(facts.cls * 1000) / 1000, tbtMs: ms(facts.tbt), inpMs: null},
    loadMs: ms(nav?.loadEventEnd) ?? 0, transferBytes: (ms(nav?.transferSize) ?? 0) + subresources.reduce((sum, r) => sum + r.bytes, 0),
    resources: [documentRow, ...subresources].slice(0, PAGESPEED_LIMITS.maxResources), resourceCount: subresources.length + 1, errors, errorCount}});
} catch (e) {
  if (e !== null) emit({t: 'done', launchFailed: true});
} finally {
  await browser.close().catch(() => {});
}
if (!abandoned) process.exit(0);
