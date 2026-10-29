import {rejectForgedDiagnostics} from './diagnostic-intake-refusals.mjs';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
// PING-001: owner API -> real signed Node runner -> migrated emitted Worker.
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings,definitionDoor} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,request,listen,close} from './signed-runner-runtime.mjs';
import https from 'node:https';
import {certificates} from './protocol-fixtures.mjs';
const diagnosticKinds=new Set();
const directory=await mkdtemp(join(tmpdir(),'uptime-ping-')),key=randomBytes(32).toString('base64url');
let worker,web,db,clock,cookie='',forge=false,forgeries=0;
try{
 const certs=await certificates(directory),cert={...certs.web,caPath:certs.caPath},ca=await readFile(certs.caPath);
 let origin;
 web=https.createServer(cert,async(req,res)=>{
  if(req.headers.host==='canary.protocol.test'){res.writeHead(200);res.end();return}
  let body='';for await(const b of req)body+=b;
  if(forge&&req.url==='/api/runner/results'){
   const original=JSON.parse(body);
   for(const mutate of [o=>{o.outcome=o.outcome==='pass'?'target_failure':'pass'},o=>{o.protocol.lossPercent=99},o=>{o.protocol.rtt={minMs:20,meanMs:10,maxMs:1}}]){
    const changed=structuredClone(original);mutate(changed.attempts[0]);
    const forged=JSON.stringify(changed),stamp=String(Date.now()),headers={...req.headers,'x-sent-at':stamp,'x-runner-signature':createHmac('sha256',key).update(`${stamp}.${forged}`).digest('hex')};
    const rejected=await worker.dispatchFetch('http://localhost/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:'POST',headers,body:forged})});
    assert.equal(rejected.status,400,'a legitimately signed but inconsistent ICMP completion is refused');forgeries++;
   }
   forge=false;
  }
  if(req.url==='/api/runner/results')await rejectForgedDiagnostics({url:origin+req.url,headers:req.headers,body,key,dispatch:envelope=>worker.dispatchFetch('http://localhost/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(envelope)}),db,seen:diagnosticKinds});
  const r=await worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{}),...(clock===undefined?{}:{clock})})});
  res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
 });
 const port=await listen(web);origin=`https://localhost:${port}`;
 const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key,UPTIME_LOCAL_REVIEW:'false',MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:randomBytes(32).toString('base64url'),RER_DEV_KEY:randomBytes(32).toString('base64url')};
 worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,ca,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers}});
 const run=async(extra={},code)=>{
  const args=['--import',resolve('tests/ping-routing.mjs'),...(code?['--input-type=module','-e',code]:[resolve('tests/signed-runner-child.mjs')])];
  const child=spawn(process.execPath,args,{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,NODE_EXTRA_CA_CERTS:cert.caPath,PROTOCOL_HTTPS_PORT:String(port),...extra},stdio:['ignore','pipe','pipe']});
  let bytes=0;child.stdout.on('data',b=>bytes+=b.length);child.stderr.on('data',b=>bytes+=b.length);
  const timer=setTimeout(()=>child.kill('SIGKILL'),30000);try{assert.equal((await once(child,'exit'))[0],0,`Runner failed (${bytes} private diagnostic bytes)`)}finally{clearTimeout(timer)}
 };
 const enrollment={version:1},stamp=String(Date.now()),sig=createHmac('sha256',key).update(`${stamp}.runner-enrolment.${JSON.stringify(enrollment)}`).digest('hex');
 const registration=(await api('/api/runner/enroll',enrollment,{'x-runner-key':key,'x-sent-at':stamp,'x-runner-signature':sig})).data;
 const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Network operations'});assert.equal(boot.status,303,JSON.stringify(boot.data));cookie=boot.headers['set-cookie'][0].split(';')[0];
 await completeApiSecondFactor(origin,cookie,api);
 const base={name:'West coast ICMP',type:'ping',ping:{host:'ping.protocol.test',family:4,packets:3,maxLossPercent:0,maxRttMs:1000},assignments:{'local-a':registration.runnerId},canaryUrl:'https://canary.protocol.test/ok',intervalMs:30000,timeoutMs:10000,retries:0,confirmSlots:1,recoverSlots:1};
 const create=async value=>{const r=await api('/api/monitors',{...base,...value});assert.equal(r.status,201,JSON.stringify(r.data));return r.data};
 const step=async(m,extra)=>{await run(extra);const slots=(await api(`/api/monitors/${m.id}/history`)).data;return slots.find(s=>!s.manual).observations[0]};
 const pause=async m=>assert.equal((await api(`/api/monitors/${m.id}`,{...m.definition,enabled:false},{},'PATCH')).status,200);
 // The owner route rejects unsafe settings and Worker assignment before probing.
 for(const bad of [{ping:{...base.ping,host:'169.254.169.254'}},{ping:{...base.ping,packets:6}},{ping:{...base.ping,family:5}},{ping:{...base.ping,maxLossPercent:101}},{ping:{...base.ping,maxRttMs:0}},{ping:{...base.ping,binary:'/tmp/ping'}},{intervalMs:5000},{timeoutMs:1000},{assertions:{latencyMs:500}},{assignments:{'local-a':'self-00000000-0000-4000-8000-000000000019'}}])assert.equal((await api('/api/monitors',{...base,...bad})).status,400);
 let m=await create({});forge=true;let o=await step(m);assert.equal(o.outcome,'pass');assert.equal(forgeries,3);assert.equal(o.protocol.received,3);assert.equal(o.protocol.lossPercent,0);assert.deepEqual(o.protocol.rtt,{minMs:1,meanMs:2,maxMs:3});await pause(m);
 for(const mode of ['loss','slow','blocked']){
  m=await create({name:`ICMP ${mode}`});o=await step(m,{PING_MODE:mode});assert.equal(o.outcome,'target_failure');
  const overview=(await api(`/api/overview?monitor=${m.id}`)).data;assert.equal(overview.monitors[0].state.targetState,'Failing');
  if(mode==='loss')assert.equal(o.checks.find(c=>c.assertion==='packet_loss').pass,false);
  if(mode==='slow')assert.equal(o.checks.find(c=>c.assertion==='rtt').pass,false);
  if(mode==='blocked'){const retained=await api('/api/monitors/'+m.id+'/failure-snapshots');assert.equal(retained.status,200);assert.equal(retained.data.items[0].snapshot.diagnostics.category,'timeout');assert.equal(retained.data.items[0].snapshot.diagnostics.phases.connectMs,null);assert.equal(o.protocol.rtt,null);assert.match(o.checks[0].reason,/cannot distinguish/)}
  await pause(m);
 }
 // Recovery is a new immutable revision, with its previous failing sample retained.
 const old=(await api(`/api/monitors/${m.id}/history`)).data;
 const changed=await api(`/api/monitors/${m.id}`,{...m.definition,enabled:true,ping:{...base.ping,maxLossPercent:50}},{},'PATCH');assert.equal(changed.status,200);
 const nextDue=(await db.prepare('SELECT next_due FROM monitors WHERE id=?').bind(m.id).first()).next_due;await new Promise(resolve=>setTimeout(resolve,Math.max(0,nextDue-Date.now()+30)));
 o=await step(changed.data,{PING_MODE:'loss'});assert.equal(o.outcome,'pass');const recovered=(await api(`/api/overview?monitor=${m.id}`)).data;assert.equal(recovered.monitors[0].state.targetState,'Healthy');assert.ok(recovered.alerts.some(a=>a.kind==='recovery'));assert.ok((await api(`/api/monitors/${m.id}/history`)).data.some(s=>s.observations.some(x=>x.id===old[0].observations[0].id)));await pause(changed.data);
 for(const extra of [{PING_MODE:'missing'},{PING_MODE:'denied'},{PING_MODE:'malformed'},{PING_MODE:'oversize'},{PING_PRIVATE_DNS:'1'},{PING_PRIVATE_V6:'1'}]){
  m=await create({name:'Unavailable ICMP vantage'});o=await step(m,extra);assert.equal(o.outcome,'runner_error');assert.equal((await api(`/api/overview?monitor=${m.id}`)).data.monitors[0].state.targetState,'Unknown');await pause(m);
 }
 // The selected family is honored even for dual-stack hosts; all-family DNS validation still applies.
 m=await create({name:'IPv6 ICMP',ping:{...base.ping,family:6}});o=await step(m);assert.equal(o.outcome,'pass');assert.equal(o.protocol.family,6);assert.equal(o.protocol.address,'2606:4700:4700::1111');await pause(m);
 // Stop invoking an assigned runner after a real signed success. Only the
 // emitted Worker's clock advances; the saved monitor and evidence stay intact.
 const stopped=await create({name:'Stopped ICMP probe'});
 const initial=(await api(`/api/overview?monitor=${stopped.id}`)).data.monitors[0];
 assert.equal(initial.state.regions[0].state,'Unknown');
 const sample=await step(stopped);assert.equal(sample.outcome,'pass');
 const healthy=(await api(`/api/overview?monitor=${stopped.id}`)).data;
 const running=healthy.monitors[0];
 assert.equal(running.definition.enabled,true);
 assert.equal(running.state.targetState,'Healthy');
 assert.equal(running.state.coverageState,'Complete');
 assert.equal(running.state.denominator,stopped.definition.probes.length);
 assert.equal(running.state.unknown,0);
 assert.equal(running.state.regions[0].state,'Healthy');
 assert.equal(running.state.regions[0].observationId,sample.id);
 assert.deepEqual(healthy.alerts,[]);
 const retained=(await api(`/api/monitors/${stopped.id}/history`)).data;
 assert.equal(retained.length,1);assert.equal(retained[0].manual,0);
 assert.equal(retained[0].observations.length,1);
 assert.deepEqual(retained[0].observations[0],sample);
 // Both the target and its external check still count just before the saved
 // freshness limit; crossing it without another runner invocation loses coverage.
 clock=Math.min(sample.completedAt,sample.canary.completedAt)+stopped.definition.freshnessMs-1;
 const fresh=(await api(`/api/overview?monitor=${stopped.id}`)).data.monitors[0];
 assert.equal(fresh.state.targetState,'Healthy');
 assert.equal(fresh.state.coverageState,'Complete');
 clock=Math.max(sample.completedAt,sample.canary.completedAt)+stopped.definition.freshnessMs+1;
 const expired=(await api(`/api/overview?monitor=${stopped.id}`)).data;
 const stale=expired.monitors[0];
 assert.deepEqual(stale.definition,running.definition,'the monitor remains enabled with the same runner assignment');
 assert.equal(stale.revision,running.revision);
 assert.equal(stale.nextDue,running.nextDue);
 assert.equal(stale.state.state,'Unknown');assert.equal(stale.state.targetState,'Unknown');
 assert.equal(stale.state.coverageState,'Incomplete');
 assert.equal(stale.state.denominator,running.state.denominator,'stopping a probe cannot shrink the configured denominator');
 assert.equal(stale.state.unknown,running.state.denominator);
 assert.equal(stale.state.fails,0);
 assert.equal(stale.state.regions[0].probe,running.state.regions[0].probe);
 assert.equal(stale.state.regions[0].state,'Unknown');
 assert.equal(stale.state.regions[0].observationId,sample.id);
 assert.equal(stale.state.regions[0].observedAt,sample.completedAt);
 assert.deepEqual(expired.alerts,healthy.alerts,'missing probes cannot fabricate a trigger or recovery');
 assert.deepEqual(stale.storedState,running.storedState,'freshness projection does not manufacture a successful scheduled decision');
 const unchanged=await api(`/api/monitors/${stopped.id}/history`);assert.equal(unchanged.status,200);
 assert.deepEqual(unchanged.data,retained,'no replacement slot or observation is fabricated and the original signed ICMP result is unchanged');
 clock=undefined;await pause(stopped);
 const exported=(await api('/api/definitions/export')).data;assert.ok(exported.monitors.some(x=>x.ping?.family===6));
 // The exported file previews through the owner's import door, over the same HTTPS origin.
 const fetcher=(url,init)=>new Promise((resolve,reject)=>{const req=https.request(url,{method:init.method,ca,headers:{'cf-connecting-ip':'192.0.2.1',...init.headers}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,json:async()=>JSON.parse(text)}))});req.on('error',reject);req.end(init.body)});
 const preview=await definitionDoor({origin,cookie,fetcher}).preview(exported,'uptime.monitors');assert.equal(preview.status,200,JSON.stringify(preview.body));
 const archiveResponse=await api('/api/archive');assert.equal(archiveResponse.status,200);const archive=archiveResponse.data;
 await api(`/api/runners/${registration.runnerId}`,undefined,{},'DELETE');assert.equal((await api('/api/runner/claim',{}, {'x-runner-key':key})).status,401);
 await worker.dispose();worker=null;const receiving=join(directory,'receiving');await mkdir(receiving);worker=await emittedRunnerWorker(receiving,bindings);const receivingDB=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await receivingDB.prepare(sql).run();
 const bootAgain=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Receiving ICMP owner'});assert.equal(bootAgain.status,303);cookie=bootAgain.headers['set-cookie'][0].split(';')[0];
 await completeApiSecondFactor(origin,cookie,api);
 const restored=await api('/api/restore',archive);assert.equal(restored.status,200,JSON.stringify(restored.data));const receivingMonitors=(await api('/api/overview')).data.monitors;assert.equal(receivingMonitors.length,exported.monitors.length);assert.ok(receivingMonitors.every(x=>x.definition.type==='ping'&&x.definition.enabled===false));assert.ok(receivingMonitors.some(x=>x.definition.ping.family===6));const roundtrip=await api('/api/archive');assert.equal(roundtrip.status,200);assert.ok(JSON.stringify(roundtrip.data).includes('lossPercent'));
 assert.deepEqual([...diagnosticKinds].sort(),['PING'].sort());
 console.log('PING-001 PASS: signed IPv4/IPv6 samples, loss/RTT thresholds, failure/recovery, unavailable and stopped probes, forged evidence refusal, portable definitions and inactive restore.');
}finally{await close(web);await worker?.dispose();await rm(directory,{recursive:true,force:true})}
