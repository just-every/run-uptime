// DIAG-001: real failed transport -> signed completion -> private incident diagnostics.
import {protocolDiagnostics} from './connection-diagnostics-protocols.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fixture} from './resilience/support.mjs';
import {diagnosticBrowser} from './connection-diagnostics-browser.mjs';

test('connection failures retain bounded diagnostic phases and unavailable routes without changing verdicts',{timeout:120000},async()=>{
 const original=childProcess.spawn,calls=[];let blocked=false;
 // Only the network utility edge is substituted. HTTP, signing, Worker and D1 are real.
 childProcess.spawn=function(file,args,options){if(file==='/usr/sbin/traceroute'||file==='traceroute'){
  calls.push({file,args});assert.equal(args.at(-1),'93.184.216.34','route uses the original numeric transport pin');assert.ok(args.includes('-n'));assert.equal(args[args.indexOf('-m')+1],'5');assert.equal(args[args.indexOf('-q')+1],'1');
  return original.call(this,process.execPath,['-e',blocked?'process.stderr.write("Operation not permitted\\n");process.exitCode=1':'process.stdout.write("1  192.0.2.1  1.25 ms\\n2  *\\n3  93.184.216.34  3.5 ms\\n")'],options)
 }return original.call(this,file,args,options)};syncBuiltinESMExports();
 let f,receiving;
 try{
  f=await fixture();f.modes.delayMs=200;
  const monitor=await f.monitor({name:'Checkout network',canary:true,timeoutMs:50}),task=await f.claim(f.first),observation=await f.evidence(task);
  assert.equal(observation.outcome,'target_failure');assert.equal(observation.checks[0].assertion,'timeout');assert.ok(observation.failureSnapshot);
  const d=observation.failureSnapshot.diagnostics;assert.equal(d.category,'timeout');assert.equal(d.route.hops.length,3);assert.equal(d.route.hops[1].lossPercent,100);assert.ok(d.phases.connectMs>=0);assert.equal(d.phases.tlsMs,null);assert.ok(d.phases.totalMs>=40);
  assert.equal((await f.submit(f.first,task,[observation])).status,200);
  f.modes.delayMs=0;f.modes.target=200;const other=await f.claim(f.second),healthy=await f.evidence(other);assert.equal(healthy.outcome,'pass');assert.equal(healthy.failureSnapshot,undefined);assert.equal((await f.submit(f.second,other,[healthy])).status,200);
  assert.equal((await f.state(monitor.id)).targetState,'Failing','diagnostics and a healthy peer do not clear a confirmed timeout');
  const incident=(await f.request(`/api/monitors/${monitor.id}/incidents`)).data[0];const detail=(await f.request(`/api/v1/incidents/${incident.trigger.id}`)).data;assert.deepEqual(detail.failureSnapshots.items[0].snapshot.diagnostics,d);
  assert.equal((await fetch(f.origin+`/api/incidents/${incident.trigger.id}/failure-snapshots`)).status,401);
  const before=(await f.DB.prepare('SELECT state FROM monitors WHERE id=?').bind(monitor.id).first()).state;
  if(process.env.UPTIME_DIAGNOSTIC_BROWSER==='1')await diagnosticBrowser(f,monitor);
  assert.equal((await f.DB.prepare('SELECT state FROM monitors WHERE id=?').bind(monitor.id).first()).state,before);
  const archive=(await f.request('/api/archive')).data;receiving=await fixture();assert.equal((await receiving.request('/api/restore',{body:{archive}})).status,200);assert.deepEqual((await receiving.request(`/api/monitors/${monitor.id}/failure-snapshots`)).data.items[0].snapshot.diagnostics,d);await receiving.close();receiving=null;
  await f.pause(monitor);
  // A refused socket has no response; blocked diagnostics remain explicit.
  blocked=true;const refused=await f.monitor({name:'Unreachable backend',url:`http://93.184.216.34:1/`,runners:[f.first],canary:true,timeoutMs:1000});
  const refusedTask=await f.claim(f.first),failure=await f.evidence(refusedTask);assert.equal(failure.checks[0].assertion,'connection');assert.equal(failure.failureSnapshot.diagnostics.route.reason,'blocked');assert.equal((await f.submit(f.first,refusedTask,[failure])).status,200);
  const forged=structuredClone(failure);forged.id+='bad';forged.failureSnapshot.diagnostics.route.reason='arbitrary secret text';assert.equal((await f.submit(f.first,refusedTask,[forged])).status,400);
  const erased=await f.request(`/api/monitors/${refused.id}/erase`,{body:{name:refused.definition.name}});assert.equal(erased.status,200);assert.equal(erased.data.receipt.counts.failure_snapshots,1);assert.equal(calls.length,2);
  const protocols=await protocolDiagnostics(f,value=>blocked=value);assert.equal(calls.length,8,'one bounded route per failed transport; healthy peers add no traffic');
  const protocolArchive=(await f.request('/api/archive')).data;receiving=await fixture();
  const restored=await receiving.request('/api/restore',{body:{archive:protocolArchive}});assert.equal(restored.status,200,JSON.stringify(restored.data));
  for(const protocol of protocols){
   const retained=(await receiving.request('/api/monitors/'+protocol.id+'/failure-snapshots')).data;
   assert.equal(retained.items.length,2);assert.equal(retained.items.filter(row=>row.snapshot.diagnostics.route.reason==='blocked').length,1);
   assert.ok(retained.items.every(row=>row.healthyPeers.length===1),'healthy peer comparison survives inactive restore');
   const erased=await receiving.request('/api/monitors/'+protocol.id+'/erase',{body:{name:protocol.definition.name}});
   assert.equal(erased.status,200);assert.equal(erased.data.receipt.counts.failure_snapshots,2);
   assert.equal((await receiving.DB.prepare('SELECT COUNT(*) n FROM failure_snapshots WHERE monitor_id=?').bind(protocol.id).first()).n,0);
  }
 }finally{childProcess.spawn=original;syncBuiltinESMExports();await receiving?.close();await f?.close()}
});
