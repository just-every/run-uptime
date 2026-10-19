import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,request} from './signed-runner-runtime.mjs';
import {certificates,listen,close,webServer} from './protocol-fixtures.mjs';
import {mailEdges} from './mail-edges.mjs';

// MAIL-001: owner-created revisions, real signed Node execution, actual TCP/TLS mail edges, retained per-step incidents.
const directory=await mkdtemp(join(tmpdir(),'uptime-mail-journey-')),key='mail-journey-test-only-runner-key';
let worker,db,web,edge,cookie='',origin;
try{
 const certs=await certificates(directory),ca=await readFile(certs.caPath),credentialDir=join(directory,'credentials');await mkdir(credentialDir,{mode:0o700});
 edge=await mailEdges(certs.web);
 web=webServer(certs.web,{dns:{google:{status:'answer',answers:[]}}},async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const response=await worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{})})});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 });
 const webPort=await listen(web);origin=`https://localhost:${webPort}`;
 const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-provider-not-contacted',UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,OWNER_EMAIL:'owner@example.test',UPTIME_RUNNER_KEY:key};
 worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,ca,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers}});
 const enroll={version:1},stamp=String(Date.now()),signature=createHmac('sha256',key).update(`${stamp}.runner-enrolment.${JSON.stringify(enroll)}`).digest('hex');
 const registration=(await api('/api/runner/enroll',enroll,{'x-runner-key':key,'x-sent-at':stamp,'x-runner-signature':signature})).data;
 const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Mail owner'});assert.equal(boot.status,303,JSON.stringify(boot.data));cookie=boot.headers['set-cookie'][0].split(';')[0];
 const endpoint=(protocol,ref)=>({protocol,host:'canary.protocol.test',port:edge.ports[protocol],security:protocol==='smtp'?'starttls':'tls',credentialRef:ref});
 const credentials=async(id,s)=>{
  for(const target of [s,...(s.transaction?[s.transaction.receive]:[])])if(target.credentialRef)await writeFile(join(credentialDir,`${target.credentialRef}.json`),JSON.stringify({monitorId:id,origin:`https://${target.host}:${target.port}`,auth:{type:'basic',username:'synthetic-user',password:'planted-private-password'}}),{mode:0o600});
 };
 const create=async(name,mail)=>{const response=await api('/api/monitors',{name,type:'mail',mail,assignments:{'local-a':registration.runnerId},canaryUrl:'https://dns.google/ok',intervalMs:5000,timeoutMs:4000,retries:0,confirmSlots:1,recoverSlots:1});assert.equal(response.status,201,JSON.stringify(response.data));await credentials(response.data.id,mail);return response.data};
 const runner=async()=>{
  const child=spawn(process.execPath,['--import',resolve('tests/mail-routing.mjs'),resolve('tests/signed-runner-child.mjs')],{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,UPTIME_CREDENTIAL_DIR:credentialDir,NODE_EXTRA_CA_CERTS:certs.caPath,MAIL_JOURNEY_WEB_PORT:String(webPort)},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),40000);
  try{assert.equal((await once(child,'exit'))[0],0,`Mail runner failed: ${output.slice(0,2000)}`)}finally{clearTimeout(timer)}
 };
 const step=async id=>{
  const row=await db.prepare('SELECT next_due FROM monitors WHERE id=?').bind(id).first(),delay=row.next_due-Date.now()+20;if(delay>0)await new Promise(r=>setTimeout(r,delay));await runner();
  const history=(await api(`/api/monitors/${id}/history`)).data,overview=(await api(`/api/overview?monitor=${id}`)).data,slot=history.find(s=>!s.manual);
  assert.equal(slot.status,'complete',JSON.stringify(slot));const o=slot.observations[0];assert.equal(o.canary.outcome,'pass');
  assert.ok(!JSON.stringify([history,overview]).includes('planted-private-password'));assert.ok(!JSON.stringify([history,overview]).includes('private-body-not-evidence'));
  return {o,history,overview,state:overview.monitors[0].state};
 };
 const pause=async id=>{const monitor=(await api(`/api/overview?monitor=${id}`)).data.monitors[0];assert.equal((await api(`/api/monitors/${id}`,{...monitor.definition,enabled:false},{},'PATCH')).status,200)};
 for(const protocol of ['smtp','pop3','imap']){
  const mail=endpoint(protocol,`account-${protocol}`),monitor=await create(`${protocol} mailbox authentication`,mail);
  let result=await step(monitor.id);assert.equal(result.o.outcome,'pass',JSON.stringify(result.o));assert.equal(result.state.state,'Healthy');
  edge.state.rejectAuth=true;result=await step(monitor.id);assert.equal(result.o.outcome,'target_failure');assert.equal(result.o.checks.at(-1).assertion,'authentication');assert.equal(result.state.state,'Failing');assert.ok(result.overview.alerts.some(a=>a.kind==='trigger'));edge.state.rejectAuth=false;
  result=await step(monitor.id);assert.equal(result.state.state,'Healthy');assert.ok(result.overview.alerts.some(a=>a.kind==='recovery'));
  // A new immutable revision changes the TLS identity, not its trusted CA. The same edge certificate must be refused.
  const bad={...mail,host:'wrong-cert.protocol.test'};
  const current=(await api(`/api/overview?monitor=${monitor.id}`)).data.monitors[0];assert.equal((await api(`/api/monitors/${monitor.id}`,{...current.definition,url:undefined,mail:bad},{},'PATCH')).status,200);await credentials(monitor.id,bad);
  result=await step(monitor.id);assert.equal(result.o.outcome,'target_failure');assert.equal(result.o.checks.at(-1).assertion,'tls');assert.ok(result.history.some(slot=>slot.observations.some(o=>o.checks.some(c=>c.assertion==='authentication'&&!c.pass))));await pause(monitor.id);
 }
 for(const [protocol,security,port] of [['smtp','none',edge.ports.smtp],['smtp','tls',edge.ports.smtps],['pop3','none',edge.ports.pop3Plain],['pop3','starttls',edge.ports.pop3Plain],['imap','none',edge.ports.imapPlain],['imap','starttls',edge.ports.imapPlain]]){
  const mail={protocol,host:'canary.protocol.test',port,security,...(security==='none'?{}:{credentialRef:`variant-${protocol}-${security}`})};
  const monitor=await create(`${protocol} ${security} connection`,mail),result=await step(monitor.id);
  assert.equal(result.o.outcome,'pass',JSON.stringify(result.o));assert.equal(result.state.state,'Healthy');await pause(monitor.id);
 }
 for(const protocol of ['pop3','imap']){
  const mail={...endpoint('smtp',`send-${protocol}`),transaction:{dedicatedMailbox:true,from:'synthetic@example.test',to:'mailbox@example.test',receive:endpoint(protocol,`receive-${protocol}`),receiptTimeoutMs:700,pollIntervalMs:100}};
  edge.state.receiptDelayMs=200;const monitor=await create(`SMTP to ${protocol} synthetic delivery`,mail);
  const unrelated={uid:edge.state.nextUid++,messageId:'<unrelated@example.test>',availableAt:Date.now(),deleted:false};edge.state.messages.push(unrelated);
  let result=await step(monitor.id),transaction=result.o.protocol.transaction;assert.equal(result.o.outcome,'pass',JSON.stringify(result.o));assert.ok(transaction.smtpAccepted&&transaction.received&&transaction.cleanup);assert.ok(transaction.receivedAt>=transaction.acceptedAt+150);assert.ok(edge.state.removed.includes(transaction.messageId));assert.equal(unrelated.deleted,false);
  edge.state.dropReceipt=true;result=await step(monitor.id);transaction=result.o.protocol.transaction;assert.equal(result.o.outcome,'target_failure');assert.equal(result.o.checks.at(-1).assertion,'receipt');assert.equal(transaction.smtpAccepted,true);assert.equal(transaction.received,false);assert.equal(transaction.cleanup,false);assert.equal(result.state.state,'Failing');edge.state.dropReceipt=false;
  edge.state.rejectCleanup=true;result=await step(monitor.id);assert.equal(result.o.outcome,'target_failure');assert.equal(result.o.checks.at(-1).assertion,'cleanup');assert.equal(result.o.protocol.transaction.received,true);assert.equal(result.o.protocol.transaction.cleanup,false);edge.state.rejectCleanup=false;
  result=await step(monitor.id);assert.equal(result.state.state,'Healthy');assert.equal(result.o.protocol.transaction.cleanup,true);assert.equal(unrelated.deleted,false);await pause(monitor.id);
 }
 console.log('PASS MAIL-001 owner configuration, signed native protocols, per-step incidents, receiver confirmation and synthetic-only removal');
}finally{await edge?.close();await close(web);await worker?.dispose();await rm(directory,{recursive:true,force:true})}
