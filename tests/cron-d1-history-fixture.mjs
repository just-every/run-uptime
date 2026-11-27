import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, join, parse, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {observationsAt} from '../src/domain/check-evidence-query.ts';
import {bucketsBetween, quietSlots} from '../src/domain/quiet-checks.ts';
import {HOSTED_RUNNER_ID} from '../src/domain/hosted-runner.ts';
import {acceptanceMs} from '../src/domain/schedule.ts';
import {evaluate, validateDefinition} from '../src/domain/policy.mjs';
import {signInOwner, testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';

export const minute = 60_000;
export const minutesPerDay = 24 * 60;
export const monitorCount = 4;
export const origin = 'https://uptime-cron-budget.test';
export const clientHeaders = {'cf-connecting-ip':'192.0.2.10'};
const target = 'https://target.cron-budget.test';
const migrations = fileURLToPath(new URL('../migrations/', import.meta.url));

export async function runtime(build, directory, {onProbe, cronStart, cronLags} = {}) {
 const emitted = resolve(build, 'server');
 const config = JSON.parse(await readFile(join(emitted, 'wrangler.json'), 'utf8'));
 const entry = join(emitted, config.main);
 const wrapper = join(directory, 'meter.mjs');
 const meter = fileURLToPath(new URL('./cron-d1-meter-worker.mjs', import.meta.url));
 await writeFile(wrapper, `import app, {checkWorkerTask, completeWorkerCheck, runWorkerBackground} from ${JSON.stringify(relative(dirname(wrapper), entry))};
import {meteredWorker} from ${JSON.stringify(relative(dirname(wrapper), meter))};
export default meteredWorker(app, {checkWorkerTask, completeWorkerCheck, runWorkerBackground});`);
 const assets = join(emitted, 'assets');
 const modules = [wrapper, meter, entry, ...(await readdir(assets)).filter(name => name.endsWith('.js')).map(name => join(assets, name))];
 const bindings = {
  ...config.vars, UPTIME_ORIGIN:origin, OWNER_EMAIL:testAuthBindings.OWNER_EMAIL,
  SESSION_SECRET:testAuthBindings.SESSION_SECRET, SETUP_TOKEN:testAuthBindings.SETUP_TOKEN,
  UPTIME_RUNNER_KEY:testAuthBindings.UPTIME_RUNNER_KEY,
  ...(cronLags ? {D1_METER_CRON_LAGS:JSON.stringify({start:cronStart, lags:cronLags})} : {}),
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
   return onProbe?.(url.pathname) ?? new Response('Ready');
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
 const forward = all.findIndex(name => name.endsWith('_slots_status_lease.sql'));
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
 let writes = 0;
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
   assert.ok(Number.isSafeInteger(meta.rows_written) && meta.rows_written >= 0, `${name} reports D1 writes for every statement`);
   writes += meta.rows_written;
   const label = sql[index].split('\n').map(line => line.trim()).find(line => line && !line.startsWith('--')).slice(0, 100);
   console.log(`  ${label} (${meta.duration} ms, ${meta.rows_read} reads, ${meta.rows_written} writes)`);
  }
 }
 return writes;
}

export async function seedHistory(db, firstMinute, historyMinutes) {
 const start = firstMinute - historyMinutes * minute;
 const lastDue = firstMinute - minute;
 const networkLabel = 'Cloudflare Worker';
 await db.prepare('INSERT INTO runners(runner_id,registered_at,network_label) VALUES(?,?,?)')
  .bind(HOSTED_RUNNER_ID, start, networkLabel).run();
 for (let index = 1; index <= monitorCount; index++) {
  const definition = validateDefinition({
   name:`Cron monitor ${index}`, url:`${target}/health/${index}`, intervalMs:minute, retries:0,
   assignments:{'local-a':{runnerId:HOSTED_RUNNER_ID, networkLabel}},
  }, []);
  const id = randomUUID();
  const encoded = JSON.stringify(definition);
  const attemptPrefix = randomUUID().slice(0, 24);
  const evidence = {probe:'local-a', attempt:0, outcome:'pass', durationMs:20, status:200,
   checks:[{assertion:'status', pass:true, reason:'HTTP 200'}]};
  const last = {...evidence, id:attemptPrefix+lastDue.toString(16).padStart(12,'0'), startedAt:lastDue,
   completedAt:lastDue+20, receivedAt:lastDue+20, retryComplete:true};
  // For uninterrupted passes the native checkpoint's only accumulated state
  // is the recovery streak. The observed state and last evidence come from the same slot.
  const state = evaluate(definition, [last], {recoveryStreak:historyMinutes-1}, last.completedAt);
  const results = await db.batch([
   db.prepare('INSERT INTO monitors(id,revision,definition,next_due,state) VALUES(?,1,?,?,?)')
    .bind(id, encoded, firstMinute, JSON.stringify(state)),
   db.prepare('INSERT INTO revisions(monitor_id,revision,definition,created_at) VALUES(?,1,?,?)').bind(id, encoded, start),
   db.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind(id),
   db.prepare(`WITH RECURSIVE times(due) AS (SELECT CAST(?2 AS INTEGER) UNION ALL SELECT due+?4 FROM times WHERE due<?3)
     INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until)
     SELECT ?1||':1:'||due,?1,1,due,'complete',?5,'',due+?6 FROM times`)
    .bind(id, start, lastDue, minute, encoded, acceptanceMs(definition)),
   db.prepare(`INSERT INTO runner_assignments(slot_id,probe,runner_id,delivered_at,received_times)
     SELECT id,'local-a',?2,due_at,json_object('0',due_at+20) FROM slots WHERE monitor_id=?1`).bind(id, HOSTED_RUNNER_ID),
   db.prepare(`WITH attempts AS (
     SELECT id AS slot_id,?2||printf('%012x',due_at) AS id,due_at FROM slots WHERE monitor_id=?1
    ) INSERT INTO observations(id,slot_id,probe,attempt,evidence)
    SELECT id,slot_id,'local-a',0,json_set(?3,'$.id',id,'$.startedAt',due_at,'$.completedAt',due_at+20)
    FROM attempts`).bind(id, attemptPrefix, JSON.stringify(evidence)),
   db.prepare(`INSERT INTO attempt_checkpoints(monitor_id,revision,due_at,slot_id,state,last_observations)
     VALUES(?,1,?,?,?,?)`).bind(id, lastDue, `${id}:1:${lastDue}`, JSON.stringify(state), JSON.stringify([last])),
  ]);
  for (const {meta} of results.slice(3,6)) assert.equal(meta.changes, historyMinutes, 'full native slot, assignment and observation history');
 }
 console.log(`Seeded ${historyMinutes * monitorCount} retained native slots and observations with settled checkpoints`);
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

// A healthy check is a slot row or, once its monitor is Healthy, a quiet check with no slot row.
export async function assertHealthyTick(db, time) {
 const {results} = await db.prepare(`SELECT s.monitor_id,s.status,
   (SELECT json_group_array(json_extract(evidence,'$.outcome')) FROM (${observationsAt('s.id')})) AS outcomes,
   json_extract(m.state,'$.targetState') AS health
   FROM monitors m CROSS JOIN slots s ON s.monitor_id=m.id
   WHERE s.due_at=?1 AND s.manual=0
   UNION ALL
   SELECT q.monitor_id,q.status,
   (SELECT json_group_array(json_extract(o.value,'$.outcome')) FROM json_each(q.hosted,'$.attempts') o),
   json_extract(m.state,'$.targetState')
   FROM (${quietSlots(column => `${column} IN (SELECT id FROM monitors)`, bucketsBetween('?1', '?1'))}) q JOIN monitors m ON m.id=q.monitor_id
   WHERE q.due_at=?1`).bind(time).all();
 assert.equal(new Set(results.map(row => row.monitor_id)).size, monitorCount, `every monitor ran at ${new Date(time).toISOString()}`);
 assert.equal(results.length, monitorCount, 'one check per scheduled monitor');
 for (const row of results) {
  assert.equal(row.status, 'complete');
  assert.deepEqual(JSON.parse(row.outcomes), ['pass'], 'one passing observation in the scheduled check');
  assert.equal(row.health, 'Healthy');
 }
}
