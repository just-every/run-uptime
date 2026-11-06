// MAINT-001: a New York recurring window across the next November fall-back,
// through the emitted Worker, durable D1 and a restarted signed Node runner.
// Its own installation runs on a pinned clock that is always ahead of the real
// one (the runner's acceptance guard also reads the real clock), so the owner
// session, runner signatures and slots all share that pinned time.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import https from 'node:https';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,certificate,runChild,listen,close,request} from './signed-runner-runtime.mjs';

const key='maintenance-recurring-test-only-runner-key';
// Sunday 01:30 repeats on the first Sunday of November (US rule). The window
// opens at 05:30Z in daylight time, the clocks fall back at 06:00Z and its 120
// elapsed minutes end at 07:30Z.
function nextFallBack(){
 let year=new Date().getUTCFullYear(),day;
 const first=y=>[1,2,3,4,5,6,7].find(d=>new Date(Date.UTC(y,10,d)).getUTCDay()===0);
 while(Date.UTC(year,10,day=first(year),5)<Date.now()+86400000)year++;
 return {at:(hour,minute)=>Date.UTC(year,10,day,hour,minute),date:offset=>new Date(Date.UTC(year,10,day+offset)).toISOString().slice(0,10)};
}

export async function proveRecurringAcrossDst(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-maintenance-ny-')),{at,date}=nextFallBack();
 const openAt=at(5,35),closeAt=at(7,30);
 let worker,db,control,target,origin,cookie='',mode=503,bridgeError,clock=openAt;
 const children=new Set();
 try{
  const tls=await certificate(directory);
  target=https.createServer(tls,(req,res)=>{res.writeHead(req.url==='/canary'?200:mode,{'content-type':'text/plain'});res.end('Controlled maintenance target')});
  const targetPort=await listen(target);
  control=https.createServer(tls,async(req,res)=>{
   try{
    let body='';for await(const chunk of req)body+=chunk;
    const response=await worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,clock,...(body?{body}:{})})});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch(error){bridgeError=error;res.writeHead(500);res.end('Emitted Worker request failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-provider-not-contacted',UPTIME_ORIGIN:origin,UPTIME_LOCAL_REVIEW:'false',UPTIME_RUNNER_KEY:key};
  const open=async()=>{worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB')};
  await open();
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers}});
  const good=async(path,body,status=200,method)=>{const response=await api(path,body,{},method);assert.equal(response.status,status,`${path}: ${JSON.stringify(response.data)}`);return response.data};
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Recurring maintenance owner'});assert.equal(boot.status,303,JSON.stringify(boot.data));cookie=boot.headers['set-cookie'][0].split(';')[0];
  await completeApiSecondFactor(origin,cookie,api,clock);
  const enroll={version:1},signature=createHmac('sha256',key).update(`${clock}.runner-enrolment.${JSON.stringify(enroll)}`).digest('hex');
  const enrollment=await api('/api/runner/enroll',enroll,{'x-runner-key':key,'x-sent-at':String(clock),'x-runner-signature':signature});assert.equal(enrollment.status,200);
  const runnerId=enrollment.data.runnerId;assert.ok(runnerId,'Runner registration missing');
  const runAt=async time=>{
   clock=time;const child=runChild({origin,key,caPath:tls.caPath,targetPort,clock});children.add(child);
   try{await child.finish()}catch(error){throw bridgeError??error}finally{children.delete(child)}
  };
  const monitor=async id=>(await good(`/api/overview?monitor=${id}`)).monitors[0];
  const complete=async id=>(await good(`/api/monitors/${id}/history`)).filter(slot=>slot.status==='complete').length;
  const alerts=async()=>(await db.prepare("SELECT COUNT(*) n FROM outbox WHERE kind IN ('trigger','recovery')").first()).n;
  const observations=async()=>(await db.prepare('SELECT * FROM observations ORDER BY id').all()).results;

  const created=await good('/api/monitors',{name:'Maintenance New York',url:'https://runner-target.test/ny',network:'public',assignments:{'local-a':runnerId},canaryUrl:'https://canary.runner-target.test/canary',intervalMs:5000,timeoutMs:10000,retries:0,confirmSlots:1,recoverSlots:1},201);
  const id=created.id;
  const window={id:'ny-sunday',name:'New York Sunday',timeZone:'America/New_York',mode:'suppress',weekly:{weekdays:[0],localTime:'01:30',durationMinutes:120,fromDate:date(-7),untilDate:date(7)}};
  const review=await good('/api/maintenance/preview',{monitorIds:[id],window});
  const day=review.occurrences.find(item=>item.localDate===date(0));
  assert.equal(day.status,'first-repeat');assert.equal(day.startsAt,at(5,30));assert.equal(day.endsAt,closeAt);
  assert.ok(day.startsAt<at(6,0)&&at(6,0)<day.endsAt,'the occurrence spans the clock change');
  assert.deepEqual(review.occurrences.map(item=>item.localDate),[date(-7),date(0),date(7)],'three Sundays, one across the clock change');
  await good('/api/maintenance/apply',{monitorIds:[id],window,digest:review.digest},201);
  const alertsBefore=await alerts();

  // The target fails before and after the clock change: results are kept and
  // the failure raises no notification while the window is open.
  await runAt(openAt);assert.equal(await complete(id),1);
  let row=await monitor(id);assert.equal(row.state.maintenance,true);assert.equal(row.state.targetState,'Failing');assert.equal(row.state.denominator,1);assert.equal(row.maintenanceEndsAt,closeAt);
  await runAt(at(6,10));assert.equal(await complete(id),2);
  row=await monitor(id);assert.equal(row.state.maintenance,true);assert.equal(row.state.targetState,'Failing');
  assert.equal(await alerts(),alertsBefore,'a failure inside the recurring window raises no notification');

  // A Worker restart keeps the calendar and every observation; the target then
  // recovers inside the window and no recovery follows a trigger never sent.
  const retained=await observations();await worker.dispose();await open();
  assert.deepEqual(await observations(),retained,'restart keeps every observation');
  assert.equal((await monitor(id)).state.maintenance,true,'restart keeps the recurring calendar');
  mode=200;await runAt(at(7,0));assert.equal(await complete(id),3);
  row=await monitor(id);assert.equal(row.state.targetState,'Healthy');assert.equal(row.state.maintenance,true);
  assert.equal(await alerts(),alertsBefore,'recovering inside the window emits no orphan recovery');

  // The window ends by itself: the next scheduled result is evaluated as
  // ordinary evidence, with the earlier observations untouched.
  mode=503;await runAt(closeAt+60000);assert.equal(await complete(id),4);
  row=await monitor(id);assert.equal(row.state.maintenance,false);assert.equal(Object.hasOwn(row,'maintenanceEndsAt'),false);assert.equal(row.state.targetState,'Failing');
  assert.equal(await alerts(),alertsBefore+1,'the failure that persists after expiry raises exactly one ordinary trigger');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM outbox WHERE kind='recovery'").first()).n,0,'no recovery for a trigger the window suppressed');
  const query=new URLSearchParams({period:'custom',from:String(at(5,30)),to:String(closeAt+60000),timeZone:'America/New_York',bucket:'raw'});
  const report=await good(`/api/v1/monitors/${id}/report?${query}`);
  // Maintenance is reported apart from availability: the window's own span
  // (from the monitor's creation at 05:35Z), with the in-window failures not
  // counted against the monitor and the rest of the range left Unknown.
  const {availability}=report;
  assert.equal(availability.maintenanceMs,closeAt-openAt);assert.equal(availability.notPassingMs,0);assert.equal(availability.upMs,0);
  assert.equal(availability.maintenanceMs+availability.unknownMs,availability.windowMs);
  const kept=await observations();for(const old of retained)assert.deepEqual(kept.find(item=>item.id===old.id),old);
  await good('/api/maintenance/cancel',{monitorIds:[id],windowId:'ny-sunday',revisions:{[id]:(await monitor(id)).revision}});
 }finally{
  await Promise.all([...children].map(child=>child.stop()));await close(control);await worker?.dispose();await close(target);await rm(directory,{recursive:true,force:true});
 }
}

if(import.meta.url===`file://${process.argv[1]}`){await proveRecurringAcrossDst();console.log('MAINT-001 recurring passed')}
