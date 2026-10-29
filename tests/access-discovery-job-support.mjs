import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {testAuthBindings} from './auth-test-support.mjs';

export async function startMemberDiscoveryProof({origin,call,fetcher,cookie,admin}){
 const runnerHeaders={'x-runner-key':testAuthBindings.UPTIME_RUNNER_KEY};
 assert.equal((await call('/api/runner/claim',{},runnerHeaders)).status,200);
 const create=async()=>{const response=await call('/api/discoveries',{url:'https://example.com/'},{cookie:admin.cookie});assert.equal(response.status,201);return response.json()};
 const claim=async id=>{const response=await call('/api/runner/discoveries/claim',{},runnerHeaders);assert.equal(response.status,200);assert.equal((await response.json()).job.id,id)};
 const complete=async(id,body)=>{const text=JSON.stringify(body),at=String(Date.now()),signature=createHmac('sha256',testAuthBindings.UPTIME_RUNNER_KEY).update(at+'.'+text).digest('hex');return call(`/api/runner/discoveries/${id}/result`,body,{...runnerHeaders,'x-sent-at':at,'x-runner-signature':signature})};
 const read=async id=>{const response=await call('/api/discoveries/'+id,undefined,{cookie});assert.equal(response.status,200);return response.json()};
 const done=await create();await claim(done.id);assert.equal((await complete(done.id,{error:'synthetic-uptime-1 controlled source failure'})).status,200);
 const retained=await read(done.id);assert.equal(retained.initiatingOwnerId,admin.id);assert.equal(retained.status,'failed');
 const cancelled=await create();await claim(cancelled.id);
 const cancelledResponse=await fetcher(origin+'/api/discoveries/'+cancelled.id,{method:'DELETE',headers:{origin,cookie}});assert.equal(cancelledResponse.status,200);const stopped=await cancelledResponse.json();assert.equal(stopped.stopReason,'member_cancelled');assert.ok(stopped.stoppedAt);
 assert.equal((await complete(cancelled.id,{error:'must not store'})).status,409);assert.deepEqual(await read(cancelled.id),stopped);
 const pending=await create();await claim(pending.id);assert.equal((await read(pending.id)).status,'running');
 return async()=>{
  assert.equal((await complete(pending.id,{error:'must not store after revocation'})).status,409);
  const stopped=await read(pending.id);assert.equal(stopped.status,'failed');assert.equal(stopped.stopReason,'initiator_revoked');assert.ok(stopped.stoppedAt);assert.equal(stopped.initiatingOwnerId,admin.id);assert.equal(stopped.result,undefined);assert.match(stopped.error,/authority revoked/);
  assert.deepEqual(await read(done.id),retained,'already-authorized outcome and initiating owner are preserved');
  const again=await call('/api/runner/discoveries/claim',{},runnerHeaders);assert.equal(again.status,200);assert.equal((await again.json()).job,null);
  console.log('ACCESS-001 member discovery PASS: initiating owner, completed outcome retention, explicit cancellation, revoked live member stops at result boundary without writing a result.');
 };
}

// The retained discovery journey exercises both attributed job kinds through
// the public owner and signed runner doors. Only DNS and HTTPS edges are fake.
export async function proveAttributedDiscoveryJobs(){
 const {fixture}=await import('./resilience/support.mjs');
 const {startLocalWorker}=await import('./mail-provider-fixture.mjs');
 const {inviteDoorMember}=await import('./access-door-support.mjs');
 const {completeSecondFactor}=await import('./mfa-auth-support.mjs');
 const {catalogEdge}=await import('./service-catalog-fixture.mjs');
 const {sourcesEdge,DOMAIN}=await import('./discovery-sources-fixture.mjs');
 const {checkCatalogSource}=await import('../src/domain/service-catalog/source-check.mjs');
 const {runSource}=await import('../runners/src/discovery/sources/run.mjs');
 const {publicReport}=await import('../runners/src/public-http.mjs');
 const g=await fixture();let resumed,edge;
 const ok=async(path,options={})=>{const r=await g.request(path,options);assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
 const rows=async table=>(await g.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
 const read=id=>ok('/api/discoveries/'+id);
 const claim=async id=>{const {job}=await ok('/api/runner/discoveries/claim',{runner:g.first,body:{}});assert.equal(job?.id,id);return job};
 const post=(id,result)=>g.request(`/api/runner/discoveries/${id}/result`,{runner:g.first,signed:true,body:{result}});
 const untouched=async()=>Object.fromEntries(await Promise.all(['discovery_source_runs','discovery_decisions','catalog_review','monitors','revisions','slots','observations','outbox','notification_jobs'].map(async table=>[table,await rows(table)])));
 const restart=async()=>{await(resumed??g.worker).dispose();resumed=await startLocalWorker({persist:g.directory,port:Number(new URL(g.origin).port),bindings:g.bindings});await resumed.ready;g.DB=await resumed.getD1Database('DB')};
 try{
  const admin=await inviteDoorMember(g.origin,g.cookie,'admin','uptime-discovery-701');await completeSecondFactor(g.origin,admin.cookie);
  const source=await ok('/api/discovery-sources',{headers:{cookie:admin.cookie},body:{kind:'openapi',label:'synthetic-uptime-701',identifiers:{url:`https://api.${DOMAIN}/openapi.json`}}});
  const make=async(kind,actor=admin)=>ok(kind==='catalog'?'/api/service-catalog/checks':`/api/discovery-sources/${source.id}/runs`,{headers:{cookie:actor.cookie},body:kind==='catalog'?{entry:'stripe',scope:'components',components:['api']}: {}});
  const jobs=[];
  for(const kind of ['catalog','source'])jobs.push({kind,...await make(kind)});
  const queued=await rows('discovery_jobs');
  for(const job of jobs){const row=queued.find(row=>row.id===job.id);assert.equal(row.initiator_id,admin.id);assert.equal(row.initiator_role,'admin');assert.ok(row.initiator_version&&row.initiator_revision);assert.equal(row.initiator_base_role,'admin');assert.equal((await read(job.id)).initiatingOwnerId,admin.id)}
  await restart();assert.deepEqual(await rows('discovery_jobs'),queued,'the entire initiating authority survives Worker restart');
  const catalogJob=await claim(jobs[0].id);
  edge=await catalogEdge(g.directory);
  const catalogGood=await checkCatalogSource(catalogJob.spec,{transport:publicReport,signal:AbortSignal.timeout(10000)});assert.equal(catalogGood.ok,true);
  edge.state.stripe.mode=503;
  const catalogBad=await checkCatalogSource(catalogJob.spec,{transport:publicReport,signal:AbortSignal.timeout(10000)});assert.equal(catalogBad.ok,false);
  assert.ok(edge.requests.length>=2);await edge.close();edge=null;
  assert.equal((await post(catalogJob.id,catalogBad)).status,200);
  assert.equal((await ok('/api/service-catalog?q=stripe')).entries[0].review.state,'needs_review');
  const sourceJob=await claim(jobs[1].id);
  edge=await sourcesEdge(g.directory);
  const sourceResult=await runSource(sourceJob.spec,{transport:publicReport,signal:AbortSignal.timeout(30000)});
  assert.ok(sourceResult.candidates.some(candidate=>candidate.proposal),'the allowed path has real proposals to preserve');assert.ok(edge.requests.length);await edge.close();edge=null;
  assert.equal((await post(sourceJob.id,sourceResult)).status,200);
  const retained=await Promise.all(jobs.map(job=>read(job.id))),review=await ok(`/api/discovery-sources/${source.id}`);
  assert.ok(review.review.proposals.length);assert.equal((await rows('discovery_source_runs')).length,1);
  assert.deepEqual((await rows('monitors')),[],'discovery never adopts or schedules its proposals');
  for(const kind of ['catalog','source']){
   const cancelled=await make(kind);await claim(cancelled.id);
   const stopped=await ok('/api/discoveries/'+cancelled.id,{method:'DELETE'});assert.equal(stopped.stopReason,'member_cancelled');assert.ok(stopped.stoppedAt);assert.equal(stopped.initiatingOwnerId,admin.id);
   const before=await untouched();assert.equal((await post(cancelled.id,kind==='catalog'?catalogGood:sourceResult)).status,409);assert.deepEqual(await untouched(),before);assert.deepEqual(await read(cancelled.id),stopped);
  }
  const completing=await inviteDoorMember(g.origin,g.cookie,'admin','uptime-discovery-703');await completeSecondFactor(g.origin,completing.cookie);
  const running=[];
  for(const kind of ['catalog','source']){const job=await make(kind,completing);await claim(job.id);running.push({kind,...job})}
  // A second source lets queued and running work coexist without bypassing the
  // existing one-pending-run rule for each source.
  const queuedSource=await ok('/api/discovery-sources',{body:{kind:'website-files',label:'synthetic-uptime-702',identifiers:{origin:`https://www.${DOMAIN}`}}});
  const waiting=[await make('catalog'),await ok(`/api/discovery-sources/${queuedSource.id}/runs`,{headers:{cookie:admin.cookie},body:{}})];
  const before=await untouched();
  assert.equal((await g.request('/auth/operator/status',{body:{operatorId:admin.id,status:'inactive'}})).status,200);
  // Claim is the first door after revocation; no queued work can escape.
  assert.equal((await ok('/api/runner/discoveries/claim',{runner:g.first,body:{}})).job,null);
  for(const job of running)assert.equal((await read(job.id)).status,'running','another live initiator keeps its work');
  assert.equal((await g.request('/auth/operator/status',{body:{operatorId:completing.id,status:'inactive'}})).status,200);
  // Signed completion is the first door after this initiator is revoked.
  for(const job of running)assert.equal((await post(job.id,job.kind==='catalog'?catalogGood:sourceResult)).status,409);
  for(const job of [...running,...waiting]){const stopped=await read(job.id);assert.equal(stopped.status,'failed');assert.equal(stopped.initiatingOwnerId,running.some(row=>row.id===job.id)?completing.id:admin.id);assert.equal(stopped.stopReason,'initiator_revoked');assert.ok(stopped.stoppedAt);assert.match(stopped.error,/authority revoked/);assert.equal(stopped.result,undefined)}
  assert.deepEqual(await untouched(),before,'revoked claims and results change no source run, review, monitor or monitoring evidence');
  for(let index=0;index<jobs.length;index++){assert.deepEqual(await read(jobs[index].id),retained[index]);assert.equal((await post(jobs[index].id,index===0?catalogGood:sourceResult)).status,409,'completion replay cannot replace an authorized outcome')}
  assert.deepEqual(await ok(`/api/discovery-sources/${source.id}`),review,'completed authorized source outcomes survive initiator revocation');
  await restart();
  assert.deepEqual(await untouched(),before,'revoked stops and authorized outcomes survive another restart');
  for(const job of [...running,...waiting])assert.equal((await read(job.id)).stopReason,'initiator_revoked');
  // Current source revocation still stops claimed work even with a live owner.
  const revoked=await ok(`/api/discovery-sources/${source.id}/runs`,{body:{}});await claim(revoked.id);
  await ok(`/api/discovery-sources/${source.id}`,{method:'DELETE'});
  assert.equal((await post(revoked.id,sourceResult)).status,409);assert.equal((await g.request(`/api/discovery-sources/${source.id}`)).status,404);
  assert.equal((await read(revoked.id)).status,'expired');assert.equal((await rows('discovery_source_runs')).length,0);
  const erased=await inviteDoorMember(g.origin,g.cookie,'admin','uptime-discovery-704');await completeSecondFactor(g.origin,erased.cookie);
  const erasedJobs=[await make('catalog',erased),await ok(`/api/discovery-sources/${queuedSource.id}/runs`,{headers:{cookie:erased.cookie},body:{}})];
  await claim(erasedJobs[0].id);const erasedSource=await claim(erasedJobs[1].id);
  edge=await sourcesEdge(g.directory);const erasedResult=await runSource(erasedSource.spec,{transport:publicReport,signal:AbortSignal.timeout(30000)});assert.ok(erasedResult.candidates.length);await edge.close();edge=null;
  const beforeErase=await untouched();
  await ok(`/api/operators/${erased.id}/erase`,{body:{}});
  for(const [index,job] of erasedJobs.entries()){assert.equal((await post(job.id,index===0?catalogGood:erasedResult)).status,409);const stopped=await read(job.id);assert.equal(stopped.initiatingOwnerId,null);assert.equal(stopped.stopReason,'initiator_erased');assert.ok(stopped.stoppedAt);assert.equal(stopped.result,undefined)}
  assert.deepEqual(await untouched(),beforeErase,'erased initiating authority cannot publish results or resurrect data');
  console.log('ACCESS-001 attributed catalog and source discovery PASS: public create/read/cancel, full authority across restart, signed completion, revoked queued claims and running results, visible durable stops, preserved outcomes, replay refusal and source revocation.');
 }finally{await edge?.close();await resumed?.dispose();await g.close()}
}
