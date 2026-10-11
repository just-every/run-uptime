// The monitor page's Recent checks model (public/monitor-timeline.js) against histories made the way the control plane
// makes them: a small simulator claims, completes and expires slots as src/domain/control.server.ts claimNext and save
// do, with the cadence functions of src/domain/schedule.ts, and a serial runner that polls once a second. Each case
// asserts the four timeline invariants on the rows the list and the strip render.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTimeline,STRIP_PLACES} from '../public/monitor-timeline.js';
import {leaseMs,missedSlots,nextDueAfter} from '../src/domain/schedule.ts';

const MIN=60000,T0=Date.UTC(2026,9,11,1,0,0);

// One monitor in one installation: save() is control.server.ts save (a new revision whose grid starts now), claim() is
// claimNext for this monitor, run() is the private runner's poll loop between two times.
function installation({intervalMs=MIN,target=()=>'pass'}={}){
 const slots=[],revs=[];let revision=1,nextDue=T0,rowid=0;
 let definition={name:'Checkout API health',type:'http',url:'http://127.0.0.1:4832/health',method:'GET',probes:['local-a'],assertions:{status:200},intervalMs,timeoutMs:2000,retries:1,failureQuorum:1,confirmSlots:2,recoverSlots:2,freshnessMs:180000,enabled:true,maintenanceUntil:0};
 const running=()=>slots.find(s=>s.status==='running');
 revs.push({revision,start:T0,definition});
 const sim={
  revs,
  save(at,changes){revision++;definition={...definition,...changes};nextDue=at;revs.push({revision,start:at,definition})},
  manual(at){const slot={id:`m:${revision}:manual:${++rowid}`,revision,due_at:at,status:'queued',definition:{...definition},lease_until:0,missed_count:0,manual:1,observations:[],rowid};slots.push(slot);return slot},
  claim(at){
   const due=definition.enabled&&nextDue<=at&&!running();
   const manual=due?null:slots.filter(s=>s.manual&&s.status==='queued').sort((a,b)=>a.due_at-b.due_at)[0];
   if(manual){if(!definition.enabled||manual.revision!==revision){manual.status='interrupted';return null}if(!running()){manual.status='running';manual.lease_until=at+leaseMs(manual.definition);return manual}}
   for(const s of slots)if(s.status==='running'&&s.lease_until<=at)s.status='interrupted';
   if(!definition.enabled||nextDue>at||running())return null;
   const slot={id:`m:${revision}:${nextDue}`,revision,due_at:nextDue,status:'running',definition:{...definition},lease_until:at+leaseMs(definition),missed_count:missedSlots(nextDue,at,definition.intervalMs),manual:0,observations:[],rowid:++rowid};
   nextDue=nextDueAfter(nextDue,at,definition.intervalMs);slots.push(slot);return slot;
  },
  complete(slot,startedAt,completedAt){
   const outcome=target(startedAt),status=outcome==='pass'?200:outcome==='target_failure'?503:null;
   slot.observations=[{id:`o:${slot.rowid}`,probe:'local-a',attempt:0,outcome,status,startedAt,completedAt,durationMs:completedAt-startedAt,checks:[{assertion:'status',pass:outcome==='pass',reason:'Expected HTTP status'}]}];
   slot.status='complete';
  },
  // The runner: claim, run for runMs, report, sleep a second; or sleep a second when nothing is due.
  run(from,to,{runMs=150}={}){let t=from;while(t<to){const task=sim.claim(t);if(task){sim.complete(task,t+5,t+runMs);t+=runMs+1000}else t+=1000}},
  history:()=>JSON.parse(JSON.stringify([...slots].sort((a,b)=>b.due_at-a.due_at||b.rowid-a.rowid).slice(0,100))),
  monitor:()=>({id:'m',revision,definition:{...definition},nextDue}),
  revisions:()=>JSON.parse(JSON.stringify([...revs].reverse().map(r=>({revision:r.revision,start:r.start,definition:r.definition})))),
  timeline:now=>buildTimeline({slots:sim.history(),now,monitor:sim.monitor(),revisions:sim.revisions()}),
 };
 return sim;
}

// The due times a row stands for: a scheduled slot its due time, a missed or overdue run each member; a manual check
// and a span none.
function claims(row){
 if(row.count)return Array.from({length:row.count},(_,k)=>row.first+k*row.interval);
 return row.slot&&!row.slot.manual?[row.slot.due_at]:[];
}
// The invariants, computed from the rows and the raw history and monitor (not from the model's own derivations):
// (a) the list is ordered by effective time, newest first; (b) every due time on the current revision's grid from the
// oldest row's time to now less the grace is represented, except inside paused or maintenance spans, and so is every
// due time of every earlier revision (the revisions read gives each start) up to a grace before the next revision
// began; (c) the strip is the list reversed; (d) no due time is claimed twice.
function assertInvariants(sim,now){
 const timeline=sim.timeline(now),{rows}=timeline,monitor=sim.monitor(),history=sim.history();
 assert.ok(rows.length<=STRIP_PLACES,'never more rows than the strip has places');
 rows.forEach((row,i)=>{
  assert.ok(row.oldestTime<=row.effectiveTime,`row ${i} spans forward in time`);
  if(i)assert.ok(rows[i-1].oldestTime>=row.effectiveTime,`(a) row ${i} (${row.kind}) is newer than the row above it`);
 });
 assert.deepEqual(timeline.strip,[...rows].reverse(),'(c) the strip is the list reversed');
 const claimed=rows.flatMap(claims),set=new Set(claimed),iso=t=>new Date(t).toISOString();
 assert.equal(set.size,claimed.length,'(d) no due time is claimed by two rows');
 if(!rows.length)return timeline;
 const oldest=rows.at(-1).oldestTime;
 if(monitor.definition.enabled){
  const interval=monitor.definition.intervalMs,own=history.filter(s=>!s.manual&&s.revision===monitor.revision);
  const anchor=own.length?Math.min(...own.map(s=>s.due_at)):monitor.nextDue,until=monitor.definition.maintenanceUntil;
  const from=Math.max(oldest,anchor),to=now-leaseMs(monitor.definition);
  for(let g=monitor.nextDue+Math.ceil((from-monitor.nextDue)/interval)*interval;g<to;g+=interval){
   if(until>anchor&&g>=anchor&&g<=until)continue;
   assert.ok(set.has(g),`(b) due time ${iso(g)} on the current grid is represented`);
  }
 }
 const real=new Set(history.filter(s=>!s.manual).map(s=>s.due_at));
 for(const rev of sim.revs){
  const next=sim.revs.find(r=>r.revision===rev.revision+1);
  if(!next||!rev.definition.enabled)continue;
  const grace=leaseMs(rev.definition),until=rev.definition.maintenanceUntil;
  for(let g=rev.start;g+grace<next.start;g+=rev.definition.intervalMs){
   if(g<oldest||(until>rev.start&&g<=until))continue;
   assert.ok(set.has(g)||real.has(g),`(b) due time ${iso(g)} of revision ${rev.revision}, scheduled before revision ${next.revision} began, is represented`);
  }
 }
 return timeline;
}
const kinds=rows=>rows.map(r=>r.count>1?`${r.kind}×${r.count}`:r.kind);

test('steady passing: one passed row per due time, newest first',()=>{
 const sim=installation();sim.run(T0,T0+20*MIN);
 const {rows}=assertInvariants(sim,T0+20*MIN);
 assert.deepEqual(kinds(rows),Array(12).fill('passed'));
 assert.ok(rows.every(r=>!r.late&&r.effectiveTime>r.slot.due_at));
});

test('a single missed check: one missed row under the late check that ran after it',()=>{
 const sim=installation();sim.run(T0,T0+3*MIN+500);sim.run(T0+5*MIN+15000,T0+8*MIN);
 const {rows}=assertInvariants(sim,T0+8*MIN);
 const late=rows.findIndex(r=>r.late);
 assert.deepEqual(kinds(rows.slice(late,late+2)),['passed','missed']);
 assert.equal(rows[late].slot.due_at,T0+4*MIN,'the late check keeps its due time');
 assert.equal(rows[late+1].first,T0+5*MIN,'the missed check is the next due time');
 assert.ok(rows[late].late.by>=MIN);
});

test('consecutive missed checks collapse into one row and one strip place',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);sim.run(T0+6*MIN+20000,T0+9*MIN);
 const {rows,strip}=assertInvariants(sim,T0+9*MIN);
 const run=rows.find(r=>r.kind==='missed');
 assert.deepEqual([run.count,run.first,run.last],[3,T0+4*MIN,T0+6*MIN]);
 assert.equal(rows.filter(r=>r.kind==='missed').length,1);
 assert.equal(strip.filter(r=>r.kind==='missed').length,1);
});

test('many missed checks across repeated outages stay within the strip places',()=>{
 const sim=installation({intervalMs:5000});
 for(let i=0;i<10;i++)sim.run(T0+i*60000,T0+i*60000+12000);
 const now=T0+10*60000;
 const {rows,strip}=assertInvariants(sim,now);
 assert.equal(rows.length,STRIP_PLACES);assert.equal(strip.length,STRIP_PLACES);
 assert.ok(rows.some(r=>r.kind==='missed'&&r.count>1)&&rows.some(r=>r.kind==='overdue'));
});

test('a late check is ordered by its run time and says when it was due',()=>{
 const sim=installation();sim.run(T0,T0+MIN+500);sim.run(T0+2*MIN+40000,T0+5*MIN);
 const {rows}=assertInvariants(sim,T0+5*MIN);
 const late=rows.find(r=>r.late);
 assert.equal(late.slot.due_at,T0+2*MIN);assert.equal(late.slot.missed_count,0,'40 s late is less than an interval');
 assert.ok(late.late.by>=40000&&late.effectiveTime>=T0+2*MIN+40000);
 const below=rows[rows.indexOf(late)+1];
 assert.equal(below.slot.due_at,T0+MIN,'the check due before it is listed below it');
});

test('a manual check during an outage neither fills nor hides the gap',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);
 sim.manual(T0+4*MIN+30000);
 const during=assertInvariants(sim,T0+7*MIN);
 assert.deepEqual(kinds(during.rows.slice(0,3)),['overdue×2','manual','overdue×2']);
 assert.equal(during.rows[1].result,'noresult','queued past its lease without a runner');
 sim.run(T0+7*MIN,T0+8*MIN);
 const after=assertInvariants(sim,T0+8*MIN);
 const manual=after.rows.find(r=>r.kind==='manual');
 assert.equal(manual.result,'passed');
 assert.ok(after.rows.indexOf(manual)<after.rows.findIndex(r=>r.late),'the manual check ran after the late scheduled one');
 assert.ok(after.rows.some(r=>r.kind==='missed'&&r.count===4));
});

test('an ongoing outage shows the overdue due times one grace (one lease) past due',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);
 const now=T0+7*MIN+10000,{rows,graceMs}=assertInvariants(sim,now);
 assert.equal(graceMs,leaseMs(sim.monitor().definition),'the grace is the lease the control plane gives a claim');
 assert.equal(rows[0].kind,'overdue');
 assert.deepEqual([rows[0].first,rows[0].last],[T0+3*MIN,T0+6*MIN],'7:00 is not yet a lease past due');
 sim.run(now,T0+9*MIN);
 const after=assertInvariants(sim,T0+9*MIN);
 assert.ok(!after.rows.some(r=>r.kind==='overdue'),'once the runner is back the outage is missed checks and a late check');
 assert.ok(after.rows.some(r=>r.kind==='missed'&&r.first===T0+4*MIN));
});

test('a revision boundary re-anchors the grid and a gap never crosses it',()=>{
 const sim=installation();sim.run(T0,T0+3*MIN+500);
 sim.run(T0+6*MIN+30000,T0+6*MIN+31000);
 sim.save(T0+6*MIN+45000,{name:'Checkout API'});
 sim.run(T0+6*MIN+45000,T0+10*MIN);
 const {rows}=assertInvariants(sim,T0+10*MIN);
 const start=T0+6*MIN+45000,old=rows.filter(r=>r.slot?.revision===1),gap=rows.find(r=>r.kind==='missed');
 assert.ok(old.length&&rows.filter(r=>r.slot?.revision===2).every(r=>(r.slot.due_at-start)%MIN===0),'revision 2 runs on its own grid');
 assert.ok(claims(gap).every(t=>t<start),'missed checks of revision 1 end before revision 2 starts');
 const clipped=installation();clipped.run(T0,T0+MIN);
 const history=clipped.history();history[0].missed_count=9;
 const next={...history[0],id:'m:2:x',revision:2,due_at:T0+3*MIN+7000,missed_count:0};
 const rowsClipped=buildTimeline({slots:[next,...history],now:T0+4*MIN,monitor:{...clipped.monitor(),revision:2,nextDue:T0+4*MIN+7000}}).rows;
 assert.ok(rowsClipped.filter(r=>r.kind==='missed').flatMap(claims).every(t=>t<next.due_at),'a missed_count that would run past the next slot is clipped');
});

test('a paused span: one neutral row, no overdue checks, and after resume the pause is a closed span',()=>{
 const sim=installation();sim.run(T0,T0+3*MIN+500);
 sim.save(T0+3*MIN+20000,{enabled:false});sim.run(T0+3*MIN+20000,T0+15*MIN);
 const paused=assertInvariants(sim,T0+15*MIN);
 assert.deepEqual([paused.rows[0].kind,paused.rows[0].from,paused.rows[0].to],['paused',T0+3*MIN+20000,null]);
 assert.ok(!paused.rows.some(r=>r.kind==='overdue'||r.kind==='missed'));
 sim.save(T0+15*MIN,{enabled:true});sim.run(T0+15*MIN,T0+18*MIN);
 const resumed=assertInvariants(sim,T0+18*MIN);
 const span=resumed.rows.find(r=>r.kind==='paused');
 assert.deepEqual([span.from,span.to],[T0+3*MIN+20000,T0+15*MIN],'the revisions read bounds the pause');
 assert.ok(!resumed.rows.some(r=>r.kind==='overdue'||r.kind==='missed'),'nothing was scheduled while paused');
 const slotless=buildTimeline({slots:sim.history(),now:T0+18*MIN,monitor:sim.monitor()}).rows;
 assert.ok(!slotless.rows?.length&&!slotless.some(r=>['overdue','missed','paused'].includes(r.kind)),'without the revisions read a past pause leaves no slot with its definition, so it is not drawn');
});

test('a maintenance span: checks continue, missed and overdue checks inside it are not listed',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);
 const start=T0+2*MIN+30000,until=start+15*MIN;
 sim.save(start,{maintenanceUntil:until});sim.run(start,start+2*MIN);
 const during=assertInvariants(sim,start+8*MIN);
 assert.deepEqual([during.rows[0].kind,during.rows[0].from,during.rows[0].to],['maintenance',start,null]);
 assert.ok(!during.rows.some(r=>r.kind==='overdue'||r.kind==='missed'));
 assert.ok(during.rows.some(r=>r.kind==='passed'&&r.slot.revision===2),'checks keep running in maintenance');
 const after=assertInvariants(sim,until+5*MIN);
 const span=after.rows.find(r=>r.kind==='maintenance'),overdue=after.rows.find(r=>r.kind==='overdue');
 assert.deepEqual([span.from,span.to],[start,until]);
 assert.ok(overdue&&overdue.first>until,'due times after maintenance ended are overdue');
});

test('maintenance ended by a save while the runner is down: the save-time due is overdue',()=>{
 for(const intervalMs of [MIN,5000]){
  const sim=installation({intervalMs});sim.run(T0,T0+2*MIN+500);
  const start=T0+2*MIN+20000;sim.save(start,{maintenanceUntil:start+15*MIN});sim.run(start,start+2*MIN+500);
  const end=start+3*MIN+7000;sim.save(end,{maintenanceUntil:0});
  const {rows}=assertInvariants(sim,end+2*MIN+30000);
  const span=rows.find(r=>r.kind==='maintenance');
  assert.deepEqual([rows[0].kind,rows[0].first],['overdue',end],'the first due time of the revision that ended maintenance, the save itself, is overdue');
  assert.deepEqual([span.from,span.to],[start,end]);
  assert.ok(!rows.some(r=>r.kind==='missed'),'the due times skipped inside maintenance are not listed');
 }
});

test('an edit or a pause mid-outage keeps the earlier overdue due times as missed checks',()=>{
 const edited=installation();edited.run(T0,T0+2*MIN+500);
 const before=assertInvariants(edited,T0+6*MIN).rows[0];
 assert.deepEqual([before.kind,before.first,before.count],['overdue',T0+3*MIN,3]);
 edited.save(T0+6*MIN+15000,{intervalMs:30000});
 const after=assertInvariants(edited,T0+9*MIN).rows;
 const missed=after.find(r=>r.kind==='missed');
 assert.deepEqual([missed.first,missed.last,missed.count],[T0+3*MIN,T0+5*MIN,3],'the due times overdue before the edit are missed after it');
 assert.equal(after.find(r=>r.kind==='overdue').first,T0+6*MIN+15000,'the edited revision is overdue from its save time');
 edited.run(T0+9*MIN,T0+11*MIN);
 assert.ok(assertInvariants(edited,T0+11*MIN).rows.some(r=>r.kind==='missed'&&r.first===T0+3*MIN&&r.count===3),'the gap before the edit stays once the runner is back');
 const paused=installation();paused.run(T0,T0+2*MIN+500);paused.save(T0+6*MIN+15000,{enabled:false});
 const {rows}=assertInvariants(paused,T0+9*MIN);
 assert.deepEqual(kinds(rows.slice(0,2)),['paused','missed×3']);
 assert.equal(rows[1].first,T0+3*MIN);
 // The history read may already hold the next revision's first slot while the overview still names the old one.
 const raced=installation();raced.run(T0,T0+2*MIN+500);
 const overview=raced.monitor(),now=T0+6*MIN+14000;
 raced.save(T0+6*MIN+15000,{name:'Checkout API'});raced.run(T0+6*MIN+15000,T0+6*MIN+16000);
 const timeline=buildTimeline({slots:raced.history(),now,monitor:overview});
 assert.deepEqual(kinds(timeline.rows.slice(0,2)),['passed','missed×3'],'the old revision\'s tail is missed, not overdue, once the next revision has begun');
 assert.equal(timeline.rows[1].first,T0+3*MIN);
});

test('a pause mid-outage, then a resume: the tail before the pause is missed, the pause a closed span',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);
 sim.save(T0+6*MIN+15000,{enabled:false});sim.save(T0+12*MIN,{enabled:true});
 const {rows}=assertInvariants(sim,T0+15*MIN);
 assert.deepEqual(kinds(rows.slice(0,3)),['overdue×3','paused','missed×3'],'overdue since the resume, the pause, then the three due times missed before it');
 assert.deepEqual([rows[1].from,rows[1].to,rows[2].first,rows[2].last],[T0+6*MIN+15000,T0+12*MIN,T0+3*MIN,T0+5*MIN]);
});

test('a maintenance revision that never ran shows its span from the revisions read',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);
 const start=T0+5*MIN+10000,end=T0+8*MIN+20000;
 sim.save(start,{maintenanceUntil:start+15*MIN});sim.save(end,{maintenanceUntil:0});
 const {rows}=assertInvariants(sim,T0+12*MIN);
 assert.deepEqual(kinds(rows.slice(0,3)),['overdue×4','maintenance','missed×2']);
 assert.deepEqual([rows[0].first,rows[1].from,rows[1].to,rows[2].first,rows[2].last],[end,start,end,T0+3*MIN,T0+4*MIN]);
});
