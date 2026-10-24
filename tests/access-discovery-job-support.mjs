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
