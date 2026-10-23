import {ago,duration,escape} from './console-format.js';
import {checkedFrom} from './monitor-rules.js';
import {checkResultSummary} from './monitor-timeline.js';
// What a monitor's page says about itself in one plain sentence, and what a finished check says. The engine's own
// explanation stays in Full check details; nothing here parses it.
export const joinNames=names=>names.length<3?names.join(' and '):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
export const clock=t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const lowerFirst=text=>text.charAt(0).toLowerCase()+text.slice(1);
// The newest attempt of each location in a slot.
export function latestAttempts(slot){
 const latest=new Map();
 for(const o of Array.isArray(slot?.observations)?slot.observations:[]){const previous=latest.get(o.probe);if(!previous||o.attempt>previous.attempt)latest.set(o.probe,o)}
 return [...latest.values()];
}
// What one location's failed attempt found: "returns 503 (expected 200)" when the status failed, else its own reason.
function failedWhat(o,expected){
 const check=o.checks?.find(c=>!c.pass);
 if(check?.assertion==='status'&&o.status)return `returns ${o.status}${Number.isSafeInteger(expected)&&expected!==o.status?` (expected ${expected})`:''}`;
 return check?.reason?lowerFirst(check.reason):'did not pass';
}
// Why a slot failed: every location that failed it, grouped by what it found, as [{what, locations}] (empty when nothing
// failed), so a sentence names them all: "returns 503 (expected 200) from Brisbane and Sydney".
export function failureOf(slot,name){
 const groups=new Map();
 for(const o of latestAttempts(slot).filter(o=>o.outcome==='target_failure')){
  const what=failedWhat(o,slot.definition?.assertions?.status),group=groups.get(what)??[];
  if(!group.includes(name(o.probe)))group.push(name(o.probe));groups.set(what,group);
 }
 return [...groups].map(([what,locations])=>({what,locations}));
}
export const failureText=groups=>groups.map(g=>`${g.what} from ${joinNames(g.locations)}`).join('; ');
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
// The status sentence. `seen` is what the page's own reads found: the newest failed scheduled check's failures, the open
// incident's start and when the running maintenance ends.
export function statusLine(m,{readUnavailable,data,seen={}}){
 const d=m.definition,state=m.state,runners=data.runner.runners??[],where=joinNames(checkedFrom(d,runners))||'your locations';
 const last=m.availability?.lastCheckAt,checked=Number.isSafeInteger(last)&&last<=Date.now()?last:null;
 if(readUnavailable)return 'Couldn’t refresh. Showing the last result.';
 if(d.enabled&&d.type==='heartbeat'&&data.runner.hosted&&!data.runner.privateRunnerReady)return 'No private runner is in contact, so receipts are not read yet. Start the command below.';
 if(!d.enabled)return 'Paused. Nothing is checked until you resume.';
 switch(state.state){
  case 'Healthy':return checked?`Up · checked from ${where} ${ago(checked)}`:`Up · waiting for the next check from ${where}`;
  case 'Failing':return `Down${seen.since?` since ${clock(seen.since)}`:''}: ${seen.failure?.length?failureText(seen.failure):'the latest checks did not pass'}`;
  case 'Degraded':return 'Some checks failed. Waiting to confirm.';
  case 'Recovering':return `Passing again. Confirming recovery (${Math.min(state.recoveryStreak??0,d.recoverSlots)} of ${d.recoverSlots} checks).`;
  case 'Maintenance':return `In maintenance${seen.maintenanceEnd?` until ${clock(seen.maintenanceEnd)}`:''}`;
  case 'Unknown':return checked?'No recent result. Waiting for the next check.':`Waiting for the first check from ${where}.`;
  default:return 'Status unavailable.';
 }
}
// A short line with the longer explanation behind a "?" disclosure, so fine print is there when wanted and not read
// otherwise. `name` says what the "?" explains (its accessible name).
export const moreInfo=(line,more,cls='',name='More about this')=>`<div class="fine-print${cls?' '+cls:''}"><p>${line}</p><details class="more-info"><summary aria-label="${escape(name)}"><span aria-hidden="true">?</span></summary><p>${more}</p></details></div>`;
export const moreInfoText=(line,more,cls,name)=>moreInfo(escape(line),escape(more),cls,name);
