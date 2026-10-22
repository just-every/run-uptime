// DEPENDENCY-002 portability through the owner doors: followed services, owner links, dependency notices and their
// acknowledgements travel in the archive without any credential, restore inactive with no send resumed, and are removed with
// their monitor; a populated installation that holds DEPENDENCY-001 monitors upgrades to the catalog tables with nothing
// rewritten.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './resilience/support.mjs';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {splitSql} from './migration-support.mjs';
import {testAuthBindings,signInOwner} from './auth-test-support.mjs';
import {validateDefinition} from '../src/domain/policy.mjs';
export async function proveCatalogPortability({g,ids,urls}){
 const ok=async(path,body,options={})=>{const response=await g.request(path,{body,...options});assert.ok(response.status<300,`${path} ${response.status} ${JSON.stringify(response.data)}`);return response.data};
 const count=async(db,sql)=>Number((await db.prepare(sql).first()).n);
 const archive=await ok('/api/archive');
 const tables=archive.payload.productTables,text=JSON.stringify(archive);
 assert.equal(tables.followed_services.length,3,'every followed service travels');
 assert.equal(tables.dependency_acks.length,1,'the grouped acknowledgement travels');
 assert.ok(archive.payload.tables.outbox.some(r=>r.kind==='dependency')&&archive.payload.tables.outbox.some(r=>r.kind==='dependency_recovery'),'dependency notices travel');
 const linked=archive.payload.tables.monitors.map(r=>JSON.parse(r.definition)).filter(d=>d.dependencies?.includes(ids.stripe)).length;assert.equal(linked,2,'owner links travel in the linked monitors’ definitions');
 for(const url of urls)assert.ok(!text.includes(url),'a destination URL stays on the installation');
 assert.ok(!/signing[_-]?secret|ciphertext/.test(JSON.stringify(tables.followed_services)+JSON.stringify(tables.dependency_acks)),'no credential rides with the catalog tables');
 // Restore into an empty installation: everything arrives paused, history is inactive, and nothing is sent.
 const h=await fixture(),okH=async path=>{const response=await h.request(path);assert.equal(response.status,200,path);return response.data};
 try{
  await okH('/api/overview');
  const restored=await h.request('/api/restore',{body:archive});assert.equal(restored.status,200,JSON.stringify(restored.data));assert.equal(restored.data.enabled,false);
  assert.equal(await count(h.DB,'SELECT COUNT(*) n FROM followed_services'),3);assert.equal(await count(h.DB,'SELECT COUNT(*) n FROM dependency_acks'),1);
  assert.equal(await count(h.DB,"SELECT COUNT(*) n FROM monitors WHERE json_extract(definition,'$.enabled')=1"),0,'every restored monitor, followed services included, is paused');
  assert.equal(await count(h.DB,"SELECT COUNT(*) n FROM outbox WHERE kind LIKE 'dependency%' AND status<>'imported-inactive'"),0);
  assert.equal(await count(h.DB,"SELECT COUNT(*) n FROM notification_jobs WHERE state NOT IN ('imported-inactive')"),0,'no restored send can resume');
  const before=await count(h.DB,'SELECT COUNT(*) n FROM notification_jobs');
  for(const m of (await okH('/api/overview')).monitors)assert.equal(m.definition.enabled,false);
  assert.equal(await count(h.DB,'SELECT COUNT(*) n FROM notification_jobs'),before,'opening the restored installation sends nothing');
  const view=await h.request('/api/service-catalog');assert.equal(view.data.followed.length,3);assert.ok(view.data.notices.every(n=>n.imported),'restored notices are history');
 }finally{await h.close()}
 // Erasing a followed service removes its row, its notices, their deliveries and the acknowledgement; the linked monitor keeps its history.
 const name=(await ok('/api/overview')).monitors.find(m=>m.id===ids.stripe).definition.name;
 await ok(`/api/monitors/${ids.stripe}/erase`,{name});
 for(const sql of [`SELECT COUNT(*) n FROM followed_services WHERE monitor_id='${ids.stripe}'`,`SELECT COUNT(*) n FROM dependency_acks WHERE monitor_id='${ids.stripe}'`,`SELECT COUNT(*) n FROM outbox WHERE monitor_id='${ids.stripe}'`,`SELECT COUNT(*) n FROM notification_jobs WHERE json_extract(event,'$.monitorId')='${ids.stripe}'`])assert.equal(await count(g.DB,sql),0,sql);
 assert.equal(await count(g.DB,'SELECT COUNT(*) n FROM followed_services'),2,'the other followed services remain');
 const incident=(await ok(`/api/monitors/${ids.shop}/incidents`))[0].id;
 assert.deepEqual((await ok(`/api/incidents/${incident}`)).dependencies.linked,[],'an erased provider leaves no dangling notice on the incident');
}
// A populated installation from before the catalog (DEPENDENCY-001 monitors, an incident, a website check) upgrades by one additive migration.
export async function proveCatalogUpgrade(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-catalog-upgrade-')),key=randomUUID()+randomUUID(),legacyId=`self-${randomUUID()}`;
 const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:key};let worker;
 try{
  worker=await startLocalWorker({persist:directory,bindings,outboundService:async()=>new Response('',{status:200})});
  const DB=await worker.getD1Database('DB'),names=(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort(),catalog=names.find(n=>n.startsWith('0064_'));
  const apply=async name=>{if(name.endsWith('_resilient_monitoring.sql')){await DB.prepare('INSERT INTO runner_registration(id,runner_id,registered_at) VALUES(1,?,?)').bind(legacyId,Date.now()).run();await DB.prepare('INSERT INTO runner_contact(id,last_contact_at) VALUES(1,?)').bind(Date.now()-5).run()}for(const sql of splitSql(await readFile(join('migrations',name),'utf8')))await DB.prepare(sql).run()};
  for(const name of names.filter(n=>n<catalog))await apply(name);
  const now=Date.now(),definition=JSON.stringify(validateDefinition({name:'Acme Cloud API',url:'https://status.provider.test/api/v2/components.json',assertions:{status:200,json:{path:'components[?(@.id=="api")].status',equals:'operational'}},service:'Acme Cloud',tags:['dependency'],group:'API',outcome:"Acme Cloud's status is the provider's own claim.",enabled:true},[]));
  await DB.batch([DB.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind('dependency-one',1,definition,now,JSON.stringify({state:'Unknown'})),DB.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind('dependency-one',1,definition,now),DB.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind('dependency-one'),
   DB.prepare("INSERT INTO discovery_jobs(id,url,status,created_at) VALUES('00000000-0000-4000-8000-000000000001','https://example.com/','done',?)").bind(now)]);
  const read=async()=>({monitors:(await DB.prepare('SELECT * FROM monitors ORDER BY rowid').all()).results,revisions:(await DB.prepare('SELECT * FROM revisions ORDER BY rowid').all()).results});
  const before=await read();
  await apply(catalog);
  assert.deepEqual(await read(),before,'the migration rewrites no monitor or revision');
  const job=await DB.prepare("SELECT kind,spec,status FROM discovery_jobs").first();assert.deepEqual({...job},{kind:'site',spec:null,status:'done'},'earlier website checks stay website checks');
  for(const table of ['followed_services','catalog_review','dependency_acks'])assert.equal(Number((await DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n),0);
  for(const name of names.filter(n=>n>catalog))await apply(name);
  const origin=(await worker.ready).origin,cookie=await signInOwner(origin,{bindings});
  const api=async path=>{const response=await fetch(origin+path,{headers:{cookie,origin}});const body=await response.json();assert.equal(response.status,200,path+' '+JSON.stringify(body));return body};
  const exported=await api('/api/archive');
  assert.equal(exported.payload.productTables.followed_services.length,0);assert.ok(exported.payload.tables.monitors.some(r=>r.id==='dependency-one'),'the upgraded installation exports its DEPENDENCY-001 monitor');
  assert.equal((await api('/api/service-catalog')).followed.length,0,'a DEPENDENCY-001 monitor is an ordinary dependency monitor, not a followed service');
  const finished=await api('/api/overview');assert.ok(finished.monitors.some(m=>m.id==='dependency-one'));
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
}
