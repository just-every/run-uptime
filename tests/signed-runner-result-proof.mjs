import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';

const authorityTables=snapshot=>snapshot.filter(([name])=>name!=='public_rate_limits');
export function assertRunnerAdmissionOnly(before,after,{secret,client,requests,start,end=Date.now()}){
 assert.deepEqual(authorityTables(after),authorityTables(before),'every product, auth and audit table remains unchanged');
 const hash=createHmac('sha256',secret).update(`uptime-public-rate-limit:v1:${client}`).digest('hex');
 const rows=value=>new Map(value.find(([name])=>name==='public_rate_limits')[1].map(row=>[JSON.stringify([row.class,row.client_hash,row.window_start]),row]));
 const old=rows(before),current=rows(after);let total=0;
 for(const [key,previous] of old)assert.ok(current.has(key),'admission never removes a counter');
 for(const [key,row] of current){
  const previous=old.get(key);
  if(row.class!=='runner'||row.client_hash!==hash||row.window_start<Math.floor(start/60000)*60000||row.window_start>Math.floor(end/60000)*60000){assert.deepEqual(row,previous,'unrelated classes, clients and windows remain exact');continue}
  const delta=row.request_count-(previous?.request_count??0);
  assert.ok(Number.isInteger(delta)&&delta>=0,'the admitted request count increases monotonically');
  assert.ok(previous||delta>0,'a new minute row must count an actual admission');
  assert.deepEqual(row,previous?{...previous,request_count:previous.request_count+delta}:{class:'runner',client_hash:hash,window_start:row.window_start,request_count:delta,expires_at:row.window_start+60000},'only request count changes; new minute rows have exact metadata');
  total+=delta;
 }
 assert.equal(total,requests,'only the actual runner requests consume admission slots, including natural minute rollover');
}

// Intercept the actual Node runner's first completion at the HTTPS bridge.
// All three submissions use the emitted Worker, exact original body and headers;
// only the first submission changes one hex character of the result signature.
export async function proveFreshResultSignature({envelope,dispatch,db,snapshot,runnerId,secret}){
 const body=JSON.parse(envelope.body),headers=envelope.headers;
 assert.equal(new URL(envelope.url).pathname,'/api/runner/results');
 assert.equal(envelope.method,'POST');
 assert.equal(headers['x-runner-id'],runnerId);
 assert.match(headers['x-runner-signature'],/^[0-9a-f]{64}$/);
 const slot=await db.prepare('SELECT * FROM slots WHERE id=?').bind(body.slotId).first();
 assert.ok(slot,'the actual runner claimed a durable slot');
 assert.equal(slot.status,'running');
 assert.equal(slot.manual,0);
 assert.equal(slot.lease_owner,'');
 const assigned=(await db.prepare('SELECT probe FROM runner_assignments WHERE slot_id=? AND runner_id=?').bind(body.slotId,runnerId).all()).results.map(r=>r.probe);
 assert.ok(body.attempts.every(o=>assigned.includes(o.probe)));
 assert.ok(slot.lease_until>Date.now(),'the owned lease is fresh before refusal');
 assert.ok(body.attempts.length>0);
 for(const attempt of body.attempts){assert.equal(attempt.outcome,'pass');assert.equal(attempt.status,200)}
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM observations WHERE slot_id=?').bind(body.slotId).first()).n,0);

 const before=await snapshot(),refusalStart=Date.now();
 const originalSignature=headers['x-runner-signature'];
 const alteredSignature=(originalSignature[0]==='0'?'1':'0')+originalSignature.slice(1);
 const refused=await dispatch({...envelope,headers:{...headers,'x-runner-signature':alteredSignature}});
 assert.equal(refused.status,403);
 assert.deepEqual(await refused.json(),{error:'Invalid signed result'});
 const afterRefusal=await snapshot();
 assertRunnerAdmissionOnly(before,afterRefusal,{secret,client:headers['cf-connecting-ip']??'unknown',requests:1,start:refusalStart});

 assert.ok(slot.lease_until>Date.now(),'the same lease remains fresh for the unchanged valid submission');
 const accepted=await dispatch(envelope);
 assert.equal(accepted.status,200);
 const result=await accepted.clone().json();
 assert.equal(result.accepted,true);
 assert.equal(result.state.state,'Healthy');
 assert.equal((await db.prepare('SELECT status FROM slots WHERE id=?').bind(body.slotId).first()).status,'complete');
 const persisted=(await db.prepare('SELECT evidence FROM observations WHERE slot_id=? ORDER BY probe,attempt').bind(body.slotId).all()).results.map(row=>JSON.parse(row.evidence));
 assert.deepEqual(persisted,[...body.attempts].sort((a,b)=>a.probe.localeCompare(b.probe)||a.attempt-b.attempt));

 const afterAccepted=await snapshot(),duplicateStart=Date.now();
 const duplicate=await dispatch(envelope);
 assert.equal(duplicate.status,200);
 assert.deepEqual(await duplicate.json(),{accepted:true,duplicate:true});
 assertRunnerAdmissionOnly(afterAccepted,await snapshot(),{secret,client:headers['cf-connecting-ip']??'unknown',requests:1,start:duplicateStart});
 return {response:accepted,receipt:{tablesCompared:before.length,assignedWindowFresh:true,refusedStatus:refused.status,acceptedStatus:accepted.status,persistedAttempts:persisted.length,duplicateStatus:duplicate.status}};
}
