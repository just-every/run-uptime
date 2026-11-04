import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {setTimeout as sleep} from 'node:timers/promises';
import {authFixture} from './tls-auth-support.mjs';

// Owner definition -> actual signed runners -> emitted Worker -> retained history.
export async function proveResponseEncodingRefusal(){
 const text='synthetic-uptime-153 ready',plain=Buffer.from(text),gzip=gzipSync(plain);
 assert.deepEqual(gunzipSync(gzip),plain,'the refused response is valid gzip containing the required text');
 assert.ok(gzip.length<65536&&plain.length<65536,'neither response approaches the body limit');
 let edge,encoding='identity';
 try{
  edge=await authFixture((_record,res)=>{
   const body=encoding==='gzip'?gzip:plain;
   res.writeHead(200,{'content-type':'text/plain','content-encoding':encoding,'content-length':body.length});
   res.end(body);
  });
  const {f,url,records}=edge;
  const monitor=await f.monitor({name:'Synthetic response encoding',network:'public',url:url('/encoding','auth.example.test'),
   canary:true,intervalMs:5000,assertions:{status:200,bodyIncludes:text}});
  const read=async path=>{const response=await f.request(path);assert.equal(response.status,200,JSON.stringify(response.data));return response.data};
  const historyPath=`/api/monitors/${monitor.id}/history`,revisionsPath=`/api/monitors/${monitor.id}/revisions`;
  const revisions=await read(revisionsPath),retained=[],snapshotsPath=`/api/monitors/${monitor.id}/failure-snapshots`;
  assert.equal(revisions.length,1);
  assert.equal(monitor.definition.tlsTrust,undefined,'ordinary verified TLS has no monitor trust exception');
  let failedSnapshots;
  for(const phase of ['identity','gzip','identity']){
   // Only the receiver changes; definition, assignments and assertions stay fixed.
   encoding=phase;
   const current=(await read('/api/overview')).monitors.find(item=>item.id===monitor.id);
   await sleep(Math.max(0,current.nextDue-Date.now()+10));
   const start=records.length;
   await f.run(f.first);await f.run(f.second);
   assert.deepEqual(records.slice(start).map(record=>({host:record.host,path:record.url,method:record.method,encoding:record.headers['accept-encoding']})),
    Array.from({length:2},()=>({host:new URL(monitor.definition.url).host,path:'/encoding',method:'GET',encoding:'identity'})),
    'the independent HTTPS receiver observes identity requested by both assigned runners in every phase');
   const history=await read(historyPath),added=history.filter(slot=>!retained.some(previous=>previous.id===slot.id));
   assert.equal(added.length,1,'both native signed completions belong to one ordinary scheduled slot');
   const [slot]=added;
   assert.equal(slot.manual,0);assert.equal(slot.revision,monitor.revision);
   assert.deepEqual(slot.definition,monitor.definition);
   assert.deepEqual(slot.observations.map(observation=>observation.probe).sort(),[...monitor.definition.probes].sort());
   for(const observation of slot.observations){
    assert.equal(observation.attempt,0);assert.ok(observation.startedAt>=slot.due_at);
    assert.equal(observation.canary.outcome,'pass','independent passing canaries qualify target failure');
    if(phase==='gzip'){
     assert.equal(observation.outcome,'target_failure','encoded HTTP 200 must never become a decompressed pass');
     assert.deepEqual(observation.checks.map(({assertion,pass})=>({assertion,pass})),[{assertion:'encoding',pass:false}]);
     assert.ok(observation.checks[0].reason.length>0&&observation.checks[0].reason.length<=300);
     assert.equal(observation.status,undefined,'an incomplete encoded response has no successful HTTP assertion evidence');
     assert.equal(observation.bytes,undefined);
    }else{
     assert.equal(observation.outcome,'pass');assert.equal(observation.status,200);assert.equal(observation.bytes,plain.length);
     assert.deepEqual(observation.checks.map(check=>({assertion:check.assertion,pass:check.pass})),[{assertion:'status',pass:true},{assertion:'body',pass:true}]);
    }
   }
   const state=await f.state(monitor.id);
   assert.equal(state.state,phase==='gzip'?'Failing':'Healthy');
   assert.equal(state.targetState,phase==='gzip'?'Failing':'Healthy');
   assert.equal(state.coverageState,'Complete');assert.equal(state.denominator,2);assert.equal(state.unknown,0);
   for(const previous of retained)assert.deepEqual(history.find(row=>row.id===previous.id),previous,'later evidence preserves every earlier signed observation');
   retained.push(structuredClone(slot));
   assert.equal(history.length,retained.length);
   const saved=(await read('/api/overview')).monitors.find(item=>item.id===monitor.id);
   assert.equal(saved.revision,monitor.revision);assert.deepEqual(saved.definition,monitor.definition);
   assert.deepEqual(await read(revisionsPath),revisions);
   const snapshots=await read(snapshotsPath);
   if(phase==='gzip'){
    assert.equal(snapshots.items.length,2,'the existing signed snapshot validation accepts each genuine encoding failure');
    assert.deepEqual(snapshots.items.map(item=>item.observation_id).sort(),slot.observations.map(observation=>observation.id).sort());
    failedSnapshots=snapshots;
   }else if(failedSnapshots)assert.deepEqual(snapshots,failedSnapshots,'scheduled recovery preserves the original failure snapshots');
  }
  const incidents=await read(`/api/monitors/${monitor.id}/incidents`);
  assert.equal(incidents.length,1);
  assert.equal(incidents[0].trigger.slotId,retained[1].id);
  assert.equal(incidents[0].recovery.slotId,retained[2].id);
  assert.equal(incidents[0].trigger.incidentKey,incidents[0].recovery.incidentKey);
  console.log('PASS response encoding: observed identity requests, bounded valid gzip HTTP 200 refused as retained encoding target_failure, unchanged-definition scheduled recovery and fixed coverage');
 }finally{await edge?.close()}
}
