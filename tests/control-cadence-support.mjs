import {strict as assert} from 'node:assert';
import {runRunner} from '../runners/src/private-runner.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Exercise a saved revision's cadence through owner reads and real signed runners.
export async function proveCadenceRevision({api,origin,fixture,grantPath}) {
 const locations=[];
 for(const networkLabel of ['synthetic-uptime-1','synthetic-uptime-2']) {
  const result=await api('/api/runners','POST',{networkLabel});
  assert.equal(result.response.status,201);
  locations.push(result.data);
 }
 const run=async location=>runRunner({origin,key:location.key,runnerId:location.runnerId,grantPath,localReview:true,once:true});
 const poll=async location=>{
  const result=await api('/api/runner/claim','POST',{}, {'x-runner-key':location.key,'x-runner-id':location.runnerId});
  assert.equal(result.response.status,200);
  return result.data;
 };
 const created=await api('/api/monitors','POST',{
  name:'synthetic-uptime-3',url:fixture+'/health',probes:['local-a','local-b'],
  assignments:{'local-a':locations[0].runnerId,'local-b':locations[1].runnerId},
  intervalMs:10000,timeoutMs:1000,retries:1,confirmSlots:2,recoverSlots:2,freshnessMs:60000,
 });
 assert.equal(created.response.status,201);
 const initial=created.data,id=initial.id;
 const history=async()=>{
  const result=await api(`/api/monitors/${id}/history`);
  assert.equal(result.response.status,200);
  return result.data;
 };
 const monitor=async()=>{
  const result=await api(`/api/overview?monitor=${id}`);
  assert.equal(result.response.status,200);
  return result.data.monitors.find(m=>m.id===id);
 };
 const runBoth=async()=>{for(const location of locations)await run(location)};
 const waitUntil=async due=>{while(Date.now()<=due)await delay(Math.min(1000,due-Date.now()+25))};
 const scheduled=rows=>rows.filter(slot=>!slot.manual);
 const assertDefinition=(slot,revision,probes,assignments)=>{
  assert.equal(slot.revision,revision);
  assert.deepEqual(slot.definition.probes,probes);
  assert.deepEqual(slot.definition.assignments,assignments);
 };
 await runBoth();
 const old=(await history())[0];
 assert.equal(old.status,'complete');assert.equal(old.manual,0);
 assertDefinition(old,initial.revision,['local-a','local-b'],{
  'local-a':{runnerId:locations[0].runnerId,networkLabel:'synthetic-uptime-1'},
  'local-b':{runnerId:locations[1].runnerId,networkLabel:'synthetic-uptime-2'},
 });
 assert.deepEqual(old.definition,initial.definition);
 assert.deepEqual(old.observations.map(o=>o.probe).sort(),['local-a','local-b']);

 const previouslyDue=(await monitor()).nextDue;
 const beforeEdit=Date.now(),edited=await api(`/api/monitors/${id}`,'PATCH',{
  ...initial.definition,intervalMs:15000,probes:['local-b','local-c'],
  assignments:{'local-b':locations[0].runnerId,'local-c':locations[1].runnerId},
 });
 assert.equal(edited.response.status,200);
 const saved=edited.data;
 assert.equal(saved.revision,initial.revision+1);
 assert.equal(saved.definition.intervalMs,15000);
 const oldStarted=Math.max(...old.observations.map(o=>o.startedAt));
 assert.ok(saved.nextDue>=Math.max(beforeEdit,oldStarted+10000),'an edit preserves the shorter old cadence after the previous real start');
 assert.ok(saved.nextDue<=Math.max(Date.now(),previouslyDue),'a longer interval does not postpone the already planned check');
 assert.equal((await monitor()).nextDue,saved.nextDue,'owner read exposes the saved next due time');
 for(const location of locations) {
  const early=await poll(location);
  assert.ok(early.now<saved.nextDue,'this claim exercises the time before the edited due time');
  assert.equal(early.task,null,'no scheduled execution before the edited due time');
 }
 assert.deepEqual(await history(),[old],'an interval and probe edit cannot rewrite history or invent a slot');

 assert.equal((await api(`/api/monitors/${id}/run`,'POST',{})).response.status,200);
 await runBoth();
 const manual=(await history()).find(slot=>slot.manual);
 assert.equal(manual.status,'complete');
 assert.ok(manual.observations.every(o=>o.outcome==='pass'));
 assert.equal((await monitor()).nextDue,saved.nextDue,'a real manual pass leaves the edited scheduled cadence unchanged');

 await waitUntil(saved.nextDue);
 await run(locations[0]);
 const partial=(await history()).find(slot=>!slot.manual&&slot.revision===saved.revision);
 assert.deepEqual(partial.observations.map(o=>o.probe),['local-b']);
 const incomplete=await monitor();
 assert.equal(incomplete.state.denominator,2,'one returned probe cannot shrink the saved coverage denominator');
 assert.equal(incomplete.state.coverageState,'Incomplete');
 assert.equal(incomplete.state.regions.find(region=>region.probe==='local-c').state,'Unknown');
 await run(locations[1]);
 const afterDue=await history(),first=scheduled(afterDue).find(slot=>slot.revision===saved.revision);
 assert.equal(first.status,'complete');assert.equal(first.due_at,saved.nextDue);
 assertDefinition(first,saved.revision,['local-b','local-c'],{
  'local-b':{runnerId:locations[0].runnerId,networkLabel:'synthetic-uptime-1'},
  'local-c':{runnerId:locations[1].runnerId,networkLabel:'synthetic-uptime-2'},
 });
 assert.deepEqual(first.definition,saved.definition);
 assert.deepEqual(first.observations.map(o=>o.probe).sort(),['local-b','local-c']);
 assert.ok(first.observations.every(o=>o.startedAt>=saved.nextDue&&o.outcome==='pass'));
 assert.deepEqual(afterDue.find(slot=>slot.id===old.id),old,'old slots retain the original selection, assignments and evidence');
 const next=(await monitor()).nextDue,started=Math.max(...first.observations.map(o=>o.startedAt));
 assert.ok(next>=started+15000,'the first edited check schedules the next using the new interval');
 const current=await monitor();
 assert.equal(current.state.denominator,2);
 assert.deepEqual(current.state.regions.map(region=>region.probe).sort(),['local-b','local-c']);

 // Leave a whole interval unclaimed, then run once: missed work remains missing.
 await waitUntil(next+15000);
 await runBoth();
 const delayed=await history(),newSlots=scheduled(delayed).filter(slot=>slot.revision===saved.revision);
 assert.equal(newSlots.length,2,'a delayed claim creates one real slot, without catch-up checks');
 const late=newSlots.find(slot=>slot.id!==first.id);
 assert.equal(late.status,'complete');assert.equal(late.due_at,next);
 assert.ok(late.missed_count>=1,'history exposes the missed interval');
 assert.ok(late.observations.every(o=>o.startedAt>=next+15000));
 const afterLate=(await monitor()).nextDue;
 assert.ok(afterLate>=Math.max(...late.observations.map(o=>o.startedAt))+15000,'a late start also keeps the new interval floor');
 for(const location of locations) {
  const early=await poll(location);
  assert.ok(early.now<afterLate);
  assert.equal(early.task,null,'the next poll cannot execute missed checks as a burst');
 }
 const final=await history();assert.deepEqual(final,delayed);
 for(const retained of [old,manual,first])assert.deepEqual(final.find(slot=>slot.id===retained.id),retained);
 console.log('SCHEDULE-001 cadence revision passed: owner interval edit, next due readback, early refusal, signed scheduled and manual passes, immutable fixed selections and assignments, and delayed claims without catch-up checks.');
}
