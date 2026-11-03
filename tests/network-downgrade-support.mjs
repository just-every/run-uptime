import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as sleep} from 'node:timers/promises';
import {authFixture} from './tls-auth-support.mjs';
import {cleanup,closeServer} from './resilience/support.mjs';

// Owner definitions, genuinely due production runner work and signed public history.
export async function networkDowngradeJourney(){
 let edge,originalRequest,redirect=false,sockets=0;
 const requests=[],responses=[],hostname='downgrade.sanity.test';
 const destination=http.createServer((req,res)=>{
  requests.push({method:req.method,path:req.url,host:req.headers.host});
  res.writeHead(200,{'content-type':'text/plain'});res.end('synthetic-uptime-137');
 });
 destination.on('connection',()=>sockets++);
 try{
  destination.listen(0,'127.0.0.1');await once(destination,'listening');
  const port=destination.address().port,httpUrl=`http://${hostname}:${port}/health`;
  edge=await authFixture((_record,res)=>{
   res.once('finish',()=>responses.push({status:res.statusCode,location:res.getHeader('location')}));
   if(redirect){res.setHeader('location',httpUrl);res.writeHead(302);res.end();return}
   res.writeHead(200);res.end('synthetic-uptime-137');
  });
  // The existing fixture resolves public names and trusts its CA. This additional
  // socket edge routes only the authorized HTTP destination to its local listener,
  // including any regressed downgrade attempt, without altering probe decisions.
  originalRequest=http.request;
  http.request=function(options,...args){
   if(options?.hostname==='93.184.216.45'&&Number(options.port)===port){
    assert.equal(options.headers.host,`${hostname}:${port}`);
    return originalRequest.call(this,{...options,hostname:'127.0.0.1'},...args);
   }
   return originalRequest.call(this,options,...args);
  };
  const {f,create,url,records}=edge;
  const read=async path=>{
   const result=await f.request(path);assert.equal(result.status,200,JSON.stringify(result.data));return result.data;
  };
  const current=async monitor=>{
   const overview=await read('/api/overview'),row=overview.monitors.find(item=>item.id===monitor.id);
   assert.ok(row);return row;
  };
  const scheduled=async monitor=>{
   const historyPath=`/api/monitors/${monitor.id}/history`,before=await read(historyPath);
   await sleep(Math.max(0,(await current(monitor)).nextDue-Date.now()+10));
   await f.run(f.first);
   const history=await read(historyPath),added=history.filter(slot=>!before.some(old=>old.id===slot.id));
   assert.equal(added.length,1,'one genuinely due scheduled slot is completed by the production signed runner');
   const [slot]=added;
   assert.equal(slot.manual,0);assert.equal(slot.revision,monitor.revision);
   assert.deepEqual(slot.definition,monitor.definition);
   assert.equal(slot.observations.length,1);
   const [observation]=slot.observations,probe=monitor.definition.probes[0];
   assert.equal(observation.probe,probe);
   assert.equal(slot.definition.assignments[probe].runnerId,f.first.runnerId);
   assert.ok(observation.startedAt>=slot.due_at);
   assert.ok(observation.completedAt>=observation.startedAt);
   for(const old of before)assert.deepEqual(history.find(item=>item.id===old.id),old,'later checks retain earlier signed evidence unchanged');
   return slot;
  };

  // Qualify the two independent destination counters through an allowed check,
  // then stop that control through the owner door before the HTTPS experiment.
  const control=await create({name:'Synthetic HTTP destination control',url:httpUrl,intervalMs:5000});
  const controlSlot=await scheduled(control);
  assert.equal(sockets,1,'the independent counter observes an allowed destination socket');
  assert.deepEqual(requests,[{method:'GET',path:'/health',host:`${hostname}:${port}`}]);
  assert.equal(controlSlot.observations[0].outcome,'pass');assert.equal(controlSlot.observations[0].status,200);
  assert.equal((await current(control)).state.targetState,'Healthy');
  await f.pause(control);assert.equal((await current(control)).state.state,'Paused');
  const baseline={sockets,requests:structuredClone(requests)};
  console.log('PROBE NETWORK-001 allowed-control: owner HTTP monitor and due signed runner -> one socket, one request, retained 200 pass, then paused');

  const monitor=await create({name:'Synthetic HTTPS downgrade refusal',url:url('/health','auth.example.test'),intervalMs:5000});
  assert.equal(monitor.definition.tlsTrust,undefined,'the source uses ordinary verified HTTPS');
  const revisions=await read(`/api/monitors/${monitor.id}/revisions`),retained=[];
  for(const phase of ['healthy','downgrade','recovered']){
   redirect=phase==='downgrade';
   const before=records.length,slot=await scheduled(monitor),[observation]=slot.observations;
   retained.push(slot);
   assert.equal(records.length,before+1,'the real HTTPS receiver observes each scheduled request');
   assert.equal(records[before].host,new URL(monitor.definition.url).host);
   assert.equal(records[before].method,'GET');assert.equal(records[before].url,'/health');
   assert.deepEqual(responses[before],{status:redirect?302:200,location:redirect?httpUrl:undefined},'the HTTPS receiver completes the controlled response');
   assert.equal(sockets,baseline.sockets,'HTTPS downgrade refusal must create zero new destination sockets');
   assert.deepEqual(requests,baseline.requests,'HTTPS downgrade refusal must send zero new destination requests');
   if(redirect){
    assert.equal(observation.outcome,'target_failure');
    assert.deepEqual(observation.checks,[{assertion:'redirect',pass:false,reason:'Probe redirect check failed'}]);
    assert.equal(observation.status,undefined,'the refused HTTP destination cannot invent a successful HTTP status');
    assert.equal(observation.bytes,undefined,'the refused destination supplies no response body evidence');
   }else{
    assert.equal(observation.outcome,'pass');assert.equal(observation.status,200);
    assert.ok(observation.checks.every(check=>check.pass));
   }
   const row=await current(monitor),state=row.state;
   assert.equal(state.targetState,redirect?'Failing':'Healthy');
   assert.equal(state.denominator,monitor.definition.probes.length,'the configured probe denominator stays fixed');
   assert.equal(state.coverageState,'Complete');
   assert.equal(state.fails,redirect?1:0);
   assert.equal(row.revision,monitor.revision);assert.deepEqual(row.definition,monitor.definition);
   assert.deepEqual(await read(`/api/monitors/${monitor.id}/revisions`),revisions,'failure and recovery do not edit saved criteria');
   const history=await read(`/api/monitors/${monitor.id}/history`);
   assert.equal(history.length,retained.length);
   for(const previous of retained)assert.deepEqual(history.find(item=>item.id===previous.id),previous);
   assert.deepEqual(await read(`/api/monitors/${control.id}/history`),[controlSlot],'the paused HTTP control never runs again');
   console.log(`PROBE NETWORK-001 ${phase}: unchanged HTTPS monitor and due signed runner -> HTTPS request observed, ${observation.outcome}, HTTP socket delta 0, request delta 0, denominator ${state.denominator}`);
  }
  const incidents=await read(`/api/monitors/${monitor.id}/incidents`);
  assert.equal(incidents.length,1);
  assert.equal(incidents[0].trigger.slotId,retained[1].id);
  assert.equal(incidents[0].recovery.slotId,retained[2].id);
  assert.equal(incidents[0].recovery.incidentKey,incidents[0].trigger.incidentKey);
  assert.match(incidents[0].trigger.probes[0].reason,/redirect/);
  console.log('PASS HTTPS downgrade: qualified destination counters, zero refused sockets and requests, signed redirect failure, immutable criteria and evidence, ordinary scheduled recovery');
 }finally{
  if(originalRequest)http.request=originalRequest;
  await cleanup(()=>edge?.close(),()=>closeServer(destination));
 }
}
