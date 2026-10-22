// PERF-001: one synthetic page-speed check. The runner loads the monitor's page once in a real, isolated browser (FLOW-001's
// process, folder and filtering proxy) with the monitor's device and network profile, and retains DNS, connect, TLS and time to
// first byte, the resource waterfall, the browser's Core Web Vitals and the browser errors the page produced. Interaction to Next
// Paint needs a person's input, so a synthetic load reports total blocking time (TBT) as its lab proxy and says so; the real-user
// beacon (src/domain/rum/) reports INP. The budget decision is a pure function of the retained figures, so the Worker recomputes
// it from the evidence and a runner cannot choose its own verdict. Shared by the Worker (validation, evidence) and the runner.
export const PAGESPEED_LIMITS = Object.freeze({
  minIntervalMs: 300000,       // a page-speed check runs at most once every 5 minutes, like a browser flow
  wallMs: 45000,               // wall time of one run, browser start included
  minTimeoutMs: 10000,
  settleMs: 1500,              // after the load event, for late paints, shifts and long tasks
  maxBytes: 8 * 1024 * 1024,   // response bytes through the proxy in one run
  maxResources: 40,            // waterfall rows retained (the document first, then by start time)
  maxErrors: 5,                // browser errors retained (the count keeps every one)
  textChars: 160,
  evidenceBytes: 12000,         // the waterfall's tail is left out to stay within it
});
export const PAGESPEED_DEVICES = Object.freeze(['mobile', 'desktop']);
export const PAGESPEED_THROTTLES = Object.freeze(['none', 'slow-4g']);
// The device a check emulates: viewport, pixel ratio, touch, and Lighthouse's mobile CPU slowdown.
export const PAGESPEED_PROFILES = Object.freeze({
  mobile: Object.freeze({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true, cpuSlowdown: 4}),
  desktop: Object.freeze({viewport: {width: 1350, height: 940}, deviceScaleFactor: 1, isMobile: false, hasTouch: false, cpuSlowdown: 1}),
});
// Lighthouse's "slow 4G" network: 150 ms round trip, 1.6 Mbit/s down, 750 kbit/s up.
export const PAGESPEED_NETWORKS = Object.freeze({'slow-4g': Object.freeze({latency: 150, downloadThroughput: 204800, uploadThroughput: 96000})});
export const PAGESPEED_BUDGETS = Object.freeze({
  ttfbMs: {label: 'Time to first byte', unit: 'ms', max: 60000},
  fcpMs: {label: 'First contentful paint', unit: 'ms', max: 60000},
  lcpMs: {label: 'Largest contentful paint', unit: 'ms', max: 60000},
  cls: {label: 'Cumulative layout shift', unit: '', max: 10},
  tbtMs: {label: 'Total blocking time (lab proxy for INP)', unit: 'ms', max: 60000},
  loadMs: {label: 'Page load', unit: 'ms', max: 60000},
  transferBytes: {label: 'Transferred bytes', unit: 'bytes', max: 8 * 1024 * 1024},
  browserErrors: {label: 'Browser errors', unit: '', max: 50},
});
export const RESOURCE_TYPES = Object.freeze(['document', 'script', 'stylesheet', 'image', 'font', 'fetch', 'media', 'other']);
export const ERROR_KINDS = Object.freeze(['exception', 'console', 'request', 'http']);

const fail = message => { throw Error(message); };
const only = (value, allowed, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`Invalid ${label}`);
  const unknown = Object.keys(value).filter(k => !allowed.includes(k));
  if (unknown.length) fail(`Invalid ${label}: unknown field${unknown.length > 1 ? 's' : ''} ${unknown.map(k => `“${k.slice(0, 60)}”`).join(', ')}`);
};
const whole = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const optional = (value, max) => value === null || whole(value, max);

/** Normalise a monitor's page-speed settings: the device, the network profile (slow 4G by default on mobile) and its budgets. */
export function validatePageSpeed(input) {
  if (input === undefined) fail('A page-speed monitor needs its settings: device and at least one budget');
  only(input, ['device', 'throttle', 'budgets'], 'page-speed settings');
  const device = input.device ?? 'mobile';
  if (!PAGESPEED_DEVICES.includes(device)) fail(`Page-speed device is ${PAGESPEED_DEVICES.join(' or ')}`);
  const throttle = input.throttle ?? (device === 'mobile' ? 'slow-4g' : 'none');
  if (!PAGESPEED_THROTTLES.includes(throttle)) fail(`Page-speed network is ${PAGESPEED_THROTTLES.join(' or ')}`);
  only(input.budgets, Object.keys(PAGESPEED_BUDGETS), 'page-speed budgets');
  const keys = Object.keys(input.budgets);
  if (!keys.length) fail('A page-speed monitor needs at least one budget');
  const budgets = {};
  for (const key of Object.keys(PAGESPEED_BUDGETS).filter(k => keys.includes(k))) {
    const value = input.budgets[key], {max} = PAGESPEED_BUDGETS[key];
    if (key === 'cls' ? !(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max && Math.round(value * 1000) === value * 1000) : !whole(value, max)) fail(`Invalid ${PAGESPEED_BUDGETS[key].label} budget`);
    budgets[key] = value;
  }
  return {device, throttle, budgets};
}

/** A resource URL as a page-speed check keeps it: origin and path only (no query string, fragment or credentials), cut. */
export function shownResourceUrl(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? `${u.origin}${u.pathname}`.slice(0, PAGESPEED_LIMITS.textChars) : `${u.protocol}`; } catch { return ''; }
}
/** Error text without any URL's query string or fragment, cut. */
export function shownErrorText(value) {
  return String(value ?? '').replace(/https?:\/\/[^\s"'<>)]+/g, url => shownResourceUrl(url)).replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, PAGESPEED_LIMITS.textChars) || 'Error';
}

/** Validate the facts a runner reports, so an observation can only carry the fixed, bounded, query-free shape. */
export function validatePageSpeedEvidence(e, definition) {
  only(e, ['device', 'throttle', 'status', 'timings', 'vitals', 'loadMs', 'transferBytes', 'resources', 'resourceCount', 'errors', 'errorCount'], 'page-speed evidence');
  if (definition && (e.device !== definition.pagespeed.device || e.throttle !== definition.pagespeed.throttle)) fail('Page-speed evidence names another profile');
  if (!PAGESPEED_DEVICES.includes(e.device) || !PAGESPEED_THROTTLES.includes(e.throttle) || !Number.isInteger(e.status) || e.status < 100 || e.status > 599) fail('Invalid page-speed evidence');
  only(e.timings, ['dnsMs', 'connectMs', 'tlsMs', 'ttfbMs'], 'page-speed timings');
  only(e.vitals, ['fcpMs', 'lcpMs', 'cls', 'tbtMs', 'inpMs'], 'page-speed vitals');
  for (const key of ['dnsMs', 'connectMs', 'tlsMs', 'ttfbMs']) if (!optional(e.timings[key], 600000)) fail('Invalid page-speed timing');
  for (const key of ['fcpMs', 'lcpMs', 'tbtMs']) if (!optional(e.vitals[key], 600000)) fail('Invalid page-speed vital');
  // A synthetic load has no interaction, so INP is never measured here: TBT is its lab proxy.
  if (e.vitals.inpMs !== null || !(typeof e.vitals.cls === 'number' && Number.isFinite(e.vitals.cls) && e.vitals.cls >= 0 && e.vitals.cls <= 100)) fail('Invalid page-speed vital');
  if (!whole(e.loadMs, 600000) || !whole(e.transferBytes, 1 << 30) || !whole(e.resourceCount, 100000) || !whole(e.errorCount, 100000)) fail('Invalid page-speed evidence');
  if (!Array.isArray(e.resources) || !e.resources.length || e.resources.length > PAGESPEED_LIMITS.maxResources || e.resources.length > e.resourceCount) fail('Invalid page-speed waterfall');
  for (const [i, r] of e.resources.entries()) {
    only(r, ['url', 'type', 'startMs', 'durationMs', 'bytes', 'status'], 'page-speed waterfall row');
    if (typeof r.url !== 'string' || r.url.length > PAGESPEED_LIMITS.textChars || /[?#]/.test(r.url) || !RESOURCE_TYPES.includes(r.type) || (i === 0) !== (r.type === 'document') ||
        !whole(r.startMs, 600000) || !whole(r.durationMs, 600000) || !whole(r.bytes, 1 << 30) || !(r.status === null || Number.isInteger(r.status) && r.status >= 100 && r.status <= 599)) fail('Invalid page-speed waterfall row');
  }
  if (!Array.isArray(e.errors) || e.errors.length > PAGESPEED_LIMITS.maxErrors || e.errors.length > e.errorCount || e.errorCount > e.errors.length && e.errors.length < PAGESPEED_LIMITS.maxErrors) fail('Invalid page-speed errors');
  for (const x of e.errors) {
    only(x, ['kind', 'text'], 'page-speed error');
    if (!ERROR_KINDS.includes(x.kind) || typeof x.text !== 'string' || !x.text || x.text.length > PAGESPEED_LIMITS.textChars || /https?:\/\/[^\s]*[?#]/.test(x.text)) fail('Invalid page-speed error');
  }
  if (JSON.stringify(e).length > PAGESPEED_LIMITS.evidenceBytes) fail(`Page-speed evidence is limited to ${PAGESPEED_LIMITS.evidenceBytes} bytes`);
  return e;
}

const figure = (key, value) => key === 'cls' ? value.toFixed(3) : key === 'transferBytes' ? `${value.toLocaleString('en-US')} bytes` : PAGESPEED_BUDGETS[key].unit === 'ms' ? `${value.toLocaleString('en-US')} ms` : value.toLocaleString('en-US');
/** The values a budget reads, from retained evidence. */
export function budgetValues(e) {
  return {ttfbMs: e.timings.ttfbMs, fcpMs: e.vitals.fcpMs, lcpMs: e.vitals.lcpMs, cls: e.vitals.cls, tbtMs: e.vitals.tbtMs, loadMs: e.loadMs, transferBytes: e.transferBytes, browserErrors: e.errorCount};
}
/** The checks of one run: the document's HTTP status, then each budget in a fixed order. Every check names its figure. */
export function pageSpeedChecks(definition, e) {
  const ok = e.status >= 200 && e.status < 300, values = budgetValues(e);
  const checks = [{assertion: 'status', pass: ok, reason: `The page answered HTTP ${e.status}${ok ? '' : ', not a success'}`}];
  for (const [key, budget] of Object.entries(definition.pagespeed.budgets)) {
    const value = values[key], label = PAGESPEED_BUDGETS[key].label;
    if (value === null) { checks.push({assertion: `budget:${key}`, pass: false, reason: `${label} was not observed, so its budget of ${figure(key, budget)} cannot pass`}); continue; }
    const pass = value <= budget;
    checks.push({assertion: `budget:${key}`, pass, reason: `${label} ${figure(key, value)} is ${pass ? 'within' : 'over'} its budget of ${figure(key, budget)}`});
  }
  return checks;
}
