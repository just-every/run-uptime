import {testAuthBindings,signInOwner} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {projectContact,CONTACT_FRESHNESS_MS} from '../src/domain/runner-contact.server.ts';
import {validateDefinition} from '../src/domain/policy.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),dir=await mkdtemp(join(tmpdir(),'uptime-contact-'));
const ports=[Number(process.env.UPTIME_CONTACT_CONTROL_PORT??15491),Number(process.env.UPTIME_CONTACT_RECOVERY_PORT??15492)];
if(ports.some(p=>!Number.isInteger(p)||p<15481||p>15519)||new Set(ports).size!==2)throw Error('Distinct assigned contact ports required');
const bindings={...testAuthBindings,UPTIME_RUNNER_KEY:'synthetic-contact-runner-key-20261002',UPTIME_SYNTHETIC_PORT:'15490'};
let worker,recovery,cookie='',origin=`http://127.0.0.1:${ports[0]}`,passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
async function api(path,method='GET',body,headers={}){const response=await fetch(origin+path,{method,headers:{'content-type':'application/json',cookie,...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json(),headers:response.headers};}
async function login(){cookie=await signInOwner(origin,{bindings});}
async function apply(DB,names){for(const name of names)for(const statement of splitSql(await readFile(join(root,'migrations',name),'utf8')))await DB.prepare(statement).run();}
async function domain(DB){return Promise.all(['monitors','revisions','slots','observations','outbox','migrations'].map(async table=>(await DB.prepare(`SELECT * FROM ${table}${table==='migrations'?' WHERE version<=2':''} ORDER BY rowid`).all()).results));}
async function setTime(DB,time){await DB.prepare('UPDATE runner_contact SET last_contact_at=? WHERE id=1').bind(time).run();}
async function submit(task,attempts,signature=true){const text=JSON.stringify({slotId:task.id,attempts}),stamp=String(Date.now());const response=await fetch(origin+'/api/runner/results',{method:'POST',headers:{'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY,'x-sent-at':stamp,'x-runner-signature':signature?createHmac('sha256',bindings.UPTIME_RUNNER_KEY).update(`${stamp}.${text}`).digest('hex'):'invalid'},body:text});return {status:response.status,data:await response.json()};}
try{
 await check('freshness boundary and future receipt clock cannot imply fresh contact',async()=>{
  assert.equal(projectContact(null,200000).state,'Never seen');assert.equal(projectContact(80000,200000).state,'Fresh contact');assert.equal(projectContact(79999,200000).state,'Stale contact');assert.equal(projectContact(200001,200000).state,'Stale contact');assert.equal(CONTACT_FRESHNESS_MS,120000);
 });
 worker=await startLocalWorker({root,port:ports[0],persist:join(dir,'control'),bindings});let DB=await worker.getD1Database('DB');
 await apply(DB,['0001_uptime.sql','0002_manual_slots.sql']);
 const legacy=validateDefinition({name:'Retained prior installation',url:'http://127.0.0.1:15490/health',enabled:false},[15490]);
 await DB.batch([DB.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind('prior-monitor',1,JSON.stringify(legacy),Date.now(),JSON.stringify({state:'Unknown'})),DB.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind('prior-monitor',1,JSON.stringify(legacy),Date.now())]);
 const before=await domain(DB);await apply(DB,['0003_runner_contact.sql']);
 await check('migration3 preserves prior definitions, history and applied migration1/2 bytes',async()=>assert.deepEqual(await domain(DB),before));
 await apply(DB,(await readdir(join(root,'migrations'))).filter(n=>n.endsWith('.sql')&&Number(n.slice(0,4))>=4).sort());
 await login();
 await check('installation starts Never seen; owner/health/rejected keys do not record runner contact',async()=>{
  assert.equal((await api('/api/overview')).data.runner.contact.state,'Never seen');assert.equal((await fetch(origin+'/health')).status,200);assert.equal((await api('/api/runner/claim','POST',{})).status,401);assert.equal((await api('/api/overview')).data.runner.contact.lastContactAt,null);
 });
 await check('authorized idle claim records server receipt time without changing monitor health',async()=>{
  const at=Date.now();assert.equal((await api('/api/runner/claim','POST',{}, {'x-runner-key':bindings.UPTIME_RUNNER_KEY})).data.task,null);const result=(await api('/api/overview')).data;assert.equal(result.runner.contact.state,'Fresh contact');assert.ok(result.runner.contact.lastContactAt>=at&&result.runner.contact.lastContactAt<=Date.now());assert.equal(result.monitors[0].state.state,'Paused');assert.equal(result.alerts.length,0);
 });
 await check('stale/future contact remains separate from retained target observations',async()=>{
  await setTime(DB,Date.now()-CONTACT_FRESHNESS_MS-1);assert.equal((await api('/api/overview')).data.runner.contact.state,'Stale contact');await setTime(DB,Date.now()+60000);const result=(await api('/api/overview')).data;assert.equal(result.runner.contact.state,'Stale contact');assert.match(result.runner.contact.reason,/could not be verified/);assert.equal(result.monitors[0].state.state,'Paused');
 });
 const created=await api('/api/monitors','POST',{name:'Contact is not target success',url:'http://127.0.0.1:15490/health',retries:0,confirmSlots:1});assert.equal(created.status,201);
 const task=(await api('/api/runner/claim','POST',{}, {'x-runner-key':bindings.UPTIME_RUNNER_KEY})).data.task;assert.ok(task);const old=Date.now()-CONTACT_FRESHNESS_MS-1000;await setTime(DB,old);
 const attempts=task.definition.probes.map(probe=>{
  const evidence={id:randomUUID(),probe,attempt:0,startedAt:Date.now(),completedAt:Date.now(),durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'runner_error',checks:[{assertion:'runner',pass:false,reason:'Synthetic protocol execution unavailable'}]};
  // The network-edge fixture reports both configured checks as unavailable.
  // Accepted contact must still leave target health Unknown.
  return {...evidence,canary:{...evidence,id:randomUUID()}};
 });
 await check('rejected signature/evidence do not refresh contact; accepted runner_error does',async()=>{
  assert.equal((await submit(task,attempts,false)).status,403);assert.equal((await submit(task,[])).status,400);assert.equal((await api('/api/overview')).data.runner.contact.lastContactAt,old);assert.equal((await submit(task,attempts)).status,200);const result=(await api('/api/overview')).data;assert.equal(result.runner.contact.state,'Fresh contact');assert.equal(result.monitors.find(m=>m.id===created.data.id).state.state,'Unknown');assert.equal(result.alerts.length,0);await setTime(DB,old);assert.equal((await submit(task,attempts)).status,200);assert.equal((await api('/api/overview')).data.runner.contact.lastContactAt,old);
 });
 const exported=(await api('/api/archive')).data;
 await check('archive excludes installation-local contact',async()=>assert.ok(!Object.hasOwn(exported.payload.tables,'runner_contact')));
 await worker.dispose();worker=null;worker=await startLocalWorker({root,port:ports[0],persist:join(dir,'control'),bindings});DB=await worker.getD1Database('DB');
 await check('same installation process restart retains genuine local contact and session',async()=>{const result=await api('/api/overview');assert.equal(result.status,200);assert.equal(result.data.runner.contact.lastContactAt,old);assert.equal(result.data.runner.contact.state,'Stale contact');});
 recovery=await startLocalWorker({root,port:ports[1],persist:join(dir,'recovery'),bindings});const recoveredDB=await recovery.getD1Database('DB');await apply(recoveredDB,(await readdir(join(root,'migrations'))).filter(n=>n.endsWith('.sql')).sort());origin=`http://127.0.0.1:${ports[1]}`;cookie='';await login();
 // Simulate a genuine prior schema2 archive by retaining its applied1/2 ledger.
 const priorArchive=structuredClone(exported);priorArchive.payload.tables.migrations=priorArchive.payload.tables.migrations.filter(m=>m.version<=2);priorArchive.sha256=createHash('sha256').update(JSON.stringify(priorArchive.payload)).digest('hex');
 await check('prior archive restore retains receiving migration3 and never inherits contact',async()=>{
  assert.equal((await api('/api/restore','POST',priorArchive)).status,200);const result=(await api('/api/overview')).data;assert.equal(result.runner.contact.state,'Never seen');assert.ok(result.monitors.every(m=>m.state.state==='Paused'));assert.deepEqual((await recoveredDB.prepare('SELECT version FROM migrations ORDER BY version').all()).results.map(m=>m.version),[1,2,3]);
 });
 console.log(`CONTACT-001 passed: ${passed} projection, actual migration/native authority, accepted-error separation, restart and prior-archive portability checks.`);
}finally{if(recovery)await recovery.dispose();if(worker)await worker.dispose();await rm(dir,{recursive:true,force:true});}
