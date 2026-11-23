import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {
 assertHealthyTick, authorizeRequests, clientHeaders, dispatchCron, migrate, migrationPlan,
 minute, minutesPerDay, monitorCount, runtime, seedHistory, upgradeHistory,
} from './cron-d1-history-fixture.mjs';

const {values} = parseArgs({options:{
 dist:{type:'string', default:'dist'},
 'history-days':{type:'string', default:'30'},
 'profile-upgrade':{type:'boolean'},
}});
const historyMinutes = Number(values['history-days']) * minutesPerDay;
assert.ok(Number.isSafeInteger(historyMinutes) && historyMinutes >= minutesPerDay, 'history-days must be at least one day');

const day = minutesPerDay * minute;
const dailyBudget = 1_000_000;
const cronBudget = 300_000;
const coldReadBudget = 1_000;
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
 if (response.status === 304) {
  assert.ok(etag, 'unchanged response follows a successful poll');
  assert.equal(await response.text(), '', 'unchanged overview has no body');
  return {etag, unchanged:true};
 }
 assert.equal(response.status, 200, 'signed-in overview poll succeeds');
 const {monitors} = await response.json();
 assert.equal(monitors.length, monitorCount);
 assert.ok(monitors.every(({availability}) => availability.lastCheckAt >= time - minute), 'overview reports the latest scheduled evidence');
 const updated = response.headers.get('etag');
 assert.ok(updated, 'overview advertises an ETag');
 assert.notEqual(updated, etag, 'a conditional 200 returns a changed overview');
 return {etag:updated, unchanged:false};
}

async function scrapeMetrics(request, time, authorization, ids) {
 const response = await request('/api/v1/metrics', {headers:{
  ...clientHeaders, authorization, 'x-d1-meter-time':String(time),
 }});
 assert.equal(response.status, 200, 'authenticated Prometheus scrape succeeds');
 const metrics = await response.text();
 for (const id of ids) assert.ok(metrics.includes(`uptime_availability_observed_seconds{monitor_id="${id}"}`));
}

async function measureDay(worker, {cookie, authorization}, firstMinute) {
 // Miniflare's dispatchFetch closes each connection. Pool loopback requests
 // to workerd's real HTTP listener so a full day can run on a shared host.
 const listener = await worker.ready;
 const request = (path, init) => fetch(new URL(path, listener), init);
 const usage = new Map();
 function record(kind, {rows, writes}) {
  const total = usage.get(kind) ?? {rows:0, writes:0, calls:0, max:0};
  total.rows += rows;
  total.writes += writes;
  total.calls++;
  total.max = Math.max(total.max, rows);
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
    console.log(`Cold cron: ${cost.rows} D1 rows read`);
   }
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
   nextPoll += result.unchanged ? unchangedPollInterval : activePollInterval;
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
 console.log(`${monitorCount} active monitors with ${historyMinutes / minutesPerDay} days of retained history`);
 for (const [kind, {rows, writes, calls, max}] of usage) console.log(`${kind}: ${rows} D1 rows read, ${writes} written in ${calls} calls, max ${max} reads`);
 console.log(`Combined: ${combined} D1 rows read across one simulated day`);
 assert.equal(usage.get('cron').calls, minutesPerDay);
 assert.equal(usage.get('metrics').calls, day / scrapeInterval);
 assert.ok(usage.get('changed overview')?.calls > 1, 'a live overview changes as scheduled checks complete');
 assert.ok(usage.get('unchanged overview')?.calls > 0, 'unchanged polls exercise conditional responses and the slower cadence');
 assert.ok(usage.get('cron').rows < cronBudget, `cron read ${usage.get('cron').rows} rows; expected under ${cronBudget} per day`);
 assert.ok(combined < dailyBudget, `combined read ${combined} rows; expected under ${dailyBudget} per day`);
}

const migrations = await migrationPlan();
const directory = await mkdtemp(join(tmpdir(), 'uptime-cron-d1-budget-'));
// Cron's scheduled clock must stay ahead of SQLite's unmodified authorization clock.
const firstMinute = Math.ceil(Date.now() / minute) * minute + 20 * minute;
let worker;
try {
 worker = await runtime(values.dist, directory);
 const fixtureDB = await worker.getD1Database('DB');
 await migrate(fixtureDB, migrations.initial);
 const auth = await authorizeRequests(worker);
 await seedHistory(fixtureDB, await worker.getWorker(), firstMinute, historyMinutes);
 await upgradeHistory(fixtureDB, migrations.afterHistory, firstMinute, historyMinutes, {profile:values['profile-upgrade']});
 await worker.dispose();
 worker = await runtime(values.dist, directory);
 await measureDay(worker, auth, firstMinute);
} finally {
 try { await worker?.dispose(); }
 finally { await rm(directory, {recursive:true, force:true}); }
}
