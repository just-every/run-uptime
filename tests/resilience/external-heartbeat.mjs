import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {hostedRuntime} from '../hosted-auth-runtime.mjs';
import {testAuthBindings} from '../auth-test-support.mjs';
import {splitSql} from '../migration-support.mjs';
import {cleanup} from './support.mjs';

// One retained sanity journey, mounted in the existing resilience registration.
export async function proveExternalHeartbeatAlarm(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-independent-heartbeat-'));
 const journal=join(directory,'service.ndjson'),path='/synthetic-uptime-1';
 const intervalMs=1000,deadlineMs=2000,now=Date.UTC(2026,0,15,12);
 const origin='http://127.0.0.1:15504',heartbeat='https://heartbeat.example.test'+path;
 const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,UPTIME_HEARTBEAT_URL:heartbeat,UPTIME_HEARTBEAT_INTERVAL_MS:String(intervalMs)};
 let worker,service,serviceError='',wireCount=0;
 const records=async()=>{try{return (await readFile(journal,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))}catch(error){if(error.code==='ENOENT')return [];throw error}};
 const waitFor=async kind=>{
  const until=Date.now()+10000;
  while(Date.now()<until){
   const found=(await records()).find(event=>event.kind===kind);
   if(found)return found;
   assert.equal(service.exitCode,null,'independent service stays alive: '+serviceError);
   await delay(20);
  }
  assert.fail('Independent service did not retain '+kind);
 };
 const schedule=async()=>{
  const response=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scheduled:true})});
  assert.equal(response.status,204,await response.text());
 };
 const attempts=async DB=>(await DB.prepare("SELECT * FROM auxiliary_attempts WHERE scope='watch' AND job_id='external-heartbeat' ORDER BY rowid").all()).results;
 // Observe all durable target rows, rather than interpreting heartbeat service
 // recovery or a successful readiness check as target-health evidence.
 const targetRows=async DB=>{
  const tables=['monitors','revisions','slots','observations','outbox','incident_work'];
  return Object.fromEntries(await Promise.all(tables.map(async name=>[name,(await DB.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()).results])));
 };
 try{
  service=fork(new URL('./external-heartbeat-service.mjs',import.meta.url),[journal,path,String(deadlineMs)],{stdio:['ignore','ignore','pipe','ipc']});
  service.stderr.on('data',chunk=>serviceError+=chunk);
  const [address]=await once(service,'message',{signal:AbortSignal.timeout(10000)});
  const serviceOrigin=`http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(serviceOrigin+'/unapproved')).status,403);
  assert.deepEqual(await records(),[],'unapproved requests do not establish heartbeat contact');
  const outbound=async request=>{
   assert.equal(request.url,heartbeat,'only the configured service capability is authorized');
   assert.equal(request.method,'GET');assert.equal(await request.text(),'','heartbeat contains no product data');
   wireCount++;
   return fetch(serviceOrigin+path,{method:request.method,redirect:'manual'});
  };
  worker=await hostedRuntime(directory,bindings,outbound,{now});
  let DB=await worker.getD1Database('DB');
  for(const file of (await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const targets=await targetRows(DB);
  await schedule();
  const first=await attempts(DB),received=await records();
  assert.equal(first.length,1);assert.equal(first[0].outcome,'accepted');assert.equal(first[0].code,'heartbeat_accepted');
  assert.equal(first[0].started_at,now);assert.equal(first[0].submitted_at,now);assert.equal(first[0].finished_at,now);
  const ping=received.find(event=>event.kind==='ping');
  assert.ok(ping,'the accepted auxiliary attempt reached the independent service');
  assert.equal(ping.path,path);assert.equal(ping.method,'GET');assert.equal(ping.pid,address.pid);
  assert.equal(received.filter(event=>event.kind==='ping').length,1);assert.equal(wireCount,1);
  await worker.dispose();worker=undefined;DB=undefined;
  const stoppedAt=Date.now();assert.ok(stoppedAt<ping.deadline,'Worker stops before the external service deadline');
  const alarm=await waitFor('alarm');
  assert.equal(service.exitCode,null);assert.equal(alarm.pid,address.pid);
  assert.equal(alarm.ping,ping.sequence);assert.equal(alarm.deadline,ping.deadline);
  assert.ok(alarm.at>=ping.deadline,'the independent service crosses its own deadline');
  assert.ok(alarm.at>stoppedAt,'the alarm is emitted after the Worker has stopped');
  assert.equal(wireCount,1,'no Uptime process sends or manufactures the missed-heartbeat alarm');
  assert.equal((await records()).filter(event=>event.kind==='recovery').length,0);

  // Restart on the same D1 storage just before the original interval is due.
  // Neither a restart nor an immediate extra scheduled poll may replay it.
  worker=await hostedRuntime(directory,bindings,outbound,{now:now+intervalMs-1});DB=await worker.getD1Database('DB');
  await schedule();await schedule();
  assert.deepEqual(await attempts(DB),first);assert.equal(wireCount,1);
  assert.equal((await records()).filter(event=>event.kind==='ping').length,1);
  assert.deepEqual(await targetRows(DB),targets);
  await worker.dispose();worker=undefined;
  worker=await hostedRuntime(directory,bindings,outbound,{now:now+intervalMs});DB=await worker.getD1Database('DB');
  await schedule();await schedule();
  const after=await attempts(DB),recovered=await records(),recovery=recovered.find(event=>event.kind==='recovery');
  assert.equal(after.length,2);assert.deepEqual(after[0],first[0]);assert.notEqual(after[1].id,first[0].id);
  assert.equal(after[1].outcome,'accepted');assert.equal(after[1].started_at,now+intervalMs);
  assert.equal(after[1].submitted_at,now+intervalMs);assert.equal(after[1].finished_at,now+intervalMs);
  const pings=recovered.filter(event=>event.kind==='ping');assert.equal(pings.length,2);assert.equal(wireCount,2);
  assert.ok(recovery,'a genuinely due ping produces an independently retained recovery');
  assert.equal(recovery.pid,address.pid);assert.equal(recovery.alarm,alarm.sequence);assert.equal(recovery.ping,pings[1].sequence);
  assert.ok(recovery.sequence>alarm.sequence);assert.equal(recovered.filter(event=>event.kind==='alarm').length,1);
  assert.deepEqual(await DB.prepare("SELECT * FROM monitoring_watch WHERE id='external-heartbeat'").first(),{id:'external-heartbeat',at:now+intervalMs,outcome:'accepted'});
  assert.deepEqual(await targetRows(DB),targets,'service recovery invents no target observations, incidents or health');
  console.info('External heartbeat: accepted scheduled ping, independent deadline alarm with Worker stopped, next-due recovery and no replay retained');
 }finally{
  await cleanup(()=>worker?.dispose(),async()=>{
   if(service&&service.exitCode===null&&service.signalCode===null){const ended=once(service,'exit');service.kill('SIGTERM');await ended}
  },()=>rm(directory,{recursive:true,force:true}));
 }
}
