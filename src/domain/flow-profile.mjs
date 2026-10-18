// One immutable browser/device combination per monitor. Network vantages remain
// independent probes of this combination, never different browsers averaged together.
export const FLOW_BROWSERS = Object.freeze(['chromium', 'firefox', 'webkit']);
export const FLOW_DEVICES = Object.freeze(['desktop', 'mobile']);
export const FLOW_VIEWPORTS = Object.freeze({desktop: Object.freeze({width: 1280, height: 800}), mobile: Object.freeze({width: 390, height: 844})});

export function flowProfile(flow = {}) {
  const browser = flow.browser ?? 'chromium', device = flow.device ?? 'desktop';
  if (!FLOW_BROWSERS.includes(browser)) throw Error('Flow browser must be chromium, firefox or webkit');
  if (!FLOW_DEVICES.includes(device)) throw Error('Flow device must be desktop or mobile');
  return {browser, device, viewport: {...FLOW_VIEWPORTS[device]}};
}

export function profileLabel(flow) {
  const {browser, device, viewport} = flowProfile(flow);
  return `${{chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit'}[browser]} · ${device} ${viewport.width} × ${viewport.height}`;
}

export function validateProfileEvidence(profile, definition) {
  const expected = flowProfile(definition?.flow);
  // Historical Chromium desktop revisions did not carry an explicit profile.
  if (profile === undefined && definition?.flow?.browser === undefined && definition?.flow?.device === undefined) return expected;
  if (!profile || Object.keys(profile).sort().join(',') !== 'browser,device,viewport' ||
      !profile.viewport || Object.keys(profile.viewport).sort().join(',') !== 'height,width' ||
      profile.browser !== expected.browser || profile.device !== expected.device ||
      profile.viewport.width !== expected.viewport.width || profile.viewport.height !== expected.viewport.height) {
    throw Error('Flow browser/device evidence differs from the immutable revision');
  }
  return expected;
}
