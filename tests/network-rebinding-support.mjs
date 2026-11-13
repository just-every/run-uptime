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

const exec=promisify(execFile),hostname='rebinding.sanity.test';
const allowed='93.184.216.34',forbidden='10.0.0.1';
async function certificates(directory){
 const openssl=(...args)=>exec('openssl',args,{cwd:directory});
 await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','2','-subj','/CN=synthetic-uptime-171-ca','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign');
 await writeFile(join(directory,'server.ext'),`basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:${hostname},DNS:canary.${hostname},DNS:localhost\n`);
 await openssl('req','-new','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr','-subj','/CN=synthetic-uptime-171');
 await openssl('x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','server.pem','-days','1','-extfile','server.ext');
 for(const host of [hostname,'canary.'+hostname,'localhost'])await openssl('verify','-CAfile','ca.pem','-purpose','sslserver','-verify_hostname',host,'server.pem');
 const ca=await readFile(join(directory,'ca.pem'),'utf8'),cert=await readFile(join(directory,'server.pem'),'utf8'),x509=new X509Certificate(cert);
 assert.equal(x509.verify(new X509Certificate(ca).publicKey),true);assert.equal(x509.checkHost(hostname),hostname);
 return {ca,caPath:join(directory,'ca.pem'),server:{cert,key:await readFile(join(directory,'server.key'),'utf8')}};
}

// Owner API -> scheduled production runner -> signed intake -> retained history.
export async function proveNetworkRebinding(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-rebinding-'));
 const key='synthetic-uptime-171-installation-runner-key',wire=[];
 const received={allowed:{connections:[],handshakes:[],requests:[]},forbidden:{connections:[],handshakes:[],requests:[]},canary:{connections:[],handshakes:[],requests:[]}};
 const completions=[],claims=[],servers=[],open=new Set();
 let worker,db,active,bridgeError,origin,cookie='';
 try{
  const certs=await certificates(directory);
  async function endpoint(name){
   const rows=received[name];
   const server=https.createServer(certs.server,(req,res)=>{rows.requests.push({host:req.headers.host,sni:req.socket.servername,method:req.method,path:req.url});res.end('synthetic-uptime-171')});
   server.on('connection',socket=>{rows.connections.push(Date.now());open.add(socket);socket.once('close',()=>open.delete(socket))});
   server.on('secureConnection',socket=>rows.handshakes.push(socket.servername));server.on('tlsClientError',()=>{});
   servers.push(server);return listen(server);
  }
  const allowedPort=await endpoint('allowed'),forbiddenPort=await endpoint('forbidden'),canaryPort=await endpoint('canary');
  // Qualify B's independent counters before the journey, then start its zero
  // baseline. All simulated addresses map only to these owned loopback ports.
  const qualified=await request(`https://localhost:${forbiddenPort}`,certs.ca,'/counter-canary',{method:'GET'});
  assert.equal(qualified.status,200);assert.equal(received.forbidden.connections.length,1);assert.equal(received.forbidden.handshakes.length,1);assert.equal(received.forbidden.requests.length,1);
  for(const rows of Object.values(received.forbidden))rows.length=0;
  const control=https.createServer(certs.server,async(req,res)=>{
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
  servers.push(control);origin=`https://localhost:${await listen(control)}`;
  const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-171-mail',UPTIME_ORIGIN:origin,UPTIME_RUNNER_KEY:key};
  const start=async()=>{worker=await emittedRunnerWorker(directory,bindings);db=await worker.getD1Database('DB')};
  await start();
  for(const file of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  console.log('DNS rebinding fixture: isolated emitted Worker migrated');
  const api=(path,body,headers={},method=body===undefined?'GET':'POST')=>request(origin,certs.ca,path,{method,body,headers:{origin,cookie,'cf-connecting-ip':'192.0.2.171',...headers}});
  const read=async path=>{const response=await api(path);assert.equal(response.status,200);return response.data};
  async function runner(phase){
   const journal=join(directory,'edge.jsonl');await writeFile(journal,'');
   active=spawn(process.execPath,['--import',resolve('tests/network-rebinding-routing.mjs'),resolve('tests/signed-runner-child.mjs')],{cwd:directory,env:{...process.env,NODE_EXTRA_CA_CERTS:certs.caPath,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,UPTIME_RUNNER_BROWSER:'off',UPTIME_FLOW_DIR:join(directory,'flows'),REBINDING_PHASE:phase,REBINDING_JOURNAL:journal,REBINDING_ALLOWED_PORT:String(allowedPort),REBINDING_FORBIDDEN_PORT:String(forbiddenPort),REBINDING_CANARY_PORT:String(canaryPort)},stdio:['ignore','pipe','pipe']});
   const child=active;let bytes=0;for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>bytes+=chunk.length);
   const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}))});
   const timer=setTimeout(()=>child.kill('SIGKILL'),35000);
   try{
    const result=await ended;active=undefined;if(bridgeError)throw bridgeError;
    assert.equal(result.signal,null);assert.equal(result.code,0,`signed runner failed (${bytes} private diagnostic bytes), intake ${completions.at(-1)?.status}: ${completions.at(-1)?.response?.error}`);
    return (await readFile(journal,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
   }finally{clearTimeout(timer)}
  }
  await runner('enroll');assert.deepEqual(claims,[null]);
  const registration=await db.prepare('SELECT runner_id FROM runners WHERE legacy_key=1').first();assert.ok(registration);
  const boot=await api('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'DNS rebinding owner'});assert.equal(boot.status,303,JSON.stringify(boot.data));cookie=boot.headers['set-cookie'][0].split(';')[0];
  await completeApiSecondFactor(origin,cookie,api);
  const created=await api('/api/monitors',{name:'Pinned public HTTPS through DNS rebinding',type:'http',network:'public',url:`https://${hostname}/health`,assignments:{'local-a':{runnerId:registration.runner_id,canaryUrl:`https://canary.${hostname}/canary`}},intervalMs:5000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1,assertions:{status:200,bodyIncludes:'synthetic-uptime-171'}});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const {id,revision,definition:saved}=created.data;
  assert.equal(saved.tlsTrust,undefined);assert.equal(saved.request,undefined);
  const revisions=await read(`/api/monitors/${id}/revisions`),retained=new Map(),slots=[];
  const history=()=>read(`/api/monitors/${id}/history`);
  const current=async()=>{const monitor=(await read('/api/overview')).monitors.find(row=>row.id===id);assert.equal(monitor.revision,revision);assert.deepEqual(monitor.definition,saved);return monitor};
  const counts=()=>Object.fromEntries(Object.entries(received).map(([name,rows])=>[name,Object.fromEntries(Object.entries(rows).map(([kind,values])=>[kind,values.length]))]));
  async function due(phase){
   const before=await current();await sleep(Math.max(0,before.nextDue-Date.now()+30));
   const baseline=counts(),completed=completions.length,events=await runner(phase);
   assert.equal(completions.length,completed+1);const completion=completions.at(-1),task=claims.at(-1);
   assert.equal(completion.status,200,'signed network evidence passes the unmodified native intake');assert.equal(task.monitorId,id);assert.deepEqual(task.definition,saved);
   const rows=await history(),slot=rows.find(row=>row.id===task.id);
   assert.ok(slot);assert.equal(slot.manual,0);assert.equal(slot.status,'complete');assert.equal(slot.revision,revision);assert.deepEqual(slot.definition,saved);
   assert.ok(slot.due_at>=before.nextDue);assert.equal(slot.observations.length,1);const [observation]=slot.observations;
   assert.ok(observation.startedAt>=slot.due_at);assert.equal(observation.probe,'local-a');assert.deepEqual(observation,completion.body.attempts[0]);
   assert.equal(observation.canary.outcome,'pass');assert.equal(observation.canary.status,200);
   assert.equal(received.canary.requests.length,baseline.canary.requests+1);assert.deepEqual(received.canary.requests.at(-1),{host:'canary.'+hostname,sni:'canary.'+hostname,method:'GET',path:'/canary'});
   assert.deepEqual(received.forbidden,{connections:[],handshakes:[],requests:[]},'B receives no destination socket, TLS handshake or HTTP request');
   const dns=events.filter(row=>row.event==='dns'&&!row.witness),dispatch=events.filter(row=>row.event==='dispatch'&&!row.canary);
   assert.deepEqual(dns.map(row=>row.answer),[phase==='forbidden'?forbidden:allowed]);
   const state=(await current()).state;
   assert.equal(state.denominator,1);assert.equal(state.fails,0);assert.ok(!state.confirmedFailure);
   if(phase==='forbidden'){
    assert.deepEqual(dispatch,[]);assert.equal(received.allowed.connections.length,baseline.allowed.connections);assert.equal(received.allowed.requests.length,baseline.allowed.requests);
    assert.equal(observation.outcome,'runner_error');assert.equal(observation.status,undefined);assert.equal(observation.bytes,undefined);
    assert.deepEqual(observation.checks,[{assertion:'network',pass:false,reason:'Probe network check failed'}]);
    assert.equal(state.state,'Unknown');assert.equal(state.targetState,'Unknown');assert.equal(state.coverageState,'Incomplete');assert.equal(state.unknown,1);
    assert.ok(state.regions.every(region=>region.state==='Unknown'&&region.observationId===observation.id));
   }else{
    assert.equal(dispatch.length,1);const sent=dispatch[0];
    assert.equal(sent.destination,allowed);assert.equal(sent.numeric,allowed);assert.equal(sent.host,hostname);assert.equal(sent.sni,hostname);assert.equal(sent.verified,true);assert.equal(sent.identityCheck,true);assert.equal(sent.trustOverride,false);
    assert.ok(dns[0].sequence<sent.sequence);
    const verified=events.filter(row=>row.event==='tls-verified'&&!row.canary);assert.equal(verified.length,1);assert.equal(verified[0].authorized,true);assert.equal(verified[0].authorizationError,null);assert.equal(verified[0].destination,allowed);assert.equal(verified[0].remotePort,allowedPort);
    assert.equal(received.allowed.connections.length,baseline.allowed.connections+1);assert.equal(received.allowed.handshakes.length,baseline.allowed.handshakes+1);assert.equal(received.allowed.requests.length,baseline.allowed.requests+1);
    assert.deepEqual(received.allowed.requests.at(-1),{host:hostname,sni:hostname,method:'GET',path:'/health'});
    assert.equal(observation.outcome,'pass');assert.equal(observation.status,200);assert.ok(observation.checks.every(check=>check.pass));
    assert.equal(state.state,'Healthy');assert.equal(state.targetState,'Healthy');assert.equal(state.coverageState,'Complete');assert.equal(state.unknown,0);
    if(phase==='rebind'){
     const boundary=events.find(row=>row.event==='validated-dispatch-boundary'),changed=events.find(row=>row.event==='answer-changed'),witness=events.find(row=>row.event==='dns'&&row.witness);
     assert.equal(boundary.destination,allowed);assert.equal(changed.answer,forbidden);assert.equal(witness.answer,forbidden);assert.equal(sent.answer,forbidden);
     assert.ok(dns[0].sequence<boundary.sequence&&boundary.sequence<changed.sequence&&changed.sequence<witness.sequence&&witness.sequence<sent.sequence,'A validated, authority switched and independently read as B, then numeric A dispatched');
    }
   }
   assert.equal(observation.tlsTrust,undefined);
   assert.deepEqual(await read(`/api/monitors/${id}/incidents`),[],'no trigger or recovery is fabricated');assert.deepEqual((await read('/api/overview')).alerts,[]);
   assert.deepEqual(await read(`/api/monitors/${id}/revisions`),revisions);
   for(const [oldId,old] of retained)assert.deepEqual(rows.find(row=>row.id===oldId),old,'later checks preserve earlier signed history');
   retained.set(slot.id,structuredClone(slot));slots.push(slot);assert.equal(rows.length,slots.length);
   wire.push({phase,events,before:baseline,after:counts(),observation});
   console.log(`PROBE NETWORK-001 acceptance-1 ${phase}: signed ${observation.outcome}, ${state.targetState} with ${state.coverageState} coverage; A connections ${received.allowed.connections.length-baseline.allowed.connections}, B connections 0 and requests 0, passing canary, immutable history`);
  }
  await due('allowed');await due('rebind');await due('forbidden');
  const stopped=counts(),oldHistory=await history();
  await worker.dispose();worker=undefined;await start();
  assert.deepEqual(await history(),oldHistory,'persistent Worker restart preserves the complete old history');
  assert.equal((await current()).state.targetState,'Unknown');assert.equal((await current()).state.coverageState,'Incomplete');
  assert.deepEqual(await read(`/api/monitors/${id}/incidents`),[]);assert.deepEqual(counts(),stopped,'restart and owner reads do not connect to either destination');
  await due('restored');assert.equal(new Set(slots.map(slot=>slot.id)).size,4);
  assert.equal(bridgeError,undefined);
  console.log('PASS DNS rebinding: validated A survives changed B before connection with verified Host and SNI; next due B is refused without a destination socket; ordinary due A and old history survive restart');
  if(process.env.UPTIME_REBINDING_RECEIPT)await writeFile(process.env.UPTIME_REBINDING_RECEIPT,JSON.stringify({journey:'proveNetworkRebinding',revision,definition:saved,forbiddenCounterQualified:true,wire,history:await history(),incidents:await read(`/api/monitors/${id}/incidents`),restartPreserved:true},null,2)+'\n');
 }finally{
  await cleanup(async()=>{if(active){const ended=new Promise(resolve=>active.once('close',resolve));active.kill('SIGKILL');await ended}},servers.map(server=>()=>close(server)),()=>worker?.dispose(),()=>rm(directory,{recursive:true,force:true}));
 }
}
