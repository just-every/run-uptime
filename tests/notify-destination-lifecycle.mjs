import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {lifecycleRuntime,lifecycleEndpoints as endpoints} from './notify-lifecycle-runtime.mjs';
import {signedReceiverVerifier,verifySlack} from './notify-acceptance-receivers.mjs';
import {waitFor} from './notify-acceptance-runtime.mjs';

export async function proveDestinationLifecycle(){
 for(const mode of ['runner','worker'])await lifecycleJourney(mode);
}

async function lifecycleJourney(mode){
 const requests=[];let webhookSecret,webhookCredential;
 const runtime=await lifecycleRuntime(mode,async(kind,endpoint,record)=>{
  if(kind==='webhook')await signedReceiverVerifier({secret:webhookSecret,tenant:'uptime-notifications',destinationId:webhookCredential})(record);
  if(kind==='slack')verifySlack(record);
  requests.push({kind,endpoint,...record});
 });
 const ok=async(path,method='GET',body)=>{const result=await runtime.api(path,method,body);assert.ok(result.status>=200&&result.status<300,`${mode} ${method} ${path}: ${result.status} ${result.data?.error??''}`);return result.data};
 const notes=()=>ok('/api/notifications');
 const credential=async id=>(await runtime.DB.prepare('SELECT credential_id FROM notification_destinations WHERE id=?').bind(id).first()).credential_id;
 const jobs=async()=>(await runtime.DB.prepare('SELECT * FROM notification_jobs ORDER BY id').all()).results;
 const destinations=[];
 try{
  for(const value of [{name:'Lifecycle inbox',kind:'email',address:endpoints.email[0]},{name:'Lifecycle Slack',kind:'slack',url:endpoints.slack[0]},{name:'Lifecycle signed receiver',kind:'webhook',url:endpoints.webhook}])destinations.push(await ok('/api/notifications/destinations','POST',value));
  const [email,slack,webhook]=destinations;
  webhookSecret=webhook.signingSecret;webhookCredential=await credential(webhook.id);
  const originalCredentials=new Map(await Promise.all(destinations.map(async d=>[d.id,await credential(d.id)])));
  const monitor=await ok('/api/monitors','POST',{name:'Lifecycle café <!channel> <script>',url:runtime.monitorURL,...(mode==='runner'?{probes:['local-a']}:{}),intervalMs:runtime.intervalMs,retries:0,confirmSlots:1,recoverSlots:1,freshnessMs:runtime.intervalMs*3});
  await runtime.transition(monitor.id,true);

  const incident=async(enabled,currentCredentials,authority)=>{
   const beforeJobs=await jobs(),beforeRequests=requests.length,beforeAlerts=(await ok('/api/overview')).alerts;
   for(const passing of [false,true]){
    await runtime.transition(monitor.id,passing);
    if(enabled)await waitFor(async()=>{await runtime.drain();const rows=(await notes()).deliveries.filter(row=>row.event.monitorId===monitor.id&&!beforeJobs.some(old=>old.id===row.id));return rows.filter(row=>row.event.kind===(passing?'recovery':'trigger')&&row.state==='accepted').length===3},'current-authority deliveries accepted');
   }
   const added=(await jobs()).filter(row=>!beforeJobs.some(old=>old.id===row.id));
   const events=(await ok('/api/overview')).alerts.filter(row=>!beforeAlerts.some(old=>old.id===row.id)&&row.event.monitorId===monitor.id);
   assert.deepEqual(events.map(row=>row.event.kind).sort(),['recovery','trigger'],'genuine scheduled transitions remain retained even with destinations disabled');
   if(!enabled){assert.deepEqual(added,[],'disabled destinations create no automatic jobs');assert.equal(requests.length,beforeRequests,'disabled destinations make no automatic requests');return}
   assert.equal(added.length,6,'each transition creates exactly one job per enabled destination');
   assert.equal(requests.length,beforeRequests+6,'each job reaches its provider edge once');
   const deliveries=(await notes()).deliveries;
   for(const destination of destinations){
    const pair=added.filter(row=>row.destination_id===destination.id);assert.deepEqual(pair.map(row=>JSON.parse(row.event).kind).sort(),['recovery','trigger']);
    for(const job of pair){
     const event=JSON.parse(job.event),delivery=deliveries.find(row=>row.id===job.id);
     assert.equal(job.credential_id,currentCredentials.get(destination.id),'scheduled job snapshots current credential authority');assert.equal(delivery.state,'accepted');assert.equal(delivery.attempts,1);
     assert.ok(events.some(row=>row.id===job.event_id&&row.event.incidentKey===event.incidentKey),'delivery belongs to the actual scheduled incident');
     const escapedTitle=event.title.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
     const matches=requests.slice(beforeRequests).filter(request=>request.kind===destination.kind&&(destination.kind==='email'?request.body.custom_args.rer_delivery_id===job.id:destination.kind==='webhook'?request.headers.get('webhook-id')===job.id:request.body.text.includes(escapedTitle)));
     assert.equal(matches.length,1,'one correlated wire request per scheduled destination job');
     const wire=matches[0];
     if(destination.kind==='email')assert.equal(wire.endpoint,endpoints.email[authority]);
     if(destination.kind==='slack'){
      assert.equal(wire.endpoint,endpoints.slack[authority]);
      const saved=await runtime.DB.prepare("SELECT envelope FROM integration_deliveries WHERE namespace='uptime-notifications' AND id=?").bind(job.id).first();
      const envelope=JSON.parse(saved.envelope);assert.equal(envelope.destinationId,job.credential_id);assert.deepEqual(JSON.parse(envelope.body),wire.body,'Slack request is the immutable current-credential job');
     }
     if(destination.kind==='webhook'){assert.equal(wire.headers.get('webhook-destination'),job.credential_id);assert.equal(wire.body.id,job.event_id)}
    }
   }
  };

  await incident(true,originalCredentials,0);
  const historical=await jobs(),oldSecret=webhookSecret,rotationStart=requests.length;
  await ok(`/api/notifications/destinations/${email.id}`,'PATCH',{name:email.name,enabled:true,address:endpoints.email[1]});
  await ok(`/api/notifications/destinations/${slack.id}`,'PATCH',{name:slack.name,enabled:true,url:endpoints.slack[1]});
  webhookSecret=(await ok(`/api/notifications/destinations/${webhook.id}/rotate`,'POST',{})).signingSecret;
  const currentCredentials=new Map(await Promise.all(destinations.map(async d=>[d.id,await credential(d.id)])));webhookCredential=currentCredentials.get(webhook.id);
  for(const destination of destinations){
   assert.notEqual(currentCredentials.get(destination.id),originalCredentials.get(destination.id),'rotation installs new authority');
   const retired=await runtime.DB.prepare('SELECT * FROM notification_credentials WHERE id=?').bind(originalCredentials.get(destination.id)).first();
   assert.ok(retired.retired_at);assert.equal(retired.ciphertext,null,'retired credential bytes are removed');
  }
  await incident(true,currentCredentials,1);
  const beforeDisable=await jobs();
  for(const destination of destinations)await ok(`/api/notifications/destinations/${destination.id}`,'PATCH',{name:destination.name,enabled:false});
  assert.ok((await notes()).destinations.every(d=>!d.enabled));
  await incident(false,currentCredentials,1);
  const disabledRequests=requests.length;
  await runtime.drain();await runtime.drain();
  assert.equal(requests.length,disabledRequests,'later dispatch cannot send automatic requests after disable');
  assert.deepEqual(await jobs(),beforeDisable,'later dispatch cannot create automatic jobs after disable');

  // Explicitly requested tests remain available to disabled destinations.
  const evidence=async()=>{
   const rows={};for(const table of ['monitors','revisions','slots','observations','outbox'])rows[table]=(await runtime.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;return rows;
  };
  // Pause scheduled checking before the evidence comparison, through the owner door.
  const current=(await ok('/api/overview')).monitors.find(m=>m.id===monitor.id);
  await ok(`/api/monitors/${monitor.id}`,'PATCH',{...current.definition,enabled:false});
  const beforeEvidence=await evidence(),beforeTests=requests.length;
  for(const destination of destinations){
   const test=await ok(`/api/notifications/destinations/${destination.id}/test`,'POST',{});
   await waitFor(async()=>{await runtime.drain();return (await notes()).deliveries.find(row=>row.id===test.deliveryId)?.state==='accepted'},'explicit disabled-destination test accepted');
   const row=(await jobs()).find(row=>row.id===test.deliveryId);assert.equal(JSON.parse(row.event).kind,'test');assert.equal(row.credential_id,currentCredentials.get(destination.id));
  }
  assert.equal(requests.length,beforeTests+3);assert.deepEqual(await evidence(),beforeEvidence,'explicit disabled-destination tests cannot change monitoring evidence or incidents');
  for(const request of requests.slice(rotationStart)){
   if(request.kind==='email')assert.equal(request.endpoint,endpoints.email[1],'every new email reaches only the current address');
   if(request.kind==='slack')assert.equal(request.endpoint,endpoints.slack[1],'every new Slack request reaches only the current endpoint');
   if(request.kind==='webhook')assert.notEqual(request.headers.get('x-lamp-signature'),createHmac('sha256',oldSecret).update(request.headers.get('x-lamp-timestamp')+'.').update(request.raw).digest('base64url'),'retired signing key cannot authenticate a new request');
  }
  const finalJobs=await jobs();
  for(const row of historical)assert.deepEqual(finalJobs.find(final=>final.id===row.id),row,'rotation and disable preserve historical outcomes');
  const archive=JSON.stringify(await ok('/api/archive')),publicReads=JSON.stringify(await notes());
  for(const value of [oldSecret,webhookSecret,...endpoints.slack]){assert.ok(!archive.includes(value),'archive excludes local authority');assert.ok(!publicReads.includes(value),'operator read excludes local authority')}
  for(const destination of destinations){const row=await runtime.DB.prepare('SELECT * FROM notification_credentials WHERE id=?').bind(currentCredentials.get(destination.id)).first();assert.ok(row.ciphertext);assert.equal(row.endpoint,null);assert.equal(row.signing_secret,null)}
  console.log(`PASS ${mode} destination lifecycle: rotated email, Slack and signing authority; scheduled trigger and recovery correlated once; disabled automatic delivery; explicit tests and history preserved`);
 }finally{await runtime.close()}
}
