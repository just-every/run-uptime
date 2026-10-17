// MAINT-001: one owner journey through the emitted Worker, durable D1 and a
// real restarted, signed Node runner. Only DNS/socket routing is controlled.
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import https from 'node:https';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,certificate,runChild,listen,close,request} from './signed-runner-runtime.mjs';

const directory=await mkdtemp(join(tmpdir(),'uptime-maintenance-'));
const key='maintenance-test-only-installation-runner-key';
let worker,db,control,target,origin,cookie='',mode=503,releaseHeld,bridgeError;
const children=new Set(),requests=[];
let holdNext=false,heldResolve;
const held=new Promise(resolve=>heldResolve=resolve);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 const tls=await certificate(directory);
 target=https.createServer(tls,async(req,res)=>{
  requests.push(req.url);
  if(req.url==='/a'&&holdNext){holdNext=false;heldResolve();await new Promise(resolve=>releaseHeld=resolve)}
  res.writeHead(req.url==='/canary'?200:mode,{'content-type':'text/plain'});res.end('Controlled maintenance target');
 });
 const targetPort=await listen(target);
 control=https.createServer(tls,async(req,res)=>{
  try{
   let body='';for await(const chunk of req)body+=chunk;
   const response=await worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{})})});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){bridgeError=error;res.writeHead(500);res.end('Emitted Worker request failed')}
 });
 origin=`https://localhost:${await listen(control)}`;
 const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-provider-not-contacted',UPTIME_ORIGIN:origin,UPTIME_LOCAL_REVIEW:'false',UPTIME_RUNNER_KEY:key};
 worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers}});
 const good=async(path,body,status=200,method)=>{const response=await api(path,body,{},method);assert.equal(response.status,status,`${path}: ${JSON.stringify(response.data)}`);return response.data};
 const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Maintenance owner'});assert.equal(boot.status,303,JSON.stringify(boot.data));cookie=boot.headers['set-cookie'][0].split(';')[0];
 const enroll={version:1},stamp=String(Date.now()),signature=createHmac('sha256',key).update(`${stamp}.runner-enrolment.${JSON.stringify(enroll)}`).digest('hex');
 const enrollment=await api('/api/runner/enroll',enroll,{'x-runner-key':key,'x-sent-at':stamp,'x-runner-signature':signature});assert.equal(enrollment.status,200);const registration=enrollment.data;
 // Enrolment requires the runner-purpose signature, independently of owner authority.
 if(!registration.runnerId)throw Error('Runner registration missing');
 const startRunner=()=>{const child=runChild({origin,key,caPath:tls.caPath,targetPort});children.add(child);return child};
 const finishRunner=async child=>{try{await child.finish()}catch(error){throw bridgeError??error}finally{children.delete(child)}};
 const runner=()=>finishRunner(startRunner());
 const history=id=>good(`/api/monitors/${id}/history`);
 const monitor=async id=>(await good(`/api/overview?monitor=${id}`)).monitors[0];
 const waitDue=async id=>{const {next_due}=await db.prepare('SELECT next_due FROM monitors WHERE id=?').bind(id).first();await delay(Math.max(0,next_due-Date.now()+25))};
 const runUntil=async(id,count)=>{for(let i=0;i<4;i++){if((await history(id)).filter(slot=>slot.status==='complete').length>=count)return;await waitDue(id);await runner()}assert.fail('The due monitor did not complete through the real runner')};
 const create=async(name,path,intervalMs=5000)=>good('/api/monitors',{name,url:`https://runner-target.test/${path}`,network:'public',assignments:{'local-a':registration.runnerId},canaryUrl:'https://canary.runner-target.test/canary',intervalMs,timeoutMs:10000,retries:0,confirmSlots:1,recoverSlots:1},201);
 const preview=input=>good('/api/maintenance/preview',input);
 const apply=async input=>{const review=await preview(input);const result=await good('/api/maintenance/apply',{...input,digest:review.digest},201);assert.equal(result.digest,review.digest);return result};
 const cancel=async(ids,windowId)=>good('/api/maintenance/cancel',{monitorIds:ids,windowId,revisions:Object.fromEntries(await Promise.all(ids.map(async id=>[id,(await monitor(id)).revision])))});
 const window=(id,mode='suppress',duration=60000)=>({id,name:id,timeZone:'America/Chicago',mode,startsAt:Date.now()-1000,endsAt:Date.now()+duration});
 const observations=async()=>(await db.prepare('SELECT * FROM observations ORDER BY id').all()).results;

 // DST previews write no revisions. Spring's nonexistent wall time is skipped;
 // fall's repeated wall time chooses the first instant, with elapsed duration.
 const a=(await create('Maintenance A','a')).id;
 const weekly={id:'dst',name:'DST Sunday',timeZone:'America/New_York',mode:'pause',weekly:{weekdays:[0],localTime:'02:30',durationMinutes:120,fromDate:'2026-03-01',untilDate:'2026-03-15'}};
 const spring=await preview({monitorIds:[a],window:weekly});
 assert.equal(spring.occurrences.find(item=>item.localDate==='2026-03-08').status,'skipped-gap');
 assert.equal((await good(`/api/monitors/${a}/revisions`)).length,1);
 const fall=await preview({monitorIds:[a],window:{...weekly,weekly:{...weekly.weekly,localTime:'01:30',fromDate:'2026-10-25',untilDate:'2026-11-08'}}});
 const repeat=fall.occurrences.find(item=>item.localDate==='2026-11-01');
 assert.equal(repeat.status,'first-repeat');assert.equal(repeat.startsAt,Date.parse('2026-11-01T05:30:00Z'));assert.equal(repeat.repeatedStartsAt-repeat.startsAt,3600000);assert.equal(repeat.endsAt-repeat.startsAt,120*60000);
 assert.equal((await api('/api/maintenance/preview',{monitorIds:[a],window:{...weekly,timeZone:'US/not-a-zone'}})).status,400);
 assert.equal((await api('/api/maintenance/apply',{monitorIds:[a],window:window('cross-origin'),digest:spring.digest},{origin:'https://elsewhere.test'})).status,403);
 assert.equal((await api('/api/maintenance/preview',{monitorIds:[a],window:weekly},{cookie:''})).status,401);

 // Apply an execution pause to a fixed pair while A's real request is already
 // in flight. Its old immutable slot still accepts and preserves that result.
 holdNext=true;const inFlight=startRunner();await Promise.race([held,delay(10000).then(()=>{throw Error('Real target request did not start')})]);
 const b=(await create('Maintenance B','b',6000)).id,ids=[a,b];
 const groupPause=window('group-pause','pause');await apply({monitorIds:ids,window:groupPause});
 releaseHeld();await finishRunner(inFlight);
 assert.equal((await history(a))[0].observations[0].outcome,'target_failure');
 const beforePause=await observations(),requestCount=requests.length;
 await runner();assert.equal(requests.length,requestCount,'paused group executes no new target requests');
 assert.deepEqual(await observations(),beforePause);
 for(const id of ids){const current=await monitor(id);assert.equal(current.state.maintenance,true);assert.equal(current.state.denominator,1);assert.equal(current.definition.enabled,true)}
 const timelineRevisions=await good(`/api/monitors/${a}/revisions`);assert.ok(timelineRevisions.some(row=>row.maintenanceIntervals?.some(range=>range.endsAt>range.startsAt)),'revision history exposes the actual planned maintenance span for the console timeline');
 await cancel(ids,'group-pause');

 // Suppression still runs checks and tracks their true target state. A stale
 // review is rejected and cannot partially change a selected group.
 const suppress=window('group-suppress'),input={monitorIds:ids,window:suppress},review=await preview(input);
 await good(`/api/monitors/${b}`,{...(await monitor(b)).definition,name:'Maintenance B edited'},200,'PATCH');
 assert.equal((await api('/api/maintenance/apply',{...input,digest:review.digest})).status,409);
 assert.ok(!(await monitor(a)).definition.maintenanceWindows?.some(item=>item.id===suppress.id));
 await apply(input);await runUntil(a,2);await runUntil(b,1);
 for(const id of ids){const current=await monitor(id);assert.equal(current.state.maintenance,true);assert.equal(current.state.targetState,'Failing');assert.equal(current.state.denominator,1)}
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM outbox WHERE kind IN ('trigger','recovery')").first()).n,0);
 mode=200;await runUntil(a,3);await runUntil(b,2);
 for(const id of ids)assert.equal((await monitor(id)).state.targetState,'Healthy');
 await cancel(ids,'group-suppress');

 // A paused first due row cannot starve B. Worker and runner restarts preserve
 // the calendar and observations; cancellation resumes A without an orphan
 // recovery for the failure whose trigger maintenance suppressed.
 const pauseA=window('pause-only-a','pause');await apply({monitorIds:[a],window:pauseA});
 await Promise.all(ids.map(waitDue));
 const aBefore=(await history(a)).length,bBefore=(await history(b)).length;
 await runner();assert.equal((await history(a)).length,aBefore);assert.equal((await history(b)).length,bBefore+1);
 const retained=await observations();await worker.dispose();worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
 assert.deepEqual(await observations(),retained);assert.equal((await monitor(a)).state.maintenance,true);await runner();assert.equal((await history(a)).length,aBefore);
 await cancel([a],'pause-only-a');await runUntil(a,aBefore+1);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM outbox WHERE kind='recovery'").first()).n,0);
 const ending=window('expires','pause',1000);await apply({monitorIds:[a],window:ending});
 await delay(Math.max(0,ending.endsAt-Date.now()+20));await runUntil(a,aBefore+2);assert.equal((await monitor(a)).state.maintenance,false);
 const kept=await observations();for(const old of beforePause)assert.deepEqual(kept.find(row=>row.id===old.id),old);
 assert.ok((await db.prepare("SELECT COUNT(*) n FROM uptime_audit WHERE action IN ('maintenance_apply','maintenance_cancel')").first()).n>=8);

 // A fixed historical fixture exercises exact report arithmetic through the
 // public report/CSV doors, including revision boundaries and pause overlap.
 const end=Math.floor(Date.now()/60000)*60000,start=end-600000,fixtureId=randomUUID();
 const base={...(await monitor(a)).definition,name:'Historical maintenance arithmetic',maintenanceUntil:0,maintenanceWindows:[],intervalMs:60000,freshnessMs:120000,assignments:undefined};
 const one=(id,from,to)=>({id,name:id,timeZone:'UTC',mode:'suppress',startsAt:start+from,endsAt:start+to});
 const weeklyAt=new Date(start+300000),date=weeklyAt.toISOString().slice(0,10);
 const definitions=[{...base,maintenanceWindows:[one('overlap-a',60000,180000),one('overlap-b',120000,240000)]},
  {...base,maintenanceUntil:start+330000,maintenanceWindows:[{id:'weekly',name:'Weekly report window',timeZone:'UTC',mode:'pause',weekly:{weekdays:[weeklyAt.getUTCDay()],localTime:weeklyAt.toISOString().slice(11,16),durationMinutes:1,fromDate:date,untilDate:date}}]},
  {...base,enabled:false,maintenanceWindows:[one('paused-overlap',450000,600000)]}];
 await db.batch([db.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind(fixtureId,3,JSON.stringify(definitions[2]),end+60000,'{"state":"Unknown"}'),db.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?)').bind(fixtureId)]);
 for(let index=0;index<3;index++)await db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(fixtureId,index+1,JSON.stringify(definitions[index]),start+[0,300000,450000][index]).run();
 for(let offset=0;offset<450000;offset+=60000){
  const revision=offset<300000?1:2,slotId=randomUUID(),at=start+offset;
  const observation={id:randomUUID(),probe:'local-a',attempt:0,startedAt:at,completedAt:at+100,durationMs:100,outcome:'pass',runnerVersion:'uptime-node/0.1.0',status:200,bytes:2,checks:[]};
  await db.batch([db.prepare("INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual) VALUES(?,?,?,?,'complete',?,'fixture',0,0,0)").bind(slotId,fixtureId,revision,at,JSON.stringify(definitions[revision-1])),db.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').bind(observation.id,slotId,'local-a',0,JSON.stringify(observation))]);
 }
 const query=new URLSearchParams({period:'custom',from:String(start),to:String(end),timeZone:'UTC',bucket:'raw'}),path=`/api/v1/monitors/${fixtureId}/report?${query}`;
 const report=await good(path);assert.equal(report.availability.upMs,209900);assert.equal(report.availability.maintenanceMs,240000);assert.equal(report.availability.pausedMs,150000);assert.equal(report.availability.unknownMs,100);assert.equal(report.latency.statistics.count,4);
 const current=await monitor(fixtureId);for(const range of ['last24h','last7d']){assert.equal(current.availability[range].upMs,209900);assert.equal(current.availability[range].maintenanceMs,240000)}
 const csv=await good(path+'&format=csv');assert.ok(csv.includes(',maintenanceMs,240000,ms,'));assert.ok(csv.includes(',upMs,209900,ms,'));
 console.log('MAINT-001 passed: DST review, exact group apply, real signed suppress/pause execution, in-flight retention, restart/cancel/expiry, no orphan recovery, immutable report/CSV counts.');
}finally{
 releaseHeld?.();await Promise.all([...children].map(child=>child.stop()));await close(control);await worker?.dispose();await close(target);await rm(directory,{recursive:true,force:true});
}
