import assert from 'node:assert/strict';
import http from 'node:http';

// Keep the real owner request open at the transport edge. The emitted route
// receives the old definition before erasure and resumes when its last byte arrives.
export function erasureRaceProof({origin,owner,snapshot}){
 const pending=new Set(),refusals=[];
 async function unchanged(label,action){
  const before=await snapshot(),result=await action();
  assert.deepEqual(await snapshot(),before,`${label}: every durable table stays exact, including receipts, audit, custody and portability fences`);
  refusals.push({label,tables:Object.keys(before).length});
  return result;
 }
 async function capture(monitor){
  const revisions=await owner.api(`/api/monitors/${monitor.id}/revisions`);
  assert.equal(revisions.status,200);
  const current=revisions.data.find(row=>row.revision===monitor.revision);
  assert.ok(current,'the edit is based on the publicly retained current revision');
  assert.deepEqual(current.definition,monitor.definition);
  const body=Buffer.from(JSON.stringify({...current.definition,name:'synthetic-uptime-stale-edit'}));
  let responded=false,request;
  const result=new Promise((resolve,reject)=>{
   request=http.request(origin+`/api/monitors/${monitor.id}`,{method:'PATCH',agent:false,headers:{origin,cookie:owner.cookie,'content-type':'application/json','content-length':body.length,connection:'close'}},response=>{
    responded=true;let text='';response.setEncoding('utf8');
    response.on('data',chunk=>text+=chunk);
    response.on('error',reject);
    response.on('end',()=>{try{resolve({status:response.statusCode,data:JSON.parse(text)})}catch(error){reject(error)}});
   });
   request.on('error',reject);
   request.setTimeout(30000,()=>request.destroy(Error('Retained owner edit timed out')));
  });
  // Attach rejection handling immediately, including failures while erasure runs.
  result.catch(()=>{});pending.add(request);
  await new Promise((resolve,reject)=>{request.once('error',reject);request.write(body.subarray(0,-1),error=>error?reject(error):resolve())});
  assert.equal(responded,false,'the actual edit request is still pending');
  const before=await snapshot();
  assert.ok(before.monitors.some(row=>row.id===monitor.id&&row.revision===current.revision));
  assert.ok(before.revisions.some(row=>row.monitor_id===monitor.id&&row.revision===current.revision));
  return {
   async resume(){
    assert.equal(responded,false,'erasure completed while the stale edit request was open');
    const afterErase=await snapshot();
    assert.ok(!afterErase.monitors.some(row=>row.id===monitor.id));
    assert.ok(!afterErase.revisions.some(row=>row.monitor_id===monitor.id));
    const response=await unchanged('captured stale monitor edit',async()=>{
     request.end(body.subarray(-1));const response=await result;
     assert.equal(response.status,400);assert.match(response.data.error,/Monitor not found/);
     return response;
    });
    pending.delete(request);
    const history=await owner.api(`/api/monitors/${monitor.id}/history`),revisions=await owner.api(`/api/monitors/${monitor.id}/revisions`),overview=await owner.api('/api/overview');
    assert.equal(history.status,200);assert.deepEqual(history.data,[]);
    assert.equal(revisions.status,200);assert.deepEqual(revisions.data,[]);
    assert.equal(overview.status,200);assert.ok(!overview.data.monitors.some(row=>row.id===monitor.id));
    return {revision:current.revision,status:response.status,tables:Object.keys(afterErase).length};
   }
  };
 }
 return {unchanged,capture,refusals,close(){for(const request of pending)request.destroy();pending.clear()}};
}
