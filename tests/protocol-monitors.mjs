import {proveNetworkDiagnostics} from './network-diagnostics-support.mjs';
import {proveTcpLocations} from './tcp-locations-support.mjs';
import {rejectForgedDiagnostics} from './diagnostic-intake-refusals.mjs';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {testAuthBindings} from './auth-test-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,request} from './signed-runner-runtime.mjs';
import {certificates,listen,close,webServer,tcpServer,tlsServer,dnsServer} from './protocol-fixtures.mjs';
// TCP-001, DNS-001, TLS-001 and DOMAIN-001 core flows: the owner API saves each monitor, the real Node runner checks
// local fixtures through its production DNS pinning and sockets (only the network edge is routed), and its signed
// results drive state, incidents and expiry warnings in the emitted production Worker with migrated D1.
const diagnosticKinds=new Set();
const directory=await mkdtemp(join(tmpdir(),'uptime-protocols-')),key='protocol-monitors-test-only-runner-key';
const DAY=86400000,scenario={dns:{},registry:{},registrar:{},certificate:null};
let worker,db,web,tcp,tlsService,dns,cookie='',origin;
const signature=(path,body,stamp)=>createHmac('sha256',key).update(`${stamp}.${path==='/api/runner/enroll'?'runner-enrolment.':''}${JSON.stringify(body)}`).digest('hex');
try{
 const certs=await certificates(directory),ca=await readFile(certs.caPath),tcpPort=await listen(tcp=tcpServer());
 const dispatch=envelope=>worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify(envelope)});
 web=webServer(certs.web,scenario,async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url==='/api/runner/results')await rejectForgedDiagnostics({url:origin+req.url,headers:req.headers,body,key,dispatch,db,seen:diagnosticKinds});
  const response=await dispatch({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{})});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 });
 const webPort=await listen(web);origin=`https://localhost:${webPort}`;
 scenario.certificate=certs.expiring;const tlsPort=await listen(tlsService=tlsServer(scenario,certs.expiring)),dnsPort=await listen(dns=dnsServer(scenario));
 const bindings={...testAuthBindings,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-provider-not-contacted',UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,OWNER_EMAIL:'owner@example.test',UPTIME_RUNNER_KEY:key};
 worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
 const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,ca,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers}});
 // One real runner process per scheduled check; `edge` selects what the routed network edge does for it.
 const runner=async(edge={})=>{
  const child=spawn(process.execPath,['--import',resolve('tests/protocol-routing.mjs'),resolve('tests/signed-runner-child.mjs')],{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,NODE_EXTRA_CA_CERTS:certs.caPath,PROTOCOL_HTTPS_PORT:String(webPort),PROTOCOL_TCP_PORT:String(tcpPort),PROTOCOL_TLS_PORT:String(tlsPort),PROTOCOL_DNS_PORT:String(dnsPort),...edge},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  const timer=setTimeout(()=>child.kill('SIGKILL'),40000);
  try{const [code]=await once(child,'exit');assert.equal(code,0,`runner failed: ${output.slice(0,2000)}`)}finally{clearTimeout(timer)}
 };
 const enroll={version:1},stamp=String(Date.now());
 const registration=(await api('/api/runner/enroll',enroll,{'x-runner-key':key,'x-sent-at':stamp,'x-runner-signature':signature('/api/runner/enroll',enroll,stamp)})).data;
 const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Protocol owner'});assert.equal(boot.status,303);cookie=boot.headers['set-cookie'][0].split(';')[0];
 await completeApiSecondFactor(origin,cookie,api);
 const create=async input=>{const r=await api('/api/monitors',{assignments:{'local-a':registration.runnerId},canaryUrl:'https://canary.protocol.test/ok',intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1,...input});assert.equal(r.status,201,JSON.stringify(r.data));return r.data};
 const waitDue=async id=>{const row=await db.prepare('SELECT next_due FROM monitors WHERE id=?').bind(id).first();const delay=row.next_due-Date.now()+20;if(delay>0)await new Promise(r=>setTimeout(r,delay))};
 // One scheduled check: wait for the slot, run the runner, then read the newest scheduled attempt and the monitor.
 const step=async(id,edge)=>{await waitDue(id);await runner(edge);const history=(await api(`/api/monitors/${id}/history`)).data,overview=(await api(`/api/overview?monitor=${id}`)).data;
  const slot=history.find(s=>!s.manual);assert.equal(slot.status,'complete',JSON.stringify(slot));const o=slot.observations[0];assert.equal(o.canary.outcome,'pass');
  return {o,state:overview.monitors[0].state,alerts:overview.alerts}};
 const kinds=alerts=>alerts.map(a=>a.kind).reverse();
 // Each runner run takes one due task, so a finished flow pauses its monitor before the next flow starts.
 const pause=async id=>{const current=(await api(`/api/overview?monitor=${id}`)).data.monitors[0];assert.equal((await api(`/api/monitors/${id}`,{...current.definition,enabled:false},{},'PATCH')).status,200)};

 // TCP: open, refused, blackholed and unresolvable-by-the-runner ports are distinct outcomes with confirmed trigger and recovery
 {
  const m=await create({name:'Database port',type:'tcp',tcp:{host:'tcp.protocol.test',port:5432,bannerIncludes:'READY'},timeoutMs:1500});
  assert.equal(m.definition.url,'tcp://tcp.protocol.test:5432');
  let r=await step(m.id);assert.equal(r.o.outcome,'pass');assert.equal(r.o.protocol.address,'93.184.216.34');assert.match(r.o.protocol.banner,/^READY protocol fixture/);assert.equal(r.state.state,'Healthy');
  await close(tcp);r=await step(m.id);assert.equal(r.o.outcome,'target_failure');assert.equal(r.o.checks[0].assertion,'refused');assert.equal((await api('/api/monitors/'+m.id+'/failure-snapshots')).data.items[0].snapshot.diagnostics.category,'connection');assert.equal(r.state.state,'Failing');assert.deepEqual(kinds(r.alerts),['trigger']);
  r=await step(m.id,{PROTOCOL_TCP_MODE:'blackhole'});assert.equal(r.o.outcome,'target_failure');assert.equal(r.o.checks[0].assertion,'timeout');assert.equal((await api('/api/monitors/'+m.id+'/failure-snapshots')).data.items[0].snapshot.diagnostics.category,'timeout');
  r=await step(m.id,{PROTOCOL_RESOLVER_FAILS:'1'});assert.equal(r.o.outcome,'runner_error');assert.equal(r.o.checks[0].assertion,'dns');assert.equal((await api('/api/monitors/'+m.id+'/failure-snapshots')).data.items[0].snapshot.diagnostics.route.reason,'missing-pin');assert.equal(r.state.targetState,'Unknown','a probe failure is never target evidence');
  await listen(tcp=tcpServer(),tcpPort);r=await step(m.id);assert.equal(r.o.outcome,'pass');assert.equal(r.state.state,'Healthy');assert.deepEqual(kinds(r.alerts),['trigger','recovery']);
  await pause(m.id);
 }

 await proveTcpLocations({api,create,runner,waitDue,pause,closeTcp:()=>close(tcp),openTcp:()=>listen(tcp=tcpServer(),tcpPort)});

 // DNS: expected values, change, owner-approved change, propagation difference, NXDOMAIN, SERVFAIL and resolver faults stay distinct
 {
  const all=values=>({cloudflare:{status:'answer',answers:values},google:{status:'answer',answers:values},authoritative:{status:'answer',answers:values}});
  scenario.dns=all(['203.0.113.10']);
  const m=await create({name:'Shop address',type:'dns',dns:{name:'shop.protocol.test',recordType:'A',resolvers:['cloudflare','google','authoritative'],expect:{values:['203.0.113.10']}}});
  let r=await step(m.id);assert.equal(r.o.outcome,'pass',JSON.stringify(r.o.checks));assert.deepEqual(r.o.protocol.resolvers.map(x=>x.answers),[['203.0.113.10'],['203.0.113.10'],['203.0.113.10']]);assert.equal(r.o.protocol.resolvers[2].server,'ns1.protocol.test 93.184.216.34');assert.equal(r.state.state,'Healthy');
  scenario.dns=all(['203.0.113.99']);r=await step(m.id);assert.equal(r.o.outcome,'target_failure');assert.match(r.o.checks[0].reason,/changed: 203\.0\.113\.99; expected 203\.0\.113\.10/);assert.equal(r.state.state,'Failing');
  const approved=await api(`/api/monitors/${m.id}`,{...m.definition,dns:{...m.definition.dns,approved:{values:['203.0.113.99']}}},{},'PATCH');assert.equal(approved.status,200,JSON.stringify(approved.data));
  r=await step(m.id);assert.equal(r.o.outcome,'pass');assert.match(r.o.checks[0].reason,/owner-approved change/);assert.equal(r.state.state,'Healthy');assert.deepEqual(kinds(r.alerts),['trigger','recovery']);
  // The zone changed at its server, but recursive resolvers still serve the cached record: each answer is acceptable,
  // yet exact expectations make the propagation difference itself a failure.
  scenario.dns={...all(['203.0.113.99']),authoritative:{status:'answer',answers:['203.0.113.10']}};r=await step(m.id);assert.equal(r.o.outcome,'target_failure');assert.match(r.o.checks.find(c=>c.assertion==='agreement').reason,/Resolvers disagree/);
  scenario.dns={cloudflare:{status:'nxdomain'},google:{status:'nxdomain'},authoritative:{status:'nxdomain'}};r=await step(m.id);assert.equal(r.o.outcome,'target_failure',JSON.stringify(r.o.checks));assert.equal((await api('/api/monitors/'+m.id+'/failure-snapshots')).data.items[0].snapshot.diagnostics.category,'dns');assert.match(r.o.checks[2].reason,/NXDOMAIN/,'an approved value never suppresses a missing name');
  scenario.dns={...all(['203.0.113.99']),google:{status:'servfail'}};r=await step(m.id);assert.equal(r.o.outcome,'target_failure');assert.match(r.o.checks[1].reason,/SERVFAIL/);assert.equal(r.o.checks.find(c=>c.assertion==='agreement').pass,false);
  scenario.dns={...all(['203.0.113.99']),google:{status:'unavailable'}};r=await step(m.id);assert.equal(r.o.outcome,'runner_error');assert.match(r.o.checks[1].reason,/monitor infrastructure fault/);assert.equal(r.state.targetState,'Unknown');
  await pause(m.id);
 }

 // TLS: an expiring certificate warns once naming it and its owner; a wrong name and an untrusted chain fail; a renewed certificate resolves the warning
 {
  scenario.certificate=certs.expiring;
  const m=await create({name:'Storefront certificate',type:'tls',tls:{host:'tls.protocol.test',warnDays:[30,14,7],owner:'Web team'}});
  let r=await step(m.id);assert.equal(r.o.outcome,'pass',JSON.stringify(r.o.checks));assert.equal(r.state.state,'Healthy');
  let warnings=r.alerts.filter(a=>a.kind==='expiry');assert.equal(warnings.length,1);assert.match(warnings[0].event.title,/^Certificate expires in (9|10) days: Storefront certificate$/);assert.match(warnings[0].event.explanation,/tls\.protocol\.test issued by Protocol fixture test CA .*the 14-day warning.*Accountable owner: Web team/);
  r=await step(m.id);assert.equal(r.alerts.filter(a=>a.kind==='expiry').length,1,'the same stage never warns twice');
  scenario.certificate=certs.wrongName;r=await step(m.id);assert.equal(r.o.outcome,'target_failure');assert.equal(r.o.checks.find(c=>c.assertion==='hostname').pass,false);assert.equal((await api('/api/monitors/'+m.id+'/failure-snapshots')).data.items[0].snapshot.diagnostics.category,'tls');assert.equal(r.state.state,'Failing');
  scenario.certificate=certs.selfSigned;r=await step(m.id);assert.equal(r.o.checks.find(c=>c.assertion==='trust').pass,false);assert.match(r.o.checks.find(c=>c.assertion==='trust').reason,/self-signed/);
  scenario.certificate=certs.renewed;r=await step(m.id);assert.equal(r.o.outcome,'pass');assert.equal(r.state.state,'Healthy');
  const renewal=r.alerts.find(a=>a.kind==='renewal');assert.ok(renewal,'a renewal is observed');assert.equal(renewal.event.incidentKey,warnings[0].event.incidentKey);assert.match(renewal.event.explanation,/valid until .*replaces the one warned about earlier/);
  r=await step(m.id);assert.equal(r.alerts.filter(a=>a.kind==='renewal').length,1);assert.deepEqual(kinds(r.alerts),['expiry','trigger','recovery','renewal']);
  await pause(m.id);
 }

 // Domain: approaching expiry warns with its source; conflicting, redacted and unavailable registry data is Unknown; renewal is followed through
 {
  const soon=Date.now()+20*DAY;scenario.registry={status:200,expiresAt:soon};scenario.registrar={status:200,expiresAt:soon+3600000};
  const m=await create({name:'Shop domain',type:'domain',domain:{name:'shop.test',owner:'Finance'},timeoutMs:5000});
  let r=await step(m.id);assert.equal(r.o.outcome,'pass',JSON.stringify(r.o.checks));assert.equal(r.o.protocol.source,'https://rdap.registry.test/domain/shop.test');assert.ok(r.o.protocol.sourceUpdatedAt<Date.now());assert.equal(r.o.protocol.registrar.source,'https://rdap.registrar.test/domain/shop.test');
  const warning=r.alerts.find(a=>a.kind==='expiry');assert.match(warning.event.title,/^Domain registration expires in (19|20) days: Shop domain$/);assert.match(warning.event.explanation,/the 30-day warning.*Accountable owner: Finance/);
  scenario.registrar={status:200,expiresAt:soon+90*DAY};r=await step(m.id);assert.equal(r.o.outcome,'runner_error');assert.match(r.o.checks[0].reason,/^Unknown: sources disagree/);assert.equal(r.state.targetState,'Unknown');
  scenario.registrar={status:200,expiresAt:soon};scenario.registry={status:200,redacted:true};r=await step(m.id);assert.equal(r.o.outcome,'runner_error');assert.match(r.o.checks[0].reason,/redacts the expiry date/);
  scenario.registry={status:503};r=await step(m.id);assert.equal(r.o.outcome,'runner_error');assert.equal(r.o.checks[0].assertion,'registry');
  const renewed=Date.now()+400*DAY;scenario.registry={status:200,expiresAt:renewed};scenario.registrar={status:200,expiresAt:renewed};r=await step(m.id);assert.equal(r.o.outcome,'pass');assert.equal(r.state.state,'Healthy');
  const renewal=r.alerts.find(a=>a.kind==='renewal');assert.ok(renewal);assert.equal(renewal.event.incidentKey,warning.event.incidentKey);assert.equal(r.alerts.filter(a=>a.kind==='trigger').length,0,'Unknown registry data never opened an incident');
 }
 assert.deepEqual([...diagnosticKinds].sort(),['TCP','DNS','TLS'].sort());
 console.log(`PROTOCOL-MONITORS completed one owner-to-runner lifecycle: emitted Worker + migrated D1, real Node runner per scheduled check, local TCP/TLS/DNS over HTTPS/RDAP fixtures behind production pinning.`);
}finally{await close(web);await close(tcp);await close(tlsService);await close(dns);await worker?.dispose();await rm(directory,{recursive:true,force:true})}

await proveNetworkDiagnostics();
