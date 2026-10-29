import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {authFixture} from './tls-auth-support.mjs';

// Exercise the saved keyword definition through the owner, scheduled runner and history doors.
export async function keywordMonitorJourney(){
 const required='synthetic-uptime-36',ready=required+' ready';
 let edge,status=200,body=ready;
 try{
  edge=await authFixture((_record,res)=>{res.writeHead(status);res.end(body)});
  const {f,create,claim,run,submit,url,records}=edge;
  const monitor=await create({name:'Synthetic keyword checkout',type:'keyword',url:url('/keyword','auth.example.test'),intervalMs:5000,assertions:{status:200,bodyIncludes:required}});
  const read=async path=>{const response=await f.request(path);assert.equal(response.status,200,JSON.stringify(response.data));return response.data};
  const revisions=await read(`/api/monitors/${monitor.id}/revisions`);
  assert.equal(revisions.length,1);
  assert.equal(revisions[0].revision,monitor.revision);
  assert.equal(revisions[0].definition.type,'keyword');
  assert.deepEqual(revisions[0].definition.assertions,{status:200,bodyIncludes:required});
  const saved=structuredClone(revisions[0].definition),retained=new Map(),slots=[];
  const current=async()=>{
   const overview=await read('/api/overview'),found=overview.monitors.find(item=>item.id===monitor.id);
   assert.ok(found);
   assert.equal(found.revision,monitor.revision);
   assert.deepEqual(found.definition,saved,'checking and recovering never edit the saved keyword criteria');
   return found;
  };
  const phases=[
   {status:200,body:ready,state:'Healthy',failed:null},
   {status:503,body:ready,state:'Failing',failed:'status'},
   {status:200,body:ready,state:'Healthy',failed:null},
   {status:200,body:'synthetic-uptime-37 waiting',state:'Failing',failed:'body'},
   {status:200,body:ready,state:'Healthy',failed:null},
  ];
  for(const phase of phases){
   status=phase.status;body=phase.body;
   const before=await current();
   await sleep(Math.max(0,before.nextDue-Date.now()+10));
   const task=await claim(monitor.id),start=records.length,result=await run(task);
   assert.deepEqual(task.definition,saved);
   assert.equal(records.length,start+1,'each scheduled check reaches the real HTTPS edge once');
   assert.equal(records[start].host,new URL(saved.url).host);
   assert.equal(records[start].url,'/keyword');
   assert.equal(records[start].method,'GET');
   await submit(task,result);
   const history=await read(`/api/monitors/${monitor.id}/history`),slot=history.find(item=>item.id===task.id);
   assert.ok(slot,'signed completion is readable through public history');
   assert.equal(slot.monitor_id,monitor.id);
   assert.equal(slot.revision,monitor.revision);
   assert.equal(slot.manual,0,'failure and recovery are scheduled evidence');
   assert.deepEqual(slot.definition,saved);
   assert.equal(slot.definition.assignments[task.probes[0]].runnerId,f.first.runnerId);
   assert.equal(slot.observations.length,1);
   const [observation]=slot.observations;
   assert.equal(observation.id,result.id);
   assert.equal(observation.probe,task.probes[0]);
   assert.equal(observation.runnerVersion,result.runnerVersion);
   assert.equal(observation.outcome,phase.failed?'target_failure':'pass');
   assert.deepEqual(observation.checks.map(check=>({assertion:check.assertion,pass:check.pass})),[
    {assertion:'status',pass:phase.failed!=='status'},
    {assertion:'body',pass:phase.failed!=='body'},
   ],'status and required text fail independently against the same saved bundle');
   assert.equal(observation.status,phase.status);
   assert.equal(observation.bytes,Buffer.byteLength(phase.body));
   assert.ok(observation.bytes<=65536,'retained response metadata respects the transport body bound');
   assert.ok(observation.startedAt>=slot.due_at);
   assert.ok(observation.completedAt>=observation.startedAt);
   assert.equal(observation.durationMs,observation.completedAt-observation.startedAt);
   assert.ok(observation.durationMs<=saved.timeoutMs);
   assert.ok(observation.checks.every(check=>check.reason.length>0&&check.reason.length<=300));
   assert.equal(observation.body,undefined,'history retains decisions and bounded metadata, not the response body');
   assert.equal((await current()).state.state,phase.state);
   assert.deepEqual(await read(`/api/monitors/${monitor.id}/revisions`),revisions);
   for(const [id,previous] of retained)assert.deepEqual(history.find(item=>item.id===id),previous,'later checks preserve each earlier signed slot');
   retained.set(slot.id,structuredClone(slot));slots.push(slot);
   assert.equal(history.length,slots.length);
  }
  assert.equal(new Set(slots.map(slot=>slot.id)).size,5);
  assert.equal(new Set(slots.map(slot=>slot.observations[0].id)).size,5);
  const incidents=await read(`/api/monitors/${monitor.id}/incidents`);
  assert.equal(incidents.length,2,'each independent failure has its own recovered incident');
  for(const [failure,recovery,reason] of [[slots[1],slots[2],/status/],[slots[3],slots[4],/required text/]]){
   const incident=incidents.find(item=>item.trigger.slotId===failure.id);
   assert.ok(incident);
   assert.equal(incident.imported,false);
   assert.equal(incident.trigger.monitorId,monitor.id);
   assert.equal(incident.trigger.monitorRevision,monitor.revision);
   assert.match(incident.trigger.probes[0].reason,reason);
   assert.equal(incident.recovery.slotId,recovery.id);
   assert.equal(incident.recovery.monitorRevision,monitor.revision);
   assert.equal(incident.recovery.incidentKey,incident.trigger.incidentKey);
   assert.ok(incident.endedAt>=incident.startedAt);
  }
  assert.notEqual(incidents[0].key,incidents[1].key);
  console.log('PASS keyword owner creation, scheduled signed HTTPS status and text failures, immutable history and recovery');
 }finally{await edge?.close()}
}
