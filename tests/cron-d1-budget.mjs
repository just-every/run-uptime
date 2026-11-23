import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {assertHealthyTick, dispatchCron, historyMinutes, migrate, migrationPlan, minute, minutesPerDay, monitorCount, runtime, seedHistory} from './cron-d1-history-fixture.mjs';

const {values} = parseArgs({options:{
 dist:{type:'string', default:'dist'},
 'before-migration':{type:'string'},
 'defer-migration':{type:'string'},
}});
const dailyBudget = 1_000_000;
const measuredMinutes = 30;
const migrations = await migrationPlan(values['before-migration'], values['defer-migration']);

const rowsRead = report => report.queries.reduce((total, [, query]) => total + query.rows, 0);
const average = totals => totals.reduce((sum, count) => sum + count, 0) / totals.length;

function printReport(reports, totals) {
 const rowsBySQL = new Map();
 for (const report of reports) {
  for (const [sql, {rows, calls}] of report.queries) {
   const total = rowsBySQL.get(sql) ?? {rows:0, calls:0};
   total.rows += rows;
   total.calls += calls;
   rowsBySQL.set(sql, total);
  }
 }
 const warm = totals.slice(1);
 console.log(`${measuredMinutes} scheduled minutes, ${monitorCount} active monitors, ${historyMinutes * monitorCount} historical slots and observations each`);
 console.log(`D1 rows read per minute: ${average(totals).toFixed(1)} avg, ${Math.min(...totals)}–${Math.max(...totals)} range, ${Math.round(average(totals) * minutesPerDay)} projected daily`);
 console.log(`Warm minutes: ${average(warm).toFixed(1)} avg, ${Math.min(...warm)}–${Math.max(...warm)} range`);
 console.log('Top SQL by D1 rows read across all measured minutes');
 for (const [sql, {rows, calls}] of [...rowsBySQL].sort(([, a], [, b]) => b.rows - a.rows).slice(0, 8)) {
  const preview = sql.length > 550 ? `${sql.slice(0, 550)}…` : sql;
  console.log(`${rows} rows in ${calls} calls  ${preview}`);
 }
 const expiry = rowsBySQL.get("UPDATE slots SET status='interrupted' WHERE status='running' AND lease_until<=?");
 console.log(`Slot lease-expiry UPDATE  ${expiry?.rows ?? 0} rows read in ${expiry?.calls ?? 0} calls`);
}

const directory = await mkdtemp(join(tmpdir(), 'uptime-cron-d1-budget-'));
// Keep acceptance windows comfortably ahead of SQLite's unmodified wall clock.
const firstMinute = Math.ceil(Date.now() / minute) * minute + minutesPerDay * minute;
let worker;
try {
 worker = await runtime(values.dist, directory);
 const fixtureDB = await worker.getD1Database('DB');
 await migrate(fixtureDB, migrations.initial);
 await seedHistory(fixtureDB, await worker.getWorker(), firstMinute);
 await migrate(fixtureDB, migrations.afterHistory);
 if (values['defer-migration']) await migrate(fixtureDB, [values['defer-migration']]);
 await worker.dispose();
 worker = await runtime(values.dist, directory);
 const service = await worker.getWorker();
 const db = await worker.getD1Database('DB');
 const reports = [];
 for (let i = 0; i < measuredMinutes; i++) {
  const time = firstMinute + i * minute;
  await dispatchCron(service, time);
  const response = await service.fetch('https://uptime-cron-budget.test/__d1_meter');
  const report = await response.json();
  assert.equal(report.time, time);
  if (i === 0) console.log(`Cold minute: ${rowsRead(report)} D1 rows read`);
  assert.deepEqual(report.unmetered, [], 'every scheduled D1 operation supplies genuine row-read metadata');
  await assertHealthyTick(db, time);
  reports.push(report);
 }
 const totals = reports.map(rowsRead);
 printReport(reports, totals);
 assert.ok(totals.every(rows => rows > 0), 'each scheduled invocation recorded D1 rows read');
 assert.ok(Math.max(...totals.slice(1)) * minutesPerDay < dailyBudget, 'every warm Cron minute must fit the daily D1 free-tier read budget');
 assert.ok(average(totals) * minutesPerDay < dailyBudget, 'projected D1 reads, including the cold minute, must fit the daily free-tier read budget');
} finally {
 try { await worker?.dispose(); }
 finally { await rm(directory, {recursive:true, force:true}); }
}
