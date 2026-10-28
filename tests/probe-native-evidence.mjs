// Save an assertion bundle, execute it at the network edge, inspect signed history, fail it and recover.
import assert from 'node:assert/strict';
import {fixture} from './resilience/support.mjs';
import {Resolver} from 'node:dns/promises';
const f=await fixture();
try{
 // An owner cannot save a metadata target; a mixed public/private DNS answer never reaches a socket or becomes Healthy.
 const before=(await f.request('/api/overview')).data.monitors.length;
 for(const url of ['http://169.254.169.254/latest/meta-data/','http://127.1/','http://[::ffff:7f00:1]/'])assert.equal((await f.request('/api/monitors',{body:{name:'Refused metadata',network:'public',url}})).status,400);
 assert.equal((await f.request('/api/overview')).data.monitors.length,before);
 const mixed=await f.monitor({name:'Fail-closed DNS',url:'http://mixed.sanity.test/health'});
 const original4=Resolver.prototype.resolve4,original6=Resolver.prototype.resolve6;
 try{
  Resolver.prototype.resolve4=async()=>['93.184.216.34','10.0.0.1'];Resolver.prototype.resolve6=async()=>[];
  await f.run(f.first);await f.run(f.second);
  assert.equal((await f.state(mixed.id)).state,'Unknown');
  const history=(await f.request(`/api/monitors/${mixed.id}/history`)).data;
  assert.ok(history.some(slot=>slot.observations.some(o=>o.outcome==='runner_error')),'unsafe DNS is an execution refusal, never a healthy result');
 }finally{Resolver.prototype.resolve4=original4;Resolver.prototype.resolve6=original6}
 await f.pause(mixed);
 const assertions={status:[200,'201-202'],bodyIncludes:'checkout-ready',bodyExcludes:'maintenance',bodyRegex:{pattern:'"ready":true'},header:{name:'x-check',equals:'yes'},json:{path:'$["ready"]',equals:true},latencyMs:1000};
 f.modes.target=200;f.modes.headers={'content-type':'application/json','x-check':'yes'};f.modes.body='{"ready":true,"message":"checkout-ready"}';
 const monitor=await f.monitor({name:'Checkout API assertions',assertions,retries:1});
 const run=async()=>{await f.run(f.first);await f.run(f.second);const history=await f.request(`/api/monitors/${monitor.id}/history`);assert.equal(history.status,200);return history.data.filter(slot=>slot.observations.length).sort((a,b)=>b.due_at-a.due_at)[0]};
 const first=await run();assert.equal((await f.state(monitor.id)).state,'Healthy');assert.deepEqual(first.definition.assertions,monitor.definition.assertions);
 // One behaviour table: each saved assertion actually judges target content, rather than merely validating its editor field.
 const goodBody='{"ready":true,"message":"checkout-ready"}';
 const examples=[
  {target:503,body:goodBody,failed:'status'},
  {body:'{"ready":true,"message":"unavailable"}',failed:'body'},
  {body:'{"ready":true,"message":"checkout-ready maintenance"}',failed:'body-absent'},
  {body:'{"ready": true,"message":"checkout-ready"}',failed:'body-regex'},
  {headers:{'x-check':'no'},failed:'header'},
  {body:'{"ready":false,"shadow":{"ready":true},"message":"checkout-ready"}',failed:'json'},
  {delayMs:1200,failed:'latency'},
 ];
 for(const example of examples){
  const scenario={target:200,body:goodBody,headers:{'x-check':'yes'},delayMs:0,...example};
  Object.assign(f.modes,scenario);await f.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.id).run();
  const slot=await run();assert.equal((await f.state(monitor.id)).state,'Failing');for(const observation of slot.observations){assert.equal(observation.checks.find(check=>check.assertion===scenario.failed)?.pass,false,scenario.failed+' judges the actual response');assert.ok(observation.checks.filter(check=>check.assertion!==scenario.failed).every(check=>check.pass),'unaffected assertions still pass');}
  assert.ok(slot.observations.some(o=>o.attempt===1),'retries retain the failed first observation');
 }
 f.modes.delayMs=0;f.modes.target=200;f.modes.body='{"ready":true,"message":"checkout-ready"}';f.modes.headers={'x-check':'yes'};
 await f.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.id).run();await run();
 assert.equal((await f.state(monitor.id)).state,'Healthy');
 const overview=(await f.request('/api/overview')).data;assert.ok(overview.alerts.some(a=>a.kind==='trigger'));assert.ok(overview.alerts.some(a=>a.kind==='recovery'));
 console.log('PASS saved HTTP/API assertions, retained retries and confirmed failure/recovery');
}finally{await f.close()}
