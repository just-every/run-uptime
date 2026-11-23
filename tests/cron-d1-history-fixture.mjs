import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, join, parse, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {validateDefinition} from '../src/domain/policy.mjs';
import {splitSql} from './migration-support.mjs';

export const minute = 60_000;
export const minutesPerDay = 24 * 60;
export const historyMinutes = 7 * minutesPerDay;
export const monitorCount = 4;
const origin = 'https://uptime-cron-budget.test';
const target = 'https://target.cron-budget.test';
const migrations = fileURLToPath(new URL('../migrations/', import.meta.url));

export async function runtime(build, directory) {
 const emitted = resolve(build, 'server');
 const config = JSON.parse(await readFile(join(emitted, 'wrangler.json'), 'utf8'));
 const entry = join(emitted, config.main);
 const wrapper = join(directory, 'meter.mjs');
 const meter = fileURLToPath(new URL('./cron-d1-meter-worker.mjs', import.meta.url));
 await writeFile(wrapper, `import app from ${JSON.stringify(relative(dirname(wrapper), entry))};
import {meteredCron} from ${JSON.stringify(relative(dirname(wrapper), meter))};
export default meteredCron(app);`);
 const assets = join(emitted, 'assets');
 const modules = [wrapper, meter, entry, ...(await readdir(assets)).filter(name => name.endsWith('.js')).map(name => join(assets, name))];
 const bindings = {
  ...config.vars, UPTIME_ORIGIN:origin, OWNER_EMAIL:'operator@example.test',
  SESSION_SECRET:randomBytes(32).toString('base64url'), UPTIME_RUNNER_KEY:randomBytes(32).toString('base64url'),
 };
 return new Miniflare(convertV4MiniflareOptions({
  host:'127.0.0.1', port:0, scriptPath:wrapper, modulesRoot:parse(emitted).root,
  modules:modules.map(path => ({type:'ESModule', path})), bindings,
  compatibilityDate:config.compatibility_date, compatibilityFlags:config.compatibility_flags,
  assets:{directory:resolve(emitted, config.assets.directory), binding:'ASSETS', routerConfig:{has_user_worker:true}, run_worker_first:true},
  d1Databases:{DB:'cron-d1-budget'}, resourcePersistencePath:join(directory, 'state'),
  unsafeLocalExplorer:false, unsafeObservability:false,
  outboundService(request) {
   const url = new URL(request.url);
   if (url.origin === 'https://cloudflare-dns.com' && url.pathname === '/dns-query' && url.searchParams.get('name') === new URL(target).hostname) {
    const type = url.searchParams.get('type');
    assert.ok(['A', 'AAAA'].includes(type));
    return Response.json({Status:0, Answer:type === 'A' ? [{type:1, data:'93.184.215.14'}] : []});
   }
   assert.equal(url.origin, target, 'all outbound traffic stays at the controlled DNS and target edges');
   return new Response('Ready');
  },
 }));
}

export async function dispatchCron(service, time) {
 const outcome = await service.scheduled({scheduledTime:new Date(time), cron:'* * * * *'});
 assert.equal(outcome.outcome, 'ok', `emitted scheduled handler at ${new Date(time).toISOString()}`);
}

export async function migrationPlan(before, defer) {
 assert.ok(!before || !defer, 'use either --before-migration or --defer-migration');
 const all = (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort();
 const boundary = before ?? defer;
 if (!boundary) return {initial:all, afterHistory:[]};
 const at = all.indexOf(boundary);
 assert.ok(at >= 0, `unknown migration ${boundary}`);
 return {initial:all.slice(0, at), afterHistory:defer ? all.slice(at) : []};
}

export async function migrate(db, files) {
 for (const name of files) {
  const sql = splitSql(await readFile(join(migrations, name), 'utf8'));
  await db.batch(sql.map(statement => db.prepare(statement)));
 }
}

export async function seedHistory(db, service, firstMinute) {
 // SQLite's authorization clock is real. Only the historical copies predate it.
 const start = firstMinute - historyMinutes * minute;
 const sample = firstMinute - 2 * minute;
 await db.prepare('INSERT INTO oa_bootstrap(singleton,claim_id,claimed_at) VALUES(1,?,?)').bind(randomUUID(), start).run();
 await dispatchCron(service, sample - minute);
 const runner = await db.prepare('SELECT runner_id,network_label FROM runners WHERE legacy_key=0').first();
 assert.ok(runner, 'the emitted handler prepared its hosted assignment');

 for (let index = 1; index <= monitorCount; index++) {
  const definition = JSON.stringify({
   ...validateDefinition({name:`Cron monitor ${index}`, url:`${target}/health/${index}`, intervalMs:minute, retries:0}, []),
   assignments:{'local-a':{runnerId:runner.runner_id, networkLabel:runner.network_label}},
  });
  const id = randomUUID();
  await db.batch([
   db.prepare('INSERT INTO monitors(id,revision,definition,next_due,state) VALUES(?,1,?,?,?)').bind(id, definition, sample, '{"state":"Unknown"}'),
   db.prepare('INSERT INTO revisions(monitor_id,revision,definition,created_at) VALUES(?,1,?,?)').bind(id, definition, start),
   db.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind(id),
  ]);
 }
 await dispatchCron(service, sample);
 await assertHealthyTick(db, sample);

 // Clone genuine slot, assignment and observation rows, preserving their
 // recorded offsets and giving each new observation its own identity.
 const copied = await db.batch([
  db.prepare(`WITH RECURSIVE minutes(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM minutes WHERE i<?1)
    INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual)
    SELECT monitor_id||':'||revision||':'||CAST(due_at-i*?2 AS INTEGER),monitor_id,revision,due_at-i*?2,status,definition,lease_owner,lease_until-i*?2,missed_count,manual
    FROM slots CROSS JOIN minutes WHERE due_at=?3`).bind(historyMinutes - 2, minute, sample),
  db.prepare(`INSERT INTO runner_assignments(slot_id,probe,runner_id,delivered_at,received_times,external_check_url)
    SELECT s.id,a.probe,a.runner_id,a.delivered_at+s.due_at-?1,
      json_set(a.received_times,'$."0"',json_extract(a.received_times,'$."0"')+s.due_at-?1),a.external_check_url
    FROM slots s JOIN slots exemplar ON exemplar.monitor_id=s.monitor_id AND exemplar.due_at=?1
    JOIN runner_assignments a ON a.slot_id=exemplar.id WHERE s.due_at<?1`).bind(sample),
  db.prepare(`WITH copied AS (
    SELECT substr(o.id,1,24)||printf('%012x',s.due_at) AS id,s.id AS slot_id,o.probe,o.attempt,o.evidence,s.due_at-?1 AS offset_ms
    FROM slots s JOIN slots exemplar ON exemplar.monitor_id=s.monitor_id AND exemplar.due_at=?1
    JOIN observations o ON o.slot_id=exemplar.id WHERE s.due_at<?1)
    INSERT INTO observations(id,slot_id,probe,attempt,evidence)
    SELECT id,slot_id,probe,attempt,json_set(evidence,'$.id',id,'$.startedAt',json_extract(evidence,'$.startedAt')+offset_ms,
      '$.completedAt',json_extract(evidence,'$.completedAt')+offset_ms) FROM copied`).bind(sample),
 ]);
 for (const [index, kind] of ['slot', 'assignment', 'observation'].entries()) {
  assert.equal(copied[index].meta.changes, (historyMinutes - 2) * monitorCount, `full historical ${kind} copy`);
 }
 // The ordinary result acceptance path constructs real projection checkpoints.
 await dispatchCron(service, firstMinute - minute);
 await assertHealthyTick(db, firstMinute - minute);
 const checkpoint = await db.prepare('SELECT COUNT(*) AS count FROM attempt_checkpoints WHERE due_at=?').bind(sample).first();
 assert.equal(checkpoint.count, monitorCount, 'all four checkpoints have folded every settled historical slot');
 const history = (await db.prepare(`SELECT COUNT(*) AS count, MIN(s.due_at) AS first, MAX(s.due_at) AS last
   FROM slots s JOIN observations o ON o.slot_id=s.id WHERE s.manual=0 GROUP BY s.monitor_id`).all()).results;
 assert.equal(history.length, monitorCount);
 for (const {count, first, last} of history) {
  assert.equal(count, historyMinutes);
  assert.equal(first, start);
  assert.equal(last, firstMinute - minute);
 }
}

export async function assertHealthyTick(db, time) {
 const {results} = await db.prepare(`SELECT s.monitor_id,s.status,json_extract(o.evidence,'$.outcome') AS outcome,
   json_extract(m.state,'$.targetState') AS health
   FROM slots s JOIN observations o ON o.slot_id=s.id JOIN monitors m ON m.id=s.monitor_id WHERE s.due_at=? AND s.manual=0`).bind(time).all();
 assert.equal(new Set(results.map(row => row.monitor_id)).size, monitorCount, `every monitor ran at ${new Date(time).toISOString()}`);
 assert.equal(results.length, monitorCount, 'one observation per scheduled monitor');
 for (const row of results) {
  assert.equal(row.status, 'complete');
  assert.equal(row.outcome, 'pass');
  assert.equal(row.health, 'Healthy');
 }
}
