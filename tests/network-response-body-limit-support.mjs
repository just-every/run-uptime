import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {authFixture} from './tls-auth-support.mjs';
import {FAILURE_SNAPSHOT_LIMITS} from '../src/domain/failure-snapshot.mjs';

// Owner creation, the production signed runner and owner history share one isolated Worker.
export async function proveResponseBodyLimit(){
 const required='synthetic-uptime-157',tail='synthetic-uptime-158';
 const bounded=Buffer.alloc(65536,'x '),oversized=Buffer.alloc(65537,'y ');
 for(const payload of [bounded,oversized]){
  payload.write(required);payload.write(tail,payload.length-Buffer.byteLength(tail));
 }
 let edge,payload=bounded;
 const received=[];
 try{
  edge=await authFixture((request,res)=>{
   const body=payload,socket=res.socket,before=socket.bytesWritten;
   const receipt={method:request.method,path:request.url,host:request.host,encoding:request.headers['accept-encoding'],bytes:0,wireBytes:0};
   received.push(receipt);
   res.once('finish',()=>{receipt.bytes=body.byteLength;receipt.wireBytes=socket.bytesWritten-before});
   res.writeHead(200,{'content-encoding':'identity','content-length':body.byteLength});
   res.end(body);
  });
  const {f,url}=edge;
  const monitor=await edge.create({name:'Synthetic response body boundary',type:'keyword',network:'public',url:url('/body-limit','auth.example.test'),intervalMs:5000,assertions:{status:200,bodyIncludes:required}});
  const read=async path=>{const response=await f.request(path);assert.equal(response.status,200,JSON.stringify(response.data));return response.data};
  const revisions=await read(`/api/monitors/${monitor.id}/revisions`),saved=structuredClone(revisions[0].definition);
  assert.equal(revisions.length,1);
  assert.equal(saved.network,'public');
  assert.equal(saved.enabled,true);
  assert.deepEqual(saved.assertions,{status:200,bodyIncludes:required});
  const current=async()=>{
   const found=(await read('/api/overview')).monitors.find(row=>row.id===monitor.id);
   assert.ok(found);assert.equal(found.revision,monitor.revision);
   assert.deepEqual(found.definition,saved,'a transport refusal cannot edit the saved definition');
   return found;
  };
  const retained=[];
  for(const phase of [
   {body:bounded,bytes:65536,state:'Healthy'},
   {body:oversized,bytes:65537,state:'Failing'},
   {body:bounded,bytes:65536,state:'Healthy'},
  ]){
   payload=phase.body;
   const before=await current();
   await sleep(Math.max(0,before.nextDue-Date.now()+10));
   const requestCount=received.length;
   await f.run(f.first);
   assert.equal(received.length,requestCount+1,'one scheduled attempt reaches the controlled trusted HTTPS receiver');
   const receipt=received[requestCount];
   assert.deepEqual({method:receipt.method,path:receipt.path,host:receipt.host,encoding:receipt.encoding},{method:'GET',path:'/body-limit',host:new URL(saved.url).host,encoding:'identity'});
   assert.equal(receipt.bytes,phase.bytes,'the receiver independently counts the entire response payload it sent');
   assert.ok(receipt.wireBytes>phase.bytes&&receipt.wireBytes<phase.bytes+1024,'wire accounting includes the payload and bounded HTTP headers');
   const history=await read(`/api/monitors/${monitor.id}/history`);
   assert.equal(history.length,retained.length+1);
   const added=history.filter(slot=>!retained.some(previous=>previous.id===slot.id));
   assert.equal(added.length,1);
   const [slot]=added;
   assert.equal(slot.manual,0,'only scheduled evidence establishes failure and recovery');
   assert.equal(slot.monitor_id,monitor.id);assert.equal(slot.revision,monitor.revision);
   assert.deepEqual(slot.definition,saved);
   assert.equal(slot.observations.length,1);
   const [observation]=slot.observations;
   assert.equal(saved.assignments[observation.probe].runnerId,f.first.runnerId);
   assert.equal(observation.attempt,0);
   assert.equal(observation.canary.outcome,'pass');
   assert.ok(observation.startedAt>=slot.due_at);
   assert.ok(observation.completedAt>=observation.startedAt);
   assert.ok(observation.durationMs<=saved.timeoutMs);
   assert.ok(observation.checks.every(check=>check.reason.length>0&&check.reason.length<=300));
   assert.equal(observation.body,undefined,'response bodies are never ordinary observation fields');
   const {failureSnapshot,...metadata}=observation;
   assert.ok(Buffer.byteLength(JSON.stringify(metadata))<=4000,'retained verdict and diagnostic metadata stay bounded');
   assert.ok(!JSON.stringify(metadata).includes(required)&&!JSON.stringify(metadata).includes(tail),'ordinary evidence contains no raw response text');
   if(phase.state==='Failing'){
    assert.equal(observation.outcome,'target_failure','matching text in an HTTP 200 overflow must never become a truncated pass');
    assert.deepEqual(observation.checks.map(({assertion,pass})=>({assertion,pass})),[{assertion:'body-limit',pass:false}]);
    assert.equal(observation.status,undefined,'an incomplete body has no completed-response status');
    assert.equal(observation.bytes,undefined,'an incomplete body is not reported as a bounded successful read');
    assert.ok(failureSnapshot&&!failureSnapshot.unavailable,'the owner can inspect bounded failure diagnostics');
    assert.ok(Buffer.byteLength(failureSnapshot.body)<=FAILURE_SNAPSHOT_LIMITS.bodyBytes);
    assert.equal(failureSnapshot.bodyTruncated,true);
    assert.ok(Buffer.byteLength(JSON.stringify(failureSnapshot))<=FAILURE_SNAPSHOT_LIMITS.totalBytes);
    assert.ok(!failureSnapshot.body.includes(tail),'the tail of the oversized response is not retained');
    const snapshots=await read(`/api/monitors/${monitor.id}/failure-snapshots`);
    assert.equal(snapshots.items.length,1);
    assert.equal(snapshots.items[0].observation_id,observation.id);
    assert.deepEqual(snapshots.items[0].snapshot,failureSnapshot);
   }else{
    assert.equal(observation.outcome,'pass');assert.equal(observation.status,200);
    assert.equal(observation.bytes,65536,'the complete body at the boundary remains supported');
    assert.deepEqual(observation.checks.map(({assertion,pass})=>({assertion,pass})),[{assertion:'status',pass:true},{assertion:'body',pass:true}]);
    assert.equal(failureSnapshot,undefined);
   }
   const {state}=await current();
   assert.equal(state.state,phase.state);assert.equal(state.targetState,phase.state);
   assert.equal(state.coverageState,'Complete');assert.equal(state.denominator,1);
   assert.equal(state.unknown,0);assert.equal(state.fails,phase.state==='Failing'?1:0);
   assert.equal(state.regions[0].observationId,observation.id);
   assert.deepEqual(await read(`/api/monitors/${monitor.id}/revisions`),revisions);
   for(const previous of retained)assert.deepEqual(history.find(row=>row.id===previous.id),previous,'recovery preserves earlier signed evidence byte for byte');
   retained.push(structuredClone(slot));
  }
  assert.deepEqual(received.map(receipt=>receipt.bytes),[65536,65537,65536]);
  const incidents=await read(`/api/monitors/${monitor.id}/incidents`);
  assert.equal(incidents.length,1);
  const [incident]=incidents;
  assert.equal(incident.imported,false);assert.equal(incident.trigger.slotId,retained[1].id);
  assert.match(incident.trigger.probes[0].reason,/body-limit/);
  assert.equal(incident.recovery.slotId,retained[2].id);
  assert.equal(incident.recovery.incidentKey,incident.trigger.incidentKey);
  assert.equal(incident.trigger.monitorRevision,monitor.revision);
  assert.equal(incident.recovery.monitorRevision,monitor.revision);
  assert.ok(incident.endedAt>=incident.startedAt);
  console.log('PASS NETWORK-001 body boundary: receiver bytes 65536,65537,65536; signed pass, body-limit target_failure, scheduled recovery; fixed denominator and immutable history');
 }finally{await edge?.close()}
}
