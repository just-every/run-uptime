// Recent checks on the monitor page (/app/monitors/<id>) as one timeline. buildTimeline() turns a monitor's history
// (GET /api/monitors/<id>/history), its revisions (GET /api/monitors/<id>/revisions: each save's number, time and
// definition) and its /api/overview entry into the rows public/monitor-page.js lists, newest first, and draws,
// reversed, as the dot strip. It is pure: no DOM and no clock; the caller passes now (the overview's server time), so a
// refresh renders the same rows from the same reads. Without revisions the model falls back to what the slots prove.
//
// What the scheduler does (src/domain/control.server.ts save and claimAttempt, src/domain/schedule.ts):
// - Every save (an edit, pause, resume, or maintenance start or end) creates a revision and sets next_due to the save
//   time, so each revision has its own grid: its save time plus whole intervals. Grids never continue across revisions.
// - claimAttempt claims next_due as one scheduled slot even when it is late, stores in missed_count the whole intervals
//   that had passed by the claim, and moves next_due to due + (missed_count + 1) * interval. The due times
//   due + k * interval, k = 1..missed_count, were skipped: never claimed, never run. They lie on the slot's own revision
//   before the next scheduled slot, so a missed run is clipped there and never crosses a revision boundary.
// - next_due after a revision's last claim names the first due time no claim took. The due times from there to the
//   save that ended the revision were scheduled and never ran (missed); for the newest revision they are the ongoing
//   outage once a grace past due (overdue). See tailRuns.
// - A paused revision is never claimed and cannot be run manually. Maintenance does not stop claims (checks continue,
//   alerts are suppressed), but missed and overdue checks inside a maintenance span are not listed.
// - Assigned attempts have a bounded acceptance window; an expired unfinished slot has no complete result.
// - A manual check is its own slot (manual 1) queued at the click time; it never moves next_due, so it never fills or
//   hides a gap and never counts as scheduled evidence.

const isTime=Number.isSafeInteger;

// The strip's places: each row of the list is one place (a check, one missed or overdue check, a collapsed run of them
// marked "+N", or a paused or maintenance span), so the list holds at most this many rows.
export const STRIP_PLACES=12;

// The acceptance budget matches src/domain/schedule.ts: target retries and each configured canary, plus the completion margin.
export function acceptanceMs(definition){
 const probes=Array.isArray(definition?.probes)?definition.probes.length:1;
 const retries=isTime(definition?.retries)&&definition.retries>=0?definition.retries:0;
 const timeout=isTime(definition?.timeoutMs)&&definition.timeoutMs>=0?definition.timeoutMs:0;
 const canaries=Object.values(definition?.assignments??{}).filter(assignment=>assignment.canaryUrl).length;
 return Math.max(30000,(probes*(retries+1)+canaries)*timeout+10000);
}

// An unclaimed scheduled check is overdue after one acceptance budget. Several
// assigned runners can accept their probes independently; earlier in-flight
// slots do not own the monitor's next scheduled slot.
export const overdueGraceMs=definition=>acceptanceMs(definition);

// A slot's result from the latest attempt of each probe: failed when any target failed (with that response's HTTP status
// and, when it is not the expected one, the expected status), passed only when the slot is complete and every probe
// passed, otherwise unknown.
export function checkResultSummary(slot){
 const latest=new Map();
 for(const o of Array.isArray(slot?.observations)?slot.observations:[]){const previous=latest.get(o.probe);if(!previous||o.attempt>previous.attempt)latest.set(o.probe,o)}
 const results=[...latest.values()],failed=results.find(o=>o.outcome==='target_failure');
 if(failed){const expected=slot.definition?.assertions?.status;return {state:'failed',label:'Failed',code:failed.status,expected:failed.status&&isTime(expected)&&expected!==failed.status?expected:null}}
 if(slot?.status==='complete'&&results.length&&results.every(o=>o.outcome==='pass')&&!slot.observations.some(o=>o.canary&&o.canary.outcome!=='pass'))return {state:'passed',label:'Passed'};
 return {state:'unknown',label:results.length?'No passing result':'No result',runnerError:results.length>0&&results.every(o=>o.outcome==='runner_error')};
}

// Tie order at the same effective time and due time, newest first: a scheduled due time before a manual check or a span.
const RANK={overdue:0,missed:1,running:2,noresult:3,failed:4,passed:5,manual:6,maintenance:7,paused:8};
const newerFirst=(a,b)=>b.effectiveTime-a.effectiveTime||b.dueAt-a.dueAt||RANK[a.kind]-RANK[b.kind];

// One slot (scheduled or manual) as an entry. effectiveTime: the latest attempt's completion when it ran; the claim
// (acceptance-window start) while it runs; otherwise its due time. Never earlier than its due time.
function slotEntry(slot,now,grace){
 const observations=Array.isArray(slot.observations)?slot.observations:[],summary=checkResultSummary(slot);
 const budget=acceptanceMs(slot.definition),claimedAt=isTime(slot.lease_until)&&slot.lease_until>0?slot.lease_until-budget:null;
 const completions=observations.map(o=>o.completedAt).filter(isTime),starts=observations.map(o=>o.startedAt).filter(isTime);
 let state,reason=null;
 if(slot.status==='complete'&&observations.length){state=summary.state==='unknown'?'noresult':summary.state;if(state==='noresult')reason=summary.runnerError?'runner-error':'incomplete'}
 else if(slot.status==='running'){if(isTime(slot.lease_until)&&slot.lease_until>now)state='running';else{state='noresult';reason='window-expired'}}
 else if(slot.status==='queued'){if(slot.due_at+budget>now){state='running';reason='queued'}else{state='noresult';reason='queued-expired'}}
 else{state='noresult';reason=slot.status==='interrupted'?'interrupted':'no-result'}
 const ran=completions.length>0,running=state==='running'&&reason!=='queued'&&claimedAt!==null;
 const effectiveTime=Math.max(slot.due_at,ran?Math.max(...completions):running?claimedAt:slot.due_at);
 const startedAt=starts.length?Math.min(...starts):running?claimedAt:null;
 const manual=Boolean(slot.manual),interval=slot.definition?.intervalMs;
 const late=!manual&&startedAt!==null&&isTime(interval)&&startedAt-slot.due_at>=Math.min(interval,grace)?{by:startedAt-slot.due_at}:null;
 return {kind:manual?'manual':state,result:state,reason,slot,dueAt:slot.due_at,effectiveTime,oldestTime:effectiveTime,startedAt,late};
}

// Due times as runs: {first, count, interval, revision}, members first + k * interval for k = 0..count-1.
const runLast=run=>run.first+(run.count-1)*run.interval;
// The members of a run outside [from, to] (to null: still going), as up to two runs.
function outside(run,{from,to}){
 const last=runLast(run),end=to??Infinity;
 if(last<from||run.first>end)return [run];
 const pieces=[];
 if(run.first<from){const count=Math.floor((from-1-run.first)/run.interval)+1;pieces.push({...run,count})}
 if(last>end){const skip=Math.floor((end-run.first)/run.interval)+1;pieces.push({...run,first:run.first+skip*run.interval,count:run.count-skip})}
 return pieces.filter(p=>p.count>0);
}
// A span covers its own revision's grid only: a span that ends where the next revision starts must not swallow that
// revision's first due time, which is exactly the save that ended the span.
const without=(runs,spans)=>runs.flatMap(run=>spans.filter(span=>span.revision===run.revision).reduce((list,span)=>list.flatMap(piece=>outside(piece,span)),[run]));

// Revision starts the history proves. A revision's first scheduled slot is due at its save time, and every slot of an
// earlier revision is due before that, so the earliest scheduled slot of a revision is its start whenever the history
// also holds an earlier revision's slot. The current revision with no scheduled slot yet still has next_due at its save
// time, because only a scheduled claim moves next_due.
// A revisions read gives every start outright.
function revisionStarts(scheduled,all,monitor,known){
 const starts=new Map(),lowest=Math.min(...all.map(s=>s.revision).filter(isTime));
 for(const r of known)starts.set(r.revision,r.start);
 for(const slot of scheduled){if(!isTime(slot.revision)||slot.revision<=lowest||known.length)continue;const start=starts.get(slot.revision);if(start===undefined||slot.due_at<start)starts.set(slot.revision,slot.due_at)}
 if(monitor&&isTime(monitor.revision)&&isTime(monitor.nextDue)&&!starts.has(monitor.revision)&&!scheduled.some(s=>s.revision===monitor.revision))starts.set(monitor.revision,monitor.nextDue);
 return starts;
}
// The earliest known start of a revision after the given one, or null.
const nextKnownStart=(starts,revision)=>{let next=null;for(const [r,start] of starts)if(r>revision&&(next===null||start<next))next=start;return next};

// Paused and maintenance spans the data allows, each on its own revision. A paused revision is paused from its start
// until the next known revision start (null while it continues). A revision whose definition sets maintenanceUntil after
// its start was in maintenance from its start until that time or the next known revision start, whichever is first; to
// is null while it continues. Revisions come from the revisions read; without it, from the slots and the overview, and
// a past pause (no slot carries its definition) is not shown.
function spans(scheduled,all,monitor,now,starts,known){
 const definitions=new Map();
 for(const r of known)definitions.set(r.revision,r.definition);
 for(const slot of all)if(isTime(slot.revision)&&slot.definition&&!definitions.has(slot.revision))definitions.set(slot.revision,slot.definition);
 const current=monitor&&isTime(monitor.revision)?monitor.revision:null;
 if(current!==null&&monitor.definition)definitions.set(current,monitor.definition);
 const earliest=new Map();for(const slot of all)if(isTime(slot.revision)&&(!earliest.has(slot.revision)||slot.due_at<earliest.get(slot.revision)))earliest.set(slot.revision,slot.due_at);
 const result=[];
 for(const [revision,definition] of definitions){
  const nextStart=nextKnownStart(starts,revision);
  const from=starts.get(revision)??earliest.get(revision)??null,fromKnown=starts.has(revision);
  if(from===null)continue;
  if(definition.enabled===false){if(revision===current||nextStart!==null)result.push({kind:'paused',revision,from,to:nextStart!==null&&nextStart<=now?nextStart:null,fromKnown});continue}
  const until=definition.maintenanceUntil;
  if(!isTime(until)||until<=from||definition.enabled===false)continue;
  const end=Math.min(until,nextStart??Infinity);
  result.push({kind:'maintenance',revision,from,to:end>now?null:end,fromKnown});
 }
 return result;
}

// The scheduled checks that never ran, from each scheduled slot's missed_count: the due times between it and the next
// scheduled slot. They were all skipped before that slot's claim, so the clip at the next slot (or, with none, at the
// next known revision start) only guards odd data.
function missedRuns(scheduled,starts){
 const runs=[];
 scheduled.forEach((slot,i)=>{
  const interval=slot.definition?.intervalMs,next=scheduled[i+1]?.due_at??nextKnownStart(starts,slot.revision)??Infinity;
  if(!isTime(slot.missed_count)||slot.missed_count<=0||!isTime(interval)||interval<=0)return;
  const count=Math.min(slot.missed_count,Number.isFinite(next)?Math.ceil((next-slot.due_at)/interval)-1:slot.missed_count);
  if(count>0)runs.push({kind:'missed',first:slot.due_at+interval,count,interval,revision:slot.revision});
 });
 return runs;
}

// Each revision's unclaimed tail: the due times on its grid from its next_due (its last scheduled slot's
// due + (missed_count + 1) * interval; its start while nothing was claimed; the overview's next_due for the current
// revision, whichever is latest) that no claim ever took. For a revision the next save ended (the next revision's start
// is known: from the revisions read, or it has a scheduled slot or is the current one), they are missed, counting only
// due times a full grace before that save, so a claim the save simply beat is never called missed. For the newest
// revision, enabled, they are overdue once a full grace past due: the ongoing outage. Without the revisions read, when
// the revision after one left no scheduled slot and is not current, when it ended is unknown and nothing is drawn.
// Grace is one acceptance budget of the revision's definition (overdueGraceMs).
function tailRuns(scheduled,monitor,starts,now,known){
 const byRevision=new Map(),definitions=new Map(known.map(r=>[r.revision,r.definition]));
 for(const slot of scheduled)if(isTime(slot.revision)){if(!byRevision.has(slot.revision))byRevision.set(slot.revision,[]);byRevision.get(slot.revision).push(slot)}
 const current=monitor&&isTime(monitor.revision)?monitor.revision:null;
 const revisions=[...new Set([...byRevision.keys(),...definitions.keys(),...(current===null?[]:[current])])],newest=Math.max(...revisions);
 const runs=[];
 for(const revision of revisions){
  const last=byRevision.get(revision)?.at(-1),definition=last?.definition??definitions.get(revision)??(revision===current?monitor.definition:null),interval=definition?.intervalMs;
  if(!definition||!isTime(interval)||interval<=0)continue;
  let first=last?last.due_at+((isTime(last.missed_count)&&last.missed_count>0?last.missed_count:0)+1)*interval:starts.get(revision)??-Infinity;
  if(revision===current&&isTime(monitor.nextDue))first=Math.max(first,monitor.nextDue);
  if(!Number.isFinite(first))continue;
  const grace=overdueGraceMs(definition),nextStart=starts.get(revision+1);
  let kind,end;
  if(isTime(nextStart)){kind='missed';end=nextStart-grace-1}
  else if(revision<newest||nextKnownStart(starts,revision)!==null)continue;
  else if(definition.enabled===false)continue;
  else{kind='overdue';end=now-grace-1}
  if(first>end)continue;
  runs.push({kind,first,count:Math.floor((end-first)/interval)+1,interval,revision});
 }
 return runs;
}

// Split each run where another entry sits inside it in time order, so every piece is contiguous in the list. An entry
// is newer than a member due at d exactly when its effective time is later than d.
function splitRuns(runs,points){
 const cuts=[...new Set(points.map(p=>p.effectiveTime))].sort((a,b)=>a-b);
 return runs.flatMap(run=>{
  const pieces=[];let piece=run;
  for(const cut of cuts){
   if(cut<=piece.first)continue;if(cut>runLast(piece))break;
   const below=Math.floor((cut-1-piece.first)/piece.interval)+1;
   pieces.push({...piece,count:below});piece={...piece,first:piece.first+below*piece.interval,count:piece.count-below};
  }
  pieces.push(piece);return pieces;
 });
}

// revisions: the revisions read ([{revision, start, definition}], any order), optional.
// rows: the list, newest first, at most STRIP_PLACES. Each row has kind, effectiveTime (its newest moment) and
// oldestTime; a run row (missed or overdue) also has first, last, count and interval; a slot row (passed, failed,
// running, noresult, manual) has its slot, result, reason, startedAt and late ({by} when it started at least
// min(interval, grace) after its due time); a span row (paused, maintenance) has from and to (null while it continues).
// strip: the same rows, oldest first.
export function buildTimeline({slots,now,monitor,revisions}){
 const definition=monitor?.definition,grace=overdueGraceMs(definition);
 const all=(Array.isArray(slots)?slots:[]).filter(s=>s&&typeof s==='object'&&isTime(s.due_at));
 const scheduled=all.filter(s=>!s.manual).sort((a,b)=>a.due_at-b.due_at);
 const known=(Array.isArray(revisions)?revisions:[]).filter(r=>r&&isTime(r.revision)&&isTime(r.start)&&r.definition&&typeof r.definition==='object');
 const starts=revisionStarts(scheduled,all,monitor,known),spanList=spans(scheduled,all,monitor,now,starts,known);
 const points=all.map(slot=>slotEntry(slot,now,grace));
 for(const span of spanList)points.push({...span,dueAt:span.from,effectiveTime:span.to??Math.max(now,span.from),oldestTime:span.to??Math.max(now,span.from)});
 const runs=splitRuns(without([...missedRuns(scheduled,starts),...tailRuns(scheduled,monitor,starts,now,known)],spanList),points)
  .map(run=>({kind:run.kind,first:run.first,last:runLast(run),count:run.count,interval:run.interval,revision:run.revision,dueAt:runLast(run),effectiveTime:runLast(run),oldestTime:run.first}));
 const ordered=[...points,...runs].sort(newerFirst);
 // A run piece that continues the grid of the piece just above it (another run's members, the entry between them listed
 // elsewhere) joins it, so a collapsed row's range holds exactly its members.
 const merged=[];
 for(const entry of ordered){
  const above=merged.at(-1);
  if(above&&entry.count&&above.count&&above.kind===entry.kind&&above.interval===entry.interval&&entry.last+entry.interval===above.first){merged[merged.length-1]={...above,first:entry.first,count:above.count+entry.count,oldestTime:entry.first};continue}
  merged.push(entry);
 }
 const rows=merged.slice(0,STRIP_PLACES);
 return {rows,strip:[...rows].reverse(),now,graceMs:grace,places:STRIP_PLACES};
}
