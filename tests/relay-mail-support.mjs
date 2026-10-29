import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';

// The emitted application, selected Base RER adapter and persistent D1 are real.
// Only the explicitly configured relay is a controlled network edge.
export async function proveRelayMail(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-relay-mail-'));
 const origin='https://synthetic-uptime-37.example.test';
 const relayUrl='https://relay.example.test/mail';
 const mailbox=name=>[name,'example.test'].join('@');
 const recipient=mailbox('synthetic-uptime-37');
 const apiKey='synthetic-uptime-37';
 const startedAt=Date.now(),retrySeconds=120,submissions=[];
 const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,
  MAIL_PROVIDER:'rer',MAIL_FROM:mailbox('synthetic-uptime-sender'),MAIL_API_KEY:apiKey,MAIL_RELAY_URL:relayUrl};
 let worker,db,cookie;
 const edge=async request=>{
  assert.equal(request.url,relayUrl,'only the authorized relay receives mail');
  assert.equal(request.method,'POST');
  assert.equal(request.headers.get('authorization'),'Bearer '+apiKey);
  assert.equal(request.headers.get('content-type'),'application/json');
  const message=await request.json();
  if(message.to!==recipient){
   assert.equal(message.to,bindings.OWNER_EMAIL,'other mail is the owner factor notice');
   return Response.json({}, {status:202});
  }
  assert.ok(message.text.includes('/alert-drill?token='),'the real adapter serializes the queued drill');
  const status=submissions.length===0?429:202;
  submissions.push({message,status});
  return status===429?new Response(null,{status,headers:{'Retry-After':String(retrySeconds)}}):Response.json({}, {status});
 };
 const start=async now=>{
  worker=await hostedRuntime(directory,bindings,edge,{now});
  db=await worker.getD1Database('DB');
 };
 const restart=async now=>{await worker.dispose();worker=null;await start(now)};
 const call=(path,body,method=body===undefined?'GET':'POST')=>worker.dispatchFetch('http://127.0.0.1:15504/',{
  method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method,
   headers:{host:new URL(origin).host,origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.37',...(cookie?{cookie}:{})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const json=async response=>{assert.ok(response.ok,await response.clone().text());return response.json()};
 const notes=async()=>json(await call('/api/notifications'));
 const scheduled=async()=>{
  const response=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});
  assert.equal(response.status,204,await response.text());
 };
 const settled=async(id,state)=>{
  let delivery;
  for(let attempt=0;attempt<100;attempt++){
   delivery=(await notes()).deliveries.find(row=>row.id===id);
   if(delivery?.state===state&&delivery.attemptHistory.length)return delivery;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.fail('relay delivery did not settle: '+JSON.stringify(delivery));
 };
 try{
  await start(startedAt);
  for(const file of(await readdir('migrations')).filter(file=>file.endsWith('.sql')).sort())
   for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const owner=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Relay owner'});
  assert.equal(owner.status,303,await owner.clone().text());cookie=owner.headers.get('set-cookie').split(';')[0];
  await completeSecondFactor(origin,cookie,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),init.method),startedAt);
  const destination=await json(await call('/api/notifications/destinations',{name:'Relay recipient',kind:'email',address:recipient}));
  const initial=(await notes()).destinations.find(row=>row.id===destination.id);
  assert.deepEqual(initial.proof,{state:'never',lastProvenAt:null});assert.equal(initial.latestDrill,null);
  const drill=await json(await call(`/api/notifications/destinations/${destination.id}/drill`,{}));
  await scheduled();
  const waiting=await settled(drill.deliveryId,'queued');
  assert.equal(waiting.code,'provider_rate_limited');assert.equal(waiting.attempts,1);
  assert.equal(waiting.attemptHistory.length,1);assert.equal(waiting.attemptHistory[0].outcome_category,'retryable');
  assert.equal(waiting.attemptHistory[0].retry_after_seconds,retrySeconds);
  assert.deepEqual(submissions.map(row=>row.status),[429]);
  const job=()=>db.prepare('SELECT * FROM notification_jobs WHERE id=?').bind(drill.deliveryId).first();
  const queued=await job(),notBefore=queued.claim_until;
  assert.equal(notBefore,startedAt+retrySeconds*1000,'numeric Retry-After is saved as the durable not-before time');
  assert.equal(queued.state,'queued');assert.equal(queued.claim,null);assert.equal(queued.finished_at,null);
  await scheduled();await scheduled();
  assert.deepEqual(await job(),queued,'repeated early dispatch leaves the queued job untouched');
  assert.equal(submissions.length,1);

  // Recreate the actual Worker at the last millisecond before the saved deadline.
  await restart(notBefore-1);
  assert.deepEqual(await job(),queued,'Worker restart preserves the same job and deadline');
  await scheduled();await scheduled();
  const early=await settled(drill.deliveryId,'queued');
  assert.equal(early.attempts,1);assert.equal(early.attemptHistory.length,1);
  assert.deepEqual(await job(),queued);assert.equal(submissions.length,1,'early dispatch after restart sends nothing');

  await restart(notBefore);
  await scheduled();
  const accepted=await settled(drill.deliveryId,'accepted');
  assert.equal(accepted.destinationId,destination.id);assert.equal(accepted.eventId,drill.eventId);
  assert.equal(accepted.attempts,2);assert.equal(accepted.attemptHistory.length,2);
  assert.deepEqual(accepted.attemptHistory.map(row=>row.outcome_category),['retryable','accepted']);
  assert.equal(accepted.attemptHistory[1].scheduled_at,notBefore);
  assert.equal(accepted.attemptHistory[1].started_at,notBefore);
  assert.deepEqual(submissions.map(row=>row.status),[429,202],'one rejected submission is followed by exactly one accepted submission');
  assert.deepEqual(submissions[1].message,submissions[0].message,'retry preserves the same drill and destination');

  const assertNoReceipt=async()=>{
   const view=await notes(),delivery=view.deliveries.find(row=>row.id===drill.deliveryId);
   const recipientProof=view.destinations.find(row=>row.id===destination.id);
   assert.equal(delivery.state,'accepted','public delivery history records provider acceptance');
   assert.equal(delivery.handoff,undefined,'mail acceptance supplies no native human-response fact');
   assert.deepEqual(recipientProof.proof,{state:'never',lastProvenAt:null},'acceptance cannot prove recipient receipt');
   assert.equal(recipientProof.latestDrill.id,drill.drillId);
   assert.equal(recipientProof.latestDrill.state,'accepted');
   assert.equal(recipientProof.latestDrill.confirmation,'pending');
   assert.equal(recipientProof.latestDrill.confirmedAt,null,'no recipient confirmation was invented');
   assert.equal((await json(await call('/api/notifications/destinations'))).find(row=>row.id===destination.id).enabled,true);
  };
  await assertNoReceipt();
  const finished=await job();assert.equal(finished.claim_until,null);assert.equal(finished.finished_at,notBefore);
  await scheduled();await scheduled();
  await restart(notBefore+600001);await scheduled();await scheduled();
  await assertNoReceipt();
  assert.deepEqual(await job(),finished,'accepted jobs remain terminal across later dispatch and restart');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM notification_jobs').first()).n,1,'one durable job throughout retry');
  assert.equal((await notes()).deliveries.find(row=>row.id===drill.deliveryId).attemptHistory.length,2);
  assert.equal(submissions.length,2,'accepted submission never replays');
  console.log('PASS RER relay Retry-After survives Worker restart, submits once when due and keeps acceptance separate from recipient proof');
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
}
