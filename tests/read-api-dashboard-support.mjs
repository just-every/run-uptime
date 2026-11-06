import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHmac} from 'node:crypto';
import https from 'node:https';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,certificate,runChild,listen,close,request} from './signed-runner-runtime.mjs';

async function consumer(path,env){
 const child=spawn(process.execPath,[resolve(path),...(env.UPTIME_MONITOR_MAP?['--map',env.UPTIME_MONITOR_MAP]:[])],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',bytes=>stdout+=bytes);child.stderr.on('data',bytes=>stderr+=bytes);
 const timer=setTimeout(()=>child.kill('SIGKILL'),45000);
 try{return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve({code,stdout,stderr}))})}finally{clearTimeout(timer)}
}

// One isolated installation: provider data never enters native monitoring storage.
export async function proveReadApiDashboard(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-read-dashboard-'));
 const key='synthetic-uptime-401-runner',sourceToken='synthetic-uptime-402-source';
 // D1's delivery transaction also consults SQLite's real clock. Start ahead
 // of it, then advance only this isolated clock; no date-boundary assertions.
 let worker,db,control,target,provider,runner,origin,cookie='',clock=Date.now()+3600000,mode=200;
 const reads=[],signedResults=[],sourceRequests=[];
 const dispatch=envelope=>worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify(envelope)});
 try{
  const tls=await certificate(directory);
  target=https.createServer(tls,(req,res)=>{res.writeHead(req.url==='/canary'?200:mode,{'content-type':'text/plain'});res.end('synthetic-uptime-401')});
  const targetPort=await listen(target);
  control=https.createServer(tls,async(req,res)=>{
   try{
    let body='';for await(const bytes of req)body+=bytes;
    const response=await dispatch({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{}),clock});
    if(req.url.startsWith('/api/v1/uptime?'))reads.push({url:new URL(origin+req.url),authorization:req.headers.authorization,cookie:req.headers.cookie,status:response.status,cache:response.headers.get('cache-control')});
    if(req.url==='/api/runner/results'){
     const stamp=req.headers['x-sent-at'];
     assert.equal(req.headers['x-runner-signature'],createHmac('sha256',key).update(`${stamp}.${body}`).digest('hex'));
     signedResults.push({body:JSON.parse(body),status:response.status});
    }
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch{res.writeHead(500);res.end('Dashboard journey transport failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-403',UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key};
  worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,tls.cert,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.40',...headers}});
  const ok=async(path,body,method)=>{const result=await api(path,body,{},method);assert.equal(result.status,body===undefined?200:201,path);return result.data};
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Dashboard migration owner'});assert.equal(boot.status,303);cookie=boot.headers['set-cookie'][0].split(';')[0];
  await completeSecondFactor(origin,cookie,async(url,init)=>{
   const result=await api(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),init.headers,init.method);
   return new Response(JSON.stringify(result.data),{status:result.status});
  },clock);
  const enrollment={version:1},stamp=String(clock);
  const enrolled=await api('/api/runner/enroll',enrollment,{'x-runner-key':key,'x-sent-at':stamp,'x-runner-signature':createHmac('sha256',key).update(`${stamp}.runner-enrolment.${JSON.stringify(enrollment)}`).digest('hex')});assert.equal(enrolled.status,200);
  const idle=await ok('/api/runners',{networkLabel:'synthetic-uptime-404'});
  const definition={url:'https://runner-target.test/health',network:'public',canaryUrl:'https://canary.runner-target.test/canary',assignments:{'local-a':enrolled.data.runnerId},intervalMs:5000,freshnessMs:30000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1};
  const active=await ok('/api/monitors',{...definition,name:'synthetic-uptime-401'});
  const never=await ok('/api/monitors',{...definition,name:'synthetic-uptime-402',assignments:{'local-a':idle.runnerId}});
  const paused=await ok('/api/monitors',{...definition,name:'synthetic-uptime-403',enabled:false});
  const maintenance=await ok('/api/monitors',{...definition,name:'synthetic-uptime-404',assignments:{'local-a':idle.runnerId},maintenanceUntil:clock+120000});
  const createdAt=clock;
  const run=async()=>{runner=runChild({origin,key,caPath:tls.caPath,targetPort,clock});await runner.finish();runner=undefined};
  await run();clock+=5000;mode=503;await run();clock+=5000;mode=200;await run();clock+=10000;
  const history=await ok(`/api/monitors/${active.id}/history`);
  assert.equal(history.length,3,'three signed scheduled results are retained');assert.deepEqual(history.map(slot=>slot.observations[0].status),[200,503,200]);
  assert.ok(history.every(slot=>slot.manual===0&&slot.status==='complete'&&slot.observations.length===1&&slot.observations[0].canary.outcome==='pass'));
  assert.equal(signedResults.length,3);assert.ok(signedResults.every(result=>result.status===200));
  assert.deepEqual(signedResults.map(result=>result.body.slotId).sort(),history.map(slot=>slot.id).sort());
  for(const result of signedResults)assert.deepEqual(history.find(slot=>slot.id===result.body.slotId).observations,result.body.attempts,'public history retains the signed completion unchanged');
  const mapping={'4101':active.id,'4102':never.id,'4103':paused.id,'4104':maintenance.id};
  const mapPath=join(directory,'monitor-map.json');await writeFile(mapPath,JSON.stringify(mapping),{mode:0o600});
  // The old consumer really executes its authorized form POST, independently of
  // the Worker. Its deliberately different ratios cannot become native evidence.
  const source=JSON.parse(await readFile('tests/fixtures/read-api/uptimerobot-ratios.json','utf8'));
  provider=https.createServer(tls,async(req,res)=>{
   let body='';for await(const bytes of req)body+=bytes;
   const form=new URLSearchParams(body);
   if(req.method!=='POST'||req.url!=='/v2/getMonitors'||form.get('api_key')!==sourceToken){res.writeHead(401);res.end();return}
   sourceRequests.push(form);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(source));
  });
  const providerOrigin=`https://localhost:${await listen(provider)}`;
  const legacy=await consumer('tests/fixtures/read-api/uptimerobot-ratios.mjs',{NODE_EXTRA_CA_CERTS:tls.caPath,UPTIMEROBOT_ORIGIN:providerOrigin,UPTIMEROBOT_READ_TOKEN:sourceToken,UPTIMEROBOT_MONITORS:Object.keys(mapping).join('-')});
  assert.equal(legacy.code,0,'legacy source consumer succeeds');assert.equal(sourceRequests.length,1);
  assert.equal(sourceRequests[0].get('custom_uptime_ratios'),'1-7-30');assert.equal(sourceRequests[0].get('monitors'),Object.keys(mapping).join('-'));
  const legacyRows=JSON.parse(legacy.stdout);
  assert.deepEqual(legacyRows.map(row=>row.sourceMonitorId),Object.keys(mapping));
  assert.deepEqual(legacyRows[0].ratios,[{horizonDays:1,uptimePercent:97.25},{horizonDays:7,uptimePercent:98.5},{horizonDays:30,uptimePercent:99.125}]);
  const issued=await ok('/api/credentials',{name:'synthetic-uptime-405',scopes:['monitoring:read'],expiresAt:clock+3600000,resources:{mode:'selection',monitorIds:Object.values(mapping),tags:[]}});
  const env={NODE_EXTRA_CA_CERTS:tls.caPath,UPTIME_ORIGIN:origin,UPTIME_READ_TOKEN:issued.token,UPTIME_MONITOR_MAP:mapPath};
  const migrated=await consumer('docs/examples/uptime-ratios.mjs',env);
  assert.equal(migrated.code,0,'documented native executable succeeds');
  const result=JSON.parse(migrated.stdout);assert.equal(result.snapshots.length,3);assert.equal(reads.length,3);
  for(const [index,snapshot] of result.snapshots.entries()){
   const days=[1,7,30][index],period=['24h','7d','30d'][index];
   assert.equal(snapshot.horizonDays,legacyRows[0].ratios[index].horizonDays);assert.equal(snapshot.horizonDays,days);
   assert.deepEqual(snapshot.period,{period,from:clock-days*86400000,to:clock,timeZone:'America/Chicago',slaTargetPercent:null});
   assert.equal(snapshot.generatedAt,clock);assert.equal(snapshot.source,'Uptime');
   assert.equal(reads[index].url.searchParams.get('period'),period);assert.equal(reads[index].url.searchParams.get('timeZone'),'America/Chicago');
   assert.equal(reads[index].url.searchParams.get('monitor'),Object.values(mapping).join(','));assert.equal(reads[index].url.searchParams.get('source'),'Uptime');
   assert.equal(reads[index].authorization,'Bearer '+issued.token);assert.equal(reads[index].cookie,undefined);assert.equal(reads[index].cache,'no-store');
   assert.equal(snapshot.monitors.length,4);
   for(const row of snapshot.monitors){
    assert.equal(row.monitorId,mapping[row.sourceMonitorId]);
    const report=await ok(`/api/v1/monitors/${row.monitorId}/report?`+new URLSearchParams({period:'custom',from:String(snapshot.period.from),to:String(snapshot.period.to),timeZone:'America/Chicago',bucket:'1d',source:'Uptime'}));
    assert.equal(report.period.from,snapshot.period.from);assert.equal(report.period.to,snapshot.period.to);assert.equal(report.period.timeZone,snapshot.period.timeZone);
    assert.deepEqual(row.availability,report.availability);assert.equal(row.denominatorPolicy,report.denominatorPolicy);
    const a=row.availability;assert.equal(a.windowMs,days*86400000);
    assert.equal(a.observedMs,a.upMs+a.notPassingMs);assert.equal(a.windowMs,a.observedMs+a.unknownMs+a.pausedMs+a.maintenanceMs);
    if(row.monitorId===active.id){
     // Independent expected spans from the actual signed history, without
     // importing the production report engine or treating source ratios as facts.
     let up=0,down=0;
     for(const slot of history){const observation=slot.observations[0];const span=Math.min(clock,observation.completedAt+5000)-observation.completedAt;if(observation.status===200)up+=span;else down+=span}
     assert.equal(a.upMs,up);assert.equal(a.notPassingMs,down);assert.equal(a.observedMs,15000);
     assert.equal(a.uptimePercent,66.66);assert.equal(a.unknownMs,days*86400000-15000);
     assert.equal(a.pausedMs,0);assert.equal(a.maintenanceMs,0);
    }else{
     assert.equal(a.uptimePercent,null,'no scheduled denominator stays Unknown');assert.equal(a.observedMs,0);
     assert.equal(a.upMs,0);assert.equal(a.notPassingMs,0);
     assert.equal(a.pausedMs,row.monitorId===paused.id?clock-createdAt:0);
     assert.equal(a.maintenanceMs,row.monitorId===maintenance.id?clock-createdAt:0);
     assert.equal(a.unknownMs,days*86400000-a.pausedMs-a.maintenanceMs);
    }
   }
  }
  assert.deepEqual(await ok(`/api/monitors/${active.id}/history`),history,'source and dashboard reads cannot fabricate or rewrite observations');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM source_history_batches').first()).n,0,'provider fixture is never imported');
  assert.equal((await api('/api/credentials/'+issued.credential.id,undefined,{},'DELETE')).status,200);
  const revoked=await consumer('docs/examples/uptime-ratios.mjs',env);
  assert.equal(revoked.code,1);assert.equal(revoked.stdout,'');assert.match(revoked.stderr,/HTTP 401; no dashboard snapshot emitted/);
  assert.equal(reads.length,4);assert.equal(reads[3].status,401);assert.equal(reads[3].cookie,undefined);
  assert.deepEqual(await ok(`/api/monitors/${active.id}/history`),history);
  console.log('PROBE READAPI-001 acceptance 4: executed authorized getMonitors consumer and documented native command -> 1, 7, 30 days preserved as 24h, 7d, 30d in America/Chicago; exact bounds, signed-evidence ratios, Unknown and excluded denominators equal REPORT-001; revoked key exits 1 with HTTP 401 and no output or session fallback.');
 }finally{await runner?.stop();await close(control);await worker?.dispose();await close(target);await close(provider);await rm(directory,{recursive:true,force:true})}
}
