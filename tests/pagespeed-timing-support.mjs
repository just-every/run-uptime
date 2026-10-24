import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './resilience/support.mjs';
import {timingNetwork} from './pagespeed-network-fixture.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';

export async function provePageSpeedTimings(){
 const f=await fixture();let network;
 try{
  assert.equal((await f.request('/api/runner/enroll',{runner:f.first,signed:true,body:{version:1,capabilities:{browser:true}}})).status,200);
  network=await timingNetwork(f.directory);const workspace=join(f.directory,'timing-browsers');await mkdir(workspace,{mode:0o700});
  async function measure(label,url,dns,tls,connect=0,firstByte=0){
   network.state.dns=dns;network.state.tls=tls;network.state.connect=connect;network.state.firstByte=firstByte;
   const monitor=await f.monitor({runners:[f.first],name:label,type:'pagespeed',network:'public',url,intervalMs:300000,timeoutMs:20000,pagespeed:{device:'desktop',budgets:{lcpMs:5000}}});
   const task=await f.claim(f.first);assert.equal(task.monitorId,monitor.id);
   const observation={...await executeTaskProbe(task,task.probes[0],{controlPort:Number(new URL(f.origin).port),flowWorkspace:workspace}),attempt:0};
   assert.equal(observation.outcome,'pass',JSON.stringify(observation.checks));
   const canaryUrl=task.definition.assignments[task.probes[0]].canaryUrl;
   if(canaryUrl)observation.canary={...await executeTaskProbe({...task,definition:{...task.definition,type:'http',url:canaryUrl,timeoutMs:5000,pagespeed:undefined,request:undefined,assertions:{status:200}}},task.probes[0],{controlPort:Number(new URL(f.origin).port),statusOnly:true}),attempt:0};
   const submitted=await f.submit(f.first,task,[observation]);assert.equal(submitted.status,200,JSON.stringify(submitted.data));
   const history=(await f.request(`/api/monitors/${monitor.id}/history`)).data,retained=history.find(slot=>slot.id===task.id);
   assert.equal(retained.manual,0);assert.deepEqual(retained.observations[0].pagespeed.timings,observation.pagespeed.timings);
   const report=(await f.request(`/api/monitors/${monitor.id}/pagespeed`)).data;
   assert.deepEqual(report.latest.evidence.timings,observation.pagespeed.timings);
   await f.pause(monitor);return observation.pagespeed.timings;
  }
  const base=await measure('synthetic-uptime-timing-base',network.https,20,30);
  assert.ok(base.dnsMs>0&&base.tlsMs>0,JSON.stringify(base));
  const delayedDns=await measure('synthetic-uptime-timing-dns',network.https,400,30);
  assert.ok(delayedDns.dnsMs>base.dnsMs+200,`delayed DNS answer moves retained DNS timing: ${JSON.stringify({base,delayedDns})}`);
  const delayedTls=await measure('synthetic-uptime-timing-tls',network.https,20,400);
  assert.ok(delayedTls.tlsMs>base.tlsMs+200,`delayed handshake moves retained TLS timing: ${JSON.stringify({base,delayedTls})}`);
  const delayedConnect=await measure('synthetic-uptime-timing-connect',network.https,20,30,400);
  assert.ok(delayedConnect.connectMs>base.connectMs+200,`delayed connection moves retained connect timing: ${JSON.stringify({base,delayedConnect})}`);
  const delayedFirstByte=await measure('synthetic-uptime-timing-first-byte',network.https,20,30,0,400);
  assert.ok(delayedFirstByte.ttfbMs>base.ttfbMs+200,`delayed first byte moves retained TTFB: ${JSON.stringify({base,delayedFirstByte})}`);
  assert.ok(Math.abs(delayedConnect.ttfbMs-base.ttfbMs)<200 && Math.abs(delayedFirstByte.connectMs-base.connectMs)<200,`connect and first-byte delays stay in their own retained phases: ${JSON.stringify({base,delayedConnect,delayedFirstByte})}`);
  const plain=await measure('synthetic-uptime-timing-http',network.http,20,0);
  assert.equal(plain.tlsMs,null);assert.ok(plain.dnsMs>0);
  assert.ok(network.queries.some(q=>q.type==='A')&&network.queries.some(q=>q.type==='AAAA'),'the runner resolves the hostname over the real DNS wire protocol');
  console.log('PERF-001 retained timing samples:', JSON.stringify({base,delayedDns,delayedTls,delayedConnect,delayedFirstByte,plain}));
  console.log('PERF-001 DNS/connect/TLS/TTFB passed: generated fixture certificate trusted only by this browser, hostname and controlled wire DNS, non-zero retained DNS/TLS, independent delayed answers/handshakes and honest plain HTTP.');
 }finally{await network?.close();await f.close()}
}
