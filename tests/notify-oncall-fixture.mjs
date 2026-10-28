import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {fixture,closeServer} from './resilience/support.mjs';
import {loopbackWireTransport} from './notify-acceptance-receivers.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {availablePorts,migratedWorker,ownerAPI} from './notify-acceptance-runtime.mjs';
import {join} from 'node:path';
import {startLocalWorker} from './mail-provider-fixture.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));
export async function proveOncallHandoff(){
 console.log('ONCALL_PROOF starting emitted Worker');
 const f=await fixture(),key=randomBytes(32).toString('hex'),events=new Map(),alerts=new Map(),records=[],errors=[];
 let disposition='lost',restarted,restored;
 // Only this edge substitutes for Oncall. The application, authenticated owner
 // routes, signed probe results, scheduler and dispatcher are the emitted product.
 const server=createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const raw=Buffer.concat(chunks).toString('utf8'),event=JSON.parse(raw);
   assert.equal(req.url,'/api/ingress/intake:synthetic-uptime-1');
   assert.equal(req.headers.authorization,'Bearer '+key);
   assert.deepEqual(Object.keys(event).sort(),['source','eventId','service','environment','key','generation','intent','severity','title','observedAt','evidence'].sort());
   assert.equal(event.source,'intake:synthetic-uptime-1');assert.equal(event.service,'synthetic-uptime-2');
   assert.equal(event.environment,'synthetic-uptime-3');assert.equal(event.severity,'critical');
   assert.ok(event.evidence.startsWith(f.origin+'/app/monitors/'));
   const existing=events.get(event.eventId);if(existing)assert.equal(existing.raw,raw,'retry content is immutable');
   const receipt=existing?.receipt??{duplicate:false,id:randomUUID(),eventId:event.eventId,service:event.service,observedAt:event.observedAt,acceptedAt:new Date().toISOString()};
   events.set(event.eventId,{raw,receipt});alerts.set(event.key+':'+event.generation,event.intent);
   records.push({raw,event,at:Date.now()});
   if(disposition==='lost'){req.socket.destroy();return}
   if(disposition==='timeout'){await sleep(4000);if(res.destroyed)return}
   if(disposition==='5xx'){res.writeHead(503);res.end('{}');return}
   res.writeHead(existing?200:201,{'content-type':'application/json'});
   res.end(disposition==='missing'?'{}':disposition==='unrouted'?JSON.stringify({...receipt,service:null}):JSON.stringify({...receipt,duplicate:Boolean(existing)}));
  }catch(error){errors.push(error);res.writeHead(422);res.end('{}')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint='https://oncall.example.com/api/ingress/intake:synthetic-uptime-1';
 const transport=loopbackWireTransport(new Map([[endpoint,{port:server.address().port,path:'/api/ingress/intake:synthetic-uptime-1'}]]));
 const ok=async(path,body,method)=>{const r=await f.request(path,{body,...(method?{method}:{})});assert.ok(r.status>=200&&r.status<300,path+': '+r.status+' '+JSON.stringify(r.data));return r.data};
 const rpc=async(_path,body)=>{const r=await f.request('/api/runner/notifications',{body,runner:f.first});assert.equal(r.status,200);return r.data};
 const send=()=>dispatchNotifications(rpc,transport);
 // Claim one scheduled round before any probe I/O. Completing one runner
 // before claiming the next can cross the slot boundary and leave recovery
 // without independent evidence in a single slot.
 const probeRound=async runners=>{
  const tasks=[];for(const runner of runners)tasks.push(await f.claim(runner));
  const evidence=await Promise.all(tasks.map(task=>task?f.evidence(task):null));
  for(let i=0;i<runners.length;i++)if(tasks[i])assert.equal((await f.submit(runners[i],tasks[i],[evidence[i]])).status,200);
 };
 const rows=async()=> (await ok('/api/notifications')).deliveries.filter(d=>d.destinationId===destination.id);
 const retry=async()=>{const row=(await rows()).find(d=>d.state==='queued');assert.ok(row,'uncertain handoff retains a retry');const due=row.attemptHistory.findLast(a=>a.started_at===null)?.scheduled_at;assert.ok(due);await sleep(due-Date.now()+30);await send()};
 let destination;
 try{
  console.log('ONCALL_PROOF configuring destination');
  destination=await ok('/api/notifications/destinations',{name:'synthetic-uptime-1',kind:'webhook',url:endpoint,webhookSigning:true,
   webhookTemplate:{version:1,method:'POST',mode:'oncall',template:{source:'intake:synthetic-uptime-1',service:'synthetic-uptime-2',environment:'synthetic-uptime-3'},headerNames:['authorization']},webhookHeaders:{authorization:'Bearer '+key}});
  const same=await ok('/api/runners',{networkLabel:f.first.networkLabel});
  const monitor=await f.monitor({name:'synthetic-uptime-4',runners:[f.first,same,f.second],freshnessMs:5000});
  const input={scope:'monitor',mode:'selected',destinationIds:[destination.id],expectedRevision:0,contactSettings:{[destination.id]:{repeatMinutes:1,maxRepeats:1}}};
  const route='/api/monitors/'+monitor.id+'/alert-route',preview=await ok(route+'/preview',input);
  await ok(route+'/apply',{...input,digest:preview.digest});
  const tasks=[];
  for(const runner of [f.first,same,f.second])tasks.push(await f.claim(runner));
  for(let i=0;i<2;i++)assert.equal((await f.submit([f.first,same][i],tasks[i],[await f.evidence(tasks[i])])).status,200);
  await send();assert.equal((await rows()).length,0,'a repeated network label cannot supply an independent failure confirmation');
  assert.equal((await f.state(monitor.id)).targetState,'Degraded');
  assert.equal((await f.submit(f.second,tasks[2],[await f.evidence(tasks[2])])).status,200);
  await send();
  let delivery=(await rows())[0];assert.equal(delivery.state,'queued');assert.equal(delivery.handoff.acknowledged.state,'unknown');
  assert.equal(alerts.size,1,'Oncall may retain the alert even when its response is lost');
  disposition='5xx';await retry();delivery=(await rows())[0];assert.equal(delivery.state,'queued');
  disposition='timeout';await retry();delivery=(await rows())[0];assert.equal(delivery.state,'queued');
  disposition='missing';await retry();delivery=(await rows())[0];assert.equal(delivery.state,'queued','a 2xx without a native receipt is uncertain');
  disposition='unrouted';await retry();delivery=(await rows())[0];assert.equal(delivery.state,'queued','unrouted custody does not acknowledge a service alert');
  disposition='accepted';await retry();delivery=(await rows())[0];assert.equal(delivery.state,'accepted');assert.equal(alerts.size,1);
  assert.equal(new Set(records.map(r=>r.raw)).size,1);assert.equal(new Set(records.map(r=>r.event.eventId)).size,1);
  assert.equal(records[0].event.title.split(f.first.networkLabel).length-1,1,'wire evidence counts a repeated label once');
  assert.ok(records[0].event.title.includes(f.second.networkLabel));
  const ack=delivery.handoff.acknowledged;assert.equal(ack.state,'acknowledged');assert.ok(ack.at);assert.ok(ack.receiptId);assert.ok(ack.receiverAcceptedAt);
  for(const name of ['received','responded'])assert.deepEqual([delivery.handoff[name].state,delivery.handoff[name].source,delivery.handoff[name].at],['unknown',null,null]);
  const incidentId=delivery.eventId;
  const detail=await ok('/api/incidents/'+incidentId);
  assert.equal(detail.timeline.filter(t=>t.kind==='sibling_handoff').length,1);
  assert.deepEqual(detail.deliveries.find(d=>d.id===delivery.id).handoff,delivery.handoff);
  // Lost probes after confirmed failure neither recover nor claim availability.
  await sleep(5500);
  assert.equal((await f.state(monitor.id)).state,'Unknown');
  assert.equal((await rows()).some(d=>d.event.kind==='recovery'),false);
  await probeRound([f.first,same,f.second]);
  // Keep real evidence fresh while the configured one-minute repeat becomes due.
  const repeatDue=delivery.event.observedAt+60000;
  while(Date.now()<repeatDue){await sleep(Math.min(4000,repeatDue-Date.now()));await probeRound([f.first,same,f.second])}
  await send();
  const repeat=(await rows()).find(d=>d.event.kind==='reminder');assert.ok(repeat);assert.equal(repeat.state,'accepted');
  assert.deepEqual(repeat.handoff.acknowledged,ack,'a repeat does not create a second acknowledgement');
  await (restarted??f.worker).dispose();
  restarted=await startLocalWorker({persist:f.directory,port:Number(new URL(f.origin).port),bindings:f.bindings});await restarted.ready;
  await send();assert.deepEqual((await rows())[0].handoff.acknowledged,ack);
  f.modes.target=200;await sleep(5100);await probeRound([f.first,same,f.second]);await send();
  const recovered=(await rows()).find(d=>d.event.kind==='recovery');assert.ok(recovered);assert.equal(recovered.state,'accepted');
  const recovery=records.find(r=>r.event.intent==='recover').event,trigger=records[0].event;
  assert.equal(recovery.key,trigger.key);assert.equal(recovery.generation,trigger.generation);assert.notEqual(recovery.eventId,trigger.eventId);
  assert.deepEqual(recovered.handoff.acknowledged,ack);
  assert.equal((await ok('/api/incidents/'+incidentId)).timeline.filter(t=>t.kind==='sibling_handoff').length,1);
  const archive=await ok('/api/archive');
  for(const value of [archive,await ok('/api/notifications'),await ok('/api/incidents/'+incidentId)]){
   const text=JSON.stringify(value);for(const secret of [key,destination.signingSecret,endpoint])assert.ok(!text.includes(secret),'no receiver credential or endpoint enters retained reads');
  }
  const restorePort=(await availablePorts(1))[0],restoredOrigin='http://127.0.0.1:'+restorePort;
  const restoring=ownerAPI(restoredOrigin);
  ({worker:restored}=await migratedWorker({port:restorePort,persist:join(f.directory,'restored-oncall'),bindings:f.bindings}));
  await restoring.signIn(f.bindings);
  const imported=await restoring.api('/api/restore','POST',archive);assert.equal(imported.status,200,JSON.stringify(imported.data));
  const retained=(await restoring.api('/api/notifications')).data.deliveries;
  assert.ok(retained.every(d=>d.state==='imported-inactive'));
  assert.deepEqual(retained.find(d=>d.id===delivery.id).handoff.acknowledged,ack,'inactive history retains its original receipt without new send authority');
  await restored.dispose();restored=null;
  await ok('/api/notifications/destinations/'+destination.id,undefined,'DELETE');
  const erased=await ok('/api/incidents/'+incidentId);assert.equal(erased.deliveries.length,0);assert.equal(erased.timeline.filter(t=>t.kind==='sibling_handoff').length,0,'destination erasure removes receipt evidence');
  await f.pause(monitor);
  assert.deepEqual(errors,[]);
  console.log('BOUNDARY-001 native handoff: configured route, stable key and generation, loss, 5xx, timeout, missing receipt, repeat, recovery, restart, three distinct facts, missing probes and distinct network evidence passed');
 }finally{await closeServer(server);await restored?.dispose();await restarted?.dispose();await f.close()}
}
