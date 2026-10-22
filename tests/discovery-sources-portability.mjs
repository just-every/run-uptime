// DISCOVERY-001 portability through the owner doors: sources (identifiers only), run snapshots and decisions travel in the archive,
// restore inactive (a run is refused until the receiving owner authorizes the source again) and erase with the adopted monitor
// they name; a populated installation upgrades to the source tables with nothing rewritten.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './resilience/support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {splitSql} from './migration-support.mjs';
import {testAuthBindings,signInOwner} from './auth-test-support.mjs';
import {SECRETS} from './discovery-sources-fixture.mjs';
export async function proveDiscoveryPortability({g,archive,erase,ok}){
 const tables=archive.payload.productTables;
 assert.equal(tables.discovery_sources.length,8,'every authorized source travels');
 assert.ok(tables.discovery_source_runs.length>=16&&tables.discovery_decisions.length>=10,'run snapshots and decisions travel');
 for(const secret of SECRETS)assert.ok(!JSON.stringify(archive).includes(secret),'no provider credential travels');
 const h=await fixture(),count=async sql=>Number((await h.DB.prepare(sql).first()).n);
 try{
  assert.equal((await h.request('/api/overview')).status,200);
  const restored=await h.request('/api/restore',{body:archive});assert.equal(restored.status,200,JSON.stringify(restored.data));
  assert.equal(await count("SELECT COUNT(*) n FROM discovery_sources WHERE state='inactive'"),8,'every restored source is inactive');
  assert.equal(await count('SELECT COUNT(*) n FROM discovery_source_runs'),tables.discovery_source_runs.length);
  const [first]=(await h.request('/api/discovery-sources')).data.sources;
  assert.equal(first.state,'inactive');
  assert.equal((await h.request(`/api/discovery-sources/${first.id}/runs`,{body:{}})).status,409,'a restored source reads nothing');
  assert.equal(await count('SELECT COUNT(*) n FROM discovery_jobs'),0);
  assert.equal((await h.request(`/api/discovery-sources/${first.id}/authorize`,{body:{}})).status,200);
  assert.equal(await count(`SELECT COUNT(*) n FROM discovery_sources WHERE id='${first.id}' AND state='active'`),1,'the receiving owner authorizes it again');
 }finally{await h.close()}
 // Erasing an adopted monitor removes the decision that names it, and counts it in the receipt.
 const name=(await ok('/api/overview')).monitors.find(m=>m.id===erase).definition.name;
 const {receipt}=await ok(`/api/monitors/${erase}/erase`,{name});
 assert.equal(receipt.counts.discovery_decisions,1);
 assert.equal(Number((await g.DB.prepare(`SELECT COUNT(*) n FROM discovery_decisions WHERE monitor_id='${erase}'`).first()).n),0);
}
// A populated installation from before discovery sources (a website check, a followed service) upgrades by one additive migration.
export async function proveDiscoveryUpgrade(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-sources-upgrade-')),key=randomUUID()+randomUUID(),legacyId=`self-${randomUUID()}`;
 const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:key};let worker;
 try{
  worker=await startLocalWorker({persist:directory,bindings,outboundService:async()=>new Response('',{status:200})});
  const DB=await worker.getD1Database('DB'),names=(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort(),sources=names.find(n=>n.startsWith('0065_'));
  const apply=async name=>{if(name.endsWith('_resilient_monitoring.sql')){await DB.prepare('INSERT INTO runner_registration(id,runner_id,registered_at) VALUES(1,?,?)').bind(legacyId,Date.now()).run();await DB.prepare('INSERT INTO runner_contact(id,last_contact_at) VALUES(1,?)').bind(Date.now()-5).run()}for(const sql of splitSql(await readFile(join('migrations',name),'utf8')))await DB.prepare(sql).run()};
  for(const name of names.filter(n=>n<sources))await apply(name);
  const now=Date.now();
  await DB.batch([DB.prepare("INSERT INTO discovery_jobs(id,url,status,created_at,kind,spec) VALUES('00000000-0000-4000-8000-000000000001','https://example.com/','done',?,'site',NULL)").bind(now),
   DB.prepare("INSERT INTO followed_services(monitor_id,entry_id,catalog_version,scope,component_key,followed_at,checked_at) VALUES('followed-one','stripe',1,'whole',NULL,?,?)").bind(now,now)]);
  const read=async()=>({jobs:(await DB.prepare('SELECT * FROM discovery_jobs ORDER BY rowid').all()).results,followed:(await DB.prepare('SELECT * FROM followed_services').all()).results});
  const before=await read();
  await apply(sources);
  assert.deepEqual(await read(),before,'the migration rewrites no job or followed service');
  for(const table of ['discovery_sources','discovery_source_runs','discovery_decisions'])assert.equal(Number((await DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n),0);
  for(const name of names.filter(n=>n>sources))await apply(name);
  await DB.prepare("DELETE FROM followed_services").run();
  const origin=(await worker.ready).origin,cookie=await signInOwner(origin,{bindings});
  const response=await fetch(origin+'/api/discovery-sources',{headers:{cookie,origin}});assert.equal(response.status,200);
  assert.deepEqual((await response.json()).sources,[],'the upgraded installation reads its (empty) sources');
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
}
