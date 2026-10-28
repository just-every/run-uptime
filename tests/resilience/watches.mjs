import {completeSecondFactor} from '../mfa-auth-support.mjs';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {once} from 'node:events';
import {hostedRuntime} from '../hosted-auth-runtime.mjs';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {testAuthBindings} from '../auth-test-support.mjs';
import {splitSql} from '../migration-support.mjs';
import {deliveredMessages} from '../mail-provider-fixture.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {runRunner} from '../../runners/src/private-runner.mjs';
import {fixture,cleanup,closeServer} from './support.mjs';
import {startLocalWorker} from '../mail-provider-fixture.mjs';
import {withStartupPortCollision} from './port-collision.mjs';
import {startWatchClockWorker} from './watch-clock.mjs';
const wait=async(fn)=>{for(let i=0;i<200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('Expected watch event did not arrive')};






// The child executes the public runner loop. Only its independent network edge
// forwards to the local receiver; SIGKILL leaves the real journal unfinished.




test("Recover monitoring across runner and Worker crashes without replaying uncertain sends",async()=>{
// OPS-001 stopping the real Worker retries a rejected independent notice, repeats accepted notices and reports restored contact
{
 const f=await fixture(),controller=new AbortController(),notices=[];let resumed,runner,failure;
 const receiver=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const status=notices.length===0?503:204;notices.push({notice:JSON.parse(body),status,at:Date.now()});res.statusCode=status;res.end()})});
 const transport={async send(wire){const response=await fetch(`http://127.0.0.1:${receiver.address().port}/notice`,{method:wire.method,headers:wire.headers,body:wire.body});return {status:response.status,headers:{},body:await response.text()}}};
 const retryMs=20,repeatMs=800;
 try{
  await new Promise((resolve,reject)=>{receiver.once('error',reject);receiver.listen(0,'127.0.0.1',()=>{receiver.off('error',reject);resolve()})});
  runner=runRunner({origin:f.origin,key:f.first.key,runnerId:f.first.runnerId,localReview:true,signal:controller.signal,pollMs:20,watch:{url:'https://watch.example.test/',afterMs:60,repeatMs,retryMs,statePath:join(f.directory,'watch','journal.sqlite'),transport}});
  await wait(async()=>(await f.DB.prepare('SELECT last_contact_at FROM runners WHERE runner_id=?').bind(f.first.runnerId).first()).last_contact_at>f.migratedContact);
  console.info('Resilience watch: fresh authenticated contact confirmed; stopping Worker');
  await f.worker.dispose();console.info('Resilience watch: Worker stopped; waiting for independent notices');await wait(()=>{const failed=notices.filter(n=>n.notice.kind==='unreachable');return failed.length>=3&&failed.filter(n=>n.status>=200&&n.status<300).length>=2});
  const unreachable=notices.filter(n=>n.notice.kind==='unreachable');assert.equal(unreachable[0].status,503);assert.ok(unreachable[1].status>=200&&unreachable[1].status<300,'the rejected notice is retried before the accepted repeat interval');assert.ok(unreachable[1].at-unreachable[0].at<repeatMs);
  console.info('Resilience watch: accepted retry and repeat confirmed; restarting persisted Worker');
  resumed=await startLocalWorker({port:Number(new URL(f.origin).port),persist:f.directory,bindings:f.bindings});console.info('Resilience watch: persisted Worker ready; waiting for recovery notice');await wait(()=>notices.some(n=>n.notice.kind==='recovery'&&n.status>=200&&n.status<300));assert.ok(notices.every(n=>!JSON.stringify(n).includes(f.first.key)));
  console.info('Resilience watch: accepted recovery confirmed');
 }catch(error){failure=error}
 finally{
  controller.abort();console.info('Resilience watch: joining runner and disposing resumed Worker');
  await cleanup(
   ()=>{if(failure)throw failure},
   ()=>runner,
   ()=>{console.info('Resilience watch: runner settled; disposing resumed Worker');return resumed?.dispose()},
   [()=>{console.info('Resilience watch: closing fixture and notice receiver');return f.close()},()=>closeServer(receiver)],
  );
  console.info('Resilience watch: all owned resources closed');
 }
}
// OPS-001 runner process crashes reconcile unreachable and recovery attempts without replay
{
 const f=await fixture(),notices=[];let resumed,child;
 const statePath=join(f.directory,'watch','journal.sqlite');
 const receiver=http.createServer((request,_response)=>{let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>notices.push(JSON.parse(body)))});
 const stop=async()=>{if(!child)return;if(child.exitCode!==null||child.signalCode!==null){child=null;return}const ended=once(child,'exit');child.kill('SIGKILL');await ended;child=null};
 const read=()=>{const db=new DatabaseSync(statePath,{readOnly:true});try{db.exec('PRAGMA busy_timeout=5000');return {attempts:db.prepare('SELECT kind,outcome,submitted_at,finished_at FROM attempts ORDER BY rowid').all(),progress:db.prepare('SELECT * FROM progress').get()}}finally{db.close()}};
 const start=offset=>{
  const source=`import {runRunner} from './runners/src/private-runner.mjs';const input=JSON.parse(process.env.UPTIME_TEST_WATCH_INPUT);const offset=input.offset;delete input.offset;const address=input.address;delete input.address;await runRunner({...input,watch:{...input.watch,now:()=>Date.now()+offset,transport:{async send(wire){const result=await fetch(address,{method:wire.method,headers:wire.headers,body:wire.body});return {status:result.status}}}}});`;
  const input={origin:f.origin,key:f.first.key,runnerId:f.first.runnerId,localReview:true,pollMs:20,offset,address:`http://127.0.0.1:${receiver.address().port}/`,watch:{url:'https://watch.example.test/',afterMs:40,repeatMs:3600000,statePath}};
  child=spawn(process.execPath,['--input-type=module','--eval',source],{cwd:process.cwd(),env:{...process.env,UPTIME_TEST_WATCH_INPUT:JSON.stringify(input)},stdio:['ignore','ignore','ignore']});
 };
 try{
  await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve));
  await f.worker.dispose();start(0);await wait(()=>notices.length===1);assert.equal(notices[0].kind,'unreachable');assert.equal(read().attempts[0].outcome,'sending');await stop();
  start(61000);await wait(()=>read().attempts[0].outcome==='uncertain');assert.equal(notices.length,1,'restart never repeats a possibly accepted unreachable notice');
  resumed=await startLocalWorker({port:Number(new URL(f.origin).port),persist:f.directory,bindings:f.bindings});await wait(()=>notices.length===2);assert.equal(notices[1].kind,'recovery');assert.equal(notices[1].since,notices[0].since,'original outage progress survives the process crash');await stop();
  start(122000);await wait(()=>read().attempts.length===2&&read().attempts[1].outcome==='uncertain');
  const resumedDB=await resumed.getD1Database('DB');
  const contact=(await resumedDB.prepare('SELECT last_contact_at FROM runners WHERE runner_id=?').bind(f.first.runnerId).first()).last_contact_at;
  await wait(async()=>(await resumedDB.prepare('SELECT last_contact_at FROM runners WHERE runner_id=?').bind(f.first.runnerId).first()).last_contact_at>contact);
  const retained=read();assert.equal(retained.progress.failed_since,null);assert.equal(retained.progress.announced,0);assert.equal(notices.length,2,'an uncertain recovery is terminal across restart');assert.ok(retained.attempts.every(row=>row.submitted_at!==null&&row.finished_at!==null));
  assert.ok(!JSON.stringify(retained).includes(f.first.key));
 }finally{await cleanup(()=>stop(),()=>resumed?.dispose(),[()=>f.close(),()=>closeServer(receiver)])}
}
// OPS-001 interrupted hosted auth mail and external heartbeat retain uncertainty across Worker restart
{
 const directory=await mkdtemp(join(tmpdir(),'uptime-ops-jobs-')),restored=await mkdtemp(join(tmpdir(),'uptime-ops-restored-')),origin='https://uptime.example.test';
 const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-ops-key',UPTIME_HEARTBEAT_URL:'https://heartbeat.example.test/ping',UPTIME_HEARTBEAT_INTERVAL_MS:'3600000'};
 let worker,mailStarted,heartbeatStarted,mailCalls=0,heartbeatCalls=0;const mailBoundary=new Promise(resolve=>mailStarted=resolve),heartbeatBoundary=new Promise(resolve=>heartbeatStarted=resolve);
 const outbound=async request=>{
  if(new URL(request.url).hostname==='api.sendgrid.com'){if((await request.clone().json()).subject==='Uptime second-factor security change')return new Response(null,{status:202});mailCalls++;mailStarted();return new Promise(()=>{})}
  assert.equal(new URL(request.url).hostname,'heartbeat.example.test');heartbeatCalls++;heartbeatStarted();return new Promise(()=>{});
 };
 const call=(path,body,cookie)=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method:body===undefined?'GET':'POST',headers:{host:'uptime.example.test',origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const schedule=()=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({scheduled:true})});
 try{
  worker=await hostedRuntime(directory,bindings,outbound);let DB=await worker.getD1Database('DB');
  for(const file of (await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const bootstrap=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'OPS owner'});assert.equal(bootstrap.status,303,await bootstrap.clone().text());const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
 await completeSecondFactor(origin,cookie,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),cookie));
  const pendingMail=call('/auth/magic-link',{email:bindings.OWNER_EMAIL}).catch(()=>null);await mailBoundary;
  const pendingHeartbeat=schedule().catch(()=>null);await heartbeatBoundary;
  const before=(await DB.prepare('SELECT * FROM auxiliary_attempts ORDER BY rowid').all()).results;assert.deepEqual(before.map(row=>row.outcome),['sending','sending']);assert.ok(before.every(row=>row.submitted_at!==null&&row.finished_at===null));
  const exportResponse=await call('/api/archive',undefined,cookie);assert.equal(exportResponse.status,200,exportResponse.status===200?'':(await exportResponse.clone().json()).error);const exported=await exportResponse.json();assert.deepEqual(exported.payload.productTables.auxiliary_attempts,before,'archive retains each live auxiliary attempt without dispatch content');
  await worker.dispose();worker=null;await Promise.all([pendingMail,pendingHeartbeat]);
  const now=Date.now()+61000;
  worker=await hostedRuntime(directory,bindings,async request=>{if(new URL(request.url).hostname==='api.sendgrid.com'){mailCalls++;return new Response(null,{status:202})}heartbeatCalls++;return new Response(null,{status:204})},{now});DB=await worker.getD1Database('DB');
  assert.equal((await schedule()).status,204);assert.equal((await schedule()).status,204);
  const after=(await DB.prepare('SELECT * FROM auxiliary_attempts ORDER BY rowid').all()).results;assert.equal(after.length,2);assert.ok(after.every(row=>row.outcome==='uncertain'&&row.code==='lease_expired_submitted'&&row.finished_at===now));assert.deepEqual(after.map(row=>row.id),before.map(row=>row.id));assert.equal(mailCalls,1);assert.equal(heartbeatCalls,1,'restart does not replay a possibly accepted ping before the next interval');
  assert.equal((await DB.prepare("SELECT outcome FROM monitoring_watch WHERE id='external-heartbeat'").first()).outcome,'uncertain');
  assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL})).status,202,'a newly requested auth execution remains usable');assert.equal(mailCalls,2);const latest=await DB.prepare("SELECT * FROM auxiliary_attempts WHERE scope='auth-mail' ORDER BY rowid DESC LIMIT 1").first();assert.equal(latest.outcome,'accepted');assert.ok(latest.finished_at!==null);
  assert.ok(!JSON.stringify(after).includes(bindings.OWNER_EMAIL));assert.ok(!JSON.stringify(after).includes(bindings.SENDGRID_API_KEY));
  await worker.dispose();worker=null;
  // Restore the interrupted executions into a receiving installation whose
  // independent heartbeat is deliberately not configured.
  const receiving={...bindings};delete receiving.UPTIME_HEARTBEAT_URL;
  worker=await hostedRuntime(restored,receiving,async request=>{if(new URL(request.url).hostname==='api.sendgrid.com'&&(await request.json()).subject==='Uptime second-factor security change')return new Response(null,{status:202});throw Error('Restored auxiliary execution must never replay')},{now});DB=await worker.getD1Database('DB');
  for(const file of (await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const receivedOwner=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Receiving owner'});assert.equal(receivedOwner.status,303);const receivedCookie=receivedOwner.headers.get('set-cookie').split(';')[0];
 await completeSecondFactor(origin,receivedCookie,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),receivedCookie),now);
  const restoredResponse=await call('/api/restore',{archive:exported},receivedCookie);assert.equal(restoredResponse.status,200,await restoredResponse.clone().text());
  const imported=(await DB.prepare('SELECT * FROM auxiliary_attempts ORDER BY rowid').all()).results;assert.equal(imported.length,2);assert.ok(imported.every(row=>row.finished_at===now&&row.outcome==='uncertain'&&row.code==='restored_inactive'));assert.deepEqual(imported.map(row=>row.id),before.map(row=>row.id));
  assert.equal((await schedule()).status,204);assert.deepEqual((await DB.prepare('SELECT * FROM auxiliary_attempts ORDER BY rowid').all()).results,imported);
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true});await rm(restored,{recursive:true,force:true})}
}
});
