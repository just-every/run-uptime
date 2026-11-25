import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {
 assertHealthyTick, authorizeRequests, clientHeaders, dispatchCron, migrate, migrationPlan,
 minute, minutesPerDay, monitorCount, origin, runtime, seedHistory,
} from './cron-d1-history-fixture.mjs';
import {proveCanaryBucketBudget, proveAvailabilityDumpRoundTrip} from './cron-d1-bucket-fixture.mjs';
import {proveNotificationIndexUpgrade} from './cron-d1-notification-fixture.mjs';

const {values} = parseArgs({options:{
 dist:{type:'string', default:'dist'},
 'history-days':{type:'string', default:'30'},
}});
const historyMinutes = Number(values['history-days']) * minutesPerDay;
assert.ok(Number.isSafeInteger(historyMinutes) && historyMinutes >= minutesPerDay, 'history-days must be at least one day');

const day = minutesPerDay * minute;
const dailyBudget = 1_000_000;
const dailyWriteBudget = 70_000;
const migrationWriteBudget = 20_000;
const freeDailyWriteLimit = 100_000;
const cronWriteBudget = 56;
const cronBudget = 300_000;
const coldCronBudget = 500_000 / minutesPerDay;
const coldReadBudget = 1_000;
const manualRunReadBudget = 180;
const activePollInterval = 5_000;
const unchangedPollInterval = minute;
const scrapeInterval = 15_000;

async function readMeter(request, door, time) {
 const response = await request('/__d1_meter?summary=1');
 assert.equal(response.status, 200);
 const report = await response.json();
 assert.equal(report.door, door);
 assert.equal(report.time, time);
 assert.deepEqual(report.unmetered, [], 'every D1 statement supplies genuine row-access metadata');
 return report;
}

async function pollOverview(request, time, cookie, etag) {
 const response = await request('/api/overview', {headers:{
  ...clientHeaders, cookie, 'x-uptime-time-zone':'Australia/Brisbane', 'x-d1-meter-time':String(time), ...(etag ? {'if-none-match':etag} : {}),
 }});
 const ttl = Number(response.headers.get('x-uptime-overview-ttl'));
 assert.ok(response.headers.has('x-uptime-overview-ttl') && Number.isFinite(ttl) && ttl >= 0, 'poll advertises its next clock deadline');
 if (response.status === 304) {
  assert.ok(etag, 'unchanged response follows a successful poll');
  assert.equal(response.headers.get('etag')?.replace(/^W\//,''), etag.replace(/^W\//,''), '304 preserves the opaque validator');
  assert.equal(await response.text(), '', 'unchanged overview has no body');
  return {etag:response.headers.get('etag'), unchanged:true, ttl};
 }
 assert.equal(response.status, 200, 'signed-in overview poll succeeds');
 const {monitors} = await response.json();
 assert.equal(monitors.length, monitorCount);
 assert.ok(monitors.every(({availability}) => availability.lastCheckAt >= time - minute), 'overview reports the latest scheduled evidence');
 const updated = response.headers.get('etag');
 assert.ok(updated, 'overview advertises an ETag');
 assert.notEqual(updated, etag, 'a conditional 200 returns a changed overview');
 return {etag:updated, unchanged:false, ttl};
}

async function scrapeMetrics(request, time, authorization, ids) {
 const response = await request('/api/v1/metrics', {headers:{
  ...clientHeaders, authorization, 'x-d1-meter-time':String(time),
 }});
 assert.equal(response.status, 200, 'authenticated Prometheus scrape succeeds');
 const metrics = await response.text();
 for (const id of ids) assert.ok(metrics.includes(`uptime_availability_observed_seconds{monitor_id="${id}"}`));
}

async function checkAfterSave(worker, cookie, tick) {
 await dispatchCron(await worker.getWorker(), tick);
 const db = await worker.getD1Database('DB');
 const {results:[checked, edited]} = await db.prepare('SELECT id, definition FROM monitors ORDER BY rowid LIMIT 2').all();
 const request = (path, init) => worker.dispatchFetch(origin + path, init);
 const requestAt = (path, time, {method='GET', body}={}) => request(path, {
  method, body, headers:{...clientHeaders, origin, cookie, 'content-type':'application/json', 'x-d1-meter-time':String(time)},
 });
 const savePath = `/api/monitors/${edited.id}`, saveAt = tick + 2_000;
 const saved = await requestAt(savePath, saveAt, {method:'PATCH', body:JSON.stringify({...JSON.parse(edited.definition), name:'Renamed service'})});
 assert.equal(saved.status, 200, 'the owner saves another monitor');
 await saved.json();
 await readMeter(request, savePath, saveAt);

 const runPath = `/api/monitors/${checked.id}/run`, runAt = saveAt + 2_000;
 const run = await requestAt(runPath, runAt, {method:'POST', body:'{}'});
 assert.equal(run.status, 200, 'the owner can run a check after saving');
 const {slotId} = await run.json();
 const cost = await readMeter(request, runPath, runAt);
 const history = await requestAt(`/api/monitors/${checked.id}/history`, runAt + 1_500);
 assert.equal(history.status, 200);
 const slot = (await history.json()).find(slot => slot.id === slotId);
 assert.equal(slot?.status, 'complete', 'the first history poll finds the manual check complete before Cron');
 assert.ok(slot.observations.some(observation => observation.outcome === 'pass'), 'the manual check recorded passing evidence');
 assert.ok(cost.rows <= manualRunReadBudget, `Run check read ${cost.rows} D1 rows including background work, expected at most ${manualRunReadBudget}`);
 console.log(`Run check after saving: ${cost.rows} D1 rows read and complete on the first history poll`);
}

async function measureDay(worker, {cookie, authorization}, firstMinute, migrationWrites) {
 // Miniflare's dispatchFetch closes each connection. Pool loopback requests
 // to workerd's real HTTP listener so a full day can run on a shared host.
 const listener = await worker.ready;
 const request = (path, init) => fetch(new URL(path, listener), init);
 const usage = new Map();
 function record(kind, {rows, writes}) {
  const total = usage.get(kind) ?? {rows:0, writes:0, calls:0, max:0, maxWrites:0};
  total.rows += rows;
  total.writes += writes;
  total.calls++;
  total.max = Math.max(total.max, rows);
  total.maxWrites = Math.max(total.maxWrites, writes);
  usage.set(kind, total);
 }
 const service = await worker.getWorker();
 const db = await worker.getD1Database('DB');
 const ids = (await db.prepare('SELECT id FROM monitors').all()).results.map(({id}) => id);
 let nextCron = firstMinute, nextPoll = firstMinute, nextScrape = firstMinute;
 let etag, coldCron, coldOverview, coldScrape;
 const end = firstMinute + day;
 for (let time = firstMinute; time < end; time = Math.min(nextCron, nextPoll, nextScrape)) {
  if (time === nextCron) {
   await dispatchCron(service, time);
   const cost = await readMeter(request, 'cron', time);
   assert.ok(cost.rows > 0, 'scheduled checks exercised metered D1 reads');
   if (coldCron === undefined) {
    coldCron = cost.rows;
    console.log(`Cold cron: ${cost.rows} D1 rows read, ${cost.writes} written`);
    assert.ok(coldCron < coldCronBudget, `fresh Workers on a minute schedule would read ${coldCron * minutesPerDay} rows per day`);
   }
   assert.ok(cost.writes < cronWriteBudget, `cron at ${new Date(time).toISOString()} wrote ${cost.writes} rows; expected under ${cronWriteBudget}`);
   record('cron', cost);
   await assertHealthyTick(db, time);
   nextCron += minute;
  }
  if (time === nextPoll) {
   const result = await pollOverview(request, time, cookie, etag);
   const cost = await readMeter(request, '/api/overview', time);
   if (coldOverview === undefined) {
    coldOverview = cost.rows;
    console.log(`Cold overview: ${cost.rows} D1 rows read`);
   }
   etag = result.etag;
   record(result.unchanged ? 'unchanged overview' : 'changed overview', cost);
   nextPoll += Math.max(1000,Math.min(result.unchanged ? unchangedPollInterval : activePollInterval,result.ttl));
  }
  if (time === nextScrape) {
   await scrapeMetrics(request, time, authorization, ids);
   const cost = await readMeter(request, '/api/v1/metrics', time);
   if (coldScrape === undefined) {
    coldScrape = cost.rows;
    console.log(`Cold scrape: ${cost.rows} D1 rows read`);
   }
   record('metrics', cost);
   nextScrape += scrapeInterval;
  }
  if (time === firstMinute + 10 * minute - scrapeInterval) {
   console.log('First ten minutes: ' + [...usage].map(([kind, {rows, calls, max}]) =>
    `${kind} ${rows} reads in ${calls} calls (max ${max})`).join(', '));
   assert.ok(coldOverview < coldReadBudget, `cold overview read ${coldOverview} rows; expected under ${coldReadBudget}`);
   assert.ok(coldScrape < coldReadBudget, `cold scrape read ${coldScrape} rows; expected under ${coldReadBudget}`);
  }
 }
 const combined = [...usage.values()].reduce((rows, total) => rows + total.rows, 0);
 const written = [...usage.values()].reduce((rows, total) => rows + total.writes, 0);
 console.log(`${monitorCount} active monitors with ${historyMinutes / minutesPerDay} days of retained history`);
 for (const [kind, {rows, writes, calls, max, maxWrites}] of usage) console.log(`${kind}: ${rows} D1 rows read, ${writes} written in ${calls} calls, max ${max} reads and ${maxWrites} writes`);
 console.log(`Combined: ${combined} D1 rows read, ${written} written across one simulated day`);
 assert.equal(usage.get('cron').calls, minutesPerDay);
 assert.equal(usage.get('metrics').calls, day / scrapeInterval);
 assert.ok(usage.get('changed overview')?.calls > 1, 'a live overview changes as scheduled checks complete');
 assert.ok(usage.get('unchanged overview')?.calls > 0, 'unchanged polls exercise conditional responses and the slower cadence');
 assert.ok(usage.get('cron').rows < cronBudget, `cron read ${usage.get('cron').rows} rows; expected under ${cronBudget} per day`);
 assert.ok(combined < dailyBudget, `combined read ${combined} rows; expected under ${dailyBudget} per day`);
 assert.ok(written < dailyWriteBudget, `combined wrote ${written} rows; expected under ${dailyWriteBudget} per day`);
 assert.ok(migrationWrites + written < freeDailyWriteLimit, `upgrade day wrote ${migrationWrites + written} rows; expected under ${freeDailyWriteLimit}`);
}

const migrations = await migrationPlan();
await proveAvailabilityDumpRoundTrip([...migrations.initial,...migrations.buckets]);
const directory = await mkdtemp(join(tmpdir(), 'uptime-cron-d1-budget-'));
// Cron's scheduled clock must stay ahead of SQLite's unmodified authorization clock.
const firstMinute = Math.ceil(Date.now() / minute) * minute + 20 * minute;
let worker;
try {
 worker = await runtime(values.dist, directory);
 const fixtureDB = await worker.getD1Database('DB');
 const canaryDirectory = join(directory, 'canary');
 await mkdir(canaryDirectory);
 const canaryWorker = await runtime(values.dist, canaryDirectory);
 try {
  const canaryDB = await canaryWorker.getD1Database('DB');
  await migrate(canaryDB, migrations.initial);
  const canaryAuth = await authorizeRequests(canaryWorker);
  const notificationIndexes = migrations.compact.find(name => name.endsWith('_bound_notification_reads.sql'));
  const canaryMigrations = [...migrations.buckets, ...migrations.compact.filter(name => name !== notificationIndexes)];
  await proveCanaryBucketBudget(canaryWorker, canaryDB, canaryMigrations, canaryAuth, firstMinute);
  await proveNotificationIndexUpgrade(canaryWorker, canaryDB, notificationIndexes, canaryAuth, firstMinute);
 } finally {
  await canaryWorker.dispose();
 }
 await migrate(fixtureDB, migrations.initial);
 await seedHistory(fixtureDB, firstMinute, historyMinutes);
 const preCompactWrites = await migrate(fixtureDB, migrations.buckets, {profile:true});
 const compactWrites = await migrate(fixtureDB, migrations.compact, {profile:true});
 const migrationWrites = preCompactWrites + compactWrites;
 console.log(`Populated upgrade: ${migrationWrites} D1 rows written (${compactWrites} from compact hosted storage onward)`);
 assert.ok(migrationWrites < migrationWriteBudget, `upgrade wrote ${migrationWrites} rows; expected under ${migrationWriteBudget}`);
 const auth = await authorizeRequests(worker);
 // Warm the persisted data first. A first overview can initialize the time
 // zone and runner rows, which should invalidate an earlier validator.
 await dispatchCron(await worker.getWorker(), firstMinute - minute);
 const firstRequest = (path, init) => worker.dispatchFetch(origin + path, init);
 await pollOverview(firstRequest, firstMinute - minute + 5_000, auth.cookie);
 const original = await pollOverview(firstRequest, firstMinute - minute + 6_000, auth.cookie);
 const {id} = await fixtureDB.prepare('SELECT id FROM monitors ORDER BY rowid LIMIT 1').first();
 const historyPath = `/api/monitors/${id}/history`;
 const historyAt = firstMinute - minute + 6_500;
 const recent = await firstRequest(historyPath, {headers:{...clientHeaders, cookie:auth.cookie, 'x-d1-meter-time':String(historyAt)}});
 assert.equal(recent.status, 200, 'the signed-in monitor detail can read recent checks');
 const slots = await recent.json();
 assert.ok(slots.some(slot=>slot.due_at===firstMinute-minute&&slot.observations.some(o=>o.outcome==='pass')), 'history contains new packed evidence');
 assert.ok(slots.some(slot=>slot.due_at<firstMinute-minute&&slot.observations.some(o=>o.outcome==='pass')), 'history contains pre-upgrade evidence');
 const historyCost = await readMeter(firstRequest, historyPath, historyAt);
 assert.equal(historyCost.writes, 0, 'reading details leaves scheduling to Cron');
 assert.ok(historyCost.rows < 600, `recent history read ${historyCost.rows} rows on a populated upgrade`);
 await worker.dispose();
 worker = await runtime(values.dist, directory);
 const restartedRequest = (path, init) => worker.dispatchFetch(origin + path, init);
 // The first request in the new workerd process carries a tag minted by
 // the old process, with only the persisted D1 state in common.
 const revalidated = await pollOverview(restartedRequest, firstMinute - minute + 7_000, auth.cookie, original.etag.replace(/^W\//,''));
 assert.equal(revalidated.unchanged, true, 'unchanged state revalidates from a fresh Worker');
 const coldPoll = await readMeter(restartedRequest, '/api/overview', firstMinute - minute + 7_000);
 assert.ok(coldPoll.rows * day / activePollInterval < dailyBudget, 'a fresh Worker revalidates within the polling budget');
 const independentlyIssued = await pollOverview(restartedRequest, firstMinute - minute + 8_000, auth.cookie);
 assert.equal(independentlyIssued.etag, original.etag, 'Workers independently issue the same validator');
 console.log(`Cross-instance overview: 304 with ${coldPoll.rows} D1 rows read`);
 // Restart again so day metering includes a truly cold scheduled run.
 await worker.dispose();
 worker = await runtime(values.dist, directory);
 await measureDay(worker, auth, firstMinute, migrationWrites);
 await checkAfterSave(worker, auth.cookie, firstMinute + day);
} finally {
 try { await worker?.dispose(); }
 finally { await rm(directory, {recursive:true, force:true}); }
}
