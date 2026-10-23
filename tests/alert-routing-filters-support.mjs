import assert from 'node:assert/strict';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {catalogEdge,hosts} from './service-catalog-fixture.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
// Actual confirmed-event admission and production dispatch. A sample read is
// not treated as a sent drill; only the target/provider and receiver are faked.
export async function proveRoutingFilters(f,ok){
 const received=[],url='https://routing-filter.example.com/receive';
 const destination=await ok('/api/notifications/destinations',{name:'Synthetic routing filter receiver',kind:'webhook',url,enabled:true});
 const transport={async send(wire,beforeRequest){assert.equal(wire.url,url);await beforeRequest();received.push(JSON.parse(wire.body));return {status:202,headers:{},body:''}}};
 const rpc=async(_path,body)=>ok('/api/runner/notifications',body,{runner:f.first});
 const clock=offset=>new Date(Date.now()+offset).toISOString().slice(11,16);
 const quiet={timeZone:'UTC',start:clock(-3600000),end:clock(3600000)};
 const open={timeZone:'UTC',start:clock(2*3600000),end:clock(3*3600000)};
 const save=async(m,filters,quietHours)=>{const path=`/api/monitors/${m.id}/alert-route`,current=await ok(path),input={scope:'monitor',mode:'selected',destinationIds:[destination.id],teamIds:[],filters,quietHours,expectedRevision:current.policies.find(p=>p.scope==='monitor').revision};const p=await ok(path+'/preview',input);await ok(path+'/apply',{...input,digest:p.digest})};
 const rows=async id=>(await ok('/api/notifications')).deliveries.filter(j=>j.event.monitorId===id);
 for(const kind of ['trigger','slow'])for(const held of [false,true]){
  f.modes.target=kind==='slow'?200:503;f.modes.delayMs=kind==='slow'?40:0;
  const m=await f.monitor({name:`${kind} ${held?'quiet':'open'} admission`,enabled:false,runners:[f.first],canary:true,environment:'production',...(kind==='slow'?{slow:{thresholdMs:1,mode:'consecutive',slots:1,locations:'all',destinationIds:[destination.id],contactSettings:{}}}:{})});
  const filters={environments:['production'],origins:[kind==='trigger'?'monitor':'slow'],severities:[kind==='trigger'?'critical':'warning'],regions:['local-a']};
  await save(m,filters,held?quiet:open);
  await ok('/api/monitors/'+m.id,{...m.definition,enabled:true},{method:'PATCH'});
  const task=await f.claim(f.first);assert.equal(task.monitorId,m.id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
  await dispatchNotifications(rpc,transport);
  const deliveries=await rows(m.id);assert.equal(deliveries.length,1);assert.equal(deliveries[0].event.kind,kind);assert.equal(deliveries[0].state,held?'queued':'accepted');assert.equal(deliveries[0].attempts,held?0:1);
  assert.equal(received.filter(e=>e.monitorId===m.id).length,held?0:1);
  await f.pause(m);
  // Clear its held work by erasure before exercising the next alert class.
  await ok('/api/monitors/'+m.id+'/erase',{name:m.definition.name});
 }
 // A custom Slow destination cannot bypass the ordinary route's environment,
 // severity, origin or region filter. Each dimension excludes a real notice.
 for(const mismatch of [{environments:['staging']},{severities:['critical']},{origins:['monitor']},{regions:['local-b']}]){
  f.modes.target=200;f.modes.delayMs=40;
  const m=await f.monitor({name:'Excluded custom Slow',enabled:false,runners:[f.first],canary:true,environment:'production',slow:{thresholdMs:1,mode:'consecutive',slots:1,locations:'all',destinationIds:[destination.id],contactSettings:{}}});
  await save(m,mismatch,open);await ok('/api/monitors/'+m.id,{...m.definition,enabled:true},{method:'PATCH'});
  const task=await f.claim(f.first);assert.equal(task.monitorId,m.id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
  assert.ok((await ok(`/api/monitors/${m.id}/slow-policy`)).status,'real Slow opens despite route exclusion');
  assert.equal((await rows(m.id)).length,0);await f.pause(m);await ok('/api/monitors/'+m.id+'/erase',{name:m.definition.name});
 }
 f.modes.target=503;f.modes.delayMs=0;
 // Disable an unsent primary during route quiet: its terminal failure advances
 // the real fallback chain, whose otherwise unrestricted contact must inherit
 // the route window. A sample preview alone cannot prove this path.
 const primary=await ok('/api/notifications/destinations',{name:'Synthetic disabled quiet primary',kind:'webhook',url:'https://routing-filter.example.com/primary',enabled:true});
 const fallbackMonitor=await f.monitor({name:'Route quiet fallback',enabled:false,runners:[f.first],canary:true,environment:'production'});
 const fallbackPath=`/api/monitors/${fallbackMonitor.id}/alert-route`,fallbackPolicy={scope:'monitor',mode:'selected',destinationIds:[primary.id],teamIds:[],filters:{environments:['production']},quietHours:quiet,fallback:{destinationIds:[destination.id],deadlineSeconds:5},expectedRevision:0};
 const fallbackPreview=await ok(fallbackPath+'/preview',fallbackPolicy);await ok(fallbackPath+'/apply',{...fallbackPolicy,digest:fallbackPreview.digest});
 await ok('/api/monitors/'+fallbackMonitor.id,{...fallbackMonitor.definition,enabled:true},{method:'PATCH'});
 const fallbackTask=await f.claim(f.first);assert.equal(fallbackTask.monitorId,fallbackMonitor.id);assert.equal((await f.submit(f.first,fallbackTask,[await f.evidence(fallbackTask)])).status,200);
 await ok('/api/notifications/destinations/'+primary.id,{name:primary.name,enabled:false},{method:'PATCH'});
 await dispatchNotifications(rpc,transport);
 const fallbackRows=await rows(fallbackMonitor.id),fallback=fallbackRows.find(j=>j.destinationId===destination.id);
 assert.ok(fallback,'disabled primary advances its saved fallback chain');assert.equal(fallback.state,'queued');assert.equal(fallback.code,'waiting_for_contact_quiet');assert.equal(fallback.attempts,0);assert.ok(fallback.quietUntil>Date.now());
 assert.equal(received.filter(e=>e.monitorId===fallbackMonitor.id).length,0);
 await f.pause(fallbackMonitor);await ok('/api/monitors/'+fallbackMonitor.id+'/erase',{name:fallbackMonitor.definition.name});
 // The provider class is created through the catalog's live source-check and
 // follow doors, then the real signed runner reads the controlled status edge.
 const edge=await catalogEdge(f.directory);
 try{
  await ok('/api/runners/'+f.second.runnerId,undefined,{method:'DELETE'});
  await ok('/api/external-check',{url:`https://${hosts.canary}/health`});
  for(const held of [false,true]){
   edge.state.stripe.statuses.api='up';
   const check=await ok('/api/service-catalog/checks',{entry:'stripe',scope:'components',components:['api']});
   const controller=new AbortController(),looking=runRunner({origin:f.origin,key:f.first.key,runnerId:f.first.runnerId,localReview:true,signal:controller.signal,pollMs:100,transport});
   try{const until=Date.now()+15000;while((await ok('/api/discoveries/'+check.id)).status!=='done'){assert.ok(Date.now()<until,'dependency source check finishes');await new Promise(r=>setTimeout(r,50))}}finally{controller.abort();await looking}
   const followed=await ok('/api/service-follows',{check:check.id}),id=followed.followed[0].monitorId;
   const current=(await ok('/api/overview')).monitors.find(m=>m.id===id),m={id,definition:{...current.definition,enabled:false,confirmSlots:1,recoverSlots:1,retries:0,environment:'production'}};
   await ok('/api/monitors/'+id,m.definition,{method:'PATCH'});
   await save(m,{environments:['production'],severities:['info'],origins:['dependency'],regions:m.definition.probes},held?quiet:open);
   await ok('/api/monitors/'+id,{...m.definition,enabled:true},{method:'PATCH'});
   edge.state.stripe.statuses.api='down';
   await runRunner({origin:f.origin,key:f.first.key,runnerId:f.first.runnerId,localReview:true,once:true,transport});
   await dispatchNotifications(rpc,transport);
   const deliveries=await rows(id);assert.equal(deliveries.length,1);assert.equal(deliveries[0].event.kind,'dependency');assert.equal(deliveries[0].state,held?'queued':'accepted');assert.equal(deliveries[0].attempts,held?0:1);
   assert.equal((await ok('/api/monitors/'+id+'/incidents')).length,0,'dependency notice creates no Uptime incident');
   await f.pause(m);await ok('/api/monitors/'+id+'/erase',{name:m.definition.name});
  }
 }finally{await edge.close()}
 console.log('ROUTING-001 actual outage, custom Slow and dependency queues/deliveries inside and outside route quiet; all Slow filter dimensions exclude');
}
