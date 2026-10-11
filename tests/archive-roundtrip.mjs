// BASE-DATA-001 replacement: complete portable records, excluded authority, inactive legacy-compatible restore.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {freePort} from '../scripts/local-ports.mjs';
import {startLocalWorker} from '../scripts/local-worker.mjs';
import {archive,restore} from '../src/domain/archive.server.ts';
import {digest,TABLES,LEGACY_TABLES,ARCHIVE_ROWS} from '../src/domain/archive-schema.ts';
import {installationLocalTables} from '../src/domain/archive-inventory.ts';
import {populateArchiveFixture} from './archive-fixture.mjs';
import {restoreBounds} from './archive-restore-bounds.mjs';
const parent=new URL('../../tmp/',import.meta.url).pathname;await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'archive-roundtrip-'));let worker;
const controlPort=await freePort();
const values={SESSION_SECRET:randomBytes(32).toString('base64url'),SETUP_TOKEN:randomBytes(32).toString('base64url'),UPTIME_RUNNER_KEY:randomBytes(32).toString('base64url'),UPTIME_ORIGIN:`http://127.0.0.1:${controlPort}`,OWNER_EMAIL:'archive-owner@example.test',MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test'};
async function command(args,executable=process.execPath){const child=spawn(executable,args,{stdio:'pipe'});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const code=await new Promise(resolve=>child.once('exit',resolve));assert.equal(code,0,output)}
async function migrate(path){await command(['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','uptime-local','--local','--persist-to',path])}
async function installation(path){worker=await startLocalWorker({persist:path,port:controlPort,bindings:values,assets:false});return {...values,DB:await worker.getD1Database('DB')}}
const tables=a=>({...a.payload.tables,...a.payload.productTables});
async function rehash(a){a.sha256=await digest(JSON.stringify(a.payload));return a}
try{
 const source=join(dir,'source'),target=join(dir,'target'),settings=join(dir,'settings.json'),file=join(dir,'archive.json');await writeFile(settings,JSON.stringify(values),{mode:0o600});
 await migrate(source);let env=await installation(source);await populateArchiveFixture(env);const original=await archive(env),a=tables(original);const inventory=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results;for(const {name} of inventory)assert.ok(TABLES.includes(name)||installationLocalTables[name]||name.startsWith('rer_portability_'),`Unclassified schema table: ${name}`);console.log('Archive schema inventory: '+inventory.map(({name})=>`${name}=${TABLES.includes(name)?'portable':'installation-local authority'}`).join(', '));
 assert.equal(original.payload.schemaVersion,2);assert.deepEqual(Object.keys(original.payload.tables),LEGACY_TABLES);assert.deepEqual(Object.keys(a),TABLES);
 const text=JSON.stringify(original);for(const secret of [values.SESSION_SECRET,values.SETUP_TOKEN,values.UPTIME_RUNNER_KEY,'private-lease','private-queued-lease','private-destination','private-fingerprint','fixture-signing-secret','credential-webhook','credential-slack','private-claim','/fixture/private/token'])assert.ok(!text.includes(secret),'Excluded credential or authority marker');assert.ok(text.includes('archive-owner@example.test'));
 await assert.rejects(archive({...env,SESSION_SECRET:'incorrect-local-secret-that-cannot-decrypt-email'}),/email definition unavailable/);
 await worker.dispose();worker=null;
 await writeFile(file,JSON.stringify(original),{mode:0o600});assert.equal((await stat(file)).mode&0o777,0o600);assert.deepEqual(tables(JSON.parse(await readFile(file,'utf8'))),a);
 await migrate(target);env=await installation(target);await restore(env,original);const roundtrip=await archive(env),b=tables(roundtrip);

 for(const name of ['migrations','observations','integration_attempts','integration_resolutions','integration_replays'])assert.deepEqual(b[name],a[name],`${name} retained byte for byte`);
 assert.equal(b.revisions.length,a.revisions.length+1);for(const revision of a.revisions)assert.deepEqual(b.revisions.find(r=>r.monitor_id===revision.monitor_id&&r.revision===revision.revision),revision);assert.equal(JSON.parse(b.monitors[0].definition).enabled,false);assert.equal(JSON.parse(b.monitors[0].state).state,'Unknown');assert.ok(b.notification_destinations.every(d=>d.enabled===0));assert.ok(b.notification_jobs.every(j=>j.state==='imported-inactive'));assert.ok(b.outbox.every(o=>o.status==='imported-inactive'));assert.ok(b.slots.every(s=>!['running','queued'].includes(s.status)));
 for(const name of ['monitors','slots','outbox','notification_destinations','notification_jobs','integration_deliveries']){
  assert.equal(b[name].length,a[name].length,`${name}: no omitted records`);
  for(const row of a[name]){const current=b[name].find(r=>r.id===row.id);assert.ok(current);if(JSON.stringify(current)!==JSON.stringify(row)){const historical=b.archive_history.find(h=>h.table_name===name&&h.record===JSON.stringify(row));assert.ok(historical,`${name}/${row.id}: exact original preserved`)}}
 }
 for(const name of ['heartbeat_authority','heartbeat_claims','runner_contact','notification_claim_custody'])assert.equal((await env.DB.prepare(`SELECT COUNT(*) n FROM ${name}`).first()).n,0);
 const polled=await fetch(values.UPTIME_ORIGIN+'/api/runner/notifications',{method:'POST',headers:{'content-type':'application/json','x-runner-key':values.UPTIME_RUNNER_KEY},body:JSON.stringify({operation:'poll'})});assert.equal(polled.status,200);assert.deepEqual((await polled.json()).jobs,[]);
 const before=await archive(env);await assert.rejects(restore(env,original),/empty installation/);assert.deepEqual(tables(await archive(env)),tables(before));
 await worker.dispose();worker=null;const repeated=join(dir,'repeated');await migrate(repeated);env=await installation(repeated);await restore(env,roundtrip);const third=tables(await archive(env));assert.deepEqual(third.archive_history,b.archive_history,'Repeated restore must not recursively copy or grow original histories');await worker.dispose();worker=null;const invalid=join(dir,'invalid');await migrate(invalid);env=await installation(invalid);
 for(const mutate of [x=>{x.payload.productTables.integration_attempts[0].delivery_id='missing'},x=>{x.payload.productTables.notification_jobs[0].event_id='missing'},x=>{x.payload.productTables.integration_attempts[0].finished_at=-1},x=>{x.payload.productTables.notification_destinations[0].address='https://secret.test'}]){const forged=structuredClone(original);mutate(forged);await assert.rejects(restore(env,await rehash(forged)));assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n,0)}
 await env.DB.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').bind('orphan','absent','local-a',0,'{}').run();await assert.rejects(restore(env,original),/empty installation/);await env.DB.prepare('DELETE FROM observations').run();
 const legacy=structuredClone(original);delete legacy.payload.extensionVersion;delete legacy.payload.productTables;legacy.payload.schemaVersion=1;for(const slot of legacy.payload.tables.slots)delete slot.manual;await restore(env,await rehash(legacy));assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM observations').first()).n,a.observations.length);
 await worker.dispose();worker=null;const prior=join(dir,'prior-010');await migrate(prior);env=await installation(prior);const priorArchive=structuredClone(original);delete priorArchive.payload.extensionVersion;delete priorArchive.payload.productTables;await restore(env,await rehash(priorArchive));assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM observations').first()).n,a.observations.length);
 await worker.dispose();worker=null;const bound=join(dir,'bound');await migrate(bound);env=await installation(bound);
 await env.DB.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<${ARCHIVE_ROWS+1}) INSERT INTO observations SELECT 'bound-'||x,'none-'||x,'local-a',0,'{}' FROM n`).run();await assert.rejects(archive(env),/row bound exceeded: observations/);await env.DB.prepare('DELETE FROM observations').run();await env.DB.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO observations SELECT 'bytes-'||x,'none-'||x,'local-a',0,hex(zeroblob(2048)) FROM n").run();await assert.rejects(archive(env),/byte bound exceeded/);await env.DB.prepare('DELETE FROM observations').run();await env.DB.prepare("CREATE TABLE unexpected_product (id TEXT)").run();await assert.rejects(archive(env),/unclassified table: unexpected_product/);await env.DB.prepare('DROP TABLE unexpected_product').run();await env.DB.prepare("INSERT INTO integration_replays VALUES('foreign','foreign','fingerprint','{}',0)").run();await assert.rejects(archive(env),/unsupported product namespace: integration_replays/);
 await worker.dispose();worker=null;
 await restoreBounds({dir,migrate,installation,command,settings,dispose:async()=>{await worker?.dispose();worker=null}});
 console.log('BASE-DATA-001 replacement / ARCHIVE-ROUNDTRIP-001 passed: real D1 archive/restore/archive, exact complete history, inactive restore, excluded authority, invalid history rejection, legacy restore and named row bound.');
}finally{await worker?.dispose();await rm(dir,{recursive:true,force:true})}
