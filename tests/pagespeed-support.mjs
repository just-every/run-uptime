// PERF-001 inside the flow journey (tests/flow-journey.mjs), through its Worker, its two production runners with their real browsers
// and the flow fixture's shop. A mobile and a desktop page-speed check of the same checkout, beside an HTTP check of the site's health
// endpoint: the mobile check retains the throttled mobile script, the browser error it throws, its waterfall and vitals, breaches its
// budgets and opens an incident whose email goes out through the installation's destination, while the desktop check passes and
// the health check stays Healthy. Then the real-user beacon: registered off, enabled with owner sampling and an excluded path, and
// visited by real browsers (consenting phone-profile and desktop visitors; a visitor without consent, one with Global Privacy Control, one
// with Do Not Track, a bot, one outside the sample and one on an excluded path send nothing), with the door's own refusals and filtering. The console
// shows the waterfall, the budgets and the two reports with their own denominators, the real users' measured percentiles, at 1440 and
// 390, with no overflow or serious axe finding; the owner finally erases the site from it. Assertions read retained structure and
// budget decisions against the fixture's fixed delays, not absolute timings.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {splitSql} from './migration-support.mjs';
import {testAuthBindings,signInOwner} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,ownerAPI} from './notify-acceptance-runtime.mjs';
import {validateDefinition} from '../src/domain/policy.mjs';

const PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const LAPTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// An actual HTTP proxy at the controlled Miniflare edge. Unlike DevTools interception,
// it remains alive for a tab's keepalive beacon after the tab target closes.
async function countryEdge(worker, origin, fixtureOrigin, country, subdivision) {
  let beacons = 0; const samples = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url);
      if (![origin, fixtureOrigin].includes(url.origin)) { response.writeHead(403).end(); return; }
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const headers = Object.fromEntries(Object.entries(request.headers).filter(([key]) => !['connection', 'proxy-connection'].includes(key)));
      const init = {method: request.method, headers, ...(!['GET', 'HEAD'].includes(request.method) ? {body: Buffer.concat(chunks)} : {})};
      if (url.origin === origin && url.pathname === '/rum/v1/collect' && request.method === 'POST') { beacons++; samples.push(JSON.parse(Buffer.concat(chunks).toString())); }
      const reply = url.origin === origin ? await worker.dispatchFetch(url.href, {...init, cf: {country, ...(subdivision ? {regionCode: subdivision} : {})}}) : await fetch(url, init);
      const keptHeaders = Object.fromEntries([...reply.headers].filter(([key]) => !['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(key)));
      response.writeHead(reply.status, keptHeaders); response.end(Buffer.from(await reply.arrayBuffer()));
    } catch { response.writeHead(502).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {proxy: {server: `http://127.0.0.1:${server.address().port}`, bypass: '<-loopback>'}, beacons: () => beacons, samples,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }};
}

/** Creates the three monitors as soon as the flows are created, so they run beside them. */
export async function startPageSpeed({ok, fixture}) {
  const speed = device => ok('/api/monitors', 'POST', {name: `Shop checkout speed (${device})`, type: 'pagespeed', url: `${fixture.origin}/s/shop/checkout`, network: 'synthetic', probes: ['local-a', 'local-b'], confirmSlots: 1, recoverSlots: 1,
    pagespeed: {device, budgets: device === 'mobile' ? {lcpMs: 2000, cls: 0.1, tbtMs: 200, browserErrors: 0} : {lcpMs: 2000, cls: 0.1, tbtMs: 200}}});
  const [mobile, desktop, health] = await Promise.all([speed('mobile'), speed('desktop'),
    ok('/api/monitors', 'POST', {name: 'Shop health endpoint', url: `${fixture.origin}/health`, network: 'synthetic', probes: ['local-a', 'local-b'], intervalMs: 300000, confirmSlots: 1, recoverSlots: 1})]);
  return {mobile: mobile.id, desktop: desktop.id, health: health.id, created: [mobile, desktop]};
}

export async function provePageSpeed({ids, ok, api, DB, fixture, origin, owner, waitFor, observations, worker}) {
  for (const id of [ids.mobile, ids.desktop, ids.health]) await waitFor(async () => (await observations(id)).some(o => o.outcome !== 'runner_error'), 'the page-speed and health checks ran', 120000);
  const [mobile] = (await observations(ids.mobile)).filter(o => o.outcome !== 'runner_error'), [desktop] = (await observations(ids.desktop)).filter(o => o.outcome !== 'runner_error');
  // The mobile check: slow 4G and a phone profile, the throttled mobile script in its waterfall (no query string kept), its exception kept.
  const m = mobile.pagespeed, d = desktop.pagespeed;
  assert.deepEqual([mobile.outcome, m.device, m.throttle, m.status], ['target_failure', 'mobile', 'slow-4g', 200]);
  assert.deepEqual(mobile.checks.map(c => [c.assertion, c.pass]), [['status', true], ['budget:lcpMs', false], ['budget:cls', false], ['budget:tbtMs', false], ['budget:browserErrors', false]], 'each budget is its own named check');
  assert.ok(m.vitals.lcpMs >= 2600 && m.vitals.tbtMs >= 300 && m.vitals.inpMs === null && Number.isInteger(m.vitals.fcpMs) && m.vitals.fcpMs > 0 && m.vitals.cls > 0.1 && m.vitals.fcpMs < m.vitals.lcpMs, `the 2.6 s mobile script sets LCP and its 400 ms task sets TBT: ${JSON.stringify(m.vitals)}`);
  assert.ok([m.timings.dnsMs, m.timings.connectMs, m.timings.ttfbMs].every(Number.isInteger) && m.timings.tlsMs === null, `DNS, connect and TTFB are retained; TLS is absent on plain HTTP: ${JSON.stringify(m.timings)}`);
  assert.equal(m.resources[0].type, 'document');
  const script = m.resources.find(r => r.url.endsWith('/s/shop/assets/mobile.js'));
  assert.ok(script && script.type === 'script' && script.durationMs >= 2600 && script.startMs >= 0, `the throttled mobile asset is in the waterfall: ${JSON.stringify(m.resources)}`);
  assert.ok(m.resources.every(r => !/[?#]/.test(r.url)) && !JSON.stringify(mobile).includes('synthetic-uptime-1'), 'no query string reaches the evidence');
  assert.ok(m.errors.some(e => e.kind === 'exception' && /Mobile checkout script failed/.test(e.text)) && m.errorCount >= 1, 'the browser error is retained');
  // The desktop check of the same page passes its budgets with the desktop script.
  assert.deepEqual([desktop.outcome, d.device, d.throttle, d.errorCount], ['pass', 'desktop', 'none', 0]);
  assert.ok(d.vitals.lcpMs < 2000 && d.vitals.cls <= 0.1 && d.resources.some(r => r.url.endsWith('/s/shop/assets/desktop.js')), `desktop LCP is within budget: ${JSON.stringify(d.vitals)}`);
  assert.ok(desktop.checks.some(c => c.assertion === 'budget:cls' && c.pass), 'desktop CLS stays within its budget');
  // The budget alert goes through the ordinary incident path and the installation's destination; the health endpoint stays Healthy.
  const state = async id => (await ok('/api/overview')).monitors.find(x => x.id === id).state.state;
  await waitFor(async () => await state(ids.mobile) === 'Failing' && await state(ids.health) === 'Healthy', 'the slow mobile checkout is Failing while the health endpoint is Healthy', 60000)
    .catch(async error => { throw Error(`${error.message}: ${JSON.stringify((await ok('/api/overview')).monitors.filter(x => [ids.mobile, ids.health].includes(x.id)).map(x => [x.definition.name, x.state.state, x.state.reason]))}`); });
  assert.equal(await state(ids.desktop), 'Healthy');
  assert.equal((await ok(`/api/monitors/${ids.mobile}/incidents`)).length, 1, 'one incident for the slow mobile checkout');
  await waitFor(async () => (await DB.prepare("SELECT state FROM notification_jobs WHERE kind='email' AND json_extract(event,'$.monitorName')=?").bind('Shop checkout speed (mobile)').first())?.state === 'accepted', 'the budget alert email was sent', 60000);

  // The real-user beacon: registered off with the default 10% sample, refused while off, then enabled by the owner.
  const site = await ok('/api/rum/sites', 'POST', {origin: fixture.origin});
  assert.deepEqual([site.enabled, site.samplePercent, site.excludedPaths], [false, 10, []], 'a registered site starts off with a low default sample');
  const script0 = await fetch(`${origin}/rum/v1/s/${site.id}.js`);
  assert.match(await script0.text(), /not enabled/, 'a site that is off serves a beacon that does nothing');
  const beacon = (body, headers = {}) => fetch(`${origin}/rum/v1/collect`, {method: 'POST', headers: {'content-type': 'text/plain', origin: fixture.origin, 'user-agent': PHONE, ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body)});
  const view = {site: site.id, route: '/s/shop/checkout', device: 'mobile', status: 'ok', lcpMs: 900, cls: 0, inpMs: 40, ttfbMs: 20, errors: 0};
  assert.equal((await beacon(view)).status, 403, 'an off site accepts no beacon');
  await ok(`/api/rum/sites/${site.id}`, 'PATCH', {enabled: true, samplePercent: 50, excludedPaths: ['/s/shop/account/']});
  assert.ok(Number((await DB.prepare("SELECT COUNT(*) n FROM uptime_audit WHERE action IN ('rum_site_register','rum_site_change') AND actor_kind='operator'").first()).n) >= 2, 'registration and settings changes are audited with their actor');
  const served = await (await fetch(`${origin}/rum/v1/s/${site.id}.js`)).text();
  assert.ok(served.includes('"sample":0.5') && served.includes('"/s/shop/account/"') && served.includes('globalPrivacyControl') && served.includes("credentials:'omit'"), 'the served beacon carries the owner sampling and exclusions');
  fixture.setBeacon(`${origin}/rum/v1/s/${site.id}.js`);

  // Real visitors in a real browser. Each visitor's own coin is fixed, so the 50% sample is decided the same way every run.
  const measured = [];
  const browser = await chromium.launch({headless: true, ...(process.env.UPTIME_TEST_CHROMIUM ? {executablePath: process.env.UPTIME_TEST_CHROMIUM} : {}), args: ['--use-mock-keychain', '--password-store=basic', '--no-sandbox']});
  try {
    const views = async () => Number((await DB.prepare('SELECT COALESCE(SUM(views),0) n FROM rum_aggregates WHERE site_id=?').bind(site.id).first()).n);
    // One visitor in a fresh context. The context stays open until the view is counted (or, for a visitor whose beacon must stay
    // silent, for a while), so closing it never cancels a beacon still in flight.
    const visit = async ({phone = false, consent = true, coin = 0.25, gpc = false, dnt = false, agent, path = '/s/shop/checkout', click = true, counted = false, country = 'US', subdivision, unavailable = false}) => {
      const edge = await countryEdge(worker, origin, fixture.origin, country, subdivision);
      const context = await browser.newContext({... (phone ? {viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: agent ?? PHONE} : {viewport: {width: 1280, height: 800}, userAgent: agent ?? LAPTOP}), ...(edge ? {proxy: edge.proxy} : {})});
      try {
        const before = await views();
        if (consent) await context.addCookies([{name: 'consent', value: 'granted', url: fixture.origin}]);
        // A browser with Global Privacy Control or Do Not Track switched on exposes it to the page this way.
        await context.addInitScript(([value, privacy, track]) => { Math.random = () => value; if (privacy) Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {get: () => true, configurable: true}); if (track) Object.defineProperty(Navigator.prototype, 'doNotTrack', {get: () => '1', configurable: true}); }, [coin, gpc, dnt]);
        const page = await context.newPage();
        const response = await page.goto(fixture.origin + path);
        assert.equal(response.status(), unavailable ? 500 : 200, 'the visitor receives the actual document status');
        if (unavailable) { await page.getByRole('heading', {name: 'Checkout unavailable'}).waitFor(); await page.waitForFunction(() => Boolean(window.uptimeRum)); await page.waitForTimeout(500); }
        else await page.getByText('Your order', {exact: false}).waitFor({timeout: 20000});
        if (click) { await page.getByRole('button', {name: 'Place order'}).click(); await page.getByText('Order placed').waitFor(); await page.waitForTimeout(500); }
        // The visitor closes the tab: the page is hidden and the beacon sends its one view.
        await page.close({runBeforeUnload: true});
        if (counted) await waitFor(async () => await views() === before + 1, 'the visitor was counted', 30000);
        else await new Promise(r => setTimeout(r, 1500));
        assert.equal(edge.beacons(), counted ? 1 : 0, 'only an admitted browser sends across the controlled edge');
        if (counted) { const sample = {...edge.samples[0], region: country, subdivision: subdivision ?? null}; measured.push(sample); return sample; }
      } finally { await context.close(); await edge?.close(); }
    };
    await visit({phone: true, subdivision: 'CA', counted: true});
    await visit({counted: true});
    // Nothing is sent without consent, with Global Privacy Control or Do Not Track, from a bot, outside the sample, or on an excluded path.
    await visit({phone: true, consent: false});
    await visit({phone: true, gpc: true});
    await visit({phone: true, dnt: true});
    await visit({phone: true, agent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'});
    await visit({phone: true, coin: 0.75});
    await visit({phone: true, path: '/s/shop/account/88231/orders', click: false});
    assert.equal(await views(), 2, 'no visitor without consent, with GPC or DNT, from a bot, outside the sample or on an excluded path was counted');
    await visit({phone: true, country: 'CA', counted: true});
    await visit({phone: true, path: '/s/shop/unavailable', unavailable: true, click: false, counted: true});
  } finally { await browser.close(); }

  // The door's own rules: only the registered origin, a bounded body, bots and excluded paths counted but not aggregated, and a
  // route kept without its query string, fragment or identifier.
  assert.equal((await beacon(view, {origin: `http://127.0.0.1:${fixture.otherPort}`})).status, 403, 'another origin is refused');
  assert.equal((await beacon(JSON.stringify(view).padEnd(1100, ' '))).status, 413, 'a body over 1 KiB is refused');
  assert.equal((await beacon({...view, extra: 1})).status, 400, 'an unknown field is refused');
  assert.equal((await beacon(view, {'user-agent': 'Mozilla/5.0 (compatible; bingbot/2.0)'})).status, 204);
  assert.equal((await beacon({...view, route: '/s/shop/account/5521/settings'})).status, 204);
  const order = randomUUID(), accepted = await beacon({...view, device: 'desktop', status: 'failed', route: `/s/shop/orders/${order}?email=synthetic-uptime-2@example.test#receipt`});
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get('access-control-allow-origin'), fixture.origin);
  assert.equal(accepted.headers.get('set-cookie'), null, 'the door sets no cookie');
  const stored = JSON.stringify([(await DB.prepare('SELECT * FROM rum_aggregates').all()).results, (await DB.prepare('SELECT * FROM rum_dropped').all()).results, (await DB.prepare('SELECT * FROM rum_value_counts').all()).results]);
  assert.ok(!stored.includes(order) && !stored.includes('synthetic-uptime-2') && !stored.includes('receipt') && !stored.includes('127.0.0.1'), 'no identifier, query, fragment or address is stored');
  const report = await ok(`/api/rum/sites/${site.id}/report?hours=24`);
  assert.deepEqual([report.kind, report.denominator, report.views, report.dropped], ['real-user', 'sampled page views', 5, {bot: 1, excluded: 1}]);
  const row = (route, device, country = 'US') => report.rows.find(r => r.route === route && r.device === device && r.region === country);
  const phone = row('/s/shop/checkout', 'mobile'), laptop = row('/s/shop/checkout', 'desktop'), failed = row('/s/shop/orders/:id', 'desktop');
  assert.ok(phone && laptop && failed, `rows by route and device: ${JSON.stringify(report.rows)}`);
  assert.ok(report.subdivisions.some(r => r.route === '/s/shop/checkout' && r.device === 'mobile' && r.region === 'US' && r.subdivision === 'CA' && r.views === 1), 'the real consenting browser beacon groups under the edge-provided US subdivision');
  assert.ok(phone.errors >= 1, 'the RUM report retains the real mobile script error count');
  for (const r of report.rows) {
    const samples = measured.filter(v => v.route === r.route && v.device === r.device && v.region === r.region);
    if (!samples.length) continue;
    assert.equal(r.errors, samples.reduce((sum, v) => sum + v.errors, 0), 'RUM errors equal the shipped browser beacons');
    for (const metric of ['lcpMs', 'cls', 'inpMs']) {
      const values = samples.map(v => v[metric]).filter(v => v !== null).sort((a,b) => a-b);
      assert.deepEqual(r[metric].percentiles, {p50: values[Math.ceil(values.length*.5)-1] ?? null, p75: values[Math.ceil(values.length*.75)-1] ?? null, p95: values[Math.ceil(values.length*.95)-1] ?? null, of: values.length}, 'percentiles retain actual browser measurements, with their own denominator');
    }
  }
  assert.equal(phone.region, 'US', 'the visitor country comes from the edge, not from an address');
  assert.ok(phone.views === 1 && phone.lcpMs.average >= 2600 && phone.lcpMs.poorPercent === 100 && phone.inpMs.average >= 250 && phone.cls.average > 0.1 && phone.availability.percent === 100, `the slow mobile checkout shows in real-user figures: ${JSON.stringify(phone)}`);
  assert.ok(laptop.lcpMs.average < 2500 && laptop.lcpMs.poorPercent === 0, `desktop visitors load fast: ${JSON.stringify(laptop)}`);
  assert.deepEqual(failed.availability, {loaded: 0, of: 1, percent: 0}, 'real-user availability counts a failed page load');
  const canada = row('/s/shop/checkout', 'mobile', 'CA'), unavailable = row('/s/shop/unavailable', 'mobile');
  assert.ok(canada && canada.views === 1 && phone.views === 1 && canada.cls.average > 0.1, 'the actual Canadian beacon stays separate and leaves the US denominator at one');
  assert.deepEqual(unavailable?.availability, {loaded: 0, of: 1, percent: 0}, 'the shipped beacon reports its real consenting phone-profile HTTP500 visit as unavailable');
  // Two reports, two denominators, never summed.
  const both = await ok(`/api/monitors/${ids.mobile}/pagespeed`);
  assert.deepEqual([both.kind, both.denominator, both.checks, both.overBudget], ['synthetic', 'page-speed checks', (await observations(ids.mobile)).filter(o => o.outcome !== 'runner_error').length, (await observations(ids.mobile)).filter(o => o.outcome === 'target_failure').length]);
  assert.deepEqual([both.realUser.report.denominator, both.realUser.report.views], ['sampled page views', 5]);
  assert.ok(!('total' in both) && !('views' in both), 'the synthetic report never adds page views to checks');

  // The console at 1440 and 390: budgets, the waterfall, the browser error, both reports and the beacon's privacy and sampling settings.
  const axeSource = await readFile(resolve('node_modules/axe-core/axe.min.js'), 'utf8');
  const consoleBrowser = await chromium.launch({headless: true, ...(process.env.UPTIME_TEST_CHROMIUM ? {executablePath: process.env.UPTIME_TEST_CHROMIUM} : {}), args: ['--use-mock-keychain', '--password-store=basic', '--no-sandbox']});
  try {
    const context = await consoleBrowser.newContext();
    await context.addCookies(owner.cookie.split(/;\s*/).filter(Boolean).map(pair => { const i = pair.indexOf('='); return {name: pair.slice(0, i), value: pair.slice(i + 1), url: origin}; }));
    const page = await context.newPage();
    await page.goto(`${origin}/app`);
    if (new URL(page.url()).pathname === '/setup') { await page.getByRole('button', {name: 'Continue', exact: true}).click(); await page.waitForURL(url => url.pathname.startsWith('/app')); }
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 1000});
      await page.goto(`${origin}/app/monitors/${ids.mobile}`);
      const panel = page.locator('#pagespeed-panel');
      await panel.locator('#pagespeed-waterfall').waitFor({timeout: 30000});
      assert.match(await panel.locator('[data-check="budget:lcpMs"]').textContent(), /Over budget/);
      assert.match(await panel.locator('[data-check="budget:cls"]').textContent(), /Over budget/);
      assert.ok(await panel.locator('#pagespeed-waterfall li').count() >= 2);
      assert.match(await panel.locator('#pagespeed-errors').textContent(), /Mobile checkout script failed/);
      assert.equal(await panel.locator('#pagespeed-synthetic-denominator').textContent(), `${both.checks} page-speed checks, ${both.overBudget} over budget.`);
      assert.match(await panel.locator('#pagespeed-rum-denominator').textContent(), /^5 sampled page views/);
      assert.equal(await panel.locator('#pagespeed-rum tbody[data-route="/s/shop/checkout"][data-device="mobile"]').count(), 2);
      for (const country of ['US', 'CA']) {
        const countryRow = panel.locator(`#pagespeed-rum tbody[data-route="/s/shop/checkout"][data-device="mobile"][data-region="${country}"]`), cls = row('/s/shop/checkout', 'mobile', country).cls.percentiles;
        assert.equal(await countryRow.locator('[data-figure="views"]').textContent(), '1');
        // The typical and slow-end CLS shown are the row's measured p50 and p75, not its average.
        const shown = await countryRow.locator('[data-figure^="cls:"]').allTextContents();
        assert.deepEqual(shown, [cls.p50.toFixed(3), cls.p75.toFixed(3)]);
        assert.ok(Number(shown[0]) > 0.1, `real CLS displayed for ${country} at ${width}`);
      }
      assert.match(await panel.locator('#pagespeed-rum tbody[data-route="/s/shop/unavailable"]').textContent(), /0% of 1/);
      assert.equal(await panel.locator('#pagespeed-sample').inputValue(), '50');
      const privacy = await panel.locator('#pagespeed-beacon #pagespeed-privacy').textContent();
      for (const promise of [/no cookies/, /no IP addresses/, /consent/, /Do Not Track or Global Privacy Control/, /erase all/]) assert.match(privacy, promise, 'the privacy copy beside the snippet states what is never kept and that the owner can erase');
      await panel.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}`);
      await page.addScriptTag({content: axeSource});
      const result = await page.evaluate(() => axe.run(document.querySelector('#pagespeed-panel'), {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']}}));
      assert.deepEqual(result.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id), [], `no serious axe finding at ${width}`);
      const evidence = resolve(process.env.UPTIME_PERF_UI_EVIDENCE ?? 'data/pagespeed-evidence'); await mkdir(evidence, {recursive: true});
      await page.screenshot({path: join(evidence, `pagespeed-${width}.png`), fullPage: true});
      await writeFile(join(evidence, `pagespeed-${width}.json`), JSON.stringify({width, mobile: m, desktop: d, rows: report.rows, violations: result.violations.map(v => v.id)}, null, 2));
    }
    // The owner changes sampling in the console; the next served beacon carries it.
    await page.locator('#pagespeed-sample').fill('20');
    await page.getByRole('button', {name: 'Save beacon settings'}).click();
    await page.getByText('Beacon settings saved.').waitFor();
    assert.ok((await (await fetch(`${origin}/rum/v1/s/${site.id}.js`)).text()).includes('"sample":0.2'));
  } finally { await consoleBrowser.close(); }
  // Additional measurements use the same registered public collector and report,
  // after the console assertions. Weighted ranks must differ from
  // averages, combine hours, exclude missing metrics and never count bot values.
  const values = [100, 200, 200, 800];
  for (const lcpMs of values) assert.equal((await worker.dispatchFetch(`${origin}/rum/v1/collect`, {method: 'POST', headers: {origin: fixture.origin, 'content-type': 'text/plain', 'user-agent': PHONE},
    body: JSON.stringify({...view, route: '/s/shop/percentiles', lcpMs, cls: lcpMs/1000, inpMs: lcpMs/2, errors: 2}), cf: {country: 'US', regionCode: 'CA'}})).status, 204);
  // Retain an earlier hourly bucket of the same admitted measurements; the report must weight both hours.
  await DB.prepare("UPDATE rum_value_counts SET hour=hour-3600000 WHERE site_id=? AND route='/s/shop/percentiles' AND value=200").bind(site.id).run();
  const sendEdge = async (country, regionCode, agent = PHONE) => worker.dispatchFetch(`${origin}/rum/v1/collect`, {method: 'POST', headers: {origin: fixture.origin, 'content-type': 'text/plain', 'user-agent': agent},
    body: JSON.stringify({...view, route: '/s/shop/percentiles', lcpMs: null, cls: null, inpMs: null, errors: 0}), cf: {country, regionCode}});
  assert.equal((await sendEdge('US', 'NY')).status, 204);
  assert.equal((await sendEdge('CA', 'ON')).status, 204);
  assert.equal((await sendEdge('US', undefined)).status, 204);
  assert.equal((await sendEdge('US', 'CA', 'Googlebot/2.1')).status, 204);
  const distribution = await ok(`/api/rum/sites/${site.id}/report`), us = distribution.rows.find(r => r.route === '/s/shop/percentiles' && r.region === 'US');
  assert.equal(us.views, 6); assert.equal(us.errors, 8);
  assert.deepEqual(us.lcpMs.percentiles, {p50: 200, p75: 200, p95: 800, of: 4});
  assert.deepEqual(us.cls.percentiles, {p50: .2, p75: .2, p95: .8, of: 4});
  assert.deepEqual(us.inpMs.percentiles, {p50: 100, p75: 100, p95: 400, of: 4});
  assert.notEqual(us.lcpMs.percentiles.p75, us.lcpMs.average, 'percentiles are not averages');
  const parts = distribution.subdivisions.filter(r => r.route === '/s/shop/percentiles');
  assert.deepEqual(parts.map(r => [r.region, r.subdivision, r.views]).sort(), [['CA', null, 1], ['US', null, 1], ['US', 'CA', 4], ['US', 'NY', 1]].sort(), 'only available US subdivision codes are grouped; country and unknown subdivision stay separate');
  assert.equal(parts.find(r => r.subdivision === 'CA').errors, 8);
  assert.deepEqual(parts.find(r => r.subdivision === 'NY').inpMs, {p50: null, p75: null, p95: null, of: 0}, 'missing input is absent, never a zero sample');
  console.log('PERF-001 RUM report assertions passed: measured browser errors and LCP/CLS/INP percentiles, weighted ranks across hours, missing metrics, bot exclusion and edge US subdivisions.');
  await proveRumErasure({ok, api, DB, worker, origin, site});
  await provePopulatedRumRestore({ok, DB, site, fixture, origin, distribution});
  await proveConsoleErasure({ok, DB, origin, owner, monitor: ids.mobile, site});
  // Paused once proven, so the journey's later hard stops find only their own flow's run folder on each runner.
  for (const monitor of ids.created) await ok(`/api/monitors/${monitor.id}`, 'PATCH', {...monitor.definition, enabled: false});
}

// A populated installation from before the beacon upgrades by one additive migration that rewrites nothing.
export async function proveRumUpgrade() {
  const directory = await mkdtemp(join(tmpdir(), 'uptime-rum-upgrade-')), bindings = {...testAuthBindings, UPTIME_RUNNER_KEY: randomUUID() + randomUUID()}, legacyId = `self-${randomUUID()}`;
  let worker;
  try {
    const [port] = await availablePorts(1);
    worker = await startLocalWorker({port, persist: directory, bindings, outboundService: async () => new Response('', {status: 200})});
    const DB = await worker.getD1Database('DB'), names = (await readdir('migrations')).filter(n => n.endsWith('.sql')).sort(), rum = names.find(n => n.startsWith('0066_'));
    const apply = async name => { if (name.endsWith('_resilient_monitoring.sql')) { await DB.prepare('INSERT INTO runner_registration(id,runner_id,registered_at) VALUES(1,?,?)').bind(legacyId, Date.now()).run(); await DB.prepare('INSERT INTO runner_contact(id,last_contact_at) VALUES(1,?)').bind(Date.now() - 5).run(); } for (const sql of splitSql(await readFile(join('migrations', name), 'utf8'))) await DB.prepare(sql).run(); };
    for (const name of names.filter(n => n < rum)) await apply(name);
    const now = Date.now(), definition = JSON.stringify(validateDefinition({name: 'Shop', url: 'https://shop.example.test/', enabled: true}, []));
    await DB.batch([DB.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind('shop-one', 1, definition, now, JSON.stringify({state: 'Unknown'})), DB.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind('shop-one', 1, definition, now), DB.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind('shop-one')]);
    const read = async () => ({monitors: (await DB.prepare('SELECT * FROM monitors ORDER BY rowid').all()).results, revisions: (await DB.prepare('SELECT * FROM revisions ORDER BY rowid').all()).results});
    const before = await read();
    await apply(rum);
    assert.deepEqual(await read(), before, 'the beacon migration rewrites no monitor or revision');
    for (const table of ['rum_sites', 'rum_aggregates', 'rum_dropped']) assert.equal(Number((await DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n), 0);
    for (const name of names.filter(n => n > rum && !n.startsWith('0077_'))) await apply(name);
    const origin = (await worker.ready).origin, cookie = await signInOwner(origin, {bindings});
    const get = async path => { const response = await fetch(origin + path, {headers: {cookie, origin}}); const body = await response.json(); assert.equal(response.status, 200, path + ' ' + JSON.stringify(body)); return body; };
    assert.deepEqual((await get('/api/rum/sites')).sites, [], 'an upgraded installation has no beacon until its owner registers one');
    assert.ok((await get('/api/archive')).payload.tables.monitors.some(r => r.id === 'shop-one'), 'the upgraded installation still exports its monitors');
    const legacySite = randomUUID(), hour = Math.floor(now/3600000)*3600000;
    await DB.prepare('INSERT INTO rum_sites VALUES(?,?,1,35,?, ?,?)').bind(legacySite, 'https://synthetic-uptime-3.example.test', '["/account"]', now, now).run();
    await DB.prepare("INSERT INTO rum_aggregates(site_id,hour,route,device,region,views,known_views,lcp_n,lcp_sum) VALUES(?,?,'/','mobile','US',3,3,3,1200)").bind(legacySite,hour).run();
    const priorRum = (await DB.prepare('SELECT * FROM rum_aggregates').all()).results;
    await apply(names.find(n => n.startsWith('0077_')));
    assert.deepEqual((await DB.prepare('SELECT * FROM rum_aggregates').all()).results, priorRum, 'percentile migration preserves existing aggregates byte for byte');
    assert.deepEqual(await read(), before, 'percentile migration preserves populated monitor history');
    const legacy = await get(`/api/rum/sites/${legacySite}/report`);
    assert.equal(legacy.rows[0].lcpMs.average, 400);
    assert.deepEqual(legacy.rows[0].lcpMs.percentiles, {p50: null, p75: null, p95: null, of: 0}, 'old sums cannot invent percentile samples');
    assert.deepEqual(legacy.subdivisions, [], 'old country-only sums cannot invent subdivisions');
    assert.ok((await get('/api/archive')).payload.tables.monitors.some(r => r.id === 'shop-one'), 'the upgraded inventory explicitly classifies the new frequency table even when empty');
  } finally { await worker?.dispose(); await rm(directory, {recursive: true, force: true}); }
}

// A populated, enabled source exports through the owner door; an independently
// established receiver restores through its owner door. Neither registration,
// sampling nor visitor aggregates can become authority at the destination.
async function provePopulatedRumRestore({ok, DB, site, fixture, origin, distribution}) {
  const audits = (await DB.prepare("SELECT * FROM uptime_audit WHERE subject_kind='rum_site' ORDER BY rowid").all()).results;
  const archive = await ok('/api/archive');
  const all = {...archive.payload.tables, ...archive.payload.productTables};
  for (const table of ['rum_sites', 'rum_aggregates', 'rum_dropped', 'rum_value_counts']) assert.ok(!Object.hasOwn(all, table), `${table} stays installation-local`);
  for (const action of ['rum_site_register', 'rum_site_change', 'rum_site_disable', 'rum_site_erase']) assert.ok(audits.some(row => row.action === action), `${action} was written by an owner operation`);
  const auditIds = new Set(audits.map(row => row.id));
  assert.deepEqual(all.uptime_audit.filter(row => auditIds.has(row.id)), audits, 'export retains every RUM audit row');
  assert.ok(distribution.views > 5 && distribution.site.enabled && distribution.site.samplePercent === 20, 'the exported source is populated and enabled with saved sampling');
  const directory = await mkdtemp(join(tmpdir(), 'uptime-rum-restore-'));
  let receiver, receiverDB;
  try {
    const [port] = await availablePorts(1), target = `http://127.0.0.1:${port}`;
    const bindings = {...testAuthBindings, SESSION_SECRET: randomUUID()+randomUUID(), UPTIME_RUNNER_KEY: randomUUID()+randomUUID()};
    ({worker: receiver, DB: receiverDB} = await migratedWorker({port, persist: directory, bindings}));
    const owner = ownerAPI(target); await owner.signIn(bindings);
    const request = async (path, method = 'GET', body) => { const r = await owner.api(path, method, body); assert.equal(r.status, 200, `${path}: ${JSON.stringify(r.data)}`); return r.data; };
    // The receiving validator admits only the exact action and subject pairs.
    for (const change of [{action: 'rum_site_unknown'}, {subject_kind: 'monitor'}, {action: 'credential_rotate'}]) {
      const invalid = structuredClone(archive);
      const row = invalid.payload.productTables.uptime_audit.find(row => auditIds.has(row.id));
      Object.assign(row, change);
      invalid.sha256 = createHash('sha256').update(JSON.stringify(invalid.payload)).digest('hex');
      const refused = await owner.api('/api/restore', 'POST', invalid);
      assert.equal(refused.status, 400, 'restore rejects an unrecognized or mismatched RUM audit');
      assert.match(refused.data.error, /Invalid anonymized archive audit/);
    }
    await request('/api/restore', 'POST', archive);
    assert.deepEqual((await request('/api/rum/sites')).sites, [], 'restore carries no enabled registration or saved sample');
    assert.match(await (await fetch(`${target}/rum/v1/s/${site.id}.js`)).text(), /not enabled/, 'the source snippet cannot collect on the receiver');
    const rejected = await fetch(`${target}/rum/v1/collect`, {method: 'POST', headers: {origin: fixture.origin, 'content-type': 'text/plain', 'user-agent': PHONE}, body: JSON.stringify({site: site.id, route: '/', device: 'mobile', status: 'ok', lcpMs: 1, cls: 0, inpMs: 1, ttfbMs: 1, errors: 0})});
    assert.equal(rejected.status, 403, 'restored collection is off');
    for (const table of ['rum_sites', 'rum_aggregates', 'rum_dropped', 'rum_value_counts']) assert.equal((await receiverDB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n, 0, `${table} remains empty after the refused beacon`);
    const restored = await request('/api/archive');
    assert.deepEqual(restored.payload.productTables.uptime_audit.filter(row => auditIds.has(row.id)), audits, 'RUM audit history arrived at the independent receiver');
    assert.equal(restored.payload.tables.monitors.length, archive.payload.tables.monitors.length, 'portable monitors survived the same restore');
    const local = await ok('/api/rum/sites');
    assert.ok(local.sites.some(r => r.id === site.id && r.enabled && r.samplePercent === 20), 'export preserves the source registration and sampling');
    assert.equal((await ok(`/api/rum/sites/${site.id}/report`)).views, distribution.views, 'export preserves source aggregates');
    console.log('PERF-001 populated archive and restore passed: registration, sampling and all aggregates stay local; restored collection is off; every RUM audit arrives.');
  } finally { await receiver?.dispose(); await rm(directory, {recursive: true, force: true}); }
}

async function proveRumErasure({ok, api, DB, worker, origin, site}) {
  const doomed = await ok('/api/rum/sites', 'POST', {origin: 'https://synthetic-uptime-4.example.test', enabled: true, samplePercent: 100});
  const body = JSON.stringify({site: doomed.id, route: '/checkout', device: 'mobile', status: 'ok', lcpMs: 200, cls: 0.1, inpMs: 100, ttfbMs: 50, errors: 1});
  const beacon = agent => worker.dispatchFetch(`${origin}/rum/v1/collect`, {method: 'POST', headers: {origin: doomed.origin, 'user-agent': agent}, body, cf: {country: 'US', regionCode: 'CA'}});
  assert.equal((await beacon(PHONE)).status, 204);
  assert.equal((await beacon('Googlebot')).status, 204);
  const tables = ['rum_aggregates', 'rum_dropped', 'rum_value_counts'];
  for (const table of tables) assert.ok((await DB.prepare(`SELECT COUNT(*) n FROM ${table} WHERE site_id=?`).bind(doomed.id).first()).n > 0, `${table} is populated before erasure`);
  const surviving = await ok(`/api/rum/sites/${site.id}/report`);
  const retained = await Promise.all(tables.map(async table => (await DB.prepare(`SELECT * FROM ${table} WHERE site_id=? ORDER BY rowid`).bind(site.id).all()).results));
  await ok(`/api/rum/sites/${doomed.id}`, 'PATCH', {enabled: false});
  assert.ok((await ok(`/api/rum/sites/${doomed.id}/report`)).views > 0, 'disabling retains the report until owner erasure');
  await ok(`/api/rum/sites/${doomed.id}`, 'PATCH', {enabled: true});
  assert.deepEqual(await ok(`/api/rum/sites/${doomed.id}`, 'DELETE'), {erased: true});
  assert.equal((await api(`/api/rum/sites/${doomed.id}/report`)).status, 404, 'the erased site report is gone');
  assert.ok(!(await ok('/api/rum/sites')).sites.some(row => row.id === doomed.id), 'the erased registration is gone');
  for (const table of tables) assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM ${table} WHERE site_id=?`).bind(doomed.id).first()).n, 0, `${table} is erased with its registration`);
  assert.equal((await beacon(PHONE)).status, 403, 'the erased origin cannot collect');
  assert.deepEqual(await ok(`/api/rum/sites/${site.id}/report`), surviving, 'a second site report survives erasure');
  assert.deepEqual(await Promise.all(tables.map(async table => (await DB.prepare(`SELECT * FROM ${table} WHERE site_id=? ORDER BY rowid`).bind(site.id).all()).results)), retained, 'a second site retains every aggregate');
  console.log('PERF-001 owner erasure passed: registration and all aggregate tables removed atomically, erased-origin collection refused, independent site retained.');
}

// The owner erases the populated site from the monitor's page: the confirm sends one DELETE for the shown site, then the
// registration and every aggregate are gone, its snippet does nothing and the panel offers registration again.
async function proveConsoleErasure({ok, DB, origin, owner, monitor, site}) {
  const browser = await chromium.launch({headless: true, ...(process.env.UPTIME_TEST_CHROMIUM ? {executablePath: process.env.UPTIME_TEST_CHROMIUM} : {}), args: ['--use-mock-keychain', '--password-store=basic', '--no-sandbox']});
  try {
    const context = await browser.newContext();
    await context.addCookies(owner.cookie.split(/;\s*/).filter(Boolean).map(pair => { const i = pair.indexOf('='); return {name: pair.slice(0, i), value: pair.slice(i + 1), url: origin}; }));
    const page = await context.newPage(), erasures = [];
    page.on('request', request => { if (request.method() === 'DELETE') erasures.push(new URL(request.url()).pathname); });
    await page.goto(`${origin}/app/monitors/${monitor}`);
    const panel = page.locator('#pagespeed-panel');
    await panel.locator('#pagespeed-erase > summary').click();
    await panel.locator('#pagespeed-erase-confirm').click();
    await panel.locator('#pagespeed-register').waitFor();
    assert.deepEqual(erasures, [`/api/rum/sites/${site.id}`], 'one erasure request for the site the panel shows');
  } finally { await browser.close(); }
  assert.ok(!(await ok('/api/rum/sites')).sites.some(row => row.id === site.id), 'the console erased the registration');
  for (const table of ['rum_aggregates', 'rum_dropped', 'rum_value_counts']) assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM ${table} WHERE site_id=?`).bind(site.id).first()).n, 0, `${table} is erased from the console`);
  assert.match(await (await fetch(`${origin}/rum/v1/s/${site.id}.js`)).text(), /not enabled/, 'the erased site serves a beacon that does nothing');
  console.log('PERF-001 console erasure passed: one confirmed DELETE from the monitor page removed the registration and every aggregate.');
}
