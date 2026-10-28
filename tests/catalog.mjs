import http from 'node:http';
import {createHmac} from 'node:crypto';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
// MONITOR-001: the owner reviews and atomically applies a catalog batch, then organises its retained history.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,finishSetup} from './auth-test-support.mjs';

test('MONITOR-001 catalog adds, metadata, lifecycle and undo keep reviewed revisions and history',async()=>{
 const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;let worker,edge;const originalRequest=http.request;
 try{
  edge=http.createServer((_request,response)=>{response.writeHead(200);response.end('synthetic-uptime-clone-result')});await new Promise(resolve=>edge.listen(0,'127.0.0.1',resolve));const edgePort=edge.address().port;
  http.request=function(options,...args){if(['93.184.216.34','93.184.216.35'].includes(options?.hostname)&&Number(options.port)===edgePort){assert.equal(options.headers.host,`${options.hostname}:${edgePort}`);return originalRequest.call(this,{...options,hostname:'127.0.0.1'},...args)}return originalRequest.call(this,options,...args)};
  let DB;({worker,DB}=await migratedWorker({port,persist:join(directory,'local'),bindings:{UPTIME_ORIGIN:origin},outboundService:async request=>{
   const url=new URL(request.url);assert.equal(url.hostname,'cloudflare-dns.com','catalog only resolves the requested target');
   assert.equal(url.searchParams.get('name'),'private.catalog.example.test');
   return Response.json({Status:0,Answer:[{type:1,data:'10.0.0.8'}]});
  }}));
  const auth=authRequest(origin),cookie=sessionCookie(await auth('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Catalog owner'}));
  await finishSetup(origin,cookie);
  const request=async(path,body,{method=body===undefined?'GET':'POST',headers={}}={})=>{
   const response=await fetch(origin+path,{method,headers:{origin,cookie,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
   return {status:response.status,data:await response.json()};
  };
  const ok=async(path,body,options)=>{const result=await request(path,body,options);assert.ok(result.status>=200&&result.status<300,`${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};
  const scan=async()=>{
   const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA' ORDER BY name").all()).results.map(r=>r.name);
   return Object.fromEntries(await Promise.all(names.map(async name=>[name,(await DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results])));
  };
  const unchanged=async run=>{const before=await scan(),result=await run();assert.deepEqual(await scan(),before);return result};
  const preview=(input,add=false)=>ok(`/api/catalog/${add?'add/':''}preview`,input);
  const apply=(input,digest,add=false)=>request(`/api/catalog/${add?'add/':''}apply`,{...input,digest});
  const bulk=async input=>{const plan=await preview(input);const result=await apply(input,plan.digest);assert.equal(result.status,201,JSON.stringify(result.data));return result.data};
  const undo=batchId=>ok(`/api/definitions/batches/${batchId}/undo`,{});
  const monitor=async id=>{const row=await DB.prepare('SELECT * FROM monitors WHERE id=?').bind(id).first();return {...row,definition:JSON.parse(row.definition)}};

  await ok('/api/external-check',{url:`http://93.184.216.35:${edgePort}/canary`});
  const seed=await ok('/api/monitors',{name:'Production checkout',url:'https://93.184.216.34/seed',enabled:false,project:'Shop',environment:'production',owner:'Payments team',outcome:'Customers can complete checkout',tags:['checkout']});
  const routeContacts=[];
  for(const [name,enabled] of [['Selected',true],['Disabled',false],['Unselected',true]])routeContacts.push(await ok('/api/notifications/destinations',{name,kind:'webhook',url:`https://catalog.example.test/${name.toLowerCase()}`,enabled}));
  const policy={scope:'monitor',mode:'selected',destinationIds:routeContacts.slice(0,2).map(d=>d.id),expectedRevision:0};
  const policyPreview=await ok(`/api/monitors/${seed.id}/alert-route/preview`,policy);
  await ok(`/api/monitors/${seed.id}/alert-route/apply`,{...policy,digest:policyPreview.digest});
  const named=await ok('/api/routing/named-routes',{name:'Payments',monitorId:seed.id});
  const defaults={intervalMs:60000,locations:['local-a','local-b'],project:'Shop',environment:'staging',owner:'Payments team',tags:['catalog'],dependencies:[seed.id]};
  const urls=Array.from({length:47},(_,i)=>`http://93.184.216.34:${edgePort}/batch/${i}`);
  const input={format:'urls',text:[...urls,'https://93.184.216.34:443/seed','invalid URL','http://10.0.0.8/'].join('\n'),defaults,enableAfterCreate:true,alertRoute:named.id};
  const plan=await unchanged(()=>preview(input,true));
  assert.deepEqual(plan.counts,{create:47,change:0,unchanged:0,duplicate:1,refused:2,excluded:0});
  assert.equal(plan.entries[47].monitorId,seed.id);
  assert.equal(plan.quota.used,1);assert.equal(plan.quota.after,48);
  assert.equal(plan.cost.currency,'USD');assert.equal(plan.cost.status,'unpriced');assert.equal(plan.cost.amount,null);
  assert.equal(plan.unsupported.length,0);
  assert.equal(plan.alertRoute.id,named.id);assert.deepEqual(plan.alertRoute.policy,named.policy);
  assert.match(plan.alertRoute.warning,/consent and confirmation remain unchanged/);
  for(const entry of plan.entries.filter(e=>e.action==='create')){
   assert.deepEqual(entry.target.probes,['local-a','local-b']);assert.equal(entry.alertRoute.readyCount,1);
   assert.deepEqual(entry.alertRoute.effective.destinationIds,policyPreview.current.destinationIds);
   assert.equal(entry.alertRoute.recipients.find(d=>d.id===routeContacts[1].id).reason,'disabled');
   assert.equal(entry.alertRoute.recipients.find(d=>d.id===routeContacts[2].id).reason,'not_selected');
  }
  assert.equal(plan.projectedChecksPerDay,47*2*1440);
  for(const entry of plan.entries.filter(e=>e.action==='refused'))assert.ok(entry.reason);
  const csv={...input,format:'csv',text:'url,name,tags,group\n'+[...urls.map((url,i)=>`${url},Row ${i},"row|checkout",Shop`),'https://93.184.216.34:443/seed,Existing,,','invalid URL,Bad,,','http://10.0.0.8/,Private,,'].join('\n')};
  const csvPlan=await unchanged(()=>preview(csv,true));assert.deepEqual(csvPlan.counts,plan.counts);
  assert.deepEqual(csvPlan.alertRoute,plan.alertRoute);assert.deepEqual(csvPlan.entries[0].alertRoute,plan.entries[0].alertRoute);
  assert.deepEqual(csvPlan.entries[0].target.tags,['row','checkout']);assert.equal(csvPlan.entries[0].target.group,'Shop');
  const selection=await unchanged(()=>preview({...input,selectedIndexes:[0,2]},true));assert.equal(selection.counts.create,2);assert.equal(selection.counts.excluded,45);assert.equal(selection.quota.after,3);assert.equal(selection.entries[1].selected,false);
  const emptySelection=await unchanged(()=>preview({...input,selectedIndexes:[]},true));assert.equal(emptySelection.counts.create,0);
  await unchanged(async()=>assert.equal((await apply({...input,selectedIndexes:[]},emptySelection.digest,true)).status,400));
  await unchanged(async()=>assert.equal((await apply({...input,selectedIndexes:[0]},selection.digest,true)).status,409));
  const privateDns=await unchanged(()=>preview({format:'urls',text:'https://private.catalog.example.test/',defaults},true));assert.equal(privateDns.counts.refused,1);
  const missingDependency=await unchanged(()=>preview({monitorIds:[seed.id],action:'edit',changes:{dependencies:['absent-monitor']}}));assert.equal(missingDependency.counts.refused,1);
  await unchanged(async()=>{assert.equal((await apply({...input,text:input.text+'\n'},plan.digest,true)).status,409)});
  await unchanged(async()=>{assert.equal((await apply({...input,enableAfterCreate:false},plan.digest,true)).status,409)});
  const pauseSeed=await bulk({monitorIds:[seed.id],action:'edit',changes:{service:'Checkout'}});
  await unchanged(async()=>assert.equal((await apply(input,plan.digest,true)).status,409));
  await undo(pauseSeed.batchId);
  const refreshed=await preview(input,true),beforeApply=await scan();
  const races=await Promise.all([apply(input,refreshed.digest,true),apply(input,refreshed.digest,true)]);
  assert.deepEqual(races.map(r=>r.status).sort(),[201,409]);
  const added=races.find(r=>r.status===201).data;assert.equal(added.created.length,47);
  const afterApply=await scan();
  assert.equal(afterApply.monitors.length,beforeApply.monitors.length+47);
  assert.equal(afterApply.definition_batches.length,beforeApply.definition_batches.length+1);
  assert.equal(afterApply.definition_batch_entries.length,beforeApply.definition_batch_entries.length+47);
  for(const id of added.created){const current=await monitor(id);assert.equal(current.definition.enabled,true);assert.ok(current.next_due<=Date.now());assert.equal(current.definition.environment,'staging');assert.deepEqual(current.definition.dependencies,[seed.id]);const saved=await ok(`/api/monitors/${id}/alert-route`);assert.equal(saved.policies[0].namedRouteId,named.id);assert.deepEqual(saved.effective.destinationIds,named.policy.destinationIds);}
  const selected=added.created[0],first=afterApply.runners.find(r=>r.legacy_key);
  const checked=new Set();
  for(let i=0;i<47;i++){
   const {task}=await ok('/api/runner/claim',{}, {headers:{'x-runner-key':testAuthBindings.UPTIME_RUNNER_KEY,'x-runner-id':first.runner_id}});
   assert.ok(task,'each enabled monitor has its first scheduled slot ready');assert.ok(added.created.includes(task.monitorId));assert.ok(!checked.has(task.monitorId));checked.add(task.monitorId);
   assert.deepEqual(task.probes,['local-a','local-b']);
   const attempts=await Promise.all(task.probes.map(async probe=>{const observation=await executeTaskProbe(task,probe,{controlPort:port});assert.equal(observation.outcome,'pass');const canaryUrl=task.definition.assignments[probe].canaryUrl;return {...observation,attempt:0,canary:{...await executeTaskProbe({...task,definition:{...task.definition,url:canaryUrl,assertions:{status:200}}},probe,{controlPort:port,statusOnly:true}),attempt:0}}}));
   const result={slotId:task.id,attempts},stamp=String(Date.now()),signature=createHmac('sha256',testAuthBindings.UPTIME_RUNNER_KEY).update(`${stamp}.${JSON.stringify(result)}`).digest('hex');
   assert.equal((await ok('/api/runner/results',result,{headers:{'x-runner-key':testAuthBindings.UPTIME_RUNNER_KEY,'x-runner-id':first.runner_id,'x-sent-at':stamp,'x-runner-signature':signature}})).accepted,true);
  }
  assert.deepEqual(checked,new Set(added.created),'all 47 monitors produced first-slot work at both configured locations');
  let history=await DB.prepare('SELECT * FROM slots ORDER BY rowid').all();assert.ok(history.results.length);
  const edited=await bulk({monitorIds:[selected],action:'edit',changes:{project:'Storefront',tags:['release'],outcome:'Shoppers can pay'}});
  const editRevision=(await monitor(selected)).revision;assert.ok(editRevision>1);assert.equal((await monitor(selected)).definition.enabled,true);
  await undo(edited.batchId);assert.deepEqual((await monitor(selected)).definition.tags,['catalog']);
  const paused=await bulk({monitorIds:[selected],action:'pause'});assert.equal((await monitor(selected)).definition.enabled,false);
  await undo(paused.batchId);assert.equal((await monitor(selected)).definition.enabled,true);
  await bulk({monitorIds:[selected],action:'pause'});
  const resumed=await bulk({monitorIds:[selected],action:'resume'});assert.equal((await monitor(selected)).definition.enabled,true);
  await undo(resumed.batchId);assert.equal((await monitor(selected)).definition.enabled,false);
  await ok(`/api/monitors/${selected}`,{...(await monitor(selected)).definition,url:`http://93.184.216.34:${edgePort}/clone`,canaryUrl:`http://93.184.216.35:${edgePort}/canary`,maintenanceWindows:[{id:'source-deploy',name:'Source deployment',timeZone:'America/New_York',mode:'pause',startsAt:Date.now()+3600000,endsAt:Date.now()+7200000}]},{method:'PATCH'});
  const sourceBefore=await monitor(selected),sourceRevisions=await DB.prepare('SELECT * FROM revisions WHERE monitor_id=? ORDER BY revision').bind(selected).all();
  const cloned=await bulk({monitorIds:[selected],action:'clone',changes:{environment:'production'},enableAfterCreate:true});
  assert.equal(cloned.created.length,1);assert.deepEqual((await monitor(cloned.created[0])).definition.maintenanceWindows,[],'a clone needs its own explicitly planned maintenance');assert.deepEqual(await monitor(selected),sourceBefore);
  assert.deepEqual((await DB.prepare('SELECT * FROM revisions WHERE monitor_id=? ORDER BY revision').bind(selected).all()).results,sourceRevisions.results);
  let cloneTask;
  for(let remaining=100;remaining>0;remaining--){const next=await ok('/api/runner/claim',{}, {headers:{'x-runner-key':testAuthBindings.UPTIME_RUNNER_KEY,'x-runner-id':first.runner_id}});if(next.task?.monitorId===cloned.created[0]){cloneTask=next.task;break}if(!next.task)break}
  assert.ok(cloneTask,'the clone has its own scheduled slot before undo');
  const attempts=await Promise.all(cloneTask.probes.map(async probe=>{const observation=await executeTaskProbe(cloneTask,probe,{controlPort:port}),canaryUrl=cloneTask.definition.assignments[probe].canaryUrl;assert.equal(observation.outcome,'pass');return {...observation,attempt:0,...(canaryUrl?{canary:{...await executeTaskProbe({...cloneTask,definition:{...cloneTask.definition,url:canaryUrl,request:undefined,assertions:{status:200}}},probe,{controlPort:port,statusOnly:true}),attempt:0}}:{})}}));
  const result={slotId:cloneTask.id,attempts},stamp=String(Date.now()),signature=createHmac('sha256',testAuthBindings.UPTIME_RUNNER_KEY).update(`${stamp}.${JSON.stringify(result)}`).digest('hex');
  assert.equal((await ok('/api/runner/results',result,{headers:{'x-runner-key':testAuthBindings.UPTIME_RUNNER_KEY,'x-runner-id':first.runner_id,'x-sent-at':stamp,'x-runner-signature':signature}})).accepted,true,'real clone HTTP evidence is accepted through the signed result door');

  const cloneHistory=await ok(`/api/monitors/${cloned.created[0]}/history`);assert.ok(cloneHistory.some(slot=>slot.id===cloneTask.id&&slot.observations.length>0&&slot.observations.every(o=>o.outcome==='pass')));
  history=await DB.prepare('SELECT * FROM slots ORDER BY rowid').all();
  await undo(cloned.batchId);assert.equal((await monitor(cloned.created[0])).definition.enabled,false);
  assert.deepEqual(await ok(`/api/monitors/${cloned.created[0]}/history`),cloneHistory,'undo retains the clone and every scheduled history record');
  const routingHistory=(await scan()).alert_route_changes,selectedHistory=await ok(`/api/monitors/${selected}/history`);
  await undo(added.batchId);
  assert.deepEqual((await scan()).alert_route_changes,routingHistory);assert.deepEqual(await ok(`/api/monitors/${selected}/history`),selectedHistory);
  for(const id of added.created.filter(id=>id!==selected))assert.equal((await monitor(id)).definition.enabled,false);
  assert.deepEqual((await DB.prepare('SELECT * FROM slots ORDER BY rowid').all()).results,history.results,'pause, clone and undo retain scheduled evidence');
  const exported=await ok('/api/definitions/export');assert.equal(exported.monitors.find(m=>m.url.endsWith('/seed')).owner,'Payments team');
  const selectedInput={format:'urls',text:'https://93.184.216.34/excluded\nhttps://93.184.216.34/selected',selectedIndexes:[1]};
  const selectedPlan=await preview(selectedInput,true),selectedApply=await apply(selectedInput,selectedPlan.digest,true);
  assert.equal(selectedApply.status,201);assert.equal(selectedApply.data.created.length,1);
  const selectedMonitor=await monitor(selectedApply.data.created[0]);assert.equal(selectedMonitor.definition.url,'https://93.184.216.34/selected');assert.equal(selectedMonitor.definition.enabled,false);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM monitors WHERE json_extract(definition,'$.url')='https://93.184.216.34/excluded'").first()).n,0);
  const room=100-(await DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n;
  const fill={format:'urls',text:Array.from({length:room},(_,i)=>`https://93.184.216.34/quota/${i}`).join('\n')};
  const fillPlan=await preview(fill,true);assert.equal(fillPlan.counts.create,room);assert.equal((await apply(fill,fillPlan.digest,true)).status,201);
  const quota=await unchanged(()=>preview({format:'urls',text:'https://93.184.216.34/no-room\nhttps://93.184.216.34/no-room-either'},true));
  assert.equal(quota.counts.refused,2);assert.equal(quota.quota.available,0);
  assert.ok(quota.entries.every(e=>/quota/.test(e.reason)));
 }finally{http.request=originalRequest;await worker?.dispose();if(edge){edge.closeAllConnections();await new Promise(resolve=>edge.close(resolve))}await cleanupDirectory(directory)}
});
