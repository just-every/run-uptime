// Owner API -> production signed runner -> emitted Worker -> retained history.
import assert from 'node:assert/strict';
import http from 'node:http';
import {Resolver} from 'node:dns/promises';
import {once} from 'node:events';
import {fixture,cleanup,closeServer} from './resilience/support.mjs';

const f=await fixture();
const hostname='mixed.sanity.test',publicIp='93.184.216.34',privateIp='10.0.0.1';
const originalRequest=http.request,original4=Resolver.prototype.resolve4,original6=Resolver.prototype.resolve6;
let answers=[publicIp],connections=0,requests=[];
const resolutions=[];
const target=http.createServer((req,res)=>{
 requests.push({method:req.method,path:req.url,host:req.headers.host});
 res.writeHead(200,{'content-type':'text/plain'});res.end('synthetic-uptime-1');
});
target.on('connection',()=>connections++);
try{
 target.listen(0,'127.0.0.1');await once(target,'listening');
 const port=target.address().port,url=`http://${hostname}:${port}/health`;
 // Only DNS and socket routing are controlled. Both possible pins reach this
 // authorized listener if validation regresses; no private network is contacted.
 Resolver.prototype.resolve4=async function(host,...args){
  if(host!==hostname)return original4.call(this,host,...args);
  resolutions.push([...answers]);return [...answers];
 };
 Resolver.prototype.resolve6=async function(host,...args){
  if(host!==hostname)return original6.call(this,host,...args);
  return [];
 };
 http.request=function(options,...args){
  if(Number(options?.port)===port&&[publicIp,privateIp].includes(options.hostname)){
   assert.equal(options.headers.host,`${hostname}:${port}`,'the pinned socket preserves the target Host');
   return originalRequest.call(this,{...options,hostname:'127.0.0.1'},...args);
  }
  return originalRequest.call(this,options,...args);
 };
 const monitor=await f.monitor({name:'Mixed DNS connection refusal',network:'public',url,intervalMs:60000});
 const history=async()=>{
  const result=await f.request(`/api/monitors/${monitor.id}/history`);
  assert.equal(result.status,200);return result.data;
 };
 const run=async()=>{
  const before=new Set((await history()).map(slot=>slot.id));
  await f.run(f.first);await f.run(f.second);
  const added=(await history()).filter(slot=>!before.has(slot.id));
  assert.equal(added.length,1,'both real runner identities complete one new scheduled slot');
  assert.equal(added[0].manual,0);
  assert.deepEqual(added[0].definition,monitor.definition,'execution keeps the saved immutable definition');
  assert.deepEqual(added[0].observations.map(o=>o.probe).sort(),[...monitor.definition.probes].sort());
  return added[0];
 };

 // A working allowed case qualifies both independent wire counters first.
 const allowed=await run();
 assert.equal(connections,2,'the listener detects each allowed target socket');
 assert.deepEqual(requests,Array.from({length:2},()=>({method:'GET',path:'/health',host:`${hostname}:${port}`})));
 assert.deepEqual(resolutions,[[publicIp],[publicIp]]);
 assert.ok(allowed.observations.every(o=>o.outcome==='pass'&&o.status===200));
 assert.equal((await f.state(monitor.id)).targetState,'Healthy');
 const initialOverview=await f.request('/api/overview');
 assert.deepEqual(initialOverview.data.alerts,[],'an allowed initial check creates no incident');

 const retained=[allowed];
 for(const ordering of [[publicIp,privateIp],[privateIp,publicIp]]){
  answers=ordering;connections=0;requests=[];resolutions.length=0;
  await f.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.id).run();
  const refused=await run();retained.push(refused);
  assert.deepEqual(resolutions,[ordering,ordering],'both assigned runners saw the entire mixed answer in this order');
  assert.equal(connections,0,'mixed answers must be refused before any target socket connects');
  assert.deepEqual(requests,[],'mixed answers must send no target HTTP request');
  for(const observation of refused.observations){
   assert.equal(observation.outcome,'runner_error','unsafe resolution is execution refusal, never a target verdict');
   assert.deepEqual(observation.checks,[{assertion:'network',pass:false,reason:'Probe network check failed'}]);
   assert.equal(observation.status,undefined,'no HTTP status is fabricated');
  }
  const state=await f.state(monitor.id);
  assert.equal(state.state,'Unknown');assert.equal(state.targetState,'Unknown');
  assert.equal(state.coverageState,'Incomplete');assert.equal(state.denominator,2);assert.equal(state.unknown,2);
  assert.equal(state.fails,0);assert.ok(!state.confirmedFailure);
  assert.ok(state.regions.every(region=>region.state==='Unknown'&&refused.observations.some(o=>o.id===region.observationId)));
  const overview=await f.request('/api/overview');
  assert.deepEqual(overview.data.alerts,[],'execution refusal fabricates neither a trigger nor a recovery');
  const readback=await history();
  for(const slot of retained)assert.deepEqual(readback.find(row=>row.id===slot.id),slot,'signed evidence remains unchanged across later refusals');
 }
 console.log('PASS mixed DNS: allowed sockets and requests observed; both mixed orderings connect and send zero, retain runner_error, Unknown coverage and no incident');
}finally{
 http.request=originalRequest;Resolver.prototype.resolve4=original4;Resolver.prototype.resolve6=original6;
 await cleanup(()=>closeServer(target),()=>f.close());
}
