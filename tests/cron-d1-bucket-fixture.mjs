import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {validateDefinition} from '../src/domain/policy.mjs';
import {minute, minutesPerDay, migrate, clientHeaders, origin} from './cron-d1-history-fixture.mjs';

const dayMs=minutesPerDay*minute;
const probes=['local-a','local-b','local-c'];
const canaryBase='https://canary.example.test/check?challenge=';
const canaryUrl=canaryBase+'a'.repeat(300-canaryBase.length);
const definition=JSON.stringify(validateDefinition({
 name:'Three-location canary',url:'https://target.example.test',probes,intervalMs:minute,retries:0,
 assignments:Object.fromEntries(probes.map(probe=>[probe,{runnerId:'self-'+randomUUID(),canaryUrl}])),
},[]));
const createMonitor=`INSERT INTO monitors(id,revision,definition,next_due,state) VALUES(?,1,?,?, '{"state":"Unknown"}')`;
const createSlots=`WITH RECURSIVE times(due) AS (SELECT CAST(?2 AS INTEGER) UNION ALL SELECT due+60000 FROM times WHERE due+60000<?3)
 INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until)
 SELECT ?1||':1:'||due,?1,1,due,'complete',?4,'',0 FROM times`;
const createEvidence=`INSERT INTO observations(id,slot_id,probe,attempt,evidence)
 SELECT s.id||':'||p.value,s.id,p.value,0,json_object('outcome','pass','startedAt',due_at,
   'completedAt',due_at+20,'durationMs',20,'canary',json_object('outcome','pass','completedAt',due_at+10))
 FROM slots s CROSS JOIN json_each(?4) p WHERE s.monitor_id=?1 AND s.due_at>=?2 AND s.due_at<?3`;
const probeJson=JSON.stringify(probes);

export async function proveCanaryBucketBudget(worker, db, forward, auth, now){
 const end=now, start=end-7*dayMs, id=randomUUID();
 await db.batch([
  db.prepare(createMonitor).bind(id,definition,end),
  db.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind(id),
  db.prepare('INSERT INTO revisions(monitor_id,revision,definition,created_at) VALUES(?,1,?,?)').bind(id,definition,start),
  db.prepare(createSlots).bind(id,start,end,definition),
  db.prepare(createEvidence).bind(id,start,end-dayMs,probeJson),
 ]);
 for (const name of forward){
  await migrate(db,[name]);
  if(name.endsWith('_availability_buckets.sql')){
   const largest=await db.prepare('SELECT MAX(length(slots)) AS bytes FROM availability_buckets').first();
   assert.ok((largest.bytes??0)<2_000_000,`upgrade ${name} must write D1-safe values`);
  }
 }
 // Write the last day through the live trigger, after the populated upgrade.
 await db.prepare(createEvidence).bind(id,end-dayMs,end,probeJson).run();
 const measure=()=>db.prepare(`SELECT COUNT(*) AS buckets,
   MAX(length(slots)) AS blob,MAX(length(CAST(json(slots) AS BLOB))) AS text,
   SUM((SELECT COUNT(*) FROM json_each(slots))) AS slots
   FROM availability_buckets WHERE monitor_id=?`).bind(id).first();
 const sizes=await measure();
 assert.equal(sizes.slots,7*minutesPerDay,'a full week of three-location slots was projected');
 // Measure bytes explicitly. Local workerd accepts values D1 would reject.
 assert.ok(sizes.blob<500_000 && sizes.text<500_000,`largest bucket: ${sizes.blob} B stored, ${sizes.text} B returned`);
 assert.ok(sizes.buckets>7,'a minute-cadence week is split into sub-day buckets');
 const overview=await worker.dispatchFetch(origin+'/api/overview',{headers:{...clientHeaders,cookie:auth.cookie,'x-d1-meter-time':String(end)}});
 assert.equal(overview.status,200,await overview.clone().text());
 const {availability}=(await overview.json()).monitors.find(monitor=>monitor.id===id);
 assert.equal(availability.last7d.upMs,7*dayMs-20,'overview folds the full week with canaries');
 const metrics=await worker.dispatchFetch(origin+'/api/v1/metrics',{headers:{...clientHeaders,authorization:auth.authorization,'x-d1-meter-time':String(end)}});
 assert.equal(metrics.status,200,await metrics.clone().text());
 assert.ok((await metrics.text()).includes(`uptime_availability_observed_seconds{monitor_id="${id}"} 86400`));
 const repair=forward.find(name=>name.endsWith('_bounded_availability_buckets.sql'));
 await migrate(db,[repair]);
 assert.deepEqual(await measure(),sizes,'replaying the rebuild preserves all seven days');
 console.log(`Seven-day 300-byte canary upgrade and live writes: ${sizes.blob} B stored, ${sizes.text} B returned (largest bucket)`);

}

function dumpSql(db,tables){
 const schema=db.prepare('SELECT sql FROM sqlite_schema WHERE tbl_name=? AND sql IS NOT NULL ORDER BY rowid');
 const ddl=[],inserts=[],after=[];
 for(const table of tables){
  const [create,...dependent]=schema.all(table);
  ddl.push(create.sql);after.push(...dependent.map(({sql})=>sql));
  const cells=db.prepare(`PRAGMA table_info(${table})`).all().map(({name})=>`quote("${name}")`).join("||','||");
  for(const {values} of db.prepare(`SELECT ${cells} AS [values] FROM ${table} ORDER BY rowid`).all())inserts.push(`INSERT INTO ${table} VALUES(${values})`);
 }
 return [...ddl,...inserts,...after].join(';\n');
}

export async function proveAvailabilityDumpRoundTrip(files){
 const source=new DatabaseSync(':memory:'),receiving=new DatabaseSync(':memory:');
 try{
  const guard=files.find(name=>name.endsWith('_defer_availability_backfill.sql'));
  const repair=files.find(name=>name.endsWith('_bounded_availability_buckets.sql'));
  const apply=async name=>source.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  // Also start with 0092 already applied, where the new guard is a no-op.
  for(const name of files)if(name!==guard&&name!==repair)await apply(name);
  const erased=randomUUID(),kept=randomUUID(),due=Math.floor(Date.now()/minute)*minute;
  for(const id of [erased,kept]){
   source.prepare(createMonitor).run(id,definition,due+minute);
   source.prepare(createSlots).run(id,due,due+2*minute,definition);
   source.prepare(createEvidence).run(id,due,due+2*minute,probeJson);
  }
  await apply(guard);
  await apply(repair);
  source.prepare('DELETE FROM observations WHERE slot_id IN (SELECT id FROM slots WHERE monitor_id=?)').run(erased);
  source.prepare('DELETE FROM slots WHERE monitor_id=?').run(erased);
  source.prepare('DELETE FROM monitors WHERE id=?').run(erased);
  receiving.exec(dumpSql(source,['monitors','slots','observations','availability_buckets','availability_bucket_history']));
  const last=`${kept}:1:${due+minute}`;
  const rowId=db=>db.prepare('SELECT rowid FROM slots WHERE id=?').get(last).rowid;
  assert.notEqual(rowId(receiving),rowId(source),'SQL dump compacts implicit rowids');
  receiving.exec(source.prepare("SELECT sql FROM sqlite_schema WHERE name='availability_bucket_slots'").get().sql);
  receiving.prepare("UPDATE slots SET status='interrupted' WHERE id=?").run(last);
  receiving.prepare(`INSERT INTO observations(id,slot_id,probe,attempt,evidence)
    SELECT 'late-retry',slot_id,probe,1,evidence FROM observations WHERE slot_id=? AND probe='local-a'`).run(last);
  const projected=receiving.prepare('SELECT json(slots) AS slots FROM availability_buckets WHERE monitor_id=?').all(kept);
  const records=Object.fromEntries(projected.flatMap(({slots})=>Object.entries(JSON.parse(slots))));
  assert.deepEqual(Object.keys(records).sort(),[`${kept}:1:${due}`,last]);
  assert.equal(records[`${kept}:1:${due}`][3],'complete');
  assert.equal(records[last][3],'interrupted','status and late retry update the same stable slot after import');
 }finally{receiving.close();source.close()}
}
