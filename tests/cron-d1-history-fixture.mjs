import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, join, parse, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {observationsAt} from '../src/domain/check-evidence-query.ts';
import {validateDefinition} from '../src/domain/policy.mjs';
import {signInOwner, testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';

export const minute = 60_000;
export const minutesPerDay = 24 * 60;
export const monitorCount = 4;
export const origin = 'https://uptime-cron-budget.test';
export const clientHeaders = {'cf-connecting-ip':'192.0.2.10'};
const target = 'https://target.cron-budget.test';
const migrations = fileURLToPath(new URL('../migrations/', import.meta.url));

export async function runtime(build, directory) {
 const emitted = resolve(build, 'server');
 const config = JSON.parse(await readFile(join(emitted, 'wrangler.json'), 'utf8'));
 const entry = join(emitted, config.main);
 const wrapper = join(directory, 'meter.mjs');
 const meter = fileURLToPath(new URL('./cron-d1-meter-worker.mjs', import.meta.url));
 await writeFile(wrapper, `import app from ${JSON.stringify(relative(dirname(wrapper), entry))};
import {meteredWorker} from ${JSON.stringify(relative(dirname(wrapper), meter))};
export default meteredWorker(app);`);
 const assets = join(emitted, 'assets');
 const modules = [wrapper, meter, entry, ...(await readdir(assets)).filter(name => name.endsWith('.js')).map(name => join(assets, name))];
 const bindings = {
  ...config.vars, UPTIME_ORIGIN:origin, OWNER_EMAIL:testAuthBindings.OWNER_EMAIL,
  SESSION_SECRET:testAuthBindings.SESSION_SECRET, SETUP_TOKEN:testAuthBindings.SETUP_TOKEN,
  UPTIME_RUNNER_KEY:testAuthBindings.UPTIME_RUNNER_KEY,
 };
 return new Miniflare(convertV4MiniflareOptions({
  host:'127.0.0.1', port:0, cf:false, scriptPath:wrapper, modulesRoot:parse(emitted).root,
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
 if (outcome.outcome !== 'ok') {
  const report = await (await service.fetch(origin + '/__d1_meter')).json();
  assert.equal(outcome.outcome, 'ok', `emitted scheduled handler at ${new Date(time).toISOString()}\n${report?.unmetered.join('\n') ?? ''}`);
 }
}

export async function migrationPlan() {
 const all = (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort();
 const forward = all.findIndex(name => name.endsWith('_slots_running_lease.sql'));
 const packed = all.findIndex(name => name.endsWith('_hosted_check_storage.sql'));
 assert.ok(forward > 0 && packed > forward, 'bounded buckets upgrade before compact hosted storage');
 return {initial:all.slice(0, forward), buckets:all.slice(forward, packed), compact:all.slice(packed)};
}

async function retainedEvidence(db) {
 const [counts, oldest] = await db.batch([
  db.prepare(`SELECT (SELECT COUNT(*) FROM slots) AS slots,
    (SELECT COUNT(*) FROM observations) AS observations,
    (SELECT COUNT(*) FROM runner_assignments) AS assignments`),
  db.prepare(`SELECT s.id,o.evidence,a.received_times
    FROM monitors m CROSS JOIN slots s ON s.monitor_id=m.id
    JOIN observations o ON o.slot_id=s.id
    LEFT JOIN runner_assignments a ON a.slot_id=s.id AND a.probe=o.probe
    WHERE s.manual=0 AND s.due_at=(SELECT MIN(due_at) FROM slots WHERE monitor_id=m.id AND manual=0)
    ORDER BY s.id,o.probe,o.attempt,o.id`),
 ]);
 return {counts:counts.results[0], oldest:oldest.results};
}

export async function migrate(db, files, {profile=false}={}) {
 for (const name of files) {
  const changesStorage = /(?:bounded_availability_buckets|hosted_check_storage|scrape_writes|hosted_availability)\.sql$/.test(name);
  const before = changesStorage ? await retainedEvidence(db) : undefined;
  const sql = splitSql(await readFile(join(migrations, name), 'utf8'));
  const started = performance.now();
  const results = await db.batch(sql.map(statement => db.prepare(statement)));
  const elapsed = performance.now() - started;
  if (before) assert.deepEqual(await retainedEvidence(db), before, `${name} preserves native records and oldest evidence`);
  if (!profile) continue;
  console.log(`${name}: ${Math.round(elapsed)} ms batch wall time`);
  for (const [index, {meta}] of results.entries()) {
   const label = sql[index].trim().split('\n').find(line => !line.startsWith('--')).slice(0, 100);
   console.log(`  ${label} (${meta.duration} ms, ${meta.rows_read} reads, ${meta.rows_written} writes)`);
  }
 }
}

export async function seedHistory(db, service, firstMinute, historyMinutes) {
 // SQLite's authorization clock is real. Only the historical copies predate it.
 const start = firstMinute - historyMinutes * minute;
 const sample = firstMinute - 2 * minute;
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

 // Clone genuine hosted evidence into the retained native format, preserving
 // recorded offsets and giving each new observation its own identity.
 // As in archive restore, suppress the native trigger during the bulk copy
 // and build the rolling projection from the current bucket view.
 const [, ...copied] = await db.batch([
  db.prepare("INSERT INTO availability_bucket_history(monitor_id,day) VALUES('',-1)"),
  db.prepare(`WITH RECURSIVE minutes(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM minutes WHERE i<?1)
    INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual)
    SELECT monitor_id||':'||revision||':'||CAST(due_at-i*?2 AS INTEGER),monitor_id,revision,due_at-i*?2,status,definition,lease_owner,lease_until-i*?2,missed_count,manual
    FROM slots CROSS JOIN minutes WHERE due_at=?3`).bind(historyMinutes - 2, minute, sample),
  db.prepare(`INSERT INTO runner_assignments(slot_id,probe,runner_id,delivered_at,received_times,external_check_url)
    SELECT s.id,a.probe,a.runner_id,a.delivered_at+s.due_at-?1,
      json_set(a.received_times,'$."0"',json_extract(a.received_times,'$."0"')+s.due_at-?1),a.external_check_url
    FROM slots s JOIN slots exemplar ON exemplar.monitor_id=s.monitor_id AND exemplar.due_at=?1
    JOIN check_assignments a ON a.slot_id=exemplar.id WHERE s.due_at<?1`).bind(sample),
  db.prepare(`WITH copied AS (
    SELECT substr(o.id,1,24)||printf('%012x',s.due_at) AS id,s.id AS slot_id,o.probe,o.attempt,o.evidence,s.due_at-?1 AS offset_ms
    FROM slots s JOIN slots exemplar ON exemplar.monitor_id=s.monitor_id AND exemplar.due_at=?1
    JOIN check_observations o ON o.slot_id=exemplar.id WHERE s.due_at<?1)
    INSERT INTO observations(id,slot_id,probe,attempt,evidence)
    SELECT id,slot_id,probe,attempt,json_set(evidence,'$.id',id,'$.startedAt',json_extract(evidence,'$.startedAt')+offset_ms,
      '$.completedAt',json_extract(evidence,'$.completedAt')+offset_ms) FROM copied`).bind(sample),
  db.prepare("DELETE FROM availability_bucket_history WHERE monitor_id='' AND day=-1"),
  db.prepare(`INSERT INTO availability_buckets(monitor_id,starts_at,slots)
    SELECT monitor_id,starts_at,jsonb_group_object(slot_key,record) FROM availability_bucket_slots
    WHERE monitor_id IN (SELECT id FROM monitors) AND due_at<?
      AND due_at>=(SELECT day FROM availability_bucket_history WHERE monitor_id='' AND day>=0)
    GROUP BY monitor_id,starts_at
    ON CONFLICT(monitor_id,starts_at) DO UPDATE SET slots=jsonb_patch(slots,excluded.slots),version=excluded.version`).bind(sample),
 ]);
 for (const [index, kind] of ['slot', 'assignment', 'observation'].entries()) {
  assert.equal(copied[index].meta.changes, (historyMinutes - 2) * monitorCount, `full historical ${kind} copy`);
 }
 // Rewind the fixture-only cursor so acceptance folds the copied evidence.
 await db.prepare('UPDATE monitors SET hosted_checkpoint=NULL').run();
 // The ordinary result acceptance path constructs real projection checkpoints.
 await dispatchCron(service, firstMinute - minute);
 await assertHealthyTick(db, firstMinute - minute);
 const checkpoint = await db.prepare("SELECT COUNT(*) AS count FROM monitors WHERE json_extract(hosted_checkpoint,'$.dueAt')>=?").bind(sample).first();
 assert.equal(checkpoint.count, monitorCount, 'all four checkpoints have folded every settled historical slot');
 const history = (await db.prepare(`SELECT COUNT(*) AS count, MIN(s.due_at) AS first, MAX(s.due_at) AS last
   FROM slots s JOIN check_observations o ON o.slot_id=s.id WHERE s.manual=0 GROUP BY s.monitor_id`).all()).results;
 assert.equal(history.length, monitorCount);
 for (const {count, first, last} of history) {
  assert.equal(count, historyMinutes);
  assert.equal(first, start);
  assert.equal(last, firstMinute - minute);
 }
 console.log(`Seeded ${historyMinutes * monitorCount} retained slots and observations with settled checkpoints`);
}

export async function authorizeRequests(worker) {
 const fetcher = async (url, init) => {
  const response = await worker.dispatchFetch(url, {...init, headers:{...init.headers, ...clientHeaders}});
  if (new URL(url).pathname === '/auth/bootstrap' && response.status === 403) {
   const reason = response.headers.get('content-type')?.startsWith('application/json')
    ? (await response.clone().json()).error : 'invalid request host';
   throw Error(`Owner bootstrap was refused: ${reason}`);
  }
  return response;
 };
 const cookie = await signInOwner(origin, {fetcher, finishFirstRun:true});
 const response = await fetcher(origin + '/api/metrics/keys', {
  method:'POST', headers:{origin,cookie,'content-type':'application/json'},
  body:JSON.stringify({name:'Monitoring budget scrape'}),
 });
 assert.equal(response.status, 201, 'owner created a metrics credential');
 return {cookie, authorization:'Bearer ' + (await response.json()).token};
}

export async function assertHealthyTick(db, time) {
 const {results} = await db.prepare(`SELECT s.monitor_id,s.status,
   (SELECT json_group_array(json_extract(evidence,'$.outcome')) FROM (${observationsAt('s.id')})) AS outcomes,
   json_extract(m.state,'$.targetState') AS health
   FROM monitors m CROSS JOIN slots s ON s.monitor_id=m.id
   WHERE s.due_at=? AND s.manual=0`).bind(time).all();
 assert.equal(new Set(results.map(row => row.monitor_id)).size, monitorCount, `every monitor ran at ${new Date(time).toISOString()}`);
 assert.equal(results.length, monitorCount, 'one slot per scheduled monitor');
 for (const row of results) {
  assert.equal(row.status, 'complete');
  assert.deepEqual(JSON.parse(row.outcomes), ['pass'], 'one passing observation in the scheduled slot');
  assert.equal(row.health, 'Healthy');
 }
}
