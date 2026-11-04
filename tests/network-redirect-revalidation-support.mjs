import assert from 'node:assert/strict';
import http from 'node:http';
import {Resolver} from 'node:dns/promises';
import {once} from 'node:events';
import {fixture,cleanup,closeServer} from './resilience/support.mjs';

// Owner doors, emitted Worker, migrated D1 and production signed runners. Only
// DNS answers and numeric socket routing are controlled at the network edge.
export async function proveRedirectRevalidation(){
 const f=await fixture(),hostname='redirect.sanity.test';
 const firstIp='93.184.216.46',destinationIp='93.184.216.47',privateIp='10.0.0.1';
 const originalRequest=http.request,original4=Resolver.prototype.resolve4,original6=Resolver.prototype.resolve6;
 let privateAnswer=false,resolutions=[],events=[];
 const first={sockets:0,requests:[]},destination={sockets:0,requests:[]};
 const record=req=>({method:req.method,path:req.url,host:req.headers.host});
 const firstHop=http.createServer((req,res)=>{
  first.requests.push(record(req));events.push('first request');
  res.once('finish',()=>events.push('relative redirect sent'));
  res.writeHead(302,{location:'/destination'});res.end();
 });
 const target=http.createServer((req,res)=>{
  destination.requests.push(record(req));events.push('destination request');
  res.writeHead(200,{'content-type':'text/plain'});res.end('synthetic-uptime-1');
 });
 firstHop.on('connection',()=>first.sockets++);
 target.on('connection',()=>destination.sockets++);
 try{
  firstHop.listen(0,'127.0.0.1');await once(firstHop,'listening');
  target.listen(0,'127.0.0.1');await once(target,'listening');
  const port=firstHop.address().port,targetPort=target.address().port;
  const url=`http://${hostname}:${port}/start`,host=`${hostname}:${port}`;
  Resolver.prototype.resolve4=async function(name,...args){
   if(name!==hostname)return original4.call(this,name,...args);
   const answer=resolutions.length===0?firstIp:privateAnswer?privateIp:destinationIp;
   resolutions.push(answer);events.push('resolve '+answer);return [answer];
  };
  Resolver.prototype.resolve6=async function(name,...args){
   if(name!==hostname)return original6.call(this,name,...args);
   return [];
  };
  http.request=function(options,...args){
   if(Number(options?.port)===port&&[firstIp,destinationIp,privateIp].includes(options.hostname)){
    assert.equal(options.headers.host,host,'numeric sockets preserve the configured hostname and port');
    // Even a regressed private pin reaches only this authorized local listener.
    const localPort=options.hostname===firstIp?port:targetPort;
    return originalRequest.call(this,{...options,hostname:'127.0.0.1',port:localPort},...args);
   }
   return originalRequest.call(this,options,...args);
  };
  const monitor=await f.monitor({name:'Relative redirect DNS revalidation',network:'public',url,intervalMs:5000});
  const history=async()=>{
   const result=await f.request(`/api/monitors/${monitor.id}/history`);
   assert.equal(result.status,200);return result.data;
  };
  const overview=async()=>{
   const result=await f.request(`/api/overview?monitor=${monitor.id}`);
   assert.equal(result.status,200);return result.data;
  };
  const revisions=await f.request(`/api/monitors/${monitor.id}/revisions`);
  assert.equal(revisions.status,200);
  const retained=[];
  const run=async()=>{
   const before=new Set((await history()).map(slot=>slot.id));
   const view=await overview(),saved=view.monitors.find(m=>m.id===monitor.id);
   // Wait for the real saved schedule; never create a manual slot or edit D1 due times.
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,saved.nextDue-Date.now()+10)));
   first.sockets=0;first.requests=[];destination.sockets=0;destination.requests=[];
   for(const runner of [f.first,f.second]){
    resolutions=[];events=[];
    await f.run(runner);
    assert.deepEqual(resolutions,[firstIp,privateAnswer?privateIp:destinationIp],
     'the same hostname is freshly resolved after its relative redirect');
    assert.deepEqual(events,['resolve '+firstIp,'first request','relative redirect sent',
     'resolve '+(privateAnswer?privateIp:destinationIp),...(!privateAnswer?['destination request']:[])],
     'the first hop is observed on the wire before the changed DNS answer is used');
   }
   const readback=await history(),added=readback.filter(slot=>!before.has(slot.id));
   assert.equal(added.length,1,'both assigned signed runners complete one genuinely due slot');
   const slot=added[0];
   assert.equal(slot.manual,0);assert.equal(slot.status,'complete');
   assert.deepEqual(slot.definition,monitor.definition,'the scheduled immutable criteria stay unchanged');
   assert.deepEqual(slot.observations.map(o=>o.probe).sort(),[...monitor.definition.probes].sort());
   assert.equal(first.sockets,2,'each runner opens one observed first-hop socket');
   assert.deepEqual(first.requests,Array.from({length:2},()=>({method:'GET',path:'/start',host})));
   for(const old of retained)assert.deepEqual(readback.find(s=>s.id===old.id),old,
    'refusal and later passing checks cannot rewrite retained signed evidence');
   retained.push(slot);
   const current=await overview();
   assert.deepEqual(current.monitors.find(m=>m.id===monitor.id).definition,monitor.definition,
    'DNS changes cannot change the owner-saved criteria');
   assert.deepEqual((await f.request(`/api/monitors/${monitor.id}/revisions`)).data,revisions.data);
   assert.deepEqual(current.alerts,[],'neither a refusal nor later passing evidence fabricates a trigger or recovery');
   assert.deepEqual((await f.request(`/api/monitors/${monitor.id}/incidents`)).data,[]);
   return {slot,state:current.monitors.find(m=>m.id===monitor.id).state};
  };
  const passing=async()=>{
   const result=await run();
   assert.equal(destination.sockets,2,'allowed redirects independently qualify the destination socket counter');
   assert.deepEqual(destination.requests,Array.from({length:2},()=>({method:'GET',path:'/destination',host})),
    'allowed redirects independently qualify the destination request counter');
   assert.ok(result.slot.observations.every(o=>o.outcome==='pass'&&o.status===200));
   assert.equal(result.state.state,'Healthy');assert.equal(result.state.targetState,'Healthy');
   assert.equal(result.state.denominator,2);
   return result;
  };

  await passing();
  privateAnswer=true;
  const refused=await run();
  assert.equal(destination.sockets,0,'the private redirect answer is refused before any destination socket');
  assert.deepEqual(destination.requests,[],'the private redirect answer sends no destination request');
  for(const observation of refused.slot.observations){
   assert.equal(observation.outcome,'runner_error','refused transport is not a target failure');
   assert.deepEqual(observation.checks,[{assertion:'network',pass:false,reason:'Probe network check failed'}]);
   assert.equal(observation.status,undefined,'the first-hop redirect status cannot become a destination HTTP status');
  }
  assert.equal(refused.state.state,'Unknown');assert.equal(refused.state.targetState,'Unknown');
  assert.equal(refused.state.coverageState,'Incomplete');assert.equal(refused.state.denominator,2);
  assert.equal(refused.state.unknown,2);assert.equal(refused.state.fails,0);assert.ok(!refused.state.confirmedFailure);
  assert.ok(refused.state.regions.every(region=>region.state==='Unknown'&&
   refused.slot.observations.some(o=>o.id===region.observationId)));
  privateAnswer=false;
  await passing();
  console.log('PASS relative redirect revalidation: qualified allowed first-hop and destination sockets and requests; fresh private answers refused with zero destination traffic, signed network runner_error, Unknown coverage, unchanged history and criteria; public answers restore scheduled Healthy without incident events');
 }finally{
  http.request=originalRequest;Resolver.prototype.resolve4=original4;Resolver.prototype.resolve6=original6;
  await cleanup([()=>closeServer(firstHop),()=>closeServer(target)],()=>f.close());
 }
}
