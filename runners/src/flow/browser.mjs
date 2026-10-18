// Capability means the selected Playwright engine actually launched, not that
// another browser happened to be installed. Missing engines produce Unknown.
import {userInfo} from 'node:os';
import {FLOW_BROWSERS} from '../../../src/domain/flow-profile.mjs';
import {flowLaunchOptions} from './launch.mjs';
const cached = new Map();
export function browserCapability(engine = 'chromium') {
  if (!FLOW_BROWSERS.includes(engine)) return Promise.resolve({available: false, reason: 'Unsupported flow browser.'});
  if (!cached.has(engine)) cached.set(engine, (async () => {
    if (/^(off|0|false)$/i.test(process.env.UPTIME_RUNNER_BROWSER ?? '')) return {available: false, reason: 'Flows are switched off on this runner (UPTIME_RUNNER_BROWSER).'};
    const enabled = process.env.UPTIME_RUNNER_BROWSERS?.split(',').map(value => value.trim());
    if (enabled && (enabled.some(name => !FLOW_BROWSERS.includes(name)) || !enabled.includes(engine))) return {available: false, reason: `${engine} is not enabled in UPTIME_RUNNER_BROWSERS on this runner.`};
    if(process.platform==='darwin'&&process.env.HOME!==userInfo().homedir)return {available:false,reason:'Start this runner with the signed-in account HOME before using browser flows.'};
    let browser;
    try {
      const engines = await import('playwright'), selected = engines[engine];
      browser = await selected.launch(flowLaunchOptions(engine));
      const executable = selected.executablePath(), at = executable.indexOf('ms-playwright');
      return {available: true, engine, browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? (at >= 0 ? executable.slice(0, at + 'ms-playwright'.length) : undefined)};
    } catch { return {available: false, reason: `This runner cannot start ${engine}: install it with pnpm exec playwright install ${engine}, then restart the runner.`}; }
    finally { await browser?.close().catch(() => {}); }
  })());
  return cached.get(engine);
}
export async function browserCapabilities() {
  const engines = {};
  // Probe sequentially: each runner owns at most one browser at a time.
  for (const engine of FLOW_BROWSERS) engines[engine] = (await browserCapability(engine)).available;
  return {browser: Object.values(engines).some(Boolean), browsers: engines};
}
