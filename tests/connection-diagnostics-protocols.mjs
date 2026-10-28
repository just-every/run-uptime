// More assertions in the existing DIAG-001 registration, through its real
// signed Worker/runner doors. Only DNS/socket routing and traceroute are edges.
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import {Resolver} from 'node:dns/promises';
import {certificates,listen,close} from './protocol-fixtures.mjs';
import {readFile} from 'node:fs/promises';

export async function protocolDiagnostics(f,setBlocked){
 const originalConnect=net.connect,originalTls=tls.connect,resolve4=Resolver.prototype.resolve4,resolve6=Resolver.prototype.resolve6;
 const services=[];let mode='timeout',connects=0,lookups=0;
 const silent=net.createServer(socket=>{socket.on('error',()=>{});services.push(socket)});
 const open=net.createServer(socket=>{socket.on('error',()=>{});services.push(socket);socket.end('READY\r\n')});
 const silentPort=await listen(silent),openPort=await listen(open);
 const reserved=net.createServer(),refusedPort=await listen(reserved);await close(reserved);
 const certs=await certificates(f.directory),secure=tls.createServer(certs.expiring,socket=>socket.end());secure.on('tlsClientError',()=>{});
 const securePort=await listen(secure);
 const PUBLIC='93.184.216.34';
 net.connect=function(options,...args){
  if(options?.host!==PUBLIC)return originalConnect.call(this,options,...args);
  connects++;
  if(mode==='timeout'){const socket=new net.Socket(),pending=setTimeout(()=>{},10000);socket.once('close',()=>clearTimeout(pending));return socket}
  return originalConnect.call(this,{...options,host:'127.0.0.1',port:mode==='refused'?refusedPort:openPort},...args);
 };
 tls.connect=function(options,...args){
  if(options?.host!==PUBLIC)return originalTls.call(this,options,...args);
  connects++;
  return originalTls.call(this,{...options,host:'127.0.0.1',port:mode==='timeout'?silentPort:mode==='refused'?refusedPort:securePort},...args);
 };
 Resolver.prototype.resolve4=async function(host,...args){if(host!=='tls.protocol.test')return resolve4.call(this,host,...args);lookups++;return [PUBLIC]};
 Resolver.prototype.resolve6=async function(host,...args){if(host!=='tls.protocol.test')return resolve6.call(this,host,...args);return []};
 try{
  for(const type of ['tcp','tls']){
   const monitor=await f.monitor({name:'synthetic-uptime-'+type,type,[type]:{host:type==='tls'?'tls.protocol.test':PUBLIC,port:4321},canary:true,timeoutMs:80,failureQuorum:1,intervalMs:5000});
   mode='timeout';setBlocked(false);const task=await f.claim(f.first),before=await f.state(monitor.id),count=connects;
   const failed=await f.evidence(task),d=failed.failureSnapshot.diagnostics;
   assert.equal(connects,count+1,'diagnostics open no extra TCP/TLS connection');
   assert.equal(failed.outcome,'target_failure');assert.equal(failed.checks[0].assertion,'timeout');
   assert.equal(d.category,'timeout');assert.ok(d.phases.dnsMs>=0);assert.ok(d.phases.connectMs>=0);assert.equal(d.phases.totalMs,failed.durationMs);
   if(type==='tls')assert.ok(d.phases.tlsMs>=40);else assert.equal(d.phases.tlsMs,null);
   assert.equal(d.route.hops[1].lossPercent,100);assert.equal(d.route.hops[0].rttMs,1.25);
   assert.deepEqual(await f.state(monitor.id),before,'collection alone changes no monitor or incident');
   const forged=structuredClone(failed);forged.failureSnapshot.diagnostics.route.reason='synthetic-uptime-secret';
   assert.equal((await f.submit(f.first,task,[forged])).status,400);
   const oversized=structuredClone(failed);oversized.failureSnapshot.diagnostics.route.hops=Array.from({length:6},(_,i)=>({hop:i+1,address:PUBLIC,lossPercent:0,rttMs:1}));
   assert.equal((await f.submit(f.first,task,[oversized])).status,400);
   assert.deepEqual(await f.state(monitor.id),before,'refused documents change no state');
   assert.equal((await f.submit(f.first,task,[failed])).status,200);
   mode='healthy';const peer=await f.claim(f.second),healthy=await f.evidence(peer);
   // TCP provides a healthy peer. TLS's native certificate trust remains real;
   // the certificate fixture is not trusted by this runner, so it fails TLS.
   if(type==='tcp'){assert.equal(healthy.outcome,'pass');assert.equal(healthy.failureSnapshot,undefined)}
   else{assert.equal(healthy.outcome,'target_failure');assert.equal(healthy.failureSnapshot.diagnostics.category,'tls')}
   assert.equal((await f.submit(f.second,peer,[healthy])).status,200);
   const incident=(await f.request('/api/monitors/'+monitor.id+'/incidents')).data[0];
   const state=await f.state(monitor.id),detail=(await f.request('/api/v1/incidents/'+incident.trigger.id)).data;
   assert.equal(state.targetState,'Failing');assert.equal(detail.machineState,'open');
   assert.deepEqual(detail.failureSnapshots.items.find(row=>row.probe==='local-a').snapshot.diagnostics,d);
   const report=await f.request('/api/incidents/'+incident.trigger.id+'/failure-report');
   assert.equal(report.status,200);assert.deepEqual(report.data.failureSnapshots.items.find(row=>row.probe==='local-a').snapshot.diagnostics,d);
   assert.ok(report.data.trigger.probes.some(probe=>probe.name==='local-b'&&probe.outcome===(type==='tcp'?'pass':'target_failure')));
   assert.deepEqual(await f.state(monitor.id),state,'opening and exporting diagnostics changes no state');
   await f.pause(monitor);
   mode='refused';setBlocked(true);const refused=await f.monitor({name:'synthetic-uptime-refused-'+type,type,[type]:{host:PUBLIC,port:4321},runners:[f.first],canary:true,timeoutMs:1000,intervalMs:5000});
   const refusedTask=await f.claim(f.first),failure=await f.evidence(refusedTask);
   assert.equal(failure.outcome,'target_failure');assert.equal(failure.checks[0].assertion,'refused');
   assert.equal(failure.failureSnapshot.diagnostics.category,'connection');assert.equal(failure.failureSnapshot.diagnostics.route.reason,'blocked');
   assert.equal((await f.submit(f.first,refusedTask,[failure])).status,200);
   const erased=await f.request('/api/monitors/'+refused.id+'/erase',{body:{name:refused.definition.name}});
   assert.equal(erased.status,200);assert.equal(erased.data.receipt.counts.failure_snapshots,1);
  }
  assert.ok(lookups>0);
 }finally{
  net.connect=originalConnect;tls.connect=originalTls;Resolver.prototype.resolve4=resolve4;Resolver.prototype.resolve6=resolve6;
  for(const socket of services)socket.destroy();
  await Promise.all([close(silent),close(open),close(secure)]);
 }
}
