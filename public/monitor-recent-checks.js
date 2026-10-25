import {escape,ago,duration,humaneDuration} from './console-format.js';
import {locationNamer} from './monitor-rules.js';
import {latestAttempts,clock as shortClock,dayClock} from './monitor-status.js';
import {checkResultSummary} from './monitor-timeline.js';
import {traceMarkup} from './flow-panel.js';
import {protocolFact} from './protocol-panel.js';
import {mailTrace} from './mail-panel.js';
import {transactionTrace} from './transaction-panel.js';
// A monitor page's Recent checks (U15): the dot strip of the last 30 checks (the newest 20 in a phone-width card) with its
// first and last times, the newest three as short rows, and "All checks", which opens the full list in place: the rows of
// buildTimeline (public/monitor-timeline.js) from the monitor's history and revisions, newest first, each check with its
// attempts.
const hiddenDot='<span class="ui-visually-hidden"> · </span>',slash='<span class="ui-visually-hidden"> / </span>';
function tlsTrustMarkup(observation){
 if(!observation.tlsTrust?.length)return '';
 return `<details class="credential-binding" data-tls-observation="${escape(observation.id)}"><summary id="tls-evidence-${escape(observation.id)}">Certificate trust for this attempt</summary><ul>${observation.tlsTrust.map(fact=>`<li><strong>${escape(fact.mode)}</strong> · ${escape(fact.origin)}<br>Leaf SHA-256: <code style="overflow-wrap:anywhere">${escape(fact.sha256)}</code><br>${fact.bypassed?'Bypassed verification errors: ':'Verification results: '}${escape(fact.errors.join(', ')||'No verification errors')}. ${fact.credentialsAllowed?'Credential authority permitted.':'No credential authority granted.'}</li>`).join('')}</ul></details>`;
}
const clock=t=>new Date(t).toLocaleTimeString();
// "11:42:04 AM – 11:44:04 AM", with each date when the range crosses midnight. Each time stays whole and the dash ends
// the first line when the range wraps.
function range(first,last){
 const day=t=>new Date(t).toLocaleDateString(),crosses=day(first)!==day(last);
 const end=(t,tail='')=>`${crosses?`${escape(day(t))}, `:''}<span class="keep-line">${escape(clock(t))}${tail}</span>`;
 return `${end(first,' –')} ${end(last)}`;
}
// Parts of a row's meta joined by " · ", each separator kept at the end of its line with the word before it (a short
// part stays whole). A part is text, or [text, class] for a part a script or style needs to find; a named part is one
// figure ("ran 4 min 44 s late") and stays whole, so a line breaks only between parts.
function metaLine(parts){
 return parts.map((part,i)=>{
  const [value,name]=Array.isArray(part)?part:[part],tail=i<parts.length-1?' ·':'',text=escape(value),cut=!name&&value.length>18?text.lastIndexOf(' '):-1;
  const body=cut>0?`${text.slice(0,cut)} <span class="keep-line">${text.slice(cut+1)}${tail}</span>`:`<span class="keep-line">${text}${tail}</span>`;
  return name?`<span class="${name}">${body}</span>`:body;
 }).join(' ');
}
const timeCell=(when,at)=>`<span class="slot-time"><span class="slot-clock">${when}</span>${hiddenDot}<span class="slot-age">${escape(ago(at))}</span></span>`;
const resultCell=(state,label)=>`<span class="check-result ui-result ${escape(state)}"><span class="result-label">${label}</span></span>`;
const rowData=(row,extra='')=>`data-kind="${escape(row.kind)}" data-time="${row.effectiveTime}" data-oldest="${row.oldestTime}"${extra}`;

const attemptResults={pass:['passed','Passed'],target_failure:['failed','Target did not pass'],runner_error:['unknown','Check could not run']};
function attemptMarkup(o,name){
 const [tone,result]=attemptResults[o.outcome]??['unknown','Unknown result'];
 const status=o.protocol?.steps?'Mail protocol':o.apiTransaction?'API transaction':o.flow?`${escape(o.flow.pages)} page${o.flow.pages===1?'':'s'}`:o.protocol!==undefined?escape(protocolFact(o)):o.status?`HTTP <span class="ui-mono">${escape(o.status)}</span>`:'No HTTP status';
 return `<div class="attempt-group"><p class="attempt-line"><span class="attempt-name">${escape(name(o.probe))} attempt ${o.attempt+1}</span><span class="ui-visually-hidden">: </span><span class="ui-result ${tone}">${escape(result)}</span>${slash}<span>${status}</span>${slash}<span>${escape(duration(o.durationMs))}</span>${slash}<span class="attempt-age">${ago(o.completedAt)}</span></p><ul class="attempt-checks">${o.checks.map(c=>`<li><span class="attempt-mark ui-result ui-result--small ${c.pass?'passed':'failed'}">${c.pass?'PASS':'FAIL'}</span> ${escape(c.assertion)}: ${escape(c.reason)}</li>`).join('')}</ul>${o.credentialBinding?`<details class="credential-binding"><summary>Known monitors referencing this credential</summary>${o.credentialBinding.monitorIds.length>1?'<p>This file can serve only one monitor. For the other monitors, create separate owner-only credential files and references, review the intended account, then bind each explicitly.</p>':''}<ul>${o.credentialBinding.monitorIds.map(id=>`<li>${escape(id)}</li>`).join('')}</ul></details>`:''}${o.canary?`<p class="canary-result">External check: ${escape(o.canary.outcome==='pass'?'Passed':o.canary.outcome==='target_failure'?'Failed':'Could not run')}${o.canary.status?` · HTTP ${escape(o.canary.status)}`:''}. ${escape(o.canary.checks.map(check=>check.reason).join('; '))}</p>`:''}${tlsTrustMarkup(o)}${traceMarkup(o)}${transactionTrace(o)}${mailTrace(o)}</div>`;
}
// What a slot row says it is: its result word, and in the meta how it ended, when it was due if it ran late, its
// attempts, and the revision it came from when the monitor was edited, paused or resumed since (its result is real but
// contributes to historical coverage, but cannot establish current health). A failed row's "HTTP 200" and
// "(expected 201)" are each one unit, so the label breaks only between them in a narrow column.
function slotResult(row){
 const summary=checkResultSummary(row.slot);
 if(row.result==='failed')return resultCell('failed',`Failed${summary.code?`&nbsp;· <span class="slot-code"><span class="keep-line">HTTP <span class="ui-mono">${escape(summary.code)}</span></span>${summary.expected?` <span class="keep-line">(expected <span class="ui-mono">${escape(summary.expected)}</span>)</span>`:''}</span>`:''}`);
 if(row.result==='passed')return resultCell('passed','Passed');
 if(row.result==='running')return resultCell('running',row.reason==='queued'?'Queued':'Running');
 return resultCell('unknown',escape(summary.label));
}
const endings={'runner-error':'could not run','window-expired':'acceptance window ended','queued':'queued, waiting for its assigned checker','queued-expired':'queued, not run within its acceptance window',interrupted:'interrupted'};
function slotMeta(row,revision,name){
 const s=row.slot,count=Array.isArray(s.observations)?s.observations.length:0,parts=[];
 parts.push(`${s.manual?'Manual':'Scheduled'} check ${endings[row.reason]??(row.result==='running'?'running':s.status)}`);
 if(row.late)parts.push([`due ${clock(s.due_at)}`,'slot-late'],[`ran ${humaneDuration(row.late.by)} late`,'slot-late']);
 if(count)for(const o of latestAttempts(s))parts.push(`${name(o.probe)} ${o.outcome==='pass'?'✓':o.outcome==='target_failure'?'✗':'–'}`);else parts.push(s.status==='complete'?'no attempts':'no result yet');
 if(row.reason&&row.reason!=='queued'&&!count)parts[parts.length-1]='no result';
 if(Number.isSafeInteger(s.revision)&&s.revision<revision)parts.push('before your last edit');
 return metaLine(parts);
}
function slotRow(row,revision,runners){
 const s=row.slot,name=locationNamer(s.definition,runners);
 return `<details ${rowData(row,` data-key="slot-${escape(s.id)}" data-slot="${escape(s.id)}" data-due="${s.due_at}"`)}><summary id="history-${escape(s.id)}">${timeCell(escape(clock(row.effectiveTime)),row.effectiveTime)}${hiddenDot}${slotResult(row)}${hiddenDot}<span class="slot-meta">${slotMeta(row,revision,name)}</span></summary><div class="slot-attempts">${(s.observations??[]).map(o=>attemptMarkup(o,name)).join('')}</div></details>`;
}
// A missed or overdue check, or a run of them collapsed into one row with its range and count. There is nothing to
// open, so a row is not a disclosure.
function runRow(row){
 const missed=row.kind==='missed',single=row.count===1;
 const what=missed?(single?'Scheduled check missed (no result available)':`${row.count} scheduled checks missed (no result available)`):(single?'Scheduled check overdue (not run yet)':`${row.count} scheduled checks overdue (not run yet)`);
 return `<div class="slot-row slot-${row.kind}" ${rowData(row,` data-key="${row.kind}-${row.first}" data-first="${row.first}" data-last="${row.last}" data-count="${row.count}" data-interval="${row.interval}"`)}>${timeCell(single?escape(clock(row.first)):range(row.first,row.last),row.last)}${hiddenDot}${resultCell(missed?'unknown':'overdue',missed?'No result':'Overdue')}${hiddenDot}<span class="slot-meta">${escape(what)}</span></div>`;
}
// A paused or maintenance span, neutral: when it began (and ended), and what it means for the checks. A span's clock
// stays whole, so "since" or "until" wraps above it in a narrow time column. A maintenance span still running ends when
// the monitor's running maintenance ends (the overview's maintenanceEndsAt: its calendar window or its quick window).
function spanRow(row,monitor,now){
 const paused=row.kind==='paused',until=monitor.maintenanceEndsAt;
 const whole=t=>`<span class="keep-line">${escape(clock(t))}</span>`;
 const when=row.to===null?(row.fromKnown?`since ${whole(row.from)}`:'ongoing'):row.fromKnown?range(row.from,row.to):`until ${whole(row.to)}`;
 const what=paused?['No scheduled checks while paused']:row.to===null?[...(until>now?[`Until ${dayClock(until,now)}`]:[]),'checks continue, alerts are suppressed']:['Checks continued, alerts were suppressed'];
 return `<div class="slot-row slot-span" ${rowData(row,` data-key="${row.kind}-${row.from}" data-from="${row.from}" data-to="${row.to??''}"`)}>${timeCell(when,row.to??row.from)}${hiddenDot}${resultCell(row.kind,paused?'Paused':'Maintenance')}${hiddenDot}<span class="slot-meta">${metaLine(what)}</span></div>`;
}
export function historyMarkup(timeline,monitor,runners){
 if(!timeline.rows.length)return '<p class="history-empty">No results. Status and uptime are Unknown.</p>';
 const row=r=>r.slot?slotRow(r,monitor.revision,runners):r.count?runRow(r):spanRow(r,monitor,timeline.now);
 return `<div class="check-list" data-now="${timeline.now}" data-grace="${timeline.graceMs}">${timeline.rows.map(row).join('')}</div>`;
}
// The strip: the list's rows oldest first, one place each between the oldest and newest times. A run is one hollow
// ring with its count; a manual check is a small diamond in its result's colour; a span is a short neutral bar. `shown`
// is how many of the newest marks the strip last measured room for (fitStrip); the older ones are drawn "past" (hidden).
const markClass={passed:'passed',failed:'failed',running:'running',noresult:'unknown',missed:'missed',overdue:'overdue',paused:'span paused',maintenance:'span maintenance'};
function stripMarkup(timeline,shown){
 const marks=timeline.strip;
 if(!marks.length)return '';
 const mark=(row,i)=>{const data=rowData(row,` data-count="${row.count??1}"`),past=i<marks.length-shown?' past':'';if(row.count>1)return `<span class="strip-run ${escape(row.kind)}${past}" ${data}>+${row.count}</span>`;return `<span class="ui-dot ${row.kind==='manual'?`manual ${markClass[row.result]}`:markClass[row.kind]}${past}" ${data}></span>`};
 return `<div class="ui-strip">${marks.map(mark).join('')}</div>`;
}
// How many of the strip's newest marks show: at most the card's own number (--strip-limit, public/monitor-page.css: 30, or
// 20 in a phone-width card), and only as many as fit the strip whole, so no mark and no run's count is ever cut and the
// newest is always there; the first time names the oldest mark shown. host: #history-strip. Runs in the task that drew it.
export function fitStrip(host){
 const strip=host?.querySelector('.ui-strip');if(!strip)return undefined;
 const marks=[...strip.children],style=getComputedStyle(strip),limit=Number.parseInt(style.getPropertyValue('--strip-limit'))||marks.length;
 for(const mark of marks)mark.classList.remove('past');
 const gap=parseFloat(style.columnGap)||0,room=strip.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
 let used=0,shown=0;
 for(const mark of marks.toReversed()){
  const own=getComputedStyle(mark),width=mark.getBoundingClientRect().width+parseFloat(own.marginLeft)+parseFloat(own.marginRight),next=used+width+(shown?gap:0);
  if(shown===limit||(shown&&next>room+0.5))break;used=next;shown++;
 }
 marks.forEach((mark,i)=>mark.classList.toggle('past',i<marks.length-shown));
 const first=host.querySelector('.strip-from'),oldest=Number(marks[marks.length-shown]?.dataset.oldest);
 if(first&&Number.isFinite(oldest))first.textContent=shortClock(oldest);
 return shown;
}
// A short row: the time, the result and, for a pass, how long the slowest location took. Times keep their seconds when two
// of the rows share a minute.
function shortResult(row){
 if(row.slot){
  const s=row.slot,summary=checkResultSummary(s),manual=s.manual?' · manual':'';
  if(row.result==='passed')return ['passed',`Passed${manual}`,duration(Math.max(...latestAttempts(s).map(o=>o.durationMs??0)))];
  if(row.result==='failed')return ['failed',`Failed${summary.code?` · ${summary.code}`:''}${manual}`,''];
  if(row.result==='running')return ['running',row.reason==='queued'?'Queued':'Running',''];
  return ['unknown',summary.label,''];
 }
 if(row.count)return row.kind==='missed'?['unknown','No result',row.count>1?`${row.count} missed`:'Missed']:['overdue','Overdue',row.count>1?`${row.count} checks`:''];
 return row.kind==='paused'?['paused','Paused','']:['maintenance','Maintenance',''];
}
function recentRows(timeline){
 const rows=timeline.rows.slice(0,3),fine=rows.some((row,i)=>i&&shortClock(row.effectiveTime)===shortClock(rows[i-1].effectiveTime));
 if(!rows.length)return '<li class="recent-empty">No results. Status and uptime are Unknown.</li>';
 return rows.map(row=>{const [tone,label,detail]=shortResult(row),at=row.effectiveTime;return `<li data-key="recent-${escape(row.slot?.id??`${row.kind}-${row.first??row.from}`)}"><time datetime="${new Date(at).toISOString()}">${escape(fine?clock(at):shortClock(at))}</time><span class="check-result ui-result ${tone}">${escape(label)}</span><span class="recent-detail">${escape(detail)}</span></li>`}).join('');
}
// The strip's first and last times: the oldest mark shown and the newest.
function stripTimes(timeline,shown){
 const marks=timeline.strip;if(!marks.length)return '';
 return `<p class="strip-times"><span class="strip-from">${escape(shortClock(marks[Math.max(0,marks.length-shown)].oldestTime))}</span><span>${escape(shortClock(marks.at(-1).effectiveTime))}</span></p>`;
}
// timeline: buildTimeline's result from the page's last history read, or undefined until it arrives; shown: how many marks
// the strip last had room for (every mark until it is first measured). #raw-history is filled by its own patch
// (historyMarkup), so a refresh leaves an open check and its focus alone.
export function recentChecks(m,timeline,shown=Infinity){
 return `<section class="ui-card panel recent-checks" id="recent-checks" aria-labelledby="recent-checks-heading"><div class="panel-head"><h2 id="recent-checks-heading">Recent checks</h2></div>`
  +`<div class="recent-strip" id="history-strip" aria-hidden="true">${timeline?stripMarkup(timeline,shown)+stripTimes(timeline,shown):''}</div>`
  +`<ul class="recent-rows" id="recent-rows">${timeline?recentRows(timeline):'<li class="recent-empty">Loading recent checks…</li>'}</ul>`
  +`<details class="all-checks" id="all-checks"><summary>All checks</summary><div id="raw-history" data-owned="${escape(m.id)}">Loading recent checks…</div></details></section>`;
}
