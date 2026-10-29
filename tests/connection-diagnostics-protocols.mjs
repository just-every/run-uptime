import {protocolDiagnosticBrowser} from './failure-page-browser.mjs';
// More assertions in the consolidated protocol journey, through its real
// signed Worker/runner doors. Only DNS/socket routing and traceroute are edges.
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import {Resolver} from 'node:dns/promises';
import {certificates,listen,close} from './protocol-fixtures.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';

export async function protocolDiagnostics(f,setBlocked){
 const originalConnect=net.connect,originalTls=tls.connect,resolve4=Resolver.prototype.resolve4,resolve6=Resolver.prototype.resolve6;
 const services=[];let mode='timeout',connects=0,lookups=0;
 const silent=net.createServer(socket=>{socket.on('error',()=>{});services.push(socket)});
 const open=net.createServer(socket=>{socket.on('error',()=>{});services.push(socket);socket.end('READY\r\n')});
 const silentPort=await listen(silent),openPort=await listen(open);
 const reserved=net.createServer(),refusedPort=await listen(reserved);await close(reserved);
 const certs=await certificates(f.directory),ca=await readFile(certs.caPath),secure=tls.createServer(certs.expiring,socket=>socket.end());secure.on('tlsClientError',()=>{});
 const securePort=await listen(secure);
 const PUBLIC='93.184.216.34';
 net.connect=function(options,...args){
  if(![PUBLIC,'10.24.3.10'].includes(options?.host))return originalConnect.call(this,options,...args);
  connects++;
  if(mode==='timeout'){const socket=new net.Socket(),pending=setTimeout(()=>{},10000);socket.once('close',()=>clearTimeout(pending));return socket}
  return originalConnect.call(this,{...options,host:'127.0.0.1',port:mode==='refused'?refusedPort:openPort},...args);
 };
 tls.connect=function(options,...args){
  if(options?.host!==PUBLIC)return originalTls.call(this,options,...args);
  connects++;
  return originalTls.call(this,{...options,host:'127.0.0.1',port:mode==='timeout'?silentPort:mode==='refused'?refusedPort:securePort,ca},...args);
 };
 Resolver.prototype.resolve4=async function(host,...args){if(host!=='tls.protocol.test')return resolve4.call(this,host,...args);lookups++;return [PUBLIC]};
 Resolver.prototype.resolve6=async function(host,...args){if(host!=='tls.protocol.test')return resolve6.call(this,host,...args);return []};
 const third=(await f.request('/api/runners',{body:{networkLabel:'synthetic-uptime-3'}})).data;
 const monitors=[];
 const stateOf=async id=>{const {evaluatedAt,...state}=await f.state(id);return state};
 try{
  for(const type of ['tcp','tls']){
   const monitor=await f.monitor({name:'synthetic-uptime-'+(type==='tcp'?101:102),type,url:undefined,[type]:{host:type==='tls'?'tls.protocol.test':PUBLIC,port:4321},canary:true,runners:[f.first,f.second,third],timeoutMs:80,failureQuorum:1,intervalMs:5000});
   monitors.push(monitor);
   mode='timeout';setBlocked(false);const task=await f.claim(f.first),before=await stateOf(monitor.id),count=connects;
   const failed=await f.evidence(task),d=failed.failureSnapshot.diagnostics;
   assert.equal(connects,count+1,'diagnostics open no extra TCP/TLS connection');
   assert.equal(failed.outcome,'target_failure');assert.equal(failed.checks[0].assertion,'timeout');
   assert.equal(d.category,'timeout');assert.ok(d.phases.dnsMs>=0);assert.ok(d.phases.connectMs>=0);assert.equal(d.phases.totalMs,failed.durationMs);
   if(type==='tls')assert.ok(d.phases.tlsMs>=40);else assert.equal(d.phases.tlsMs,null);
   assert.equal(d.route.hops[1].lossPercent,100);assert.equal(d.route.hops[0].rttMs,1.25);
   assert.deepEqual(await stateOf(monitor.id),before,'collection alone changes no monitor or incident');
   const forged=structuredClone(failed);forged.failureSnapshot.diagnostics.route.reason='synthetic-uptime-99';
   assert.equal((await f.submit(f.first,task,[forged])).status,400);
   const oversized=structuredClone(failed);oversized.failureSnapshot.diagnostics.route.hops=Array.from({length:6},(_,i)=>({hop:i+1,address:PUBLIC,lossPercent:0,rttMs:1}));
   assert.equal((await f.submit(f.first,task,[oversized])).status,400);
   assert.deepEqual(await stateOf(monitor.id),before,'refused documents change no state');
   assert.equal((await f.submit(f.first,task,[failed])).status,200);
   mode='healthy';const peer=await f.claim(f.second),healthy=await f.evidence(peer);
   assert.equal(healthy.outcome,'pass');assert.equal(healthy.failureSnapshot,undefined);
   assert.equal((await f.submit(f.second,peer,[healthy])).status,200);
   mode='timeout';setBlocked(true);const blockedTask=await f.claim(third),blockedFailure=await f.evidence(blockedTask);
   assert.equal(blockedFailure.failureSnapshot.diagnostics.route.reason,'blocked');
   assert.equal((await f.submit(third,blockedTask,[blockedFailure])).status,200);
   const incident=(await f.request('/api/monitors/'+monitor.id+'/incidents')).data[0];
   const state=await stateOf(monitor.id),detail=(await f.request('/api/v1/incidents/'+incident.trigger.id)).data;
   assert.equal(state.targetState,'Failing');assert.equal(detail.machineState,'open');
   assert.deepEqual(detail.failureSnapshots.items.find(row=>row.probe==='local-a').snapshot.diagnostics,d);
   const report=await f.request('/api/incidents/'+incident.trigger.id+'/failure-report');
   assert.equal(report.status,200);assert.deepEqual(report.data.failureSnapshots.items.find(row=>row.probe==='local-a').snapshot.diagnostics,d);
   {const peers=report.data.failureSnapshots.items.find(row=>row.probe==='local-a').healthyPeers;assert.equal(peers.length,1);assert.equal(peers[0].probe,'local-b');assert.equal(peers[0].outcome,'pass');assert.deepEqual(peers[0].checks,healthy.checks)}
   assert.equal(detail.failureSnapshots.items.find(row=>row.probe==='local-c').snapshot.diagnostics.route.reason,'blocked');
   assert.deepEqual(await stateOf(monitor.id),state,'opening and exporting diagnostics changes no state');
   await f.pause(monitor);
   if(type==='tcp'&&process.env.UPTIME_PROTOCOL_DIAGNOSTIC_BROWSER==='1')await protocolDiagnosticBrowser(f,monitor);
   mode='refused';setBlocked(true);const refused=await f.monitor({name:'synthetic-uptime-'+(type==='tcp'?103:104),type,url:undefined,[type]:{host:PUBLIC,port:4321},runners:[f.first],canary:true,timeoutMs:1000,intervalMs:5000});
   const refusedTask=await f.claim(f.first),failure=await f.evidence(refusedTask);
   assert.equal(failure.outcome,'target_failure');assert.equal(failure.checks[0].assertion,'refused');
   assert.equal(failure.failureSnapshot.diagnostics.category,'connection');assert.equal(failure.failureSnapshot.diagnostics.route.reason,'blocked');
   assert.equal((await f.submit(f.first,refusedTask,[failure])).status,200);
   const erased=await f.request('/api/monitors/'+refused.id+'/erase',{body:{name:refused.definition.name}});
   assert.equal(erased.status,200);assert.equal(erased.data.receipt.counts.failure_snapshots,1);
  }
  assert.equal((await f.request('/api/runner/enroll',{runner:f.first,signed:true,body:{version:1,capabilities:{browser:false,privateNetwork:true,capacity:1,version:'uptime-node/0.1.0'}}})).status,200);
  mode='refused';const privateMonitor=await f.monitor({name:'synthetic-uptime-301',type:'tcp',url:undefined,network:'private',privateGrantRef:'synthetic-uptime-301',tcp:{host:'10.24.3.10',port:4321},runners:[f.first],canary:true,timeoutMs:1000});
  const privateTask=await f.claim(f.first),grantDirectory=join(f.directory,'diagnostic-grants');await mkdir(grantDirectory,{mode:0o700});
  await writeFile(join(grantDirectory,'synthetic-uptime-301.json'),JSON.stringify({runnerId:f.first.runnerId,monitorId:privateMonitor.id,hosts:['10.24.3.10'],cidrs:['10.24.3.10/32'],ports:[4321],expiresAt:Date.now()+60000}),{mode:0o600});
  const privateEvidence={...await executeTaskProbe(privateTask,privateTask.probes[0],{runnerId:f.first.runnerId,controlOrigin:f.origin,privateGrantDirectory:grantDirectory}),attempt:0};
  const {tcp,...canaryDefinition}=privateTask.definition,canaryTask={...privateTask,definition:{...canaryDefinition,type:'http',network:'public',privateGrantRef:undefined,url:privateTask.definition.assignments['local-a'].canaryUrl,method:'GET',assertions:{status:200}}};
  privateEvidence.canary={...await executeTaskProbe(canaryTask,'local-a',{statusOnly:true}),attempt:0};
  assert.equal(privateEvidence.outcome,'target_failure');assert.equal(privateEvidence.failureSnapshot.diagnostics.route.reason,'private-network');
  assert.equal((await f.submit(f.first,privateTask,[privateEvidence])).status,200);
  const privateErased=await f.request('/api/monitors/'+privateMonitor.id+'/erase',{body:{name:privateMonitor.definition.name}});
  assert.equal(privateErased.status,200);assert.equal(privateErased.data.receipt.counts.failure_snapshots,1);
  assert.ok(lookups>0);
  return monitors;
 }finally{
  net.connect=originalConnect;tls.connect=originalTls;Resolver.prototype.resolve4=resolve4;Resolver.prototype.resolve6=resolve6;
  for(const socket of services)socket.destroy();
  await Promise.all([close(silent),close(open),close(secure)]);
 }
}
