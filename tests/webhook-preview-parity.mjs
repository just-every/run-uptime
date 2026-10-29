import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {webhookFixture} from './webhook-custom-support.mjs';
import {fixture} from './resilience/support.mjs';

// One public-door journey: the owner authorizes exactly the previewed sample,
// then the production runner claims its durable notification and sends HTTPS.
// Expected sample values below are independent of the production renderer.
export async function proveWebhookPreviewParity(){
 const edge=await webhookFixture();let receiving;
 try{
  const {f,records,url}=edge,headerSecret=randomBytes(32).toString('hex');
  const request=async(path,body,method)=>{const response=await f.request(path,{...(body===undefined?{}:{body}),...(method?{method}:{})});assert.ok(response.status>=200&&response.status<300,JSON.stringify(response));return response.data};
  f.modes.target=200;
  const monitor=await f.monitor({runners:[f.first],canary:true,name:'synthetic-uptime-1'});
  await f.run(f.first);await f.pause(monitor);
  // Projection evaluation time advances on reads; retained evidence is compared
  // separately below. Every health outcome and identity remains unchanged.
  const healthView=({evaluatedAt,...view})=>view;
  const state=healthView(await f.state(monitor.id)),history=await request(`/api/monitors/${monitor.id}/history`);
  const healthTables=(await f.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(r=>r.name).filter(name=>/^(monitors|revisions|slots|attempt_checkpoints|evidence_generation|runner_assignments|heartbeat_authority|heartbeat_claims|observations|outbox|incident_|expiry_|slow_|alert_contact_schedules$|alert_recovery_matches$|alert_fallback)/.test(name));
  const healthSnapshot=async()=>Object.fromEntries(await Promise.all(healthTables.map(async name=>[name,(await f.DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results])));
  const health=await healthSnapshot();
  const fields={id:'{{event.id}}',monitor:'{{monitor.name}}',name:'{{alert.name}}',type:'{{alert.type}}',duration:'{{alert.durationSeconds}}',certificate:'{{ssl.expiryDate}}',response:'{{response.timeMs}}',literal:'synthetic-uptime-1: café ☃'};
  const expected={
   trigger:{name:'Down',type:'down',duration:'Unavailable',certificate:'Unavailable',response:'215'},
   recovery:{name:'Up',type:'up',duration:'90',certificate:'Unavailable',response:'120'},
   expiry:{name:'Expiry warning',type:'expiry',duration:'Unavailable',certificate:'2026-01-29',response:'Unavailable'},
   slow:{name:'Slow',type:'slow',duration:'Unavailable',certificate:'Unavailable',response:'1800'},
  };
  let saved,firstSample;
  for(const [method,mode] of [['POST','json'],['PUT','form'],['GET','query']]){
   const template={version:1,method,mode,template:mode==='json'?JSON.stringify(fields,null,2):fields,headerNames:['X-Api-Key','Idempotency-Key'],timeZone:'America/New_York'};
   saved=await request('/api/notifications/destinations',{name:'synthetic-uptime-1',kind:'webhook',enabled:false,url,webhookTemplate:template,webhookHeaders:{'X-Api-Key':headerSecret,'Idempotency-Key':'{{event.id}}'},webhookSigning:true});
   const path=`/api/notifications/destinations/${saved.id}`,before=records.length;
   const jobsBefore=(await f.DB.prepare('SELECT * FROM notification_jobs ORDER BY id').all()).results;
   const preview=await request(path+'/preview',{});
   assert.deepEqual(preview.samples.map(s=>s.kind),Object.keys(expected));
   assert.equal(records.length,before,'a preview never sends');
   assert.deepEqual((await f.DB.prepare('SELECT * FROM notification_jobs ORDER BY id').all()).results,jobsBefore,'a preview never queues');
   // Cross a real timestamp boundary: a dispatch-time header would break parity.
   await new Promise(resolve=>setTimeout(resolve,1100));
   for(const sample of preview.samples){
    firstSample??=sample;
    const [queued,replay]=await Promise.all([request(path+'/test',sample.test),request(path+'/test',sample.test)]);
    assert.match(queued.eventId,/^test:/);assert.deepEqual(replay,queued);
    const stored=JSON.parse((await f.DB.prepare('SELECT event FROM notification_jobs WHERE id=?').bind(queued.deliveryId).first()).event);
    assert.equal(stored.kind,'test');assert.equal(stored.state,'test');
    for(const key of ['monitorId','monitorRevision','incidentKey','slotId'])assert.equal(stored[key],null);
    await f.run(f.first);
    assert.equal(records.length,before+preview.samples.indexOf(sample)+1);
    const received=records.at(-1),target=new URL(sample.request.url);
    assert.equal(received.method,sample.request.method);
    assert.equal(received.path,target.pathname+target.search,'the complete request target preserves receiver parameters and encoding');
    assert.deepEqual(received.rawBody,Buffer.from(sample.request.body??'','utf8'),'compare original UTF-8 bytes, including whitespace and Unicode');
    const application=Object.fromEntries(Object.entries(received.headers).filter(([name])=>!['host','connection','content-length','transfer-encoding'].includes(name)));
    assert.deepEqual(Object.keys(application).sort(),Object.keys(sample.request.headers).sort());
    const masks=['x-api-key','idempotency-key','webhook-signature','x-lamp-signature'];
    for(const [name,value] of Object.entries(sample.request.headers)){
     if(masks.includes(name))assert.equal(value,'[masked]');
     else assert.equal(application[name],value,`unmasked application header ${name}`);
    }
    assert.equal(application['x-api-key'],headerSecret);assert.equal(application['idempotency-key'],queued.eventId);
    assert.equal(application['webhook-id'],queued.deliveryId);
    assert.match(application['webhook-event'],/^uptime\.notification\.sample\.v1\./);
    const body=mode==='json'?JSON.parse(received.body):Object.fromEntries(new URLSearchParams(mode==='query'?target.search:received.body));
    if(mode==='query')delete body.local;
    assert.deepEqual(body,{id:queued.eventId,monitor:'Checkout "API" <script> & worker',...expected[sample.kind],literal:'synthetic-uptime-1: café ☃'});
    const signedBytes=mode==='query'?target.search.slice(1):received.rawBody;
    const hmac=createHmac('sha256',saved.signingSecret).update(application['x-lamp-timestamp']+'.').update(signedBytes).digest('base64url');
    assert.equal(application['x-lamp-signature'],hmac);
    const envelope=['integrations.webhook.v1',application['webhook-tenant'],application['webhook-destination'],application['webhook-event'],application['webhook-id'],application['webhook-timestamp'],received.body];
    assert.equal(application['webhook-signature'],'v1='+createHmac('sha256',saved.signingSecret).update(JSON.stringify(envelope)).digest('hex'));
    const delivery=(await request('/api/notifications')).deliveries.find(d=>d.id===queued.deliveryId);
    assert.equal(delivery.state,'accepted');assert.equal(delivery.status,200);assert.ok(delivery.responseExcerpt.includes('[redacted]'));
    await request(path+'/test',sample.test);await f.run(f.first);
    assert.equal(records.length,before+preview.samples.indexOf(sample)+1,'a replay after acceptance never sends twice');
   }
   const unchanged=(await request(path+'/preview',{})).samples[0];
   // Unsaved edits can be previewed but cannot authorize sending a saved version.
   const proposed=await request(path+'/preview',{webhookTemplate:{...template,method:mode==='query'?'POST':'PATCH'}});
   assert.ok(proposed.samples.every(s=>s.test===undefined));
   const count=records.length,jobs=(await f.DB.prepare('SELECT * FROM notification_jobs ORDER BY id').all()).results;
   for(const [id,input] of [[randomUUID(),unchanged.test],[saved.id,{sample:unchanged.test.sample+'x'}],[saved.id,{sample:unchanged.test.sample,kind:'trigger'}]])assert.equal((await f.request(`/api/notifications/destinations/${id}/test`,{body:input})).status,400);
   const anonymous=await fetch(f.origin+path+'/test',{method:'POST',headers:{'content-type':'application/json',origin:f.origin},body:JSON.stringify(unchanged.test)});assert.equal(anonymous.status,401);
   assert.equal((await f.request(path+'/test',{body:unchanged.test,headers:{origin:'https://foreign.example.test'}})).status,403);
   assert.deepEqual((await f.DB.prepare('SELECT * FROM notification_jobs ORDER BY id').all()).results,jobs);
   await request(path+'/rotate',{});
   assert.equal((await f.request(path+'/test',{body:unchanged.test})).status,400,'rotation invalidates preview authority');
   await f.run(f.first);assert.equal(records.length,count);
  }
  const erasePreview=(await request(`/api/notifications/destinations/${saved.id}/preview`,{})).samples[0];
  await request(`/api/notifications/destinations/${saved.id}`,undefined,'DELETE');
  assert.equal((await f.request(`/api/notifications/destinations/${saved.id}/test`,{body:erasePreview.test})).status,400);
  assert.deepEqual(await healthSnapshot(),health,'samples create no monitoring, incident, recovery, schedule or evidence rows');
  assert.deepEqual(healthView(await f.state(monitor.id)),state);assert.deepEqual(await request(`/api/monitors/${monitor.id}/history`),history);
  const archive=await request('/api/archive');
  assert.ok(!JSON.stringify(archive).includes(headerSecret));
  assert.ok(!JSON.stringify(archive).includes(firstSample.test.sample),'preview tokens never enter portable history');
  receiving=await fixture();
  assert.equal((await receiving.request('/api/restore',{body:archive})).status,200);
  const restored=(await receiving.request('/api/notifications')).data;
  assert.ok(restored.deliveries.length>0&&restored.deliveries.every(d=>d.state==='imported-inactive'));
  assert.ok(restored.destinations.every(d=>!d.enabled&&!d.credentialsAvailable));
  const beforeRestoreRun=records.length;await receiving.run(receiving.first);assert.equal(records.length,beforeRestoreRun,'inactive sample history never replays');
  console.log('WEBHOOK-001 native parity: 12 previewed samples, exact request target, complete application headers, raw UTF-8, independently verified HMAC, accepted outcomes, replay and authority refusals, unchanged monitoring history.');
 }finally{try{await receiving?.close()}finally{await edge.close()}}
}
