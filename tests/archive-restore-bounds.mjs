import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {archive,restore} from '../src/domain/archive.server.ts';
import {validateArchive} from '../src/domain/archive-validation.ts';
import {ARCHIVE_BYTES,ARCHIVE_ROWS,TABLES,portableArchive} from '../src/domain/archive-schema.ts';
import {legacyArchive,archiveTables,rehashArchive} from './archive-restore-fixtures.mjs';

export async function restoreBounds({dir,migrate,installation,dispose,command,settings}){
 const refused=join(dir,'projected-refusal');await migrate(refused);let env=await installation(refused);
 // D1's own _cf_METADATA contents are inaccessible to application queries.
 const names=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA' ORDER BY name").all()).results.map(row=>row.name);
 const snapshot=async()=>Object.fromEntries(await Promise.all(names.map(async name=>[name,(await env.DB.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()).results])));
 const before=await snapshot();
 for(const [options,bound] of [[{revisions:ARCHIVE_ROWS,slots:0},/Archive row bound exceeded: revisions \(10000\)/],[{slots:2200,fullDefinition:true},/Archive exceeds 2 MiB \(byte bound exceeded: 2 MiB\)/]]){
  const input=await legacyArchive(options);await validateArchive(input);assert.ok(Buffer.byteLength(JSON.stringify(input))<ARCHIVE_BYTES);
  await assert.rejects(restore(env,input),bound);assert.deepEqual(await snapshot(),before,'Projected-bound refusal leaves every real D1 table unchanged');
 }
 let commitPrepared=false,raced=false;
 const racedDB={prepare(sql){if(sql.startsWith('INSERT '))commitPrepared=true;return env.DB.prepare(sql)},async batch(statements){
  if(commitPrepared&&!raced){raced=true;await env.DB.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').bind('concurrent','absent','local-a',0,'{}').run()}
  return env.DB.batch(statements);
 }};
 await assert.rejects(restore({...env,DB:racedDB},await legacyArchive()));assert.equal(raced,true);
 await env.DB.prepare("DELETE FROM observations WHERE id='concurrent'").run();
 assert.deepEqual(await snapshot(),before,'The in-transaction empty guard rolls back every restore write after a concurrent insertion');
 await dispose();
 for(const [label,options] of [['revision-edge',{revisions:ARCHIVE_ROWS-1,slots:0}],['accepted-history',{slots:24,status:'accepted',receipt:'historical receiver acknowledgement'}],['unavailable-definitions',{slots:0}]]){
  const target=join(dir,label),file=join(dir,`${label}-input.json`),output=join(dir,`${label}-output.json`);let input=await legacyArchive(options);
  if(label==='unavailable-definitions'){
   input=await portableArchive(await validateArchive(input));input.payload.productTables.notification_destinations=[
    {id:'unavailable',name:'Unavailable email',kind:'email',enabled:0,created_at:1,deleted_at:null,address:null},
    {id:'deleted',name:'Deleted email',kind:'email',enabled:0,created_at:1,deleted_at:2,address:'prior@example.test'},
   ];await rehashArchive(input);
  }
  await migrate(target);await writeFile(file,JSON.stringify(input),{mode:0o600});
  env=await installation(target);await restore(env,input);const runtime=await archive(env),cli=runtime,tables=archiveTables(runtime);

  assert.ok(TABLES.every(name=>tables[name].length<=ARCHIVE_ROWS));assert.ok(Buffer.byteLength(JSON.stringify(runtime)+'\n')<=ARCHIVE_BYTES);
  if(label==='revision-edge')assert.equal(tables.revisions.length,ARCHIVE_ROWS);
  if(label==='accepted-history'){
   assert.equal(tables.outbox[0].status,'imported-inactive');assert.equal(tables.outbox[0].receipt,null);assert.equal(tables.outbox[0].event,input.payload.tables.outbox[0].event);
   assert.ok(tables.archive_history.some(row=>row.table_name==='outbox'&&row.record===JSON.stringify(input.payload.tables.outbox[0])));
  }
  if(label==='unavailable-definitions'){
   assert.deepEqual(tables.notification_destinations.map(row=>row.address),[null,null]);
   assert.ok(tables.archive_history.some(row=>row.table_name==='notification_destinations'&&row.record===JSON.stringify(input.payload.productTables.notification_destinations[1])));
  }
  await dispose();
  const repeated=join(dir,`${label}-repeat`);await migrate(repeated);env=await installation(repeated);await restore(env,cli);
  assert.deepEqual(archiveTables(await archive(env)),tables,'A repeated accepted restore adds neither history nor revisions');await dispose();
 }
 console.log('ARCHIVE-PROJECTED-BOUNDS passed: real D1 no-write refusals, 10000 revision boundary, genuine accepted legacy history, runtime export equivalence and repeat stability.');
}
