import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {createHmac,X509Certificate} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import https from 'node:https';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {promisify} from 'node:util';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeApiSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';
import {emittedRunnerWorker,listen,close,request} from './signed-runner-runtime.mjs';
import {cleanup} from './resilience/support.mjs';

const exec=promisify(execFile),hostname='redirect.sanity.test';
async function certificates(directory){
 const openssl=(...args)=>exec('openssl',args,{cwd:directory});
 await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','2','-subj','/CN=synthetic-uptime-164-ca','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign');
 await writeFile(join(directory,'server.ext'),`basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:${hostname},DNS:canary.${hostname},DNS:localhost\n`);
 await openssl('req','-new','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr','-subj','/CN=synthetic-uptime-164');
 await openssl('x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','server.pem','-days','1','-extfile','server.ext');
 for(const host of [hostname,'canary.'+hostname,'localhost'])await openssl('verify','-CAfile','ca.pem','-purpose','sslserver','-verify_hostname',host,'server.pem');
 const ca=await readFile(join(directory,'ca.pem'),'utf8'),cert=await readFile(join(directory,'server.pem'),'utf8'),x509=new X509Certificate(cert);
 assert.equal(x509.verify(new X509Certificate(ca).publicKey),true);
 assert.equal(x509.checkHost(hostname),hostname);
 assert.ok(Date.parse(x509.validFrom)<=Date.now()&&Date.parse(x509.validTo)>Date.now());
 return {ca,caPath:join(directory,'ca.pem'),server:{cert,key:await readFile(join(directory,'server.key'),'utf8')}};
}

// One differential native journey; only the receiver's redirect routing changes.
export async function proveNetworkRedirectCycle(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-redirect-cycle-'));
 const key='synthetic-uptime-164-installation-runner-key';
 const connections=[],handshakes=[],requests=[],canaries=[],completions=[],claims=[],open=new Set();
 let worker,db,control,target,canary,active,bridgeError,origin,cookie='',mode='short';
 try{
  const certs=await certificates(directory);
  target=https.createServer(certs.server,(req,res)=>{
   const location=mode==='cycle'?(req.url==='/cycle-a'?'/cycle-b':'/cycle-a'):req.url==='/entry'?'/healthy':undefined;
   requests.push({at:Date.now(),host:req.headers.host,sni:req.socket.servername,method:req.method,path:req.url,status:location?302:200,...(location?{location}:{})});
   res.writeHead(location?302:200,location?{location}:{});res.end(location?'':'synthetic-uptime-164');
  });
  target.on('connection',socket=>{connections.push(Date.now());open.add(socket);socket.once('close',()=>open.delete(socket))});
  target.on('secureConnection',socket=>handshakes.push({at:Date.now(),sni:socket.servername}));
  target.on('tlsClientError',()=>{});
  const targetPort=await listen(target);
  canary=https.createServer(certs.server,(req,res)=>{canaries.push({host:req.headers.host,sni:req.socket.servername,path:req.url});res.end('synthetic-uptime-164-canary')});
  const canaryPort=await listen(canary);
  control=https.createServer(certs.server,async(req,res)=>{
   try{
    let body='';for await(const chunk of req)body+=chunk;
    if(['/api/runner/enroll','/api/runner/results'].includes(req.url)){
     const purpose=req.url==='/api/runner/enroll'?'runner-enrolment.':'';
     assert.equal(req.headers['x-runner-signature'],createHmac('sha256',key).update(`${req.headers['x-sent-at']}.${purpose}${body}`).digest('hex'),'production runner signs the actual submitted bytes');
    }
    const response=await worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{})})});
    const text=await response.text();
    if(req.url==='/api/runner/results')completions.push({body:JSON.parse(body),status:response.status,response:JSON.parse(text)});
    if(req.url==='/api/runner/claim')claims.push(JSON.parse(text).task);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(text);
   }catch(error){bridgeError=error;res.writeHead(500);res.end('Emitted Worker request failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-164-mail',UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key};
  const start=async()=>{worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB')};
  await start();
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,certs.ca,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.164',...headers}});
  const read=async path=>{const response=await api(path);assert.equal(response.status,200);return response.data};
  async function runner(){
   active=spawn(process.execPath,['--import',resolve('tests/network-redirect-cycle-routing.mjs'),resolve('tests/signed-runner-child.mjs')],{cwd:directory,env:{...process.env,NODE_EXTRA_CA_CERTS:certs.caPath,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,UPTIME_RUNNER_BROWSER:'off',UPTIME_FLOW_DIR:join(directory,'flows'),REDIRECT_TARGET_PORT:String(targetPort),REDIRECT_CANARY_PORT:String(canaryPort)},stdio:['ignore','pipe','pipe']});
   const child=active;let bytes=0;for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>bytes+=chunk.length);
   const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}))});
   const timer=setTimeout(()=>child.kill('SIGKILL'),35000);
   try{const result=await ended;active=undefined;if(bridgeError)throw bridgeError;assert.equal(result.signal,null);if(result.code!==0&&process.env.UPTIME_REDIRECT_RECEIPT)await writeFile(process.env.UPTIME_REDIRECT_RECEIPT,JSON.stringify({journey:'proveNetworkRedirectCycle',failure:'signed runner completion refused',exit:result.code,completions,connections,handshakes,requests,canaries},null,2)+'\n');assert.equal(result.code,0,`signed runner failed (${bytes} private diagnostic bytes); last completion status ${completions.at(-1)?.status}, error ${completions.at(-1)?.response?.error}`)}finally{clearTimeout(timer)}
  }
  await runner();assert.deepEqual(claims,[null]);
  const registration=await db.prepare('SELECT runner_id FROM runners WHERE legacy_key=1').first();assert.ok(registration);
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Redirect cycle owner'});assert.equal(boot.status,303);cookie=boot.headers['set-cookie'][0].split(';')[0];
  await completeApiSecondFactor(origin,cookie,api);
  const created=await api('/api/monitors',{name:'Verified public HTTPS redirects',type:'http',network:'public',url:`https://${hostname}/entry`,assignments:{'local-a':{runnerId:registration.runner_id,canaryUrl:`https://canary.${hostname}/canary`}},intervalMs:5000,timeoutMs:3000,retries:0,confirmSlots:1,recoverSlots:1,assertions:{status:200,bodyIncludes:'synthetic-uptime-164'}});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const {id,revision,definition:saved}=created.data;
  assert.equal(saved.tlsTrust,undefined);assert.equal(saved.request,undefined);
  const revisions=await read(`/api/monitors/${id}/revisions`),retained=new Map(),slots=[],wire=[];
  const history=()=>read(`/api/monitors/${id}/history`);
  const current=async()=>{const monitor=(await read('/api/overview')).monitors.find(row=>row.id===id);assert.equal(monitor.revision,revision);assert.deepEqual(monitor.definition,saved);return monitor};
  const traffic=()=>({connections:connections.length,handshakes:handshakes.length,requests:requests.length,canaries:canaries.length});
  async function due(phase,expected){
   const before=await current();await sleep(Math.max(0,before.nextDue-Date.now()+20));
   const counts=traffic(),completed=completions.length;
   await runner();
   assert.equal(completions.length,completed+1);
   const completion=completions.at(-1),task=claims.at(-1);
   assert.equal(completion.status,200,'signed redirect evidence passes native intake');
   assert.equal(task.monitorId,id);assert.deepEqual(task.definition,saved);
   const rows=await history(),slot=rows.find(row=>row.id===task.id);
   assert.ok(slot);assert.equal(slot.status,'complete');assert.equal(slot.manual,0);assert.equal(slot.revision,revision);assert.deepEqual(slot.definition,saved);
   assert.equal(slot.observations.length,1);const [observation]=slot.observations;
   assert.ok(slot.due_at>=before.nextDue);assert.ok(observation.startedAt>=slot.due_at);
   assert.deepEqual(observation,completion.body.attempts[0],'owner sees the exact signed observation');
   assert.equal(observation.canary.outcome,'pass');assert.equal(observation.canary.status,200);
   assert.equal(canaries.length,counts.canaries+1);assert.deepEqual(canaries.at(-1),{host:'canary.'+hostname,sni:'canary.'+hostname,path:'/canary'});
   const received=requests.slice(counts.requests),connected=connections.length-counts.connections;
   assert.equal(connected,received.length,'independent TCP count matches actual received requests');
   assert.equal(handshakes.length-counts.handshakes,connected,'every target connection completed verified TLS');
   assert.ok(received.every(row=>row.host===hostname&&row.sni===hostname&&row.method==='GET'));
   assert.ok(handshakes.slice(counts.handshakes).every(row=>row.sni===hostname));
   if(phase==='cycle'){
    assert.equal(observation.outcome,'target_failure');assert.equal(observation.status,undefined);assert.equal(observation.bytes,undefined);
    assert.deepEqual(observation.checks,[{assertion:'redirect',pass:false,reason:'Probe redirect check failed'}]);
    assert.ok(observation.durationMs<saved.timeoutMs,'hop exhaustion happens before the saved request timeout');
    assert.ok(observation.completedAt-observation.startedAt<saved.timeoutMs);
    assert.ok(received.length>wire[0].requests.length,'cycle actually follows more hops than the successful chain');
    assert.equal(received[0].path,'/entry');
    for(let index=0;index<received.length;index++){
     const row=received[index];assert.equal(row.status,302);
     if(index>0)assert.equal(row.path,received[index-1].location,'ordered receiver targets follow each prior redirect');
     assert.equal(row.location,row.path==='/cycle-a'?'/cycle-b':'/cycle-a');
     assert.ok(row.at>=observation.startedAt&&row.at<=observation.completedAt);
    }
    assert.ok(received.some(row=>row.path==='/cycle-a')&&received.some(row=>row.path==='/cycle-b'));
   }else{
    assert.equal(observation.outcome,'pass');assert.equal(observation.status,200);assert.ok(observation.checks.every(check=>check.pass));
    assert.deepEqual(received.map(({path,status,location})=>({path,status,...(location?{location}:{})})),[{path:'/entry',status:302,location:'/healthy'},{path:'/healthy',status:200}]);
   }
   assert.equal(observation.tlsTrust,undefined,'ordinary verified HTTPS never acquires a trust exception');
   const state=(await current()).state;assert.equal(state.state,expected);assert.equal(state.targetState,expected);assert.equal(state.denominator,1);assert.equal(state.unknown,0);assert.equal(state.coverageState,'Complete');
   assert.deepEqual(await read(`/api/monitors/${id}/revisions`),revisions);
   for(const [oldId,old] of retained)assert.deepEqual(rows.find(row=>row.id===oldId),old,'later phases preserve earlier signed history');
   retained.set(slot.id,structuredClone(slot));slots.push(slot);assert.equal(rows.length,slots.length);
   wire.push({phase,connections:connected,handshakes:handshakes.length-counts.handshakes,requests:received,observation});
   console.log(`PROBE NETWORK-001 acceptance-1 ${phase}: unchanged owner-created public HTTPS monitor -> signed ${observation.outcome}, ${observation.checks.map(check=>check.assertion).join(',')}, ${expected}; ${connected} TLS connections and ${received.length} ordered requests, duration ${observation.durationMs}ms below saved ${saved.timeoutMs}ms deadline`);
  }
  await due('short','Healthy');mode='cycle';await due('cycle','Failing');
  const stopped=traffic(),failedHistory=await history(),failedIncidents=await read(`/api/monitors/${id}/incidents`);
  assert.equal(failedIncidents.length,1);assert.equal(failedIncidents[0].recovery,null);
  const quiet=async()=>{
   await sleep(saved.timeoutMs);
   assert.deepEqual(traffic(),stopped,'no target or canary requests restart after redirect refusal');
   assert.equal(open.size,0,'no target TCP socket remains after refusal');
   assert.deepEqual(await history(),failedHistory);
   const incidents=await read(`/api/monitors/${id}/incidents`);assert.equal(incidents.length,failedIncidents.length);
   for(let index=0;index<incidents.length;index++){
    const {durationMs,...current}=incidents[index],{durationMs:previousDuration,...previous}=failedIncidents[index];
    assert.ok(durationMs>=previousDuration,'an open incident continues to accrue visible elapsed time');
    assert.deepEqual(current,previous,'restart and quiet reads preserve every durable incident fact');
   }
   assert.equal((await current()).state.targetState,'Failing');
   assert.deepEqual(await read(`/api/monitors/${id}/revisions`),revisions);
  };
  await quiet();await worker.dispose();worker=undefined;await start();await quiet();
  console.log('PROBE NETWORK-001 acceptance-1 restart: receiver remains in cycle mode through two full saved-timeout quiet windows and persistent Worker restart -> zero extra connections or requests, no open sockets, identical failure history and incident');
  mode='short';await due('restored','Healthy');
  assert.equal(new Set(slots.map(slot=>slot.id)).size,3);
  const incidents=await read(`/api/monitors/${id}/incidents`);assert.equal(incidents.length,1);
  assert.equal(incidents[0].trigger.slotId,slots[1].id);assert.match(incidents[0].trigger.probes[0].reason,/redirect/);
  assert.equal(incidents[0].recovery.slotId,slots[2].id);assert.equal(incidents[0].recovery.incidentKey,incidents[0].trigger.incidentKey);
  assert.equal(bridgeError,undefined);
  console.log('PASS redirect-cycle exhaustion: bounded redirect target failure, verified receiver counts and ordered targets, quiescence through restart, ordinary due recovery and immutable earlier evidence');
  if(process.env.UPTIME_REDIRECT_RECEIPT)await writeFile(process.env.UPTIME_REDIRECT_RECEIPT,JSON.stringify({journey:'proveNetworkRedirectCycle',revision,savedTimeoutMs:saved.timeoutMs,wire,quietWindows:2,quietWindowMs:saved.timeoutMs,stopped,history:await history(),incidents,definition:saved},null,2)+'\n');
 }finally{
  await cleanup(async()=>{if(active){const ended=new Promise(resolve=>active.once('close',resolve));active.kill('SIGKILL');await ended}},[()=>close(control),()=>close(target),()=>close(canary)],()=>worker?.dispose(),()=>rm(directory,{recursive:true,force:true}));
 }
}
