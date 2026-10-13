// The monitor page's Recent checks model (public/monitor-timeline.js) against histories made the way the control plane
// makes them: a small simulator claims, completes and expires slots as src/domain/control.server.ts claimNext and save
// do, with the cadence functions of src/domain/schedule.ts, and a serial runner that polls once a second. Each case
// asserts the four timeline invariants on the rows the list and the strip render, against the due times the simulator
// itself scheduled.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTimeline,STRIP_PLACES} from '../public/monitor-timeline.js';
import {acceptanceMs,missedSlots,nextDueAfter} from '../src/domain/schedule.ts';

const MIN=60000,T0=Date.UTC(2026,9,11,1,0,0);

// One monitor in one installation: save() is control.server.ts save (a new revision, due at the save or the shorter
// interval after the last scheduled check started, whichever is later), claim() is attempts.server.ts claimAttempt for
// this monitor, complete() completeAttempts (raising next_due to one interval after the reported start), run() is the
// private runner's poll loop between two times. made records every due time the scheduler made due: each claimed one,
// the ones a claim skipped, and a revision's unclaimed ones before the save that ended it.
function installation({intervalMs=MIN,target=()=>'pass',...changes}={}){
 const slots=[],revs=[],made=[];let revision=1,nextDue=T0,rowid=0;
 let definition={name:'Checkout API health',type:'http',url:'http://127.0.0.1:4832/health',method:'GET',probes:['local-a'],assertions:{status:200},intervalMs,timeoutMs:2000,retries:1,failureQuorum:1,confirmSlots:2,recoverSlots:2,freshnessMs:180000,enabled:true,maintenanceUntil:0,...changes};
 const running=()=>slots.find(s=>s.status==='running');
 const started=slot=>Math.max(...[slot.lease_until>0?slot.lease_until-acceptanceMs(slot.definition):null,...slot.observations.map(o=>o.startedAt)].filter(Number.isSafeInteger));
 revs.push({revision,start:T0,definition});
 const sim={
  revs,
  save(at,changes){
   const old=definition,last=slots.filter(s=>!s.manual).sort((a,b)=>b.due_at-a.due_at||b.rowid-a.rowid)[0];
   if(old.enabled)for(let g=nextDue;g<at;g+=old.intervalMs)made.push({revision,at:g});
   revision++;definition={...definition,...changes};
   nextDue=Math.max(at,last?started(last)+Math.min(definition.intervalMs,old.intervalMs):at);revs.push({revision,start:at,definition});
  },
  manual(at){const slot={id:`m:${revision}:manual:${++rowid}`,revision,due_at:at,status:'queued',definition:{...definition},lease_until:0,missed_count:0,manual:1,observations:[],rowid};slots.push(slot);return slot},
  claim(at){
   const due=definition.enabled&&nextDue<=at&&!running();
   const manual=due?null:slots.filter(s=>s.manual&&s.status==='queued').sort((a,b)=>a.due_at-b.due_at)[0];
   if(manual){if(!definition.enabled||manual.revision!==revision){manual.status='interrupted';return null}if(!running()){manual.status='running';manual.lease_until=at+acceptanceMs(manual.definition);return manual}}
   for(const s of slots)if(s.status==='running'&&s.lease_until<=at)s.status='interrupted';
   if(!definition.enabled||nextDue>at||running())return null;
   const slot={id:`m:${revision}:${nextDue}`,revision,due_at:nextDue,status:'running',definition:{...definition},lease_until:at+acceptanceMs(definition),missed_count:missedSlots(nextDue,at,definition.intervalMs),manual:0,observations:[],rowid:++rowid};
   for(let k=0;k<=slot.missed_count;k++)made.push({revision,at:nextDue+k*definition.intervalMs});
   nextDue=Math.max(nextDueAfter(nextDue,at,definition.intervalMs),at+definition.intervalMs);slots.push(slot);return slot;
  },
  // The runner reports every attempt in one request at completedAt; failedUntil makes a failed first attempt end then
  // and a retry start right after it.
  complete(slot,startedAt,completedAt,{failedUntil}={}){
   const observation=(attempt,outcome,from,to)=>({id:`o:${slot.rowid}:${attempt}`,probe:'local-a',attempt,outcome,status:outcome==='pass'?200:outcome==='target_failure'?503:null,startedAt:from,completedAt:to,durationMs:to-from,checks:[{assertion:'status',pass:outcome==='pass',reason:'Expected HTTP status'}]});
   slot.observations=failedUntil?[observation(0,'target_failure',startedAt,failedUntil),observation(1,target(failedUntil+1),failedUntil+1,completedAt)]:[observation(0,target(startedAt),startedAt,completedAt)];
   slot.status='complete';
   if(!slot.manual&&slot.revision===revision)nextDue=Math.max(nextDue,startedAt+definition.intervalMs);
  },
  // The runner: claim, run for runMs, report, sleep a second; or sleep a second when nothing is due.
  run(from,to,{runMs=150}={}){let t=from;while(t<to){const task=sim.claim(t);if(task){sim.complete(task,t+5,t+runMs);t+=runMs+1000}else t+=1000}},
  // Every due time made due by now, with the current revision's unclaimed ones only once a full grace past due.
  scheduled:now=>[...made,...(definition.enabled?Array.from({length:Math.max(0,Math.ceil((now-acceptanceMs(definition)-nextDue)/definition.intervalMs))},(_,k)=>({revision,at:nextDue+k*definition.intervalMs})):[])],
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
// The invariants, computed from the rows, the raw history and the due times the simulator scheduled (not from the
// model's own derivations): (a) the list is ordered by effective time, newest first; (b) every due time scheduled since
// the oldest row's time is represented, except inside maintenance spans: each claimed one by its slot, and each one that
// never ran (skipped by a late claim, left unclaimed before the save that ended its revision, or a full grace past due on
// the current revision) by a missed or overdue row; (c) the strip is the list reversed; (d) no due time is claimed twice;
// (e) a missed or overdue row names only due times the scheduler made due.
function assertInvariants(sim,now){
 const timeline=sim.timeline(now),{rows}=timeline,history=sim.history();
 assert.ok(rows.length<=STRIP_PLACES,'never more rows than the strip has places');
 rows.forEach((row,i)=>{
  assert.ok(row.oldestTime<=row.effectiveTime,`row ${i} spans forward in time`);
  if(i)assert.ok(rows[i-1].oldestTime>=row.effectiveTime,`(a) row ${i} (${row.kind}) is newer than the row above it`);
 });
 assert.deepEqual(timeline.strip,[...rows].reverse(),'(c) the strip is the list reversed');
 const claimed=rows.flatMap(claims),set=new Set(claimed),iso=t=>new Date(t).toISOString();
 assert.equal(set.size,claimed.length,'(d) no due time is claimed by two rows');
 if(!rows.length)return timeline;
 const oldest=rows.at(-1).oldestTime,real=new Set(history.filter(s=>!s.manual).map(s=>s.due_at));
 for(const {revision,at} of sim.scheduled(now)){
  const rev=sim.revs.find(r=>r.revision===revision),until=rev.definition.maintenanceUntil;
  if(at<oldest||(until>rev.start&&at>=rev.start&&at<=until))continue;
  assert.ok(set.has(at)||real.has(at),`(b) due time ${iso(at)} of revision ${revision} is represented`);
 }
 const made=new Set(sim.scheduled(now).map(d=>d.at));
 for(const at of rows.filter(r=>r.count).flatMap(claims))assert.ok(made.has(at),`(e) ${iso(at)} was made due`);
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
 const sim=installation();sim.run(T0,T0+3*MIN+500);const pending=sim.monitor().nextDue;sim.run(T0+5*MIN+15000,T0+8*MIN);
 const {rows}=assertInvariants(sim,T0+8*MIN);
 const late=rows.findIndex(r=>r.late);
 assert.deepEqual(kinds(rows.slice(late,late+2)),['passed','missed']);
 assert.equal(rows[late].slot.due_at,pending,'the late check keeps its due time');
 assert.equal(rows[late+1].first,pending+MIN,'the missed check is the next due time');
 assert.ok(rows[late].late.by>=MIN);
});

test('consecutive missed checks collapse into one row and one strip place',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);const pending=sim.monitor().nextDue;sim.run(T0+6*MIN+20000,T0+9*MIN);
 const {rows,strip}=assertInvariants(sim,T0+9*MIN);
 const run=rows.find(r=>r.kind==='missed');
 assert.deepEqual([run.count,run.first,run.last],[3,pending+MIN,pending+3*MIN]);
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
 const sim=installation();sim.run(T0,T0+MIN+500);const before=sim.history()[0].due_at,pending=sim.monitor().nextDue;sim.run(T0+2*MIN+40000,T0+5*MIN);
 const {rows}=assertInvariants(sim,T0+5*MIN);
 const late=rows.find(r=>r.late);
 assert.equal(late.slot.due_at,pending);assert.equal(late.slot.missed_count,0,'40 s late is less than an interval');
 assert.ok(late.late.by>=T0+2*MIN+40000-pending&&late.effectiveTime>=T0+2*MIN+40000);
 const below=rows[rows.indexOf(late)+1];
 assert.equal(below.slot.due_at,before,'the check due before it is listed below it');
});

test('a manual check during an outage neither fills nor hides the gap',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);const pending=sim.monitor().nextDue;
 sim.manual(T0+4*MIN+30000);
 const during=assertInvariants(sim,T0+7*MIN);
 assert.deepEqual(kinds(during.rows.slice(0,3)),['overdue×2','manual','overdue×2']);
 assert.equal(during.rows[1].result,'noresult','queued past its lease without a runner');
 sim.run(T0+7*MIN,T0+8*MIN);
 const after=assertInvariants(sim,T0+8*MIN);
 const manual=after.rows.find(r=>r.kind==='manual');
 assert.equal(manual.result,'passed');
 assert.ok(after.rows.indexOf(manual)<after.rows.findIndex(r=>r.late),'the manual check ran after the late scheduled one');
 assert.ok(after.rows.some(r=>r.kind==='missed'&&r.first===pending+MIN&&r.count===3),'the late claim at 7:00 skipped the three due times after the one it took');
});

test('an ongoing outage shows the overdue due times one grace (one lease) past due',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);const pending=sim.monitor().nextDue;
 const now=T0+7*MIN+10000,{rows,graceMs}=assertInvariants(sim,now);
 assert.equal(graceMs,acceptanceMs(sim.monitor().definition),'the grace is the lease the control plane gives a claim');
 assert.equal(rows[0].kind,'overdue');
 assert.deepEqual([rows[0].first,rows[0].last],[pending,pending+3*MIN],'the one due near 7:00 is not yet a lease past due');
 sim.run(now,T0+9*MIN);
 const after=assertInvariants(sim,T0+9*MIN);
 assert.ok(!after.rows.some(r=>r.kind==='overdue'),'once the runner is back the outage is missed checks and a late check');
 assert.ok(after.rows.some(r=>r.kind==='missed'&&r.first===pending+MIN));
});

test('a revision boundary re-anchors the schedule and a gap never crosses it',()=>{
 const sim=installation();sim.run(T0,T0+3*MIN+500);
 sim.run(T0+6*MIN+30000,T0+6*MIN+31000);
 sim.save(T0+6*MIN+45000,{name:'Checkout API'});
 sim.run(T0+6*MIN+45000,T0+10*MIN);
 const {rows}=assertInvariants(sim,T0+10*MIN);
 const start=T0+6*MIN+45000,old=rows.filter(r=>r.slot?.revision===1),gap=rows.find(r=>r.kind==='missed');
 const lastOld=sim.history().find(s=>s.revision===1),oldStart=Math.max(lastOld.lease_until-acceptanceMs(lastOld.definition),lastOld.observations[0].startedAt);
 const firstNew=Math.min(...sim.history().filter(s=>s.revision===2).map(s=>s.due_at));
 assert.ok(old.length&&firstNew===Math.max(start,oldStart+MIN),'revision 2 is first due at its save or an interval after revision 1\'s last check started, whichever is later');
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
 const edited=installation();edited.run(T0,T0+2*MIN+500);const pending=edited.monitor().nextDue;
 const before=assertInvariants(edited,T0+6*MIN).rows[0];
 assert.deepEqual([before.kind,before.first,before.count],['overdue',pending,3]);
 edited.save(T0+6*MIN+15000,{intervalMs:30000});
 const after=assertInvariants(edited,T0+9*MIN).rows;
 const missed=after.find(r=>r.kind==='missed');
 assert.deepEqual([missed.first,missed.last,missed.count],[pending,pending+3*MIN,4],'the due times overdue before the edit, and the one due in its last lease, are missed after it');
 assert.equal(after.find(r=>r.kind==='overdue').first,T0+6*MIN+15000,'the edited revision is overdue from its save time');
 edited.run(T0+9*MIN,T0+11*MIN);
 assert.ok(assertInvariants(edited,T0+11*MIN).rows.some(r=>r.kind==='missed'&&r.first===pending&&r.count===4),'the gap before the edit stays once the runner is back');
 const paused=installation();paused.run(T0,T0+2*MIN+500);paused.save(T0+6*MIN+15000,{enabled:false});
 const {rows}=assertInvariants(paused,T0+9*MIN);
 assert.deepEqual(kinds(rows.slice(0,2)),['paused','missed×4']);
 assert.equal(rows[1].first,pending);
 // The history read may already hold the next revision's first slot while the overview still names the old one.
 const raced=installation();raced.run(T0,T0+2*MIN+500);
 const overview=raced.monitor(),now=T0+6*MIN+14000;
 raced.save(T0+6*MIN+15000,{name:'Checkout API'});raced.run(T0+6*MIN+15000,T0+6*MIN+16000);
 const timeline=buildTimeline({slots:raced.history(),now,monitor:overview});
 assert.deepEqual(kinds(timeline.rows.slice(0,2)),['passed','missed×4'],'the old revision\'s tail is missed, not overdue, once the next revision has begun');
 assert.equal(timeline.rows[1].first,pending);
});

test('a pause mid-outage, then a resume: the tail before the pause is missed, the pause a closed span',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);const pending=sim.monitor().nextDue;
 sim.save(T0+6*MIN+15000,{enabled:false});sim.save(T0+12*MIN,{enabled:true});
 const {rows}=assertInvariants(sim,T0+15*MIN);
 assert.deepEqual(kinds(rows.slice(0,3)),['overdue×3','paused','missed×4'],'overdue since the resume, the pause, then the four due times missed before it');
 assert.deepEqual([rows[1].from,rows[1].to,rows[2].first,rows[2].last],[T0+6*MIN+15000,T0+12*MIN,pending,pending+3*MIN]);
});

test('a maintenance revision that never ran shows its span from the revisions read',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);const pending=sim.monitor().nextDue;
 const start=T0+5*MIN+10000,end=T0+8*MIN+20000;
 sim.save(start,{maintenanceUntil:start+15*MIN});sim.save(end,{maintenanceUntil:0});
 const {rows}=assertInvariants(sim,T0+12*MIN);
 assert.deepEqual(kinds(rows.slice(0,3)),['overdue×4','maintenance','missed×3']);
 assert.deepEqual([rows[0].first,rows[1].from,rows[1].to,rows[2].first,rows[2].last],[end,start,end,pending,pending+2*MIN]);
});

test('a pause or maintenance window that continues across a save is one span and one strip place',()=>{
 const sim=installation();sim.run(T0,T0+3*MIN+500);
 sim.save(T0+3*MIN+20000,{enabled:false});sim.save(T0+8*MIN,{name:'Checkout API'});
 const paused=assertInvariants(sim,T0+12*MIN);
 assert.deepEqual(paused.rows.filter(r=>r.kind==='paused').map(r=>[r.from,r.to]),[[T0+3*MIN+20000,null]],'the edit while paused does not split the pause');
 sim.save(T0+12*MIN,{enabled:true});sim.run(T0+12*MIN,T0+14*MIN);
 const resumed=assertInvariants(sim,T0+14*MIN);
 assert.deepEqual(resumed.rows.filter(r=>r.kind==='paused').map(r=>[r.from,r.to]),[[T0+3*MIN+20000,T0+12*MIN]]);
 assert.equal(resumed.strip.filter(r=>r.kind==='paused').length,1);
 const kept=installation();kept.run(T0,T0+2*MIN+500);
 const start=T0+2*MIN+30000,until=start+15*MIN;
 kept.save(start,{maintenanceUntil:until});kept.run(start,start+2*MIN);kept.save(start+3*MIN,{name:'Checkout API'});kept.run(start+3*MIN,start+5*MIN);
 const during=assertInvariants(kept,start+5*MIN);
 assert.deepEqual(during.rows.filter(r=>r.kind==='maintenance').map(r=>[r.from,r.to]),[[start,null]],'an edit during maintenance does not split it');
 const after=assertInvariants(kept,until+MIN);
 assert.deepEqual(after.rows.filter(r=>r.kind==='maintenance').map(r=>[r.from,r.to]),[[start,until]]);
 const ended=installation();ended.run(T0,T0+2*MIN+500);
 ended.save(start,{maintenanceUntil:start+MIN});ended.save(start+3*MIN,{maintenanceUntil:start+3*MIN+MIN});
 assert.equal(assertInvariants(ended,start+6*MIN).rows.filter(r=>r.kind==='maintenance').length,2,'two windows with time between them stay two spans');
});

test('the due times in the last lease before a save are missed; a save before anything was due misses nothing',()=>{
 const sim=installation();sim.run(T0,T0+2*MIN+500);const pending=sim.monitor().nextDue;
 sim.save(pending+10000,{name:'Checkout API'});
 const {rows}=assertInvariants(sim,pending+20000);
 assert.deepEqual([rows[0].kind,rows[0].first,rows[0].count],['missed',pending,1],'due 10 s before the edit, inside its lease, and never claimed');
 const busy=installation();busy.run(T0,T0+3*MIN+5000);
 const last=busy.history()[0],next=busy.monitor().nextDue,save=last.due_at+MIN+1;
 assert.ok(next>save,'the runner reported its start after the due time, so the next check is due later than the plain interval');
 busy.save(save,{name:'Checkout API'});busy.run(save,save+2*MIN);
 assert.ok(!assertInvariants(busy,save+2*MIN).rows.some(r=>r.kind==='missed'||r.kind==='overdue'),'nothing was due before the edit');
 const twice=installation();twice.run(T0,T0+3*MIN+5000);
 twice.save(T0+3*MIN+10000,{name:'Checkout API'});twice.run(T0+3*MIN+10000,T0+3*MIN+40000);twice.save(T0+3*MIN+40000,{enabled:false});
 const quiet=assertInvariants(twice,T0+5*MIN);
 assert.ok(!quiet.rows.some(r=>r.kind==='missed'||r.kind==='overdue'),'the edited revision was first due an interval after the last check started, after the pause ended it');
});

test('a check still running at the save: its start is not read, so the due time in its lease is missed and none is invented',()=>{
 // The save reads only results already reported (lastScheduledStart), and the result reported after it no longer moves
 // next_due (completeAttempts raises it only while the slot's revision is current).
 // A first attempt that failed before the save is not read either: the runner reports it with its retry.
 for(const {lag,saveAfter,failedUntil} of [{lag:800,saveAfter:60400},{lag:5,saveAfter:61000},{lag:800,saveAfter:60400,failedUntil:30800}]){
  const sim=installation({timeoutMs:30000,retries:2});sim.run(T0,T0+2*MIN+500);
  const claimAt=sim.monitor().nextDue,slot=sim.claim(claimAt),save=claimAt+saveAfter;
  sim.save(save,{name:'Checkout API'});
  sim.complete(slot,claimAt+lag,claimAt+90000,{failedUntil:failedUntil&&claimAt+failedUntil});
  sim.run(claimAt+91000,claimAt+5*MIN);
  const {rows}=assertInvariants(sim,claimAt+5*MIN);
  const missed=rows.filter(r=>r.kind==='missed');
  assert.deepEqual(missed.map(r=>[r.first,r.count]),[[claimAt+MIN,1]],`lag ${lag} ms: the due time one interval after the claim was never claimed before the save`);
  assert.equal(Math.min(...sim.history().filter(s=>s.revision===2).map(s=>s.due_at)),save,'the edited revision was first due at its save');
 }
});
