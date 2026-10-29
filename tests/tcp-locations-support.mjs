import assert from 'node:assert/strict';

// Two separately keyed production runners share the existing authorized TCP
// fixture. Network labels identify local vantages, not managed geography.
export async function proveTcpLocations({api,create,runner,waitDue,pause,closeTcp,openTcp}){
 const probes=['local-a','local-b'],locations=[];
 for(const networkLabel of ['synthetic-uptime-1','synthetic-uptime-2']){
  const response=await api('/api/runners',{networkLabel});
  assert.equal(response.status,201);
  locations.push(response.data);
 }
 assert.notEqual(locations[0].runnerId,locations[1].runnerId);
 assert.ok(locations[0].key&&locations[1].key&&locations[0].key!==locations[1].key,'each location has its own signing authority');
 const assignments=Object.fromEntries(probes.map((probe,i)=>[probe,locations[i].runnerId]));
 const monitor=await create({name:'Two-location TCP service',type:'tcp',tcp:{host:'tcp.protocol.test',port:5432,bannerIncludes:'READY'},probes,assignments,timeoutMs:1500});
 const savedAssignments=Object.fromEntries(probes.map((probe,i)=>[probe,{runnerId:locations[i].runnerId,networkLabel:locations[i].networkLabel,canaryUrl:'https://canary.protocol.test/ok'}]));
 assert.deepEqual(monitor.definition.assignments,savedAssignments);
 const read=async()=>{
  const history=await api(`/api/monitors/${monitor.id}/history`),overview=await api(`/api/overview?monitor=${monitor.id}`);
  assert.equal(history.status,200);assert.equal(overview.status,200);
  const {state}=overview.data.monitors[0];
  assert.equal(state.denominator,2,'coverage always counts both saved probes');
  assert.deepEqual(state.regions.map(r=>[r.probe,r.networkLabel]),probes.map((probe,i)=>[probe,locations[i].networkLabel]));
  return {history:history.data,slot:history.data.find(s=>!s.manual),state,alerts:overview.data.alerts};
 };
 const run=async(i,edge={})=>runner({...edge,UPTIME_RUNNER_KEY:locations[i].key,UPTIME_RUNNER_ID:locations[i].runnerId,UPTIME_NETWORK_LABEL:locations[i].networkLabel});
 const retained=[];
 const phase=async(edge={})=>{
  await waitDue(monitor.id);
  await run(0,edge);
  const first=await read();
  assert.equal(first.state.coverageState,'Incomplete','one result never supplies the missing location');
  assert.equal(first.slot.observations.length,1);
  assert.equal(first.slot.observations[0].probe,'local-a');
  assert.equal(first.state.regions[1].state,'Unknown');
  await run(1,edge);
  const result=await read(),{slot,state}=result;
  assert.equal(slot.id,first.slot.id,'both runners complete the same scheduled slot');
  assert.equal(slot.status,'complete');assert.equal(slot.manual,0);
  assert.deepEqual(slot.definition.probes,probes);
  assert.deepEqual(slot.definition.assignments,savedAssignments);
  assert.equal(slot.observations.length,2);
  assert.deepEqual(slot.observations.map(o=>o.probe),probes);
  assert.equal(state.coverageState,'Complete');assert.equal(state.unknown,0);
  for(const o of slot.observations){
   assert.equal(o.canary.outcome,'pass');
   assert.equal(o.attempt,0);
  }
  retained.push(structuredClone(slot));
  return result;
 };
 const passing=result=>{
  assert.equal(result.state.state,'Healthy');
  for(const o of result.slot.observations){
   assert.equal(o.outcome,'pass');assert.equal(o.protocol.address,'93.184.216.34');
   assert.ok(Number.isFinite(o.protocol.connectMs)&&o.protocol.connectMs>=0,'measured handshake latency retained');
   assert.match(o.protocol.banner,/^READY protocol fixture/);
   assert.ok(o.protocol.banner.length<=256,'retained banner is bounded');
   assert.equal(o.checks.find(c=>c.assertion==='connect').pass,true);
   assert.equal(o.checks.find(c=>c.assertion==='banner').pass,true);
  }
 };
 let result=await phase();passing(result);assert.equal(result.alerts.length,0);
 await closeTcp();
 result=await phase();
 const failed=(result,assertion,category)=>{
  assert.equal(result.state.state,'Failing');assert.equal(result.state.failingVantages,2);
  for(const o of result.slot.observations){
   assert.equal(o.outcome,'target_failure');assert.equal(o.checks[0].assertion,assertion);assert.equal(o.checks[0].pass,false);
   assert.equal(o.failureSnapshot.diagnostics.category,category);
  }
  assert.deepEqual(result.alerts.map(a=>a.kind),['trigger'],'both locations confirm one incident');
 };
 failed(result,'refused','connection');
 result=await phase({PROTOCOL_TCP_MODE:'blackhole'});failed(result,'timeout','timeout');
 const trigger=result.alerts[0];
 assert.equal(typeof trigger.event.incidentKey,'string');assert.ok(trigger.event.incidentKey.length);
 await openTcp();
 result=await phase();passing(result);
 assert.deepEqual(result.alerts.map(a=>a.kind).reverse(),['trigger','recovery']);
 assert.equal(result.alerts.find(a=>a.kind==='trigger').id,trigger.id);
 assert.equal(result.alerts.find(a=>a.kind==='recovery').event.incidentKey,trigger.event.incidentKey);
 for(const slot of retained)assert.deepEqual(result.history.find(s=>s.id===slot.id),slot,'recovery preserves both locations and original transport evidence');
 await pause(monitor.id);
 console.log('TCP-001 two-location journey passed: separately signed runners, fixed coverage, open, refused, timeout and recovered history, one trigger and recovery pair.');
}
