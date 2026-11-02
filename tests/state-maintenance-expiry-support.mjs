// STATE-001 acceptance 2: the end of a planned maintenance window cannot fabricate
// recovery. One confirmed outage is opened by real signed scheduled failures from two
// independent owner-named runner networks (own emitted Worker, own migrated D1), a
// pause window is previewed and applied through the owner doors, and only the harness
// clock moves across its expiry. Only DNS and socket routing are controlled.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import https from 'node:https';
import {mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,certificate,listen,close,request} from './signed-runner-runtime.mjs';

const key='state-maintenance-expiry-test-only-runner-key';
const runnerModule=pathToFileURL(resolve('runners/src/runner.mjs')).href;

export async function proveMaintenanceExpiryKeepsOutage(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-state-expiry-'));
 let worker,control,target,cookie='',clock=Date.now(),bridgeError;
 const requests=[];
 try{
  const tls=await certificate(directory);
  target=https.createServer(tls,(req,res)=>{requests.push(req.url);res.writeHead(503,{'content-type':'text/plain'});res.end('Controlled outage')});
  const targetPort=await listen(target);
  let origin;
  control=https.createServer(tls,async(req,res)=>{
   try{
    let body='';for await(const chunk of req)body+=chunk;
    const response=await worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,clock,...(body?{body}:{})})});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch(error){bridgeError=error;res.writeHead(500);res.end('Emitted Worker request failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-provider-not-contacted',UPTIME_ORIGIN:origin,UPTIME_LOCAL_REVIEW:'false',UPTIME_RUNNER_KEY:key};
  const persistence=join(directory,'expiry');await mkdir(persistence);
  worker=await emittedRunnerWorker(persistence,bindings);const db=await worker.getD1Database('DB');
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers}});
  const good=async(path,body,status=200)=>{const response=await api(path,body);assert.equal(response.status,status,`${path}: ${JSON.stringify(response.data)}`);return response.data};
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Expiry owner'});assert.equal(boot.status,303,JSON.stringify(boot.data));cookie=boot.headers['set-cookie'][0].split(';')[0];
  await completeApiSecondFactor(origin,cookie,api);

  // Two owner-named networks run real signed Node runners, one after the other, at the harness clock.
  const networks=[];
  for(const networkLabel of['synthetic-uptime-1','synthetic-uptime-2'])networks.push(await good('/api/runners',{networkLabel},201));
  const runNetwork=async network=>{
   const child=spawn(process.execPath,['--import',resolve('tests/signed-runner-routing.mjs'),'--input-type=module','-e',`import {runRunner} from ${JSON.stringify(runnerModule)};await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,runnerId:process.env.UPTIME_RUNNER_ID,once:true})`],{cwd:process.cwd(),env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:network.key,UPTIME_RUNNER_ID:network.runnerId,NODE_EXTRA_CA_CERTS:tls.caPath,SIGNED_RUNNER_TARGET_PORT:String(targetPort),SIGNED_RUNNER_CLOCK:String(clock)},stdio:['ignore','pipe','pipe']});
   let bytes=0;child.stdout.on('data',b=>bytes+=b.length);child.stderr.on('data',b=>bytes+=b.length);
   const timer=setTimeout(()=>child.kill('SIGKILL'),35000);
   try{assert.equal((await once(child,'exit'))[0],0,`Signed runner failed (${bytes} private diagnostic bytes)`)}catch(error){throw bridgeError??error}finally{clearTimeout(timer)}
  };
  const runBoth=async()=>{for(const network of networks)await runNetwork(network)};
  const created=await good('/api/monitors',{name:'Expiry outage',url:'https://runner-target.test/outage',network:'public',probes:['local-a','local-b'],assignments:{'local-a':networks[0].runnerId,'local-b':networks[1].runnerId},intervalMs:60000,timeoutMs:5000,retries:0,confirmSlots:2,recoverSlots:2,freshnessMs:1800000},201);
  const id=created.id;
  const monitor=async()=>(await good(`/api/overview?monitor=${id}`)).monitors[0];
  const alerts=async()=>(await good('/api/overview')).alerts.filter(alert=>alert.monitor_id===id);
  const history=()=>good(`/api/monitors/${id}/history`);
  const table=async name=>(await db.prepare(`SELECT * FROM ${name} ORDER BY id`).all()).results;
  const facts=async()=>({observations:await table('observations'),slots:await table('slots'),outbox:await table('outbox')});
  const dueRun=async()=>{const {next_due}=await db.prepare('SELECT next_due FROM monitors WHERE id=?').bind(id).first();clock=Math.max(clock,next_due);await runBoth()};

  // Two scheduled slots, both vantages failing in each: independent agreement, then confirmation.
  await dueRun();
  assert.equal((await monitor()).state.state,'Degraded','one failing slot is not yet a confirmed outage');
  await dueRun();
  const open=await monitor();
  assert.equal(open.state.state,'Failing');assert.equal(open.state.failingVantages,2);
  const trigger=(await alerts()).filter(alert=>alert.kind==='trigger');
  assert.equal(trigger.length,1);const incidentKey=trigger[0].event.incidentKey;
  const incidentsPath=`/api/monitors/${id}/incidents`;
  const openIncident=(await good(incidentsPath));assert.equal(openIncident.length,1);assert.equal(openIncident[0].key,incidentKey);assert.equal(openIncident[0].endedAt??null,null);
  const evidence=await history();assert.equal(evidence.filter(slot=>slot.status==='complete').length,2);
  for(const slot of evidence)assert.deepEqual(slot.observations.map(o=>o.outcome),['target_failure','target_failure']);
  const before=await facts(),requestCount=requests.length;
  assert.equal(before.outbox.filter(row=>row.kind==='trigger').length,1);

  // The owner previews and applies a one-time pause through the public maintenance doors.
  const window={id:'expiring-pause',name:'Expiring pause',timeZone:'UTC',mode:'pause',startsAt:clock-1000,endsAt:clock+300000};
  const input={monitorIds:[id],window},review=await good('/api/maintenance/preview',input);
  assert.deepEqual(await facts(),before,'previewing maintenance writes no evidence');
  const applied=await good('/api/maintenance/apply',{...input,digest:review.digest},201);assert.equal(applied.digest,review.digest);
  // Saving the window is a new immutable revision: until a check runs under it the state reads Unknown, never Healthy.
  const paused=await monitor();assert.equal(paused.state.maintenance,true);assert.equal(paused.state.state,'Maintenance');assert.equal(paused.state.underlyingState,'Unknown');

  // Only the isolated clock moves, across expiry. No runner is invoked.
  clock=window.endsAt+1000;
  const expired=await monitor();
  assert.equal(expired.state.maintenance,false,'maintenance has ended');
  assert.equal(Object.hasOwn(expired,'maintenanceEndsAt'),false);
  assert.equal(expired.state.state,'Unknown','expiry with no new evidence is Unknown');
  assert.ok(!['Healthy','Recovering'].includes(expired.state.state)&&!['Healthy','Recovering'].includes(expired.state.targetState),'expiry never reads as recovery');
  assert.equal(expired.state.notificationOpen,true,'the outage notification stays open');
  assert.equal((await alerts()).filter(alert=>alert.kind==='recovery').length,0,'expiry emits no recovery event');
  const afterExpiry=await good(incidentsPath);assert.equal(afterExpiry.length,1);assert.equal(afterExpiry[0].key,incidentKey);assert.equal(afterExpiry[0].endedAt??null,null,'the incident stays open');
  assert.deepEqual(await facts(),before,'expiry leaves observations, slots and outbox facts exactly as they were');
  assert.equal(requests.length,requestCount,'expiry sends no traffic to the target');
  assert.deepEqual(await history(),evidence,'historical evidence is unaltered');

  // Genuinely due signed scheduled checks still fail on both networks: the same outage returns to Failing,
  // with no recovery, no second incident and no duplicate trigger.
  for(const [round,expected] of [[1,'Degraded'],[2,'Failing']]){
   await dueRun();
   assert.equal(requests.length,requestCount+2*round,'each due check made one real request per network');
   const current=await monitor();assert.equal(current.state.state,expected);assert.equal(current.state.maintenance,false);
   const current_alerts=await alerts();
   assert.equal(current_alerts.filter(alert=>alert.kind==='trigger').length,1,'no duplicate trigger');assert.equal(current_alerts.filter(alert=>alert.kind==='recovery').length,0,'no fabricated recovery');
   const incidents=await good(incidentsPath);assert.equal(incidents.length,1);assert.equal(incidents[0].key,incidentKey);assert.equal(incidents[0].endedAt??null,null);
  }
  const final=await history();assert.equal(final.length,4);
  for(const old of evidence)assert.deepEqual(final.find(slot=>slot.id===old.id),old,'earlier slots and observations remain identical');
  assert.deepEqual((await facts()).outbox,before.outbox,'the outbox holds only the original trigger');
  console.log('STATE-001 maintenance expiry passed: two signed networks confirmed one outage, a pause window expired without recovery, traffic, incident closure or altered facts, and the next due failing checks returned to Failing on the same open incident.');
 }finally{
  await close(control);await worker?.dispose();await close(target);await rm(directory,{recursive:true,force:true});
 }
}
