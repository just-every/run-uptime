// One owner flow through the emitted API, signed runner evidence and production
// notification dispatcher. Only the public target socket and recipient edge
// are controlled by the fixture; route decisions and delivery state are real.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {fixture} from './resilience/support.mjs';
import {proveRoutingFilters} from './alert-routing-filters-support.mjs';
import {proveRoutingTeams} from './alert-routing-teams-support.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';

test('owned routes preview inheritance, deliver matched triggers/recoveries and retain auditable changes',{timeout:90000},async()=>{
 const f=await fixture();let releaseTrigger,dispatching;
 try{
  const ok=async(path,body,options={})=>{const r=await f.request(path,{...options,...(body===undefined?{}:{body})});assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
  const contacts=[];
  for(const [label,enabled] of [['Accepted',true],['Rejected',true],['Later route',true],['Disabled',false]])contacts.push(await ok('/api/notifications/destinations',{name:label,enabled,kind:'webhook',url:`https://routing.example.com/${contacts.length}`}));
  const [a,b,c,d]=contacts;
  const monitor=await f.monitor({runners:[f.first],canary:true,service:'Checkout',group:'Store'});
  const peer=await f.monitor({name:'Paused peer',runners:[f.first],enabled:false,service:'Checkout',group:'Store'});
  const route=id=>`/api/monitors/${id}/alert-route`,read=()=>ok(route(monitor.id));
  const input=async(id,scope,mode,destinationIds=[])=>{const current=await ok(route(id));return {scope,mode,destinationIds,expectedRevision:current.policies.find(p=>p.scope===scope).revision}};
  const apply=async(id,scope,mode,ids=[])=>{const body=await input(id,scope,mode,ids),p=await ok(route(id)+'/preview',body);return ok(route(id)+'/apply',{...body,digest:p.digest})};
  assert.equal((await read()).effective.scope,'installation');
  await apply(monitor.id,'installation','selected',[c.id]);
  await apply(monitor.id,'group','selected',[c.id,d.id]);
  let current=await read();assert.equal(current.effective.scope,'group');assert.equal(current.recipients.find(r=>r.id===d.id).reason,'disabled');assert.equal(current.recipients.find(r=>r.id===a.id).selected,false);
  const stale=await input(monitor.id,'service','selected',[a.id,b.id]),plan=await ok(route(monitor.id)+'/preview',stale);
  await ok(`/api/notifications/destinations/${d.id}`,{name:d.name,enabled:true},{method:'PATCH'});
  assert.equal((await f.request(route(monitor.id)+'/apply',{body:{...stale,digest:plan.digest}})).status,409,'recipient changes invalidate the reviewed preview');
  await ok(`/api/notifications/destinations/${d.id}`,{name:d.name,enabled:false},{method:'PATCH'});
  await apply(monitor.id,'service','selected',[a.id,b.id]);
  await apply(peer.id,'monitor','selected',[c.id]);
  const scopePreview=await ok(route(monitor.id)+'/preview',await input(monitor.id,'service','selected',[a.id,b.id]));
  assert.deepEqual(new Set(scopePreview.affected.map(m=>m.id)),new Set([monitor.id,peer.id]));
  assert.equal(scopePreview.affected.find(m=>m.id===peer.id).effective.scope,'monitor','preview discloses the narrower override');
  await apply(monitor.id,'monitor','selected',[]);assert.equal((await read()).readyCount,0,'empty selection is explicit no coverage');
  await apply(monitor.id,'monitor','inherit');assert.equal((await read()).effective.scope,'service');

  const trigger=await f.claim(f.first);assert.ok(trigger);assert.equal(trigger.monitorId,monitor.id);
  assert.equal((await f.submit(f.first,trigger,[await f.evidence(trigger)])).status,200);
  assert.equal((await f.state(monitor.id)).targetState,'Failing');
  const deliveries=async()=>(await ok('/api/notifications')).deliveries.filter(j=>j.event.monitorId===monitor.id);
  assert.deepEqual(new Set((await deliveries()).map(j=>j.destinationId)),new Set([a.id,b.id]));
  const rpc=async(_path,body)=>ok('/api/runner/notifications',body,{runner:f.first});
  const received=[];let entered;
  const firstBoundary=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>releaseTrigger=resolve);
  const transport={async send(wire,beforeRequest){await beforeRequest();
   const destination=contacts.find(d=>wire.url===`https://routing.example.com/${contacts.indexOf(d)}`);assert.ok(destination,'only configured recipient edges are reached');
   const expected=createHmac('sha256',destination.signingSecret).update(`${wire.headers['x-lamp-timestamp']}.${wire.body}`).digest('base64url');assert.equal(wire.headers['x-lamp-signature'],expected);
   const event=JSON.parse(wire.body);received.push({destinationId:destination.id,event});
   if(destination.id===a.id&&event.kind==='trigger'){entered();await held}
   return {status:destination.id===b.id?400:200,headers:{},body:''};
  }};
  dispatching=dispatchNotifications(rpc,transport);await Promise.race([firstBoundary,dispatching.then(()=>{throw Error('Trigger did not reach the recipient boundary')})]);
  await apply(monitor.id,'monitor','selected',[c.id]);
  f.modes.target=200;
  await new Promise(resolve=>setTimeout(resolve,5100));
  const recovery=await f.claim(f.first);assert.ok(recovery);assert.equal(recovery.monitorId,monitor.id);
  assert.equal((await f.submit(f.first,recovery,[await f.evidence(recovery)])).status,200);
  assert.equal((await f.state(monitor.id)).targetState,'Healthy');
  await dispatchNotifications(rpc,transport);
  assert.ok(!received.some(r=>r.event.kind==='recovery'),'an in-flight trigger cannot authorize recovery yet');
  releaseTrigger();await dispatching;dispatching=null;
  await dispatchNotifications(rpc,transport);
  const rows=await deliveries(),recovered=rows.filter(j=>j.event.kind==='recovery');
  assert.equal(recovered.find(j=>j.destinationId===a.id).state,'accepted');
  assert.equal(recovered.find(j=>j.destinationId===b.id).state,'rejected');
  assert.equal(recovered.find(j=>j.destinationId===b.id).code,'trigger_not_accepted');
  assert.deepEqual(received.filter(r=>r.event.kind==='recovery').map(r=>r.destinationId),[a.id],'only the accepted original recipient gets recovery after route changes');
  assert.ok(!received.some(r=>r.destinationId===c.id),'newly selected contacts never receive recovery for an incident they missed');

  // Tests and drills remain direct, labelled sends, even for a disabled contact.
  const before=(await ok('/api/overview')).alerts;
  await ok(`/api/notifications/destinations/${c.id}/test`,{});
  await ok(`/api/notifications/destinations/${d.id}/drill`,{});
  await dispatchNotifications(rpc,transport);
  for(const id of [c.id,d.id])assert.ok(received.some(r=>r.destinationId===id&&r.event.kind==='test'&&r.event.incidentKey===null));
  assert.deepEqual((await ok('/api/overview')).alerts,before);
  current=await read();assert.ok(current.changes.some(change=>change.scope==='service'&&change.current.destinationIds.includes(a.id)),'durable change history names the reviewed selection');
  await apply(monitor.id,'monitor','inherit');await apply(monitor.id,'service','inherit');
  await ok(`/api/notifications/destinations/${d.id}`,undefined,{method:'DELETE'});
  current=await read();assert.equal(current.recipients.find(r=>r.id===d.id).reason,'destination_missing','erasure cannot silently count as coverage');
  assert.equal((await f.request('/api/archive')).status,200,'routing tables have an explicit archive inventory decision');
  await f.pause(monitor);
  await proveRoutingTeams(f,ok);
  await proveRoutingFilters(f,ok);
 }finally{releaseTrigger?.();await dispatching;await f.close()}
});
