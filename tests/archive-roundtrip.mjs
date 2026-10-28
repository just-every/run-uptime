import {seedArchiveHistory} from './source-history-support.mjs';
// BASE-DATA-001 replacement: complete portable records, excluded authority, inactive legacy-compatible restore.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {freePort} from '../scripts/local-ports.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {archive,restore} from '../src/domain/archive.server.ts';
import {digest,TABLES,LEGACY_TABLES,ARCHIVE_ROWS,extensionTables} from '../src/domain/archive-schema.ts';
import {installationLocalTables,assertArchiveInventory} from '../src/domain/archive-inventory.ts';
import {populateArchiveFixture,populateProtocolArchiveFixture} from './archive-fixture.mjs';
import {restoreBounds} from './archive-restore-bounds.mjs';
import {undoBatch} from '../src/domain/definitions/index.server.ts';
import {signInOwner,definitionDoor} from './auth-test-support.mjs';
const parent=new URL('../../tmp/',import.meta.url).pathname;await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'archive-roundtrip-'));let worker;
const controlPort=await freePort();
const values={UPTIME_LOCAL_REVIEW:'true',SESSION_SECRET:randomBytes(32).toString('base64url'),SETUP_TOKEN:randomBytes(32).toString('base64url'),UPTIME_RUNNER_KEY:randomBytes(32).toString('base64url'),UPTIME_ORIGIN:`http://127.0.0.1:${controlPort}`,OWNER_EMAIL:'archive-owner@example.test',MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test'};
async function command(args,executable=process.execPath){const child=spawn(executable,args,{stdio:'pipe'});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const code=await new Promise(resolve=>child.once('exit',resolve));assert.equal(code,0,output)}
async function migrate(path){await command(['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','uptime-local','--local','--persist-to',path])}
async function installation(path){worker=await startLocalWorker({persist:path,port:controlPort,bindings:values,assets:false});return {...values,DB:await worker.getD1Database('DB')}}
const tables=a=>({...a.payload.tables,...a.payload.productTables});
async function rehash(a){a.sha256=await digest(JSON.stringify(a.payload));return a}
try{
 const source=join(dir,'source'),target=join(dir,'target'),settings=join(dir,'settings.json'),file=join(dir,'archive.json');await writeFile(settings,JSON.stringify(values),{mode:0o600});
 await migrate(source);let env=await installation(source);
 // The owner opens the console first, which establishes the installation's runner; an import never creates one.
 const origin=values.UPTIME_ORIGIN,cookie=await signInOwner(origin,{bindings:values,finishFirstRun:true});
 assert.equal((await fetch(origin+'/api/overview',{headers:{origin,cookie}})).status,200);
 await populateArchiveFixture(env);await populateProtocolArchiveFixture(env);
 const platformLedger=async(db,name)=>{await db.prepare('CREATE TABLE rer_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();await db.prepare('INSERT INTO rer_migrations(name,sha256) VALUES(?,?)').bind(name,await digest(name)).run();return (await db.prepare('SELECT * FROM rer_migrations').all()).results};
 const sourceLedger=await platformLedger(env.DB,'source.sql');
 // One applied-and-undone definition batch and one applied batch travel as history, each imported through the owner's
 // import door as the move-in screen imports.
 const door=definitionDoor({origin,cookie}),definitionFile=names=>JSON.stringify({format:'uptime.monitors',version:1,monitors:names.map(name=>({name,url:`https://example.test/${name}`}))});
 for(const [names,undo] of [[['imported-a','imported-b'],true],[['imported-c'],false]]){
  const view=await door.preview(definitionFile(names));assert.equal(view.status,200,JSON.stringify(view.body));
  const applied=await door.apply(view.body);assert.equal(applied.status,200,JSON.stringify(applied.body));
  if(undo)assert.equal((await door.undo(applied.body)).body.job.state,'undone');
 }
 // A catch-up that is undone and then followed by another catch-up: each archived entry names the revision its own apply wrote,
 // although the undo's restore took a revision between them.
 const robot=timeout=>JSON.stringify({data:[{id:1,friendlyName:'Robot one',type:'HTTP',url:'https://robot-one.example.test/health',interval:300,timeout,httpMethodType:'GET',successHttpResponseCodes:['200']}],nextLink:null});
 const robotBatches=[];
 for(const [timeout,undo] of [[5,false],[7,true],[8,false]]){
  const view=await door.preview(robot(timeout));assert.equal(view.status,200,JSON.stringify(view.body));
  const applied=await door.apply(view.body);assert.equal(applied.status,200,JSON.stringify(applied.body));robotBatches.push(applied.body.batchId.slice('business:'.length));
  if(undo)assert.equal((await door.undo(applied.body)).body.job.state,'undone');
 }
 const authorityMember=crypto.randomUUID();await env.DB.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,'synthetic-archive-member@example.test','Synthetic archive member','member','active',1,?)").bind(authorityMember,Date.now()).run();await env.DB.prepare("INSERT INTO uptime_member_roles(operator_id,role,base_role,base_version,updated_at) VALUES(?,'read-only','member',1,?)").bind(authorityMember,Date.now()).run();await env.DB.prepare("INSERT INTO uptime_member_scopes(operator_id,kind,value) VALUES(?,'service','synthetic-private-scope')").bind(authorityMember).run();
 const recipientResponse=await fetch(origin+'/api/notifications/destinations',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({name:'synthetic-uptime-report-archive',kind:'email',address:'synthetic-uptime-archive@example.test'})});assert.equal(recipientResponse.status,201);const reportRecipient=await recipientResponse.json();
 const reportMonitor=(await env.DB.prepare('SELECT id FROM monitors ORDER BY id LIMIT 1').first()).id;
 const scheduledResponse=await fetch(origin+`/api/monitors/${encodeURIComponent(reportMonitor)}/report-schedules`,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({dueAt:Date.now()+3600000,destinationId:reportRecipient.id,period:{period:'24h',timeZone:'America/Chicago'}})});assert.equal(scheduledResponse.status,201,await scheduledResponse.clone().text());const scheduled=await scheduledResponse.json();
 await seedArchiveHistory({origin,cookie,db:env.DB});
 const original=await archive(env),a=tables(original);assert.ok(!JSON.stringify(original).includes('rer_migrations'));assert.deepEqual((await env.DB.prepare('SELECT * FROM rer_migrations').all()).results,sourceLedger);
 // A Slack body sent with workerd's zero-offset spelling exports as sent; the loops below restore and re-export it byte for byte.
 assert.match(JSON.parse(a.integration_deliveries.find(d=>d.id==='job-zero-offset').envelope).body,/Confirmed start \(UTC\): [^\\]+ GMT\+00:00\\n/);
 assert.equal(a.definition_batches.length,5);assert.equal(a.definition_batch_entries.length,6);assert.ok(a.definition_batches.every(b=>b.restored_at===null));const fileBatches=a.definition_batches.filter(b=>b.source==='uptime.monitors'),robotRows=robotBatches.map(id=>a.definition_batch_entries.filter(e=>e.batch_id===id));
 assert.deepEqual(fileBatches.map(b=>[b.actor_kind,b.undone_at!==null]),[['operator',true],['operator',false]]);assert.deepEqual(a.definition_batch_entries.filter(e=>fileBatches.some(b=>b.id===e.batch_id)).map(e=>[e.action,e.revision,e.previous_revision,e.undo_outcome]),[['create',1,null,'paused'],['create',1,null,'paused'],['create',1,null,null]]);
 // Revisions 1 to 4 of the robot: import, catch-up (undone), the undo's restore, the second catch-up. The archive names the revision each apply wrote.
 const robotMonitor=a.definition_batch_entries.find(e=>e.batch_id===robotBatches[0]).monitor_id,timeoutOf=revision=>JSON.parse(a.revisions.find(r=>r.monitor_id===robotMonitor&&r.revision===revision).definition).timeoutMs;
 assert.deepEqual(robotRows.map(rows=>rows.map(e=>[e.action,e.revision,e.previous_revision,e.undo_outcome])),[[['create',1,null,null]],[['change',2,1,'restored']],[['change',4,3,null]]]);
 assert.deepEqual([timeoutOf(1),timeoutOf(2),timeoutOf(3),timeoutOf(4)],[5000,7000,5000,8000],'each named revision holds the definition its apply wrote');
 const inventory=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results;for(const {name} of inventory)assert.ok(TABLES.includes(name)||installationLocalTables[name]||name.startsWith('rer_portability_'),`Unclassified schema table: ${name}`);console.log('Archive schema inventory: '+inventory.map(({name})=>`${name}=${TABLES.includes(name)?'portable':'installation-local authority'}`).join(', '));
 // Real D1 carries Cloudflare's _cf_* tables (_cf_KV) that local D1 refuses to create, so inject their names under the real inventory query: platform tables are never refused, while any other unknown table, even one that merely resembles the prefix, still refuses.
 const withTables=(names,db=env.DB)=>({prepare:sql=>db.prepare(sql.replace('FROM sqlite_master',`FROM (SELECT name,type FROM sqlite_master${names.map(n=>` UNION ALL SELECT '${n}','table'`).join('')})`)),batch:statements=>db.batch(statements)});
 await assertArchiveInventory(withTables(['_cf_KV','_cf_FUTURE']));await assert.rejects(assertArchiveInventory(withTables(['_cf_KV','xcf_unknown'])),/Archive unclassified table: xcf_unknown/);
 assert.equal(original.payload.schemaVersion,2);assert.deepEqual(Object.keys(original.payload.tables),LEGACY_TABLES);assert.deepEqual(Object.keys(a),TABLES);
 const text=JSON.stringify(original);assert.ok(!text.includes('synthetic-private-scope'));assert.ok(!Object.hasOwn(a,'uptime_member_roles'));assert.ok(!Object.hasOwn(a,'uptime_member_scopes'));for(const secret of [values.SESSION_SECRET,values.SETUP_TOKEN,values.UPTIME_RUNNER_KEY,'private-lease','private-queued-lease','private-destination','private-fingerprint','fixture-signing-secret','credential-webhook','credential-slack','private-claim','/fixture/private/token'])assert.ok(!text.includes(secret),'Excluded credential or authority marker');assert.ok(text.includes('archive-owner@example.test'));
 await assert.rejects(archive({...env,SESSION_SECRET:'synthetic-incorrect-local-secret-that-cannot-decrypt-email'}),/email definition unavailable/);
 await worker.dispose();worker=null;
 await writeFile(file,JSON.stringify(original),{mode:0o600});assert.equal((await stat(file)).mode&0o777,0o600);assert.deepEqual(tables(JSON.parse(await readFile(file,'utf8'))),a);
 await migrate(target);env=await installation(target);const destinationLedger=await platformLedger(env.DB,'destination.sql');await restore(env,original);const roundtrip=await archive(env),b=tables(roundtrip);assert.deepEqual((await env.DB.prepare('SELECT * FROM rer_migrations').all()).results,destinationLedger,'ARCHIVE-ROUNDTRIP-001: preserve Platform destination migration history');

 assert.deepEqual(b.source_history_rows,a.source_history_rows,'source history rows, source labels, batch IDs and digests round trip');assert.deepEqual(b.source_history_batches.map(r=>({...r,restored_at:null})),a.source_history_batches);assert.ok(b.source_history_batches.every(r=>r.restored_at!==null),'source batches restore inactive');
 assert.deepEqual(b.scheduled_reports,a.scheduled_reports.map(row=>({...row,actor_id:null})),'scheduled snapshot survives with inactive owner attribution');assert.equal(b.notification_jobs.find(job=>job.id===scheduled.deliveryId).state,'imported-inactive','restored report cannot send');
 for(const name of ['uptime_member_roles','uptime_member_scopes'])assert.equal((await env.DB.prepare(`SELECT COUNT(*) n FROM ${name}`).first()).n,0,'archive restore grants no receiving membership or scope');
 for(const name of ['migrations','observations','integration_attempts','integration_resolutions','integration_replays'])assert.deepEqual(b[name],a[name],`${name} retained byte for byte`);
 for(const type of ['tcp','dns','tls','domain']){
  const source=a.monitors.find(m=>JSON.parse(m.definition).type===type),restored=b.monitors.find(m=>m.id===source.id);
  const definition=JSON.parse(source.definition);
  assert.deepEqual(JSON.parse(restored.definition),{...definition,enabled:false},`${type}: exact settings, paused`);
  assert.equal(JSON.parse(restored.state).state,'Unknown');
  assert.deepEqual(b.revisions.find(r=>r.monitor_id===source.id&&r.revision===source.revision),a.revisions.find(r=>r.monitor_id===source.id&&r.revision===source.revision));
  const slot=b.slots.find(s=>s.monitor_id===source.id);assert.equal(slot.status,'interrupted');assert.equal(slot.definition,source.definition);
 }
 assert.equal(b.revisions.length,a.revisions.length+b.monitors.filter(m=>m.revision!==a.monitors.find(o=>o.id===m.id).revision).length);for(const revision of a.revisions)assert.deepEqual(b.revisions.find(r=>r.monitor_id===revision.monitor_id&&r.revision===revision.revision),revision);assert.equal(JSON.parse(b.monitors[0].definition).enabled,false);assert.equal(JSON.parse(b.monitors[0].state).state,'Unknown');assert.ok(b.notification_destinations.every(d=>d.enabled===0));assert.ok(b.notification_jobs.every(j=>j.state==='imported-inactive'));assert.ok(b.outbox.every(o=>o.status==='imported-inactive'));assert.ok(b.slots.every(s=>!['running','queued'].includes(s.status)));
 for(const name of ['monitors','slots','outbox','notification_destinations','notification_jobs','integration_deliveries']){
  assert.equal(b[name].length,a[name].length,`${name}: no omitted records`);
  for(const row of a[name]){const current=b[name].find(r=>r.id===row.id);assert.ok(current);if(JSON.stringify(current)!==JSON.stringify(row)){const historical=b.archive_history.find(h=>h.table_name===name&&h.record===JSON.stringify(row));assert.ok(historical,`${name}/${row.id}: exact original preserved`)}}
 }
 // Batches arrive as history: the same rows, marked restored, and undo refuses to act on them.
 assert.deepEqual(b.definition_batch_entries,a.definition_batch_entries);assert.deepEqual(b.definition_batches.map(({restored_at,...rest})=>rest),a.definition_batches.map(({restored_at,...rest})=>rest));assert.ok(b.definition_batches.every(x=>Number.isSafeInteger(x.restored_at)));
 for(const batch of b.definition_batches)await assert.rejects(undoBatch(env,batch.id,{kind:'feature',ref:'local-cli'}),/came from an archive/);
 for(const name of ['heartbeat_authority','heartbeat_claims','runner_contact','notification_claim_custody'])assert.equal((await env.DB.prepare(`SELECT COUNT(*) n FROM ${name}`).first()).n,0);
 const polled=await fetch(values.UPTIME_ORIGIN+'/api/runner/notifications',{method:'POST',headers:{'content-type':'application/json','x-runner-key':values.UPTIME_RUNNER_KEY},body:JSON.stringify({operation:'poll'})});assert.equal(polled.status,200);assert.deepEqual((await polled.json()).jobs,[]);
 const before=await archive(env);await assert.rejects(restore(env,original),/empty installation/);assert.deepEqual(tables(await archive(env)),tables(before));
 await worker.dispose();worker=null;const repeated=join(dir,'repeated');await migrate(repeated);env=await installation(repeated);await restore(env,roundtrip);const third=tables(await archive(env));assert.deepEqual(third.archive_history,b.archive_history,'Repeated restore must not recursively copy or grow original histories');await worker.dispose();worker=null;const invalid=join(dir,'invalid');await migrate(invalid);env=await installation(invalid);
 for(const mutate of [x=>{x.payload.productTables.integration_attempts[0].delivery_id='missing'},x=>{x.payload.productTables.notification_jobs[0].event_id='missing'},x=>{x.payload.productTables.integration_attempts[0].finished_at=-1},x=>{x.payload.productTables.notification_destinations[0].address='https://secret.test'}]){const forged=structuredClone(original);mutate(forged);await assert.rejects(restore(env,await rehash(forged)));assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n,0)}
 await env.DB.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').bind('orphan','absent','local-a',0,'{}').run();await assert.rejects(restore(env,original),/empty installation/);await env.DB.prepare('DELETE FROM observations').run();
 const legacy=structuredClone(original);delete legacy.payload.erasureFence;delete legacy.payload.extensionVersion;delete legacy.payload.productTables;legacy.payload.schemaVersion=1;for(const slot of legacy.payload.tables.slots)delete slot.manual;await restore(env,await rehash(legacy));assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM observations').first()).n,a.observations.length);
 await worker.dispose();worker=null;const prior=join(dir,'prior-010');await migrate(prior);env=await installation(prior);const priorArchive=structuredClone(original);delete priorArchive.payload.erasureFence;delete priorArchive.payload.extensionVersion;delete priorArchive.payload.productTables;await restore(env,await rehash(priorArchive));assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM observations').first()).n,a.observations.length);
 await worker.dispose();worker=null;const beforeBatches=join(dir,'prior-012');await migrate(beforeBatches);env=await installation(beforeBatches);const missingSnapshot=structuredClone(original);missingSnapshot.payload.productTables.scheduled_reports=[];await assert.rejects(restore(env,await rehash(missingSnapshot)),/Invalid scheduled report event/);assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n,0,'missing scheduled snapshot refuses before writes');
 const extension2=structuredClone(original);extension2.payload.productTables.notification_jobs=extension2.payload.productTables.notification_jobs.filter(job=>JSON.parse(job.event).kind!=='report');extension2.payload.extensionVersion=2;extension2.payload.productTables=Object.fromEntries(extensionTables(2).map(name=>[name,extension2.payload.productTables[name]]));await restore(env,await rehash(extension2));assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM observations').first()).n,a.observations.length);assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM definition_batches').first()).n,0);
 await worker.dispose();worker=null;const bound=join(dir,'bound');await migrate(bound);env=await installation(bound);
 await env.DB.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<${ARCHIVE_ROWS+1}) INSERT INTO observations SELECT 'bound-'||x,'none-'||x,'local-a',0,'{}' FROM n`).run();await assert.rejects(archive(env),/row bound exceeded: observations/);await env.DB.prepare('DELETE FROM observations').run();await env.DB.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO observations SELECT 'bytes-'||x,'none-'||x,'local-a',0,hex(zeroblob(2048)) FROM n").run();await assert.rejects(archive(env),/byte bound exceeded/);await env.DB.prepare('DELETE FROM observations').run();await env.DB.prepare("CREATE TABLE unexpected_product (id TEXT)").run();await assert.rejects(archive(env),/unclassified table: unexpected_product/);await env.DB.prepare('DROP TABLE unexpected_product').run();await env.DB.prepare("INSERT INTO integration_replays VALUES('foreign','foreign','fingerprint','{}',0)").run();await assert.rejects(archive(env),/unsupported product namespace: integration_replays/);
 await worker.dispose();worker=null;
 await restoreBounds({dir,migrate,installation,command,settings,dispose:async()=>{await worker?.dispose();worker=null}});
 console.log('BASE-DATA-001 replacement / ARCHIVE-ROUNDTRIP-001 passed: real D1 archive/restore/archive, exact complete history, inactive restore, excluded authority, invalid history rejection, legacy restore and named row bound.');
}finally{await worker?.dispose();await rm(dir,{recursive:true,force:true})}
