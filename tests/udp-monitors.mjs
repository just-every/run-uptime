import {rejectForgedDiagnostics} from './diagnostic-intake-refusals.mjs';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
// UDP-001: owner API -> real signed Node runner -> migrated emitted Worker.
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import {createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,request,listen,close} from './signed-runner-runtime.mjs';
import https from 'node:https';
import {certificates} from './protocol-fixtures.mjs';
const diagnosticKinds=new Set();
const directory=await mkdtemp(join(tmpdir(),'uptime-udp-')),key='udp-test-only-scoped-runner-key';
let worker,web,db,cookie='',mode='match',packets=0;const udp=dgram.createSocket('udp4');
try{
 udp.on('message',(bytes,remote)=>{packets++;assert.equal(bytes.toString(),'PING');if(mode!=='drop')udp.send(mode==='oversize'?Buffer.alloc(1025):Buffer.from(mode==='match'?'PONG':'WRONG'),remote.port,remote.address)});
 udp.bind(0,'127.0.0.1');await once(udp,'listening');
 const certs=await certificates(directory),cert={...certs.web,caPath:certs.caPath},ca=await readFile(certs.caPath);
 let origin;
 web=https.createServer(cert,async(req,res)=>{
  if(req.headers.host==='canary.protocol.test'){res.writeHead(200);res.end();return}
  let body='';for await(const b of req)body+=b;
  if(req.url==='/api/runner/results')await rejectForgedDiagnostics({url:origin+req.url,headers:req.headers,body,key,dispatch:envelope=>worker.dispatchFetch('http://localhost/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(envelope)}),db,seen:diagnosticKinds});
  const r=await worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{})})});
  res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
 });
 const port=await listen(web);origin=`https://localhost:${port}`;
 const bindings={...testAuthBindings,UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key,UPTIME_LOCAL_REVIEW:'false',MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-key-not-contacted'};
 worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,ca,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers}});
 const run=async(extra={},code)=>{
  const args=['--import',resolve('tests/udp-routing.mjs'),...(code?['--input-type=module','-e',code]:[resolve('tests/signed-runner-child.mjs')])];
  const child=spawn(process.execPath,args,{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,NODE_EXTRA_CA_CERTS:cert.caPath,PROTOCOL_HTTPS_PORT:String(port),UDP_TARGET_PORT:String(udp.address().port),...extra},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  const timer=setTimeout(()=>child.kill('SIGKILL'),30000);try{assert.equal((await once(child,'exit'))[0],0,output.slice(0,1800))}finally{clearTimeout(timer)}
 };
 const enrollment={version:1},stamp=String(Date.now()),sig=createHmac('sha256',key).update(`${stamp}.runner-enrolment.${JSON.stringify(enrollment)}`).digest('hex');
 const registration=(await api('/api/runner/enroll',enrollment,{'x-runner-key':key,'x-sent-at':stamp,'x-runner-signature':sig})).data;
 const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Network operations'});assert.equal(boot.status,303,JSON.stringify(boot.data));cookie=boot.headers['set-cookie'][0].split(';')[0];
 await completeApiSecondFactor(origin,cookie,api);
 const base={name:'West coast game service',type:'udp',udp:{host:'udp.protocol.test',port:9000,payloadHex:'50494e47',expectedHex:'504f4e47',match:'exact'},assignments:{'local-a':registration.runnerId},canaryUrl:'https://canary.protocol.test/ok',intervalMs:30000,timeoutMs:150,retries:0,confirmSlots:1,recoverSlots:1};
 const create=async value=>{const r=await api('/api/monitors',{...base,...value});assert.equal(r.status,201,JSON.stringify(r.data));return r.data};
 const step=async(m,extra)=>{await run(extra);const slots=(await api(`/api/monitors/${m.id}/history`)).data;return slots.find(s=>!s.manual).observations[0]};
 const pause=async m=>assert.equal((await api(`/api/monitors/${m.id}`,{...m.definition,enabled:false},{},'PATCH')).status,200);
 // No packet leaves for forbidden settings, a Worker assignment, or a private DNS answer.
 for(const bad of [{udp:{...base.udp,host:'169.254.169.254'}},{udp:{...base.udp,payloadHex:'aa'.repeat(257)}},{intervalMs:5000},{assignments:{'local-a':'self-00000000-0000-4000-8000-000000000019'}}])assert.equal((await api('/api/monitors',{...base,...bad})).status,400);
 let m=await create({});let o=await step(m,{UDP_PRIVATE_DNS:'1'});assert.equal(o.outcome,'runner_error');assert.equal(o.checks[0].assertion,'network');assert.equal(packets,0);await pause(m);
 mode='mismatch';m=await create({name:'Chicago UDP assertions'});o=await step(m);assert.equal(o.outcome,'target_failure');assert.equal(o.checks[0].assertion,'response');assert.equal(o.protocol.responseHex,Buffer.from('WRONG').toString('hex'));
 let overview=(await api(`/api/overview?monitor=${m.id}`)).data;assert.equal(overview.monitors[0].state.targetState,'Failing');assert.equal(overview.alerts.filter(a=>a.kind==='trigger').length,1);
 // Real elapsed schedule: no clock changes or fabricated observations.
 mode='match';const due=(await db.prepare('SELECT next_due FROM monitors WHERE id=?').bind(m.id).first()).next_due;
 await new Promise(r=>setTimeout(r,Math.max(0,due-Date.now()+30)));o=await step(m);assert.equal(o.outcome,'pass');
 overview=(await api(`/api/overview?monitor=${m.id}`)).data;assert.equal(overview.monitors[0].state.targetState,'Healthy');assert.equal(overview.alerts.filter(a=>a.kind==='recovery').length,1);await pause(m);
 for(const [scenario,category] of [['drop','timeout'],['oversize','response_limit']]){mode=scenario;m=await create({name:`UDP ${scenario}`});o=await step(m);assert.equal(o.outcome,'target_failure');assert.equal(o.checks[0].assertion,category);if(category==='timeout'){const retained=await api('/api/monitors/'+m.id+'/failure-snapshots');assert.equal(retained.status,200);assert.equal(retained.data.items[0].snapshot.diagnostics.category,'timeout');assert.equal(retained.data.items[0].snapshot.diagnostics.phases.connectMs,null)}await pause(m)}
 // Real packets prove per-process caps and cancellation cleanup through the probe door.
 mode='match';const before=packets;
 await run({},`import assert from 'node:assert/strict';import {probeProtocol} from './runners/src/protocol-probes.mjs';const d=${JSON.stringify(base)};for(let i=0;i<6;i++)assert.equal((await probeProtocol(d,'local-a')).outcome,'pass');const capped=await probeProtocol(d,'local-a');assert.equal(capped.outcome,'runner_error');assert.equal(capped.checks[0].assertion,'capacity');const c=new AbortController();c.abort();assert.equal((await probeProtocol(d,'local-a',{signal:c.signal})).checks[0].assertion,'timeout');`);
 assert.equal(packets-before,6);
 const exported=(await api('/api/definitions/export')).data;assert.ok(exported.monitors.some(x=>x.udp?.payloadHex===base.udp.payloadHex));
 const archiveResponse=await api('/api/archive');assert.equal(archiveResponse.status,200,JSON.stringify(archiveResponse.data));const archive=archiveResponse.data;assert.ok(JSON.stringify(archive).includes('504f4e47'));
 m=await create({name:'Revoked network runner'});await api(`/api/runners/${registration.runnerId}`,undefined,{},'DELETE');const count=packets;
 const claim=await api('/api/runner/claim',{}, {'x-runner-key':key});assert.equal(claim.status,401);assert.equal(packets,count);
 await worker.dispose();worker=null;const receiving=join(directory,'receiving');await mkdir(receiving);worker=await emittedRunnerWorker(receiving,bindings);const receivingDB=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await receivingDB.prepare(sql).run();
 const receivingBoot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Receiving network owner'});assert.equal(receivingBoot.status,303);cookie=receivingBoot.headers['set-cookie'][0].split(';')[0];
 await completeApiSecondFactor(origin,cookie,api);
 const restored=await api('/api/restore',archive);assert.equal(restored.status,200,JSON.stringify(restored.data));const receivingMonitors=(await api('/api/overview')).data.monitors;assert.ok(receivingMonitors.length);assert.ok(receivingMonitors.every(x=>x.definition.enabled===false));assert.ok(receivingMonitors.every(x=>x.definition.udp.expectedHex===base.udp.expectedHex));assert.equal(packets,count);const roundtrip=await api('/api/archive');assert.equal(roundtrip.status,200);assert.ok(JSON.stringify(roundtrip.data).includes('57524f4e47'));
 assert.deepEqual([...diagnosticKinds].sort(),['UDP'].sort());
 console.log('UDP-001 PASS: signed scheduled match/mismatch/timeout/recovery, immutable facts, destination rejection, one-packet/rate/size caps, cancellation, portable settings and revoked authority.');
}finally{udp.close();await close(web);await worker?.dispose();await rm(directory,{recursive:true,force:true})}
