import assert from 'node:assert/strict';
import {createHmac,X509Certificate} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,request} from './signed-runner-runtime.mjs';
import {certificates,listen,close,webServer,tlsServer} from './protocol-fixtures.mjs';

const DAY=86400000;

// One saved monitor, actual TLS handshakes and signed scheduled results. Only the test
// envelope and runner preload move time; neither certificates nor retained facts change.
export async function proveTlsExpiryStages(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-tls-stages-'));
 const key='synthetic-uptime-242424242424242424',scenario={certificate:null};
 let worker,db,web,service,origin,cookie='',clock=Date.now();
 const wallNow=Date.now;
 try{
  const certs=await certificates(directory),ca=await readFile(certs.caPath);
  const certificate=new X509Certificate(certs.expiring.cert),expiresAt=Date.parse(certificate.validTo);
  const fingerprint=certificate.fingerprint256;
  scenario.certificate=certs.expiring;
  const tlsPort=await listen(service=tlsServer(scenario,certs.expiring));
  web=webServer(certs.web,scenario,async(req,res)=>{
   let body='';for await(const chunk of req)body+=chunk;
   const response=await worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{}),clock})});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  });
  const webPort=await listen(web);origin=`https://localhost:${webPort}`;
  const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-25',UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key};
  const restart=async()=>{await worker?.dispose();worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB')};
  await restart();
  for(const file of(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const api=async(path,body,headers={},method=body===undefined?'GET':'POST')=>{
   const response=await request(origin,ca,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.24',...headers}});
   assert.ok(response.status>=200&&response.status<400,`${method} ${path}: ${response.status} ${JSON.stringify(response.data)}`);
   return response;
  };
  Date.now=()=>clock;
  const enroll={version:1},stamp=String(clock);
  const signature=createHmac('sha256',key).update(`${stamp}.runner-enrolment.${JSON.stringify(enroll)}`).digest('hex');
  const registration=(await api('/api/runner/enroll',enroll,{'x-runner-key':key,'x-sent-at':stamp,'x-runner-signature':signature})).data;
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'TLS stage owner'});
  assert.equal(boot.status,303);cookie=boot.headers['set-cookie'][0].split(';')[0];
  await completeApiSecondFactor(origin,cookie,api);
  const created=await api('/api/monitors',{name:'Certificate stage progression',type:'tls',tls:{host:'tls.protocol.test',warnDays:[8,6,4],owner:'Certificate team'},assignments:{'local-a':registration.runnerId},canaryUrl:'https://canary.protocol.test/ok',intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1});
  assert.equal(created.status,201);
  const monitor=created.data,stages=monitor.definition.tls.warnDays;
  assert.deepEqual(stages,[8,6,4],'the owner saves the warning policy used by this journey');
  const clockPreload=join(directory,'clock.mjs');
  await writeFile(clockPreload,'Date.now=()=>Number(process.env.SIGNED_RUNNER_CLOCK);\n');
  const history=async()=>(await api(`/api/monitors/${monitor.id}/history`)).data;
  const overview=async()=>(await api(`/api/overview?monitor=${monitor.id}`)).data;
  const warnings=view=>view.alerts.filter(a=>a.kind==='expiry');
  const step=async()=>{
   // Move to the next saved due time without altering scheduler or observation rows.
   const view=await overview();clock=Math.max(clock,view.monitors[0].nextDue+1);
   const child=spawn(process.execPath,['--import',clockPreload,'--import',resolve('tests/protocol-routing.mjs'),resolve('tests/signed-runner-child.mjs')],{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,NODE_EXTRA_CA_CERTS:certs.caPath,PROTOCOL_HTTPS_PORT:String(webPort),PROTOCOL_TLS_PORT:String(tlsPort),SIGNED_RUNNER_CLOCK:String(clock)},stdio:['ignore','pipe','pipe']});
   let bytes=0;child.stdout.on('data',b=>bytes+=b.length);child.stderr.on('data',b=>bytes+=b.length);
   const timer=setTimeout(()=>child.kill('SIGKILL'),40000);
   try{assert.equal((await once(child,'exit'))[0],0,`TLS stage runner failed (${bytes} diagnostic bytes)`)}finally{clearTimeout(timer)}
   const slots=await history(),slot=slots.find(s=>!s.manual),o=slot.observations[0];
   assert.equal(slot.status,'complete');assert.equal(o.canary.outcome,'pass');assert.equal(o.probe,'local-a');
   assert.equal(o.protocol.address,'93.184.216.34');
   return {slot,o,view:await overview()};
  };
  let result=await step();
  assert.equal(result.o.outcome,'pass');assert.equal(result.o.protocol.certificate.fingerprint256,fingerprint);
  assert.equal(warnings(result.view).length,0,'a valid certificate outside every saved stage has no warning');
  const originalSlot=structuredClone(result.slot),reached=[],retainedWarnings=[];
  let incidentKey;
  for(const stage of stages){
   clock=expiresAt-(stage+0.5)*DAY;
   result=await step();reached.push(stage);
   assert.equal(result.o.outcome,'pass');assert.equal(result.view.monitors[0].state.state,'Healthy');
   assert.equal(result.o.protocol.certificate.fingerprint256,fingerprint,'clock advancement keeps the actual leaf certificate');
   assert.equal(result.o.protocol.certificate.notAfter,expiresAt);
   assert.ok(result.o.completedAt>=expiresAt-(stage+0.5)*DAY,'signed evidence uses the advanced clock');
   const notices=warnings(result.view);
   assert.equal(notices.length,reached.length,'exactly one durable warning for each reached stage');
   const notice=notices.find(a=>a.event.explanation.includes(`the ${stage}-day warning`));
   assert.ok(notice,`the saved ${stage}-day stage is visible`);
   assert.match(notice.event.title,/^Certificate expires in \d+ days: Certificate stage progression$/);
   assert.match(notice.event.explanation,/tls\.protocol\.test issued by Protocol fixture test CA/);
   assert.match(notice.event.explanation,/Accountable owner: Certificate team/);
   assert.equal(notice.event.slotId,result.slot.id);assert.equal(notice.event.observedAt,clock);
   incidentKey??=notice.event.incidentKey;assert.equal(notice.event.incidentKey,incidentKey,'all stages track the same certificate warning identity');
   retainedWarnings.push(structuredClone(notice));
   const before=structuredClone(notices);
   result=await step();assert.deepEqual(warnings(result.view),before,'a second signed check cannot repeat a stage');
   await restart();
   assert.deepEqual(warnings(await overview()),before,'warnings survive a Worker restart');
   result=await step();assert.deepEqual(warnings(result.view),before,'a restarted Worker cannot repeat a stage');
  }
  const warnedHistory=structuredClone(await history());
  // Invalid replacement evidence cannot resolve the original warning.
  scenario.certificate=certs.wrongName;result=await step();
  assert.equal(result.o.outcome,'target_failure');assert.equal(result.o.checks.find(c=>c.assertion==='hostname').pass,false);
  assert.equal(result.view.alerts.filter(a=>a.kind==='renewal').length,0);
  scenario.certificate=certs.selfSigned;result=await step();
  assert.equal(result.o.outcome,'target_failure');assert.equal(result.o.checks.find(c=>c.assertion==='trust').pass,false);
  assert.equal(result.view.alerts.filter(a=>a.kind==='renewal').length,0);
  scenario.certificate=certs.renewed;result=await step();
  assert.equal(result.o.outcome,'pass');assert.equal(result.view.monitors[0].state.state,'Healthy');
  assert.equal(result.o.protocol.trusted,true);assert.notEqual(result.o.protocol.certificate.fingerprint256,fingerprint);
  const renewals=result.view.alerts.filter(a=>a.kind==='renewal');assert.equal(renewals.length,1);
  assert.equal(renewals[0].event.incidentKey,incidentKey);assert.equal(renewals[0].event.slotId,result.slot.id);
  assert.match(renewals[0].event.explanation,/valid until .*replaces the one warned about earlier/);
  result=await step();assert.deepEqual(result.view.alerts.filter(a=>a.kind==='renewal'),renewals,'renewal resolves the original identity once');
  await restart();result=await step();
  assert.deepEqual(result.view.alerts.filter(a=>a.kind==='renewal'),renewals,'renewal is not repeated after restart');
  assert.deepEqual(warnings(result.view).slice().reverse(),retainedWarnings,'renewal preserves the original staged warnings');
  const finalHistory=await history();
  for(const slot of [originalSlot,...warnedHistory])assert.deepEqual(finalHistory.find(s=>s.id===slot.id),slot,'later checks and renewal cannot rewrite retained location evidence');
  assert.deepEqual(result.view.alerts.filter(a=>['trigger','recovery'].includes(a.kind)).map(a=>a.kind).reverse(),['trigger','recovery']);
  console.log('TLS-STAGES passed: one real certificate across three saved stages; signed repeated checks and Worker restarts retain one warning per stage and one valid renewal.');
 }finally{
  Date.now=wallNow;
  await close(web);await close(service);await worker?.dispose();await rm(directory,{recursive:true,force:true});
 }
}
