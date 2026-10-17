// Whether this runner can run flows: the pinned Playwright package and its Chromium must both be present. A runner reports this in
// its enrolment; a flow assigned to one without a browser is Unknown with that reason, never a pass and never a failure.
import {userInfo} from 'node:os';
let cached;
/** {available:true, browsersPath} or {available:false, reason}. A runner can run flows when it can start the pinned Playwright's
 * Chromium, so that is what it tries, once. UPTIME_RUNNER_BROWSER=off keeps a runner from running flows. */
export function browserCapability() {
  cached ??= (async () => {
    if (/^(off|0|false)$/i.test(process.env.UPTIME_RUNNER_BROWSER ?? '')) return {available: false, reason: 'Flows are switched off on this runner (UPTIME_RUNNER_BROWSER).'};
    if(process.platform==='darwin'&&process.env.HOME!==userInfo().homedir)return {available:false,reason:'Start this runner with the signed-in account HOME before using browser flows.'};
    try {
      const {chromium} = await import('playwright');
      const browser = await chromium.launch({headless:true,timeout:20000,args:['--use-mock-keychain','--password-store=basic']});
      await browser.close();
      const executable = chromium.executablePath(), at = executable.indexOf('ms-playwright');
      return {available: true, browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? (at >= 0 ? executable.slice(0, at + 'ms-playwright'.length) : undefined)};
    } catch { return {available: false, reason: 'This runner has no browser: run pnpm exec playwright install chromium on it.'}; }
  })();
  return cached;
}
