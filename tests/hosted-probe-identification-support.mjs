import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {testAuthBindings} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';

// Owner doors and the emitted scheduled handler; only authorized DNS and HTTP edges are substituted.
export async function proveHostedProbeIdentification(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-probe-identification-'));
 const origin='https://synthetic-uptime-600.test',target='https://synthetic-uptime-601.synthetic-uptime-600.workers.dev',redirected='https://synthetic-uptime-602.synthetic-uptime-600.test';
 const names=['synthetic-uptime-603-private-name','synthetic-uptime-604-private-name'];
 const release=JSON.parse(await readFile('seed.json','utf8')).version,epoch=Date.now(),received=[],dnsNames=new Set();
 const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'false',UPTIME_ORIGIN:origin,MAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'synthetic-uptime-607'};
 let worker,phase='failure',cookie;
 const outbound=async request=>{
  const url=new URL(request.url);
  if(url.hostname==='api.sendgrid.com')return new Response(null,{status:202});
  if(url.origin==='https://cloudflare-dns.com'){
   dnsNames.add(url.searchParams.get('name'));
   assert.ok([new URL(target).hostname,new URL(redirected).hostname,'example.com','localhost','synthetic-uptime-612.test'].includes(url.searchParams.get('name')),'only owner-authorized targets, redirects and canary resolve');
   const a=url.searchParams.get('type')==='A';
   if(['localhost','synthetic-uptime-612.test'].includes(url.searchParams.get('name')))return Response.json({Status:0,Answer:[{type:1,data:'93.184.215.14'},{type:1,data:'127.0.0.1'}]});
   return Response.json({Status:0,Answer:[{type:a?1:28,data:a?'93.184.215.14':'2606:2800:21f:cb07:6820:80da:af6b:8b2c'}]});
  }
  if(url.origin==='https://example.com')return new Response('canary ready');
  assert.ok([target,redirected].includes(url.origin),'only the reviewed target and its public redirect receive target requests');
  received.push({phase,url:request.url,method:request.method,headers:Object.fromEntries(request.headers)});
  if(url.origin===target){
   if(!url.pathname.endsWith('/next'))return new Response(null,{status:302,headers:{location:url.pathname+'/next'}});
   return new Response(null,{status:307,headers:{location:redirected+url.pathname.replace('/next','')}});
  }
  if(url.pathname==='/private')return new Response(null,{status:302,headers:{location:'http://127.0.0.1/admin'}});
  const routingFailure='<!doctype html><h1>Error 1042</h1><p>Cloudflare routing failure</p><p>Authorization: Bearer synthetic-uptime-608</p><p>synthetic-uptime-609 operator@example.test</p>'+'x'.repeat(17000)+'PRIVATE-TAIL';
  return new Response(phase==='failure'?(url.pathname==='/http'?routingFailure:'not ready'):'service ready',{status:phase==='failure'&&url.pathname==='/http'?404:200});
 };
 const start=async now=>{worker=await hostedRuntime(directory,bindings,outbound,{now})};
 const call=(path,body,session=cookie,method=body===undefined?'GET':'POST')=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',redirect:'manual',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method,headers:{host:new URL(origin).host,origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(session?{cookie:session}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})});
 const json=async response=>{assert.ok(response.ok,await response.clone().text());return response.json()};
 const scheduled=async()=>{const response=await worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',body:JSON.stringify({scheduled:true})});assert.equal(response.status,204,await response.text())};
 const history=async id=>json(await call(`/api/monitors/${id}/history`));
 try{
  await start(epoch);
  const db=await worker.getD1Database('DB');
  for(const file of(await readdir('migrations')).filter(file=>file.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const owner=await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'synthetic-uptime-605-private-owner'},null);
  assert.equal(owner.status,303,await owner.clone().text());cookie=owner.headers.get('set-cookie').split(';')[0];
  await completeSecondFactor(origin,cookie,(url,init)=>call(new URL(url).pathname,init.body===undefined?undefined:JSON.parse(init.body),cookie),epoch);
  const monitors=[];
  for(const [index,type] of ['http','keyword'].entries())monitors.push(await json(await call('/api/monitors',{name:names[index],type,url:target+'/'+type,enabled:false,intervalMs:60000,retries:1,confirmSlots:1,recoverSlots:1,...(type==='keyword'?{assertions:{status:200,bodyIncludes:'service ready'}}:{})})));
  await json(await call(`/api/monitors/${monitors[0].id}/failure-snapshots`,{version:0,retentionDays:90,masks:['synthetic-uptime-609']},cookie,'PATCH'));
  // Paused creation lets the real console kick settle before explicit Cron execution at this clock.
  for(let attempt=0;attempt<100;attempt++){
   const kick=await db.prepare("SELECT outcome FROM monitoring_watch WHERE id='console-worker-kick'").first();
   if(kick?.outcome==='complete')break;
   assert.ok(attempt<99,'paused owner work settles');await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(received.length,0,'paused monitors never contact their targets');
  for(const monitor of monitors)monitor.definition=(await json(await call('/api/monitors/'+monitor.id,{...monitor.definition,enabled:true},cookie,'PATCH'))).definition;
  await scheduled();
  const failing=await Promise.all(monitors.map(monitor=>history(monitor.id)));
  for(const [index,slots] of failing.entries()){
   assert.equal(slots.length,1);assert.equal(slots[0].status,'complete');
   assert.ok(slots[0].observations.some(observation=>observation.attempt===1),'a failing target retries within its immutable slot');
   assert.ok(slots[0].observations.every(observation=>observation.outcome==='target_failure'));
   assert.ok(slots[0].observations.some(observation=>observation.checks.some(check=>!check.pass&&check.assertion===(index===0?'status':'body'))),'HTTP status and keyword failures retain their ordinary assertion evidence');
  }
  const httpFailure=failing[0][0].observations[0];
  assert.equal(httpFailure.status,404);
  assert.match(httpFailure.checks.find(check=>check.assertion==='status').reason,/HTTP 404.*error code 1042/,'history names the actual response and routing error');
  const snapshots=await json(await call(`/api/monitors/${monitors[0].id}/failure-snapshots`));
  assert.ok(snapshots.items.length,'the operator can inspect the response body through the ordinary details API');
  for(const {snapshot} of snapshots.items){
   assert.equal(snapshot.status,404);assert.match(snapshot.body,/Error 1042/);assert.match(snapshot.body,/\[redacted\]/);
   assert.ok(Buffer.byteLength(snapshot.body)<=16384);assert.equal(snapshot.bodyTruncated,true);
   for(const privateValue of ['synthetic-uptime-608','synthetic-uptime-609','operator@example.test','PRIVATE-TAIL'])assert.ok(!snapshot.body.includes(privateValue),'failure details redact secrets, operator masks and email and bound the prefix');
  }
  const references=new Map();
  for(const record of received){
   const parsed=/^Uptime\/([^\s]+) \(\+(https:\/\/[^\s;]+); monitor=([a-f0-9]{64})\)$/.exec(record.headers['user-agent']??'');
   assert.ok(parsed,'the receiving target observes all four public identification fields');assert.equal(parsed[1],release);
   const document=new URL(parsed[2]);assert.equal(document.origin,origin);assert.equal(document.pathname,'/docs/monitors');assert.ok(document.hash);
   const docs=await call(document.pathname,undefined,null);assert.equal(docs.status,200,'the advertised documentation is served without owner authority');
   const html=await docs.text();assert.ok(html.includes(`id="${document.hash.slice(1)}"`),'the advertised fragment resolves on the served public page');
   const type=new URL(record.url).pathname.split('/')[1],reference=references.get(type);
   if(reference)assert.equal(parsed[3],reference,'same-origin and cross-origin redirect hops and retries keep the monitor reference');else references.set(type,parsed[3]);
   assert.equal(record.method,'GET');
  }
  assert.equal(references.size,2);assert.notEqual(references.get('http'),references.get('keyword'),'distinct monitors have independent opaque references');
  for(const type of ['http','keyword'])for(const url of [target+'/'+type,target+'/'+type+'/next',redirected+'/'+type])assert.ok(received.filter(record=>record.url===url).length>=2,'both attempts reach each validated redirect hop');
  const baseline=await json(await call('/api/overview'));
  for(const monitor of monitors)assert.equal(baseline.monitors.find(item=>item.id===monitor.id).state.targetState,'Failing');
  await worker.dispose();worker=null;phase='recovery';await start(Math.max(...baseline.monitors.map(monitor=>monitor.nextDue))+1);await scheduled();
  const recovered=await Promise.all(monitors.map(monitor=>history(monitor.id)));
  for(const [index,slots] of recovered.entries()){
   assert.equal(slots.length,2);assert.deepEqual(slots.slice(1),failing[index],'restart and recovery preserve failure history');
   assert.ok(slots[0].observations.every(observation=>observation.outcome==='pass'));
  }
  const overview=await json(await call('/api/overview'));
  for(const monitor of monitors)assert.equal(overview.monitors.find(item=>item.id===monitor.id).state.targetState,'Healthy');
  // An owner edit creates a new definition, while the identification remains monitor-scoped.
  await json(await call('/api/monitors/'+monitors[0].id,{...monitors[0].definition,name:'synthetic-uptime-606-renamed'},cookie,'PATCH'));
  const edited=await json(await call('/api/overview'));
  await worker.dispose();worker=null;phase='edited';await start(Math.max(...edited.monitors.map(monitor=>monitor.nextDue))+1);await scheduled();
  for(const monitor of monitors){
   const slots=await history(monitor.id);assert.equal(slots.length,3);
   assert.ok(slots.flatMap(slot=>slot.observations).every(observation=>observation.runnerVersion==='uptime-worker/0.1.0'),'request identification never changes the accepted evidence protocol');
  }
  for(const phaseName of ['recovery','edited'])for(const type of ['http','keyword']){
   const requests=received.filter(record=>record.phase===phaseName&&new URL(record.url).pathname.split('/')[1]===type);
   assert.ok(requests.some(record=>new URL(record.url).origin===redirected),'the restarted scheduled handler reaches the redirected target');
   for(const record of requests)assert.equal(/; monitor=([a-f0-9]{64})\)$/.exec(record.headers['user-agent'])?.[1],references.get(type),'later checks and revisions retain the original opaque reference');
  }
  const wire=JSON.stringify(received);
  for(const secret of [...names,'synthetic-uptime-605-private-owner','synthetic-uptime-606-renamed',cookie,bindings.OWNER_EMAIL,bindings.SENDGRID_API_KEY,bindings.SESSION_SECRET,bindings.UPTIME_RUNNER_KEY,bindings.SETUP_TOKEN,...monitors.map(monitor=>monitor.id)])assert.ok(!wire.includes(secret),'identification excludes private names and installation authority');
  for(const record of received){assert.equal(record.headers.cookie,undefined);assert.equal(record.headers.authorization,undefined)}
  assert.ok(dnsNames.has(new URL(target).hostname)&&dnsNames.has(new URL(redirected).hostname),'both redirect origins pass the actual hosted DNS boundary');
  // The routing compatibility flag grants no private-target permission.
  const beforeRefusal=received.length;
  for(const url of ['http://127.0.0.1/admin','http://169.254.169.254/latest/meta-data/'])assert.equal((await call('/api/monitors',{name:'synthetic-uptime-610',url})).status,400);
  assert.equal(received.length,beforeRefusal);
  const redirectedPrivate=await json(await call('/api/monitors',{name:'synthetic-uptime-611',url:redirected+'/private',enabled:false,intervalMs:60000,retries:0}));
  await json(await call(`/api/monitors/${redirectedPrivate.id}`,{...redirectedPrivate.definition,enabled:true},cookie,'PATCH'));
  await scheduled();
  const refused=await history(redirectedPrivate.id);
  assert.equal(refused[0].observations[0].outcome,'runner_error');assert.equal(refused[0].observations[0].checks[0].assertion,'network');
  assert.ok(received.slice(beforeRefusal).every(record=>[target,redirected].includes(new URL(record.url).origin)),'a private redirect never reaches the network edge');
  for(const url of ['http://localhost/admin','https://synthetic-uptime-612.test/admin']){
   const beforeDNSRefusal=received.length;
   const monitor=await json(await call('/api/monitors',{name:'synthetic-uptime-613',url,enabled:false,retries:0}));
   await json(await call(`/api/monitors/${monitor.id}`,{...monitor.definition,enabled:true},cookie,'PATCH'));
   await scheduled();
   const slots=await history(monitor.id);
   assert.equal(slots[0].observations[0].outcome,'runner_error');assert.equal(slots[0].observations[0].checks[0].assertion,'network');
   assert.equal(received.length,beforeDNSRefusal,'localhost and mixed public/private DNS never send a target request');
  }
  console.log('PASS hosted routed-target failure details: HTTP status and error code, bounded redacted body, localhost and metadata refusals, private redirect refusal');
  console.log('PASS hosted HTTP and keyword probe identification: public documentation, distinct stable opaque references, retries, redirects, restart, owner edit, private-data exclusion and retained failure and recovery history');
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
}
