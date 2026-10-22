// DEPENDENCY-002 with full-size official status documents (each over 64 KiB) at the authorized status-source edge: the owner
// follows a Cloudflare component, a Google Cloud product in one location, PayPal REST APIs in production and Okta through the
// console's catalog control; each scheduled check reads its part with the catalog's streaming reader. A stated incident and
// recovery on each send one dependency notice and one recovery notice through the route, open no Uptime incident and leave the
// application monitor unchanged; a document past the reader's bound and a changed shape each turn the dependency Unknown with the
// review marker. Part of the catalog journey (service-catalog-journey.mjs), which supplies the installation and its helpers.
import assert from 'node:assert/strict';
import {hosts} from './service-catalog-fixture.mjs';
const MIB = 1024 * 1024;
export async function proveFullSizeSources({g, edge, page, catalog, search, entry, ok, rows, monitors, routeFor, check, twice, run, contact, receiver, widths, evidence, startLooking, stopLookingNow, snapshot}) {
 const follow = async (name, choose, before = async () => {}) => {
  await search(name.toLowerCase());
  const card = entry(name);
  await choose(card);await before(card);
  await card.getByRole('button', {name: 'Follow', exact: true}).click();
  const outcome = card.locator('.catalog-feedback[data-state=done], .catalog-feedback[data-state=error]');await outcome.waitFor({timeout: 30000});
  assert.equal(await outcome.getAttribute('data-state'), 'done', await outcome.innerText());
  return (await monitors()).filter(m => m.definition.service === name).at(-1);
 };
 const component = (box, region) => async card => {
  await card.getByLabel('Chosen components', {exact: true}).check();
  if (region) await card.locator('.catalog-region select').selectOption(region);
  await card.getByRole('checkbox', {name: box, exact: true}).check();
 };
 startLooking();
 await page.goto(g.origin + '/app/monitor');await catalog.waitFor();
 const cloudflare = await follow('Cloudflare', component('Workers'));
 // A product in one location: the control lists one location's products at a time, at desktop and phone width.
 const google = await follow('Google Cloud', component('Google Compute Engine · us-central1', 'us-central1'), async card => {
  assert.equal(await card.locator('.catalog-component:not([hidden])').count(), 6, 'one location lists its six products');
  await widths(page, 'catalog-location', {evidence, target: card});
 });
 const paypal = await follow('PayPal', component('REST APIs · production', 'production'));
 const okta = await follow('Okta', async () => {});
 await stopLookingNow();
 const parts = {cloudflare, google, paypal, okta};
 assert.deepEqual(Object.fromEntries(Object.entries(parts).map(([name, m]) => [name, m.definition.catalog])), {
  cloudflare: {entry: 'cloudflare', scope: 'component', key: 'workers', ref: 'synthetic-uptime-workers'},
  google: {entry: 'google-cloud', scope: 'component', key: 'google-compute-engine-us-central1', ref: 'synthetic-uptime-gce'},
  paypal: {entry: 'paypal', scope: 'component', key: 'rest-apis-production', ref: '7'},
  okta: {entry: 'okta', scope: 'whole', key: null, ref: null}}, 'each follow saved its catalog part and the provider id its live check read');
 for (const m of Object.values(parts)) assert.deepEqual(m.definition.assertions, {status: 200}, 'the provider claim is read by the catalog reader, not asserted over the document');
 for (const [host, path] of [[hosts.cloudflare, '/api/v2/components.json'], [hosts.gcp, '/products.json'], [hosts.gcp, '/incidents.json'], [hosts.paypal, '/api/v1/components'], [hosts.okta, '/OktaStatusRSS']])
  assert.ok(edge.requests.some(r => r.host === host && r.path === path), `the live check read ${host}${path}`);
 // Every part's notices go to one contact; an application monitor that checks once an hour sits beside them.
 for (const m of Object.values(parts)) await routeFor(m.id, {destinationIds: [contact.id], contactSettings: {}});
 const app = await ok('/api/monitors', {name: 'Checkout', url: `https://${hosts.app}/`, intervalMs: 3600000, freshnessMs: 86400000, retries: 0, confirmSlots: 2, recoverSlots: 2, probes: ['local-a'], assignments: {'local-a': g.first.runnerId}, service: 'Checkout'});
 edge.state.app = 200;await twice(app.id);
 const appBefore = await snapshot(app.id), outbox = id => rows(`SELECT kind FROM outbox WHERE monitor_id='${id}' ORDER BY rowid`).then(r => r.map(row => row.kind));
 const state = async id => (await ok('/api/overview')).monitors.find(m => m.id === id).state.state;
 // A stated incident, then recovery, on each followed part, through scheduled signed-runner checks.
 const incidents = {cloudflare: s => { s.status = s.status === 'operational' ? 'major_outage' : 'operational'; }, google: s => { s.open = !s.open; }, paypal: s => { s.status = s.status === 'Operational' ? 'Degraded Performance' : 'Operational'; }, okta: s => { s.open = !s.open; }};
 const source = {cloudflare: edge.state.cloudflare, google: edge.state.gcp, paypal: edge.state.paypal, okta: edge.state.okta};
 for (const [name, m] of Object.entries(parts)) {
  await twice(m.id);assert.equal(await state(m.id), 'Healthy', `${name} states operational`);
  incidents[name](source[name]);await twice(m.id);
  assert.equal(await state(m.id), 'Failing', `${name} states an issue`);
  incidents[name](source[name]);await twice(m.id);
  assert.equal(await state(m.id), 'Healthy', `${name} states operational again`);
  assert.deepEqual(await outbox(m.id), ['dependency', 'dependency_recovery'], `${name}: one dependency notice and one recovery notice, no incident trigger`);
  assert.deepEqual(await ok(`/api/monitors/${m.id}/incidents`), [], `${name} opened no Uptime incident`);
 }
 for (let i = 0; i < 4; i++) await run();
 const delivered = receiver.records.filter(r => r.body.eventType?.startsWith('uptime.dependency') && ['Cloudflare', 'Google Cloud', 'PayPal', 'Okta'].includes(r.body.dependency?.provider));
 assert.deepEqual(delivered.map(r => [r.body.dependency.provider, r.body.dependency.component, r.body.eventType, r.body.dependency.stated]).sort(), [
  ['Cloudflare', 'Workers', 'uptime.dependency.firing', 'major_outage'], ['Cloudflare', 'Workers', 'uptime.dependency.recovered', 'operational'],
  ['Google Cloud', 'Google Compute Engine · us-central1', 'uptime.dependency.firing', 'SERVICE_OUTAGE'], ['Google Cloud', 'Google Compute Engine · us-central1', 'uptime.dependency.recovered', 'operational'],
  ['PayPal', 'REST APIs · production', 'uptime.dependency.firing', 'Degraded Performance'], ['PayPal', 'REST APIs · production', 'uptime.dependency.recovered', 'operational'],
  ['Okta', null, 'uptime.dependency.firing', 'Service Disruption'], ['Okta', null, 'uptime.dependency.recovered', 'operational']].sort(), 'each notice and recovery reached the route once, with the part and the provider’s stated status');
 assert.deepEqual(await snapshot(app.id), appBefore, 'the application monitor’s state, revisions and evidence are unchanged');
 // Past the reader's bound, or not the provider's format: Unknown with the review marker, never operational, and no notice.
 const notices = (await rows("SELECT id FROM outbox WHERE kind LIKE 'dependency%'")).length;
 const unknown = async (name, m) => {
  assert.equal(await state(m.id), 'Unknown', `${name} is Unknown`);
  const view = (await ok('/api/service-catalog')).followed.find(f => f.monitorId === m.id);
  assert.equal(view.sourceState, 'unknown');assert.equal(view.review.state, 'needs_review', `${name} needs review`);
 };
 edge.state.cloudflare.mode = 'oversize';
 // Memory: the runner process's RSS, sampled every 5 ms across the scheduled check, against its RSS just before it.
 const baseline = process.memoryUsage.rss(), samples = [], sampler = setInterval(() => samples.push(process.memoryUsage.rss()), 5);
 try { await check(cloudflare.id); } finally { clearInterval(sampler); }
 const read = edge.oversized.at(-1), peak = Math.max(baseline, ...samples) - baseline;
 for (const until = Date.now() + 5000; !read.closed && Date.now() < until;) await new Promise(resolve => setTimeout(resolve, 20));
 assert.ok(read.closed && read.sent < read.total, 'the runner stopped reading at its bound and closed the connection');
 assert.ok(peak < read.total, 'the reader never holds the oversize document');
 console.log(`CATALOG_READER_MEMORY oversize ${read.total / MIB} MiB document, reader bound 1 MiB: the edge had queued ${(read.sent / MIB).toFixed(1)} MiB when the runner closed it; runner process peak RSS delta ${(peak / MIB).toFixed(1)} MiB (process.memoryUsage.rss() every 5 ms across the scheduled check, minus the RSS just before it; ${samples.length} samples)`);
 assert.match((await ok(`/api/monitors/${cloudflare.id}/history`))[0].observations[0].checks[0].reason, /larger than the catalog reader reads/);
 await unknown('Cloudflare past the bound', cloudflare);
 edge.state.okta.mode = 'oversize';await check(okta.id);await unknown('Okta past the bound', okta);
 for (const [name, m, s] of [['Google Cloud', google, edge.state.gcp], ['PayPal', paypal, edge.state.paypal]]) {s.mode = 'shape';await check(m.id);await unknown(`${name} with another shape`, m)}
 assert.equal((await rows("SELECT id FROM outbox WHERE kind LIKE 'dependency%'")).length, notices, 'an unreadable source states nothing, so it sends no notice');
 await page.goto(g.origin + '/app/monitors/' + encodeURIComponent(cloudflare.id));
 await page.locator('.followed-panel .followed-review').waitFor();
 await widths(page, 'followed-oversize', {evidence, target: page.locator('.followed-panel')});
 for (const s of Object.values(source)) s.mode = 200;
 return Object.values(parts).length;
}
