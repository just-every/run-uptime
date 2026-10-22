// PERF-001: what the real-user beacon may carry and keep. A beacon names a registered site and a route (the page's path only, every
// identifier-like segment replaced), a device class and a few browser figures; nothing that identifies a visitor. The same rules
// read an owner's site settings. Shared by the beacon door, the owner API and the beacon script the door serves.
export const RUM_LIMITS = Object.freeze({bodyBytes: 1024, routeChars: 120, maxExcluded: 20, excludedChars: 100, defaultSamplePercent: 10, reportHours: 24 * 7, poorLcpMs: 2500});
// User agents the beacon never aggregates: crawlers, headless and automated browsers, and monitoring tools (Uptime's own runner included).
export const BOT_AGENTS = /bot\b|bot\/|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pagespeed|pingdom|uptime|monitor|phantomjs|selenium|puppeteer|playwright|python-requests|curl\/|wget|httpclient|java\//i;
const fail = message => { throw Object.assign(Error(message), {status: 400}); };
const IDENTIFIER = [/^\d{3,}$/, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, /^[0-9a-f]{12,}$/i, /@|%40/i, /^[A-Za-z0-9_-]{24,}$/, /\d.*\d.*\d.*\d/];

/** The route a page view counts under: its path without query or fragment, each identifier-like segment shown as :id, cut. */
export function rumRoute(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 2048) fail('A beacon route is a path that starts with /');
  const plain = path.split(/[?#]/)[0];
  const route = plain.split('/').map(segment => IDENTIFIER.some(rule => rule.test(segment)) ? ':id' : segment).join('/');
  return route.slice(0, RUM_LIMITS.routeChars) || '/';
}
const figure = (value, max) => value === null || Number.isSafeInteger(value) && value >= 0 && value <= max;
/** One beacon: exactly these fields, each within its bound. */
export function validateBeacon(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['site', 'route', 'device', 'status', 'lcpMs', 'cls', 'inpMs', 'ttfbMs', 'errors'].includes(k))) fail('Invalid beacon');
  if (typeof body.site !== 'string' || !/^[0-9a-f-]{36}$/.test(body.site) || !['mobile', 'desktop'].includes(body.device) || !['ok', 'failed', 'unknown'].includes(body.status)) fail('Invalid beacon');
  if (!figure(body.lcpMs, 120000) || !figure(body.inpMs, 60000) || !figure(body.ttfbMs, 120000) || !Number.isSafeInteger(body.errors) || body.errors < 0 || body.errors > 100 ||
      !(body.cls === null || typeof body.cls === 'number' && Number.isFinite(body.cls) && body.cls >= 0 && body.cls <= 100)) fail('Invalid beacon');
  return {site: body.site, route: rumRoute(body.route), device: body.device, status: body.status, lcpMs: body.lcpMs, cls: body.cls, inpMs: body.inpMs, ttfbMs: body.ttfbMs, errors: body.errors};
}
/** A site the owner registers: its origin (https, or a loopback origin on a local review installation), and its beacon settings. */
export function validateSiteInput(input, {local = false, partial = false} = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['origin', 'enabled', 'samplePercent', 'excludedPaths'].includes(k))) fail('Invalid beacon settings');
  const out = {};
  if (!partial || input.origin !== undefined) {
    let u; try { u = new URL(input.origin); } catch { fail('A beacon origin is a site address such as https://shop.example'); }
    const loopback = local && u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname);
    if (u.origin !== input.origin || !(u.protocol === 'https:' || loopback)) fail('A beacon origin is a site address such as https://shop.example, with nothing after the host');
    out.origin = u.origin;
  }
  if (input.enabled !== undefined) { if (typeof input.enabled !== 'boolean') fail('Invalid beacon switch'); out.enabled = input.enabled; }
  if (input.samplePercent !== undefined) { if (!Number.isInteger(input.samplePercent) || input.samplePercent < 1 || input.samplePercent > 100) fail('Sampling is a whole percentage from 1 to 100'); out.samplePercent = input.samplePercent; }
  if (input.excludedPaths !== undefined) {
    if (!Array.isArray(input.excludedPaths) || input.excludedPaths.length > RUM_LIMITS.maxExcluded || input.excludedPaths.some(p => typeof p !== 'string' || !p.startsWith('/') || p.length > RUM_LIMITS.excludedChars || /[?#\x00-\x1f\x7f]/.test(p))) fail(`Excluded paths are up to ${RUM_LIMITS.maxExcluded} path prefixes that start with /`);
    out.excludedPaths = [...new Set(input.excludedPaths)];
  }
  return out;
}
