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

const exec=promisify(execFile),hostname='hostname.sanity.test';
async function certificates(directory){
 const openssl=(...args)=>exec('openssl',args,{cwd:directory});
 await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','2','-subj','/CN=synthetic-uptime-160-ca','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign');
 const ca=new X509Certificate(await readFile(join(directory,'ca.pem'))),result={caPath:join(directory,'ca.pem'),ca:ca.toString()};
 for(const [name,sans] of [['matching',[hostname,'canary.'+hostname,'localhost']],['wrong',['wrong.sanity.test']]]){
  await writeFile(join(directory,name+'.ext'),`basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${sans.map(host=>'DNS:'+host).join(',')}\n`);
  await openssl('req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN=synthetic-uptime-160-'+name);
  await openssl('x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out',name+'.pem','-days','1','-extfile',name+'.ext');
  await openssl('verify','-CAfile','ca.pem','-purpose','sslserver',name+'.pem');
  const cert=await readFile(join(directory,name+'.pem'),'utf8'),x509=new X509Certificate(cert);
  assert.equal(x509.verify(ca.publicKey),true,'each server certificate has the independently generated CA signature');
  assert.ok(Date.parse(x509.validFrom)<=Date.now()&&Date.parse(x509.validTo)>Date.now());
  assert.equal(x509.checkHost(hostname),name==='matching'?hostname:undefined);
  assert.equal(x509.subjectAltName,sans.map(host=>'DNS:'+host).join(', '));
  result[name]={cert,key:await readFile(join(directory,name+'.key'),'utf8')};
 }
 await openssl('verify','-CAfile','ca.pem','-purpose','sslserver','-verify_hostname',hostname,'matching.pem');
 await assert.rejects(openssl('verify','-CAfile','ca.pem','-purpose','sslserver','-verify_hostname',hostname,'wrong.pem'),error=>error.code!==0&&/hostname mismatch/i.test(error.stderr));
 return result;
}

// A differential public HTTPS journey: owner -> real signed runner -> emitted
// Worker -> history. Only the served certificate changes between due checks.
export async function proveNetworkTlsHostname(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-hostname-'));
 const key='synthetic-uptime-160-installation-runner-key';
 const requests=[],connections=[],handshakes=[],canaryRequests=[],completions=[],claims=[];
 let worker,db,control,target,canary,active,bridgeError,origin,cookie='';
 try{
  const certs=await certificates(directory);
  target=https.createServer(certs.matching,(req,res)=>{requests.push({host:req.headers.host,sni:req.socket.servername,method:req.method,path:req.url});res.end('synthetic-uptime-160')});
  target.on('connection',()=>connections.push(Date.now()));
  target.on('secureConnection',socket=>handshakes.push(socket.servername));
  target.on('tlsClientError',()=>{});
  const targetPort=await listen(target);
  canary=https.createServer(certs.matching,(req,res)=>{canaryRequests.push({host:req.headers.host,sni:req.socket.servername,path:req.url});res.end('synthetic-uptime-160-canary')});
  const canaryPort=await listen(canary);
  control=https.createServer(certs.matching,async(req,res)=>{
   try{
    let body='';for await(const chunk of req)body+=chunk;
    if(['/api/runner/enroll','/api/runner/results'].includes(req.url)){
     const purpose=req.url==='/api/runner/enroll'?'runner-enrolment.':'';
     assert.equal(req.headers['x-runner-signature'],createHmac('sha256',key).update(`${req.headers['x-sent-at']}.${purpose}${body}`).digest('hex'),'actual production runner signs the exact submitted bytes');
    }
    const response=await worker.dispatchFetch('http://localhost/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+req.url,method:req.method,headers:req.headers,...(body?{body}:{})})});
    const text=await response.text();
    if(req.url==='/api/runner/results')completions.push({body:JSON.parse(body),status:response.status});
    if(req.url==='/api/runner/claim')claims.push(JSON.parse(text).task);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(text);
   }catch(error){bridgeError=error;res.writeHead(500);res.end('Emitted Worker request failed')}
  });
  origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-160-mail',UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key};
  worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB');
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,certs.ca,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.1',...headers}});
  const read=async path=>{const response=await api(path);assert.equal(response.status,200);return response.data};
  async function runner(){
   active=spawn(process.execPath,['--import',resolve('tests/network-tls-hostname-routing.mjs'),resolve('tests/signed-runner-child.mjs')],{cwd:directory,env:{...process.env,NODE_EXTRA_CA_CERTS:certs.caPath,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,UPTIME_RUNNER_BROWSER:'off',UPTIME_FLOW_DIR:join(directory,'flows'),HOSTNAME_TARGET_PORT:String(targetPort),HOSTNAME_CANARY_PORT:String(canaryPort)},stdio:['ignore','pipe','pipe']});
   const child=active;let bytes=0;for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>bytes+=chunk.length);
   const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}))});
   const timer=setTimeout(()=>child.kill('SIGKILL'),35000);
   try{const result=await ended;active=undefined;if(bridgeError)throw bridgeError;assert.equal(result.signal,null);assert.equal(result.code,0,`signed runner failed (${bytes} private diagnostic bytes)`)}finally{clearTimeout(timer)}
  }
  await runner();assert.deepEqual(claims,[null],'ordinary signed enrollment initially finds no work');
  const registration=await db.prepare('SELECT runner_id FROM runners WHERE legacy_key=1').first();assert.ok(registration);
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'TLS hostname owner'});assert.equal(boot.status,303,JSON.stringify(boot.data));cookie=boot.headers['set-cookie'][0].split(';')[0];
  await completeApiSecondFactor(origin,cookie,api);
  const created=await api('/api/monitors',{name:'Verified public HTTPS hostname',type:'http',network:'public',url:`https://${hostname}/health`,assignments:{'local-a':{runnerId:registration.runner_id,canaryUrl:`https://canary.${hostname}/canary`}},intervalMs:5000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1,assertions:{status:200,bodyIncludes:'synthetic-uptime-160'}});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const {id,revision,definition:saved}=created.data;
  assert.equal(saved.tlsTrust,undefined,'ordinary verified TLS has no saved exception');
  assert.equal(saved.request,undefined,'the public check uses no request credential');
  const revisions=await read(`/api/monitors/${id}/revisions`),retained=new Map(),slots=[];
  const current=async()=>{const monitor=(await read('/api/overview')).monitors.find(row=>row.id===id);assert.equal(monitor.revision,revision);assert.deepEqual(monitor.definition,saved);return monitor};
  for(const [phase,certificate,expected] of [['matching',certs.matching,'Healthy'],['wrong-name',certs.wrong,'Failing'],['restored',certs.matching,'Healthy']]){
   target.setSecureContext(certificate);
   const before=await current();await sleep(Math.max(0,before.nextDue-Date.now()+20));
   const counts={connections:connections.length,handshakes:handshakes.length,requests:requests.length,canaries:canaryRequests.length,completions:completions.length};
   await runner();
   assert.equal(completions.length,counts.completions+1);
   const completion=completions.at(-1);assert.equal(completion.status,200,'emitted Worker accepts the real signed result');
   const task=claims.at(-1);assert.equal(task.monitorId,id);assert.deepEqual(task.definition,saved);
   const history=await read(`/api/monitors/${id}/history`),slot=history.find(row=>row.id===task.id);
   assert.ok(slot);assert.equal(slot.status,'complete');assert.equal(slot.manual,0);assert.equal(slot.revision,revision);assert.deepEqual(slot.definition,saved);
   assert.equal(slot.observations.length,1);const [observation]=slot.observations;
   assert.ok(observation.startedAt>=slot.due_at,'the genuine scheduled deadline precedes execution');
   assert.equal(observation.probe,'local-a');assert.deepEqual(observation,completion.body.attempts[0],'owner history preserves the actual signed observation');
   assert.equal(observation.canary.outcome,'pass');assert.equal(observation.canary.status,200);
   assert.equal(canaryRequests.length,counts.canaries+1,'a separately trusted canary remains available in every phase');
   assert.equal(connections.length,counts.connections+1,'certificate verification requires one target TLS connection, including the refusal');
   if(phase==='wrong-name'){
    assert.equal(requests.length,counts.requests,'hostname mismatch sends no HTTP application request');
    assert.equal(handshakes.length,counts.handshakes,'the unauthorized TLS handshake never becomes an authenticated connection');
    assert.equal(observation.outcome,'target_failure');assert.equal(observation.status,undefined);assert.equal(observation.bytes,undefined);
    assert.equal(observation.tlsTrust,undefined,'no bypassed-error evidence or trust exception is invented');
    assert.equal(observation.checks.length,1);assert.equal(observation.checks[0].assertion,'tls');assert.equal(observation.checks[0].pass,false);
    assert.match(observation.checks[0].reason,/TLS certificate verification failed \(ERR_TLS_CERT_ALTNAME_INVALID\)/);
   }else{
    assert.equal(requests.length,counts.requests+1);assert.equal(handshakes.length,counts.handshakes+1);
    assert.deepEqual(requests.at(-1),{host:hostname,sni:hostname,method:'GET',path:'/health'});
    assert.equal(observation.outcome,'pass');assert.equal(observation.status,200);assert.ok(observation.checks.every(check=>check.pass));
   }
   const state=(await current()).state;
   assert.equal(state.state,expected);assert.equal(state.targetState,expected);assert.equal(state.denominator,1);assert.equal(state.unknown,0);assert.equal(state.coverageState,'Complete');
   assert.deepEqual(await read(`/api/monitors/${id}/revisions`),revisions);
   for(const [oldId,old] of retained)assert.deepEqual(history.find(row=>row.id===oldId),old,'later failure and recovery never rewrite earlier observations');
   retained.set(slot.id,structuredClone(slot));slots.push(slot);assert.equal(history.length,slots.length);
   console.info(`PROBE NETWORK-001 acceptance-1 ${phase}: owner-created unchanged public HTTPS monitor -> signed ${observation.outcome}, ${expected}, one TLS connection, ${phase==='wrong-name'?'zero':'one'} HTTP request, fixed coverage and retained history`);
  }
  assert.equal(new Set(slots.map(slot=>slot.id)).size,3);
  const incidents=await read(`/api/monitors/${id}/incidents`);assert.equal(incidents.length,1);
  assert.equal(incidents[0].trigger.slotId,slots[1].id);assert.match(incidents[0].trigger.probes[0].reason,/ERR_TLS_CERT_ALTNAME_INVALID/);
  assert.equal(incidents[0].recovery.slotId,slots[2].id);assert.equal(incidents[0].recovery.incidentKey,incidents[0].trigger.incidentKey);
  assert.equal(bridgeError,undefined);
 }finally{
  await cleanup(async()=>{if(active){const ended=new Promise(resolve=>active.once('close',resolve));active.kill('SIGKILL');await ended}},[()=>close(control),()=>close(target),()=>close(canary)],()=>worker?.dispose(),()=>rm(directory,{recursive:true,force:true}));
 }
}
