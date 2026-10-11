import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');

// Intercept the actual Node runner's first completion at the HTTPS bridge.
// All three submissions use the emitted Worker, exact original body and headers;
// only the first submission changes one hex character of the result signature.
export async function proveFreshResultSignature({envelope,dispatch,db,snapshot,runnerId}){
 const body=JSON.parse(envelope.body),headers=envelope.headers;
 assert.equal(new URL(envelope.url).pathname,'/api/runner/results');
 assert.equal(envelope.method,'POST');
 assert.equal(headers['x-runner-id'],runnerId);
 assert.match(headers['x-runner-signature'],/^[0-9a-f]{64}$/);
 const slot=await db.prepare('SELECT * FROM slots WHERE id=?').bind(body.slotId).first();
 assert.ok(slot,'the actual runner claimed a durable slot');
 assert.equal(slot.status,'running');
 assert.equal(slot.manual,0);
 assert.equal(slot.lease_owner,body.leaseOwner);
 assert.ok(slot.lease_owner.startsWith(runnerId+':'));
 assert.ok(slot.lease_until>Date.now(),'the owned lease is fresh before refusal');
 assert.ok(body.attempts.length>0);
 for(const attempt of body.attempts){assert.equal(attempt.outcome,'pass');assert.equal(attempt.status,200)}
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM observations WHERE slot_id=?').bind(body.slotId).first()).n,0);

 const before=await snapshot(),beforeSha256=digest(before);
 const originalSignature=headers['x-runner-signature'];
 const alteredSignature=(originalSignature[0]==='0'?'1':'0')+originalSignature.slice(1);
 const refused=await dispatch({...envelope,headers:{...headers,'x-runner-signature':alteredSignature}});
 assert.equal(refused.status,403);
 assert.deepEqual(await refused.json(),{error:'Invalid signed result'});
 const afterRefusalSha256=digest(await snapshot());
 assert.equal(afterRefusalSha256,beforeSha256,'every durable D1 table is unchanged by the invalid signature');

 assert.ok(slot.lease_until>Date.now(),'the same lease remains fresh for the unchanged valid submission');
 const accepted=await dispatch(envelope);
 assert.equal(accepted.status,200);
 const result=await accepted.clone().json();
 assert.equal(result.accepted,true);
 assert.equal(result.state.state,'Healthy');
 assert.equal((await db.prepare('SELECT status FROM slots WHERE id=?').bind(body.slotId).first()).status,'complete');
 const persisted=(await db.prepare('SELECT evidence FROM observations WHERE slot_id=? ORDER BY probe,attempt').bind(body.slotId).all()).results.map(row=>JSON.parse(row.evidence));
 assert.deepEqual(persisted,[...body.attempts].sort((a,b)=>a.probe.localeCompare(b.probe)||a.attempt-b.attempt));

 const afterAcceptedSha256=digest(await snapshot());
 const duplicate=await dispatch(envelope);
 assert.equal(duplicate.status,400);
 assert.deepEqual(await duplicate.json(),{error:'Invalid or expired slot lease'});
 assert.equal(digest(await snapshot()),afterAcceptedSha256,'replaying the accepted signed body changes no durable D1 table');
 return {response:accepted,receipt:{runnerIdentitySha256:digest(runnerId),slotIdentitySha256:digest(body.slotId),resultBodySha256:digest(envelope.body),tablesCompared:before.length,leaseRunningAndFresh:true,refusedStatus:refused.status,beforeSha256,afterRefusalSha256,acceptedStatus:accepted.status,persistedAttempts:persisted.length,duplicateStatus:duplicate.status,afterAcceptedSha256}};
}
