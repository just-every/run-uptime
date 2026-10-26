import {ago,duration,escape} from './console-format.js';
import {checkedFrom,quoted,responseTime,statusText} from './monitor-rules.js';
import {checkResultSummary} from './monitor-timeline.js';
// What a monitor's page says about itself in one plain sentence, and what a finished check says. The engine's own
// explanation stays in Full check details; a failure is said in the page's own words for each kind of rule.
export const joinNames=names=>names.length<3?names.join(' and '):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
export const clock=t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
// When a running maintenance ends, or when an open incident or Slow notice began: its time, with the weekday and date too
// when that is a day or more from now ("Mon, Oct 26, 11:17 AM"). now is the overview's server time.
export const dayClock=(t,now)=>Math.abs(t-now)<86400000?clock(t):new Date(t).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
// The newest attempt of each location in a slot.
export function latestAttempts(slot){
 const latest=new Map();
 for(const o of Array.isArray(slot?.observations)?slot.observations:[]){const previous=latest.get(o.probe);if(!previous||o.attempt>previous.attempt)latest.set(o.probe,o)}
 return [...latest.values()];
}
// What a JSON rule found, from its evidence: missing, the value it read, or why it could not read one; null when the
// evidence does not say (src/domain/http-assertions/json.mjs words it "actual …; expected …").
export const jsonActual=reason=>/: actual (.+); expected /.exec(reason??'')?.[1]??null;
// Why an attempt failed before any rule was judged, from the category its runner reported.
const BEFORE_RULES={timeout:'timed out',connection:'could not connect',transport:'could not connect',network:'could not connect',unresolved:'has no address',dns:'has no address',tls:'failed its TLS handshake',redirect:'redirected away',method:'refused the request method'};
// One location's failed attempt in plain words: what failed and what the rule expected.
function failedWhat(o,definition){
 const a=definition?.assertions??{},check=o.checks?.find(c=>!c.pass);
 switch(check?.assertion){
  case 'status':return o.status?`returns ${o.status} (expected ${statusText(a.status??200)})`:'returns no status';
  case 'body':return `does not contain ${quoted(a.bodyIncludes??'')}`;
  case 'body-absent':return `contains ${quoted(a.bodyExcludes??'')}`;
  case 'body-regex':return `does not match /${a.bodyRegex?.pattern??''}/`;
  case 'header':return `header ${a.header?.name??''} is not ${quoted(a.header?.equals??'')}`;
  case 'json':{const actual=jsonActual(check.reason),expected=a.json?JSON.stringify(a.json.equals):'';return actual==='invalid JSON'?'returns no JSON':`${a.json?.path??'the JSON value'} is ${actual??'different'}${expected?` (expected ${expected})`:''}`}
  case 'latency':return `took ${duration(o.durationMs)} (limit ${responseTime(a.latencyMs)})`;
  default:return BEFORE_RULES[check?.assertion]??'did not pass';
 }
}
// Why a slot failed: every location that failed it, grouped by what it found, as [{what, locations}] (empty when nothing
// failed), so a sentence names them all: "returns 503 (expected 200) from Brisbane and Sydney".
export function failureOf(slot,name){
 const groups=new Map();
 for(const o of latestAttempts(slot).filter(o=>o.outcome==='target_failure')){
  const what=failedWhat(o,slot.definition),group=groups.get(what)??[];
  if(!group.includes(name(o.probe)))group.push(name(o.probe));groups.set(what,group);
 }
 return [...groups].map(([what,locations])=>({what,locations}));
}
const failureText=groups=>groups.map(g=>`${g.what} from ${joinNames(g.locations)}`).join('; ');
// "Passed in 120 ms from Brisbane and Back office", "Failed: returns 404 (expected 200) from Brisbane".
export function checkOutcome(slot,name){
 const attempts=latestAttempts(slot),where=joinNames([...new Set(attempts.map(o=>name(o.probe)))]);
 if(checkResultSummary(slot).state==='passed')return `Passed in ${duration(Math.max(...attempts.map(o=>o.durationMs??0)))} from ${where}`;
 const failure=failureOf(slot,name);
 return failure.length?`Failed: ${failureText(failure)}`:`Couldn’t run from ${where||'any location'}`;
}
// Waits for a queued manual check to finish, up to `limit` ms; null when it has not.
export async function waitForCheck({api,id,slotId,name,limit=20000}){
 const end=Date.now()+limit;
 while(Date.now()<end){
  await new Promise(resolve=>setTimeout(resolve,1500));
  try{const slot=(await api(`/api/monitors/${encodeURIComponent(id)}/history`)).find(s=>s.id===slotId);if(slot?.status==='complete')return checkOutcome(slot,name)}catch{}
 }
 return null;
}
// The status sentence. `seen` is what the page's own reads found: the newest failed scheduled check's failures and the open
// incident's start. A running maintenance ends at the monitor read's maintenanceEndsAt: the latest end of its running windows
// (a weekly one's running occurrence) and its quick window, from the definition (src/domain/planned-maintenance.mjs).
export function statusLine(m,{readUnavailable,data,seen={}}){
 const d=m.definition,state=m.state,runners=data.runner.runners??[],where=joinNames(checkedFrom(d,runners))||'your locations',now=Number.isSafeInteger(data.now)?data.now:Date.now();
 const last=m.availability?.lastCheckAt,checked=Number.isSafeInteger(last)&&last<=Date.now()?last:null;
 if(readUnavailable)return 'Couldn’t refresh. Showing the last result.';
 if(d.enabled&&d.type==='heartbeat'&&data.runner.hosted&&!data.runner.privateRunnerReady)return 'No private runner is in contact, so receipts are not read yet. Start the command in the Heartbeat section.';
 if(!d.enabled)return 'Paused. Nothing is checked until you resume.';
 switch(state.state){
  case 'Healthy':return checked?`Up · checked from ${where} ${ago(checked)}`:`Up · waiting for the next check from ${where}`;
  case 'Failing':return `Down${seen.since?` since ${dayClock(seen.since,now)}`:''}: ${seen.failure?.length?failureText(seen.failure):'the latest checks did not pass'}`;
  case 'Degraded':return 'Some checks failed. Waiting to confirm.';
  case 'Recovering':return `Passing again. Confirming recovery (${Math.min(state.recoveryStreak??0,d.recoverSlots)} of ${d.recoverSlots} checks).`;
  case 'Maintenance':return `In maintenance${m.maintenanceEndsAt>now?` until ${dayClock(m.maintenanceEndsAt,now)}`:''}`;
  case 'Unknown':return checked?'No recent result. Waiting for the next check.':`Waiting for the first check from ${where}.`;
  default:return 'Status unavailable.';
 }
}
// A short line with the longer explanation behind a "?" disclosure, so fine print is there when wanted and not read
// otherwise. `name` says what the "?" explains (its accessible name).
export const moreInfo=(line,more,cls,name)=>`<div class="fine-print${cls?' '+cls:''}"><p>${line}</p><details class="more-info"><summary aria-label="${escape(name)}"><span aria-hidden="true">?</span></summary><p>${more}</p></details></div>`;
export const moreInfoText=(line,more,cls,name)=>moreInfo(escape(line),escape(more),cls,name);
