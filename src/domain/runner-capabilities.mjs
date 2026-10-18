import {FLOW_BROWSERS} from './flow-profile.mjs';

export function validRunnerCapabilities(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['browser', 'browsers', 'privateNetwork', 'capacity', 'version'].includes(key)) || typeof value.browser !== 'boolean') return false;
  if (value.browsers !== undefined && (!value.browsers || typeof value.browsers !== 'object' || Array.isArray(value.browsers) ||
      Object.keys(value.browsers).sort().join(',') !== [...FLOW_BROWSERS].sort().join(',') ||
      FLOW_BROWSERS.some(engine => typeof value.browsers[engine] !== 'boolean') || value.browser !== Object.values(value.browsers).some(Boolean))) return false;
  return (value.privateNetwork === undefined || typeof value.privateNetwork === 'boolean') &&
    (value.capacity === undefined || Number.isInteger(value.capacity) && value.capacity >= 1 && value.capacity <= 64) &&
    (value.version === undefined || typeof value.version === 'string' && /^[a-zA-Z0-9./_-]{1,60}$/.test(value.version));
}

export function runnerCapabilities(value) {
  let parsed; try { parsed = JSON.parse(String(value)); } catch { parsed = null; }
  if (!validRunnerCapabilities(parsed)) return {browser: false, browsers: {chromium: false, firefox: false, webkit: false}};
  return {...parsed, browsers: parsed.browsers ?? {chromium: parsed.browser, firefox: false, webkit: false}};
}
