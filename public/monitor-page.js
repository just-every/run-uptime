import {incidentMarkup} from './monitor-incidents.js';
import {bindHeartbeatKey} from './heartbeat-key.js';
import {confirmErasure,showErasureReceipt} from './notification-dialogs.js';
// One monitor's page (/app/monitors/<id>), rendered by public/app.js into the console shell on every refresh: the page
// header (back link, name with its state, URL, kind and interval, actions) and, in #content-area, the state notice, then
// evidence coverage and recent checks with their attempts on the left, and the last check, what the check expects and,
// for a heartbeat, its receipts on the right. Recent checks are the rows of buildTimeline (public/monitor-timeline.js)
// from the monitor's history and revisions: the list newest first and the dot strip, the same rows oldest first.
// Focusable elements keep stable ids, because app.js restores focus by id after each 5-second rebuild.
import {escape,icon,ago,duration,breakableUrl,checkTime,humaneDuration,shownState} from './console-format.js';
import {COVERAGE_RULE,coverage,coverageLegend} from './monitor-coverage.js';
import {buildTimeline,checkResultSummary} from './monitor-timeline.js';
import {isFlow,flowSummary,flowPanel,flowRevisions,traceMarkup} from './flow-panel.js';

// The id in /app/monitors/<id>, or null on any other path. The server answers an id that does not decode with its 404
// page, so this page only sees ids that decode.
export function monitorIdFromPath(pathname){
 const match=pathname.match(/^\/app\/monitors\/([^/]+)\/?$/);
 return match?decodeURIComponent(match[1]):null;
}

const kinds={http:'HTTP check',keyword:'Keyword check',heartbeat:'Heartbeat',flow:'Browser flow'};
const backLink='<a class="back-link ui-link" id="monitor-back" href="/app"><span class="ui-icon" data-icon="chevron" aria-hidden="true"></span><span class="ui-visually-hidden">Back to </span>Monitors</a>';
const hiddenDot='<span class="ui-visually-hidden"> · </span>',slash='<span class="ui-visually-hidden"> / </span>';
const openHistory=new Set(),openIncidents=new Set();

// "every 1 minute", "every 15 seconds", "every 1 hour 30 minutes": the interval with its units spelled out.
const unitWords={d:'day',h:'hour',min:'minute',s:'second'};
const spokenInterval=ms=>humaneDuration(ms).replace(/(\d+) (d|h|min|s)\b/g,(_,n,unit)=>`${n} ${unitWords[unit]}${n==='1'?'':'s'}`);

function statusExplanation(m,readUnavailable,data){if(readUnavailable)return 'The latest overview could not be refreshed. These results are from the last successful refresh.';if(m.definition.enabled&&m.definition.type==='heartbeat'&&data.runner.hosted&&!data.runner.privateRunnerReady)return 'This heartbeat needs a private runner to evaluate receipts. No private runner has fresh contact. Start the command in Private runner required below; a receipt alone cannot change health.';if(!m.definition.enabled)return 'This monitor is paused. New scheduled results are needed after it resumes.';return m.state.reason||({Healthy:'The latest scheduled check passed.',Failing:'The latest scheduled check did not pass.',Degraded:'Recent check results are mixed or still being confirmed.',Unknown:'No valid recent scheduled result is available.',Recovering:'The latest check passed, and recovery is still being confirmed.',Maintenance:'Maintenance is active. Checks continue, but alerts are suppressed.'})[m.state.state]||'Check status is unavailable.'}
// Each expectation as a label over a chip; codes, headers and JSON are monospace, prose limits are not. A heartbeat
// check only reads its receipt (runners/src/probes.mjs probeHeartbeat), so its stored HTTP assertions are not listed;
// Full check details still shows them.
function assertionSummary(definition){
 if(isFlow(definition))return flowSummary(definition);
 const assertions=definition.assertions,checks=[];
 if(definition.type==='heartbeat'){if(Number.isFinite(definition.heartbeat?.maxAgeMs))checks.push(['Heartbeat receipt','Received within '+humaneDuration(definition.heartbeat.maxAgeMs),false])}
 else{
  checks.push(['HTTP status',String(assertions.status),true]);
  if(assertions.bodyIncludes!==undefined)checks.push(['Body contains',assertions.bodyIncludes,true]);
  if(assertions.header)checks.push(['Header',assertions.header.name+' = '+assertions.header.equals,true]);
  if(assertions.json)checks.push(['JSON value',assertions.json.path+' = '+JSON.stringify(assertions.json.equals),true]);
  if(assertions.latencyMs!==undefined)checks.push(['Response time',`At most ${assertions.latencyMs}\u00a0ms`,false]);
 }
 return '<dl class="assertion-summary">'+checks.map(([name,value,code])=>`<div><dt>${escape(name)}</dt><dd><span class="expect-chip${code?' ui-mono':''}">${escape(value)}</span></dd></div>`).join('')+'</dl>';
}

function titleBlock(m,readUnavailable){
 const state=shownState(m,readUnavailable),heartbeat=m.definition.type==='heartbeat';
 const where=heartbeat?`<p class="subtitle monitor-target">Incoming heartbeat at <code class="ui-mono">/api/heartbeats/${escape(m.id)}</code></p>`:`<p class="subtitle monitor-target ui-url">${breakableUrl(m.definition.url)}</p>`;
 return `${backLink}<div class="monitor-title"><h1 id="monitor-detail-heading">${escape(m.definition.name)}</h1><span class="ui-pill badge ${escape(state.toLowerCase())}" id="monitor-state">${escape(state)}</span></div>${where}<p class="monitor-kind"><span class="keep-line">${escape(kinds[m.definition.type??'http']??'Check')} ·</span> every ${escape(spokenInterval(m.definition.intervalMs))}</p>`;
}
function actionButtons(m){
 const maintenance=m.definition.maintenanceUntil>Date.now();
 return `<button id="run-monitor" class="primary" ${m.definition.enabled?'':'disabled'}>${icon('play')}Run now</button>${(isFlow(m.definition)||m.definition.type==='heartbeat')?'<a class="ui-button" id="edit" href="/docs/definitions">'+icon('pencil')+'Edit in a definitions file</a>':`<button id="edit">${icon('pencil')}Edit check</button>`}<button id="pause"${m.definition.enabled?'':' class="resume"'}>${icon(m.definition.enabled?'pause':'play')}${m.definition.enabled?'Pause':'Authorize & resume'}</button><button id="maintenance">${icon('moon')}${maintenance?'End maintenance':'Maintenance 15m'}</button>`;
}
function heartbeatPanel(m,data){
 if(m.definition.type!=='heartbeat')return '';
 return `${data.runner.hosted?`<section class="ui-card panel"><h2>Private runner required</h2><p>The Cloudflare Worker accepts heartbeat receipts. A private runner evaluates them on schedule; receipts alone cannot make this monitor Healthy. ${data.runner.privateRunnerReady?'A private runner has fresh contact.':'No private runner has fresh contact. Start this command from the checkout that deployed this installation:'}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere"><code>${escape(data.runner.privateRunnerCommand)}</code></pre><a href="/docs/runner">Private runner instructions</a></section>`:''}<section class="ui-card panel heartbeat" aria-labelledby="heartbeat-heading"><h2 id="heartbeat-heading">Heartbeat receipts</h2><dl class="heartbeat-details ui-dl"><div><dt>Receipt path</dt><dd><code class="ui-mono">/api/heartbeats/${escape(m.id)}</code></dd></div><div><dt>Receipt must be newer than</dt><dd>${escape(humaneDuration(m.definition.heartbeat?.maxAgeMs))}</dd></div></dl><p>Your job sends an empty JSON object to the receipt path with its heartbeat key and an increasing <code>X-Heartbeat-Sequence</code>. A receipt alone does not change health; the next scheduled check reads it. <a id="heartbeat-docs-link" href="/docs/monitors">Heartbeat instructions</a></p><button id="issue-heartbeat-key">Issue heartbeat key</button><p>Issuing a key replaces the previous key and clears its receipts. Save the new key when it appears.</p></section>`;
}
function coveragePanel(availability){
 const window=(label,metrics)=>`<div class="coverage-window"><h3>${label}</h3>${coverage(metrics,label,'large')}</div>`;
 return `<section class="ui-card panel coverage-panel" aria-labelledby="coverage-heading"><div class="panel-head"><h2 id="coverage-heading">Evidence coverage</h2><p class="metric-basis">${escape(COVERAGE_RULE)}</p></div><div class="coverage-windows">${window('Last 24 hours',availability?.last24h)}${window('Last 7 days',availability?.last7d)}</div><div class="coverage-foot">${coverageLegend}<p class="coverage-note">Passing is the share of observed time when every configured check passed. Earlier revisions retain their observed time. Maintenance and paused periods are separate from Unknown time without a valid result. Percentages are rounded to two decimals, passing down and failing and Unknown up, and never to 0% or 100% unless exact. Manual runs and retries do not add observed time. Checks run from their assigned runner networks.</p></div></section>`;
}
function pageBody(m,readUnavailable,definitionOpen,data){
 const availability=m.availability,lastLabel=readUnavailable?'Last recorded check':'Last check';
 const worker=Object.values(m.definition.assignments??{}).some(a=>(data.runner.runners??[]).some(r=>r.runnerId===a.runnerId&&r.hosted));
 const startup=worker&&!data.runner.demo&&!data.runner.cronStarted&&!availability?.lastCheckAt&&m.state.targetState==='Unknown'?'<p class="status-explanation ui-callout">The Cloudflare Worker checks while you use this console. Cloudflare can take up to about two hours to activate a new Cron schedule; background checks continue automatically once it starts.</p>':'';
 return `<div class="monitor-page" id="monitor-page"><p class="status-explanation ui-callout" data-state="${escape(shownState(m,readUnavailable).toLowerCase())}">${escape(statusExplanation(m,readUnavailable,data))}</p>`
  +startup+'<div class="monitor-primary">'+coveragePanel(availability)+`<section class="ui-card panel incidents" aria-labelledby="incidents-heading"><h2 id="incidents-heading">Incidents</h2><div id="monitor-incidents">Loading incident history…</div><p>Latest 100 confirmed incidents. Times mark scheduled confirmation; manual checks do not open or close incidents.</p></section>`
  +`<section class="ui-card panel evidence" aria-labelledby="recent-checks-heading"><div class="panel-head"><h2 id="recent-checks-heading">Recent checks</h2><div class="history-strip" id="history-strip" aria-hidden="true"></div></div><div id="raw-history">Loading recent checks…</div></section></div>`
  +`<div class="monitor-secondary"><section class="ui-card panel detail" aria-labelledby="latest-check-heading"><h2 id="latest-check-heading">${lastLabel}</h2><dl class="detail-metrics"><div><dt class="ui-visually-hidden">${lastLabel}</dt><dd class="detail-time">${checkTime(m,{withLabel:false,readUnavailable})}</dd></div><div><dt>Response duration</dt><dd>${escape(duration(availability?.responseDurationMs))}</dd></div></dl></section>`
  +`<section class="ui-card panel assertions" aria-labelledby="expects-heading"><h2 id="expects-heading">What the check expects</h2>${assertionSummary(m.definition)}<details id="assertion-definition" ${definitionOpen?'open':''}><summary id="assertion-definition-summary">Full check details</summary><pre>${escape(JSON.stringify(m.definition.assertions,null,2))}</pre></details></section>`
  +(isFlow(m.definition)?flowPanel(m,data):'')+heartbeatPanel(m,data)+'</div></div>';
}

const clock=t=>new Date(t).toLocaleTimeString();
// "11:42:04 AM – 11:44:04 AM", with each date when the range crosses midnight. Each time stays whole and the dash ends
// the first line when the range wraps.
function range(first,last){
 const day=t=>new Date(t).toLocaleDateString(),crosses=day(first)!==day(last);
 const end=(t,tail='')=>`${crosses?`${escape(day(t))}, `:''}<span class="keep-line">${escape(clock(t))}${tail}</span>`;
 return `${end(first,' \u2013')} ${end(last)}`;
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

const probeNames={'local-a':'Check 1','local-b':'Check 2','local-c':'Check 3'};
const attemptResults={pass:['passed','Passed'],target_failure:['failed','Target did not pass'],runner_error:['unknown','Check could not run']};
function attemptMarkup(o){
 const [tone,result]=attemptResults[o.outcome]??['unknown','Unknown result'];
 const status=o.flow?`${escape(o.flow.pages)} page${o.flow.pages===1?'':'s'}`:o.status?`HTTP <span class="ui-mono">${escape(o.status)}</span>`:'No HTTP status';
 return `<div class="attempt-group"><p class="attempt-line"><span class="attempt-name">${escape(probeNames[o.probe]??'Check')} attempt ${o.attempt+1}</span><span class="ui-visually-hidden">: </span><span class="ui-result ${tone}">${escape(result)}</span>${slash}<span>${status}</span>${slash}<span>${escape(duration(o.durationMs))}</span>${slash}<span class="attempt-age">${ago(o.completedAt)}</span></p><ul class="attempt-checks">${o.checks.map(c=>`<li><span class="attempt-mark ui-result ui-result--small ${c.pass?'passed':'failed'}">${c.pass?'PASS':'FAIL'}</span> ${escape(c.assertion)}: ${escape(c.reason)}</li>`).join('')}</ul>${o.credentialBinding?`<details class="credential-binding"><summary>Known monitors referencing this credential</summary>${o.credentialBinding.monitorIds.length>1?'<p>This file can serve only one monitor. For the other monitors, create separate owner-only credential files and references, review the intended account, then bind each explicitly.</p>':''}<ul>${o.credentialBinding.monitorIds.map(id=>`<li>${escape(id)}</li>`).join('')}</ul></details>`:''}${o.canary?`<p class="canary-result">External check: ${escape(o.canary.outcome==='pass'?'Passed':o.canary.outcome==='target_failure'?'Failed':'Could not run')}${o.canary.status?` · HTTP ${escape(o.canary.status)}`:''}. ${escape(o.canary.checks.map(check=>check.reason).join('; '))}</p>`:''}${traceMarkup(o)}</div>`;
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
function slotMeta(row,revision){
 const s=row.slot,count=Array.isArray(s.observations)?s.observations.length:0,parts=[];
 parts.push(`${s.manual?'Manual':'Scheduled'} check ${endings[row.reason]??(row.result==='running'?'running':s.status)}`);
 if(row.late)parts.push([`due ${clock(s.due_at)}`,'slot-late'],[`ran ${humaneDuration(row.late.by)} late`,'slot-late']);
 parts.push(count||s.status==='complete'?`${count} ${count===1?'attempt':'attempts'}`:'no result yet');
 if(row.reason&&row.reason!=='queued'&&!count)parts[parts.length-1]='no result';
 if(Number.isSafeInteger(s.revision)&&s.revision<revision)parts.push(`from revision ${s.revision}`);
 return metaLine(parts);
}
function slotRow(row,revision){
 const s=row.slot;
 return `<details ${rowData(row,` data-slot="${escape(s.id)}" data-due="${s.due_at}"`)} ${openHistory.has(s.id)?'open':''}><summary id="history-${escape(s.id)}">${timeCell(escape(clock(row.effectiveTime)),row.effectiveTime)}${hiddenDot}${slotResult(row)}${hiddenDot}<span class="slot-meta">${slotMeta(row,revision)}</span></summary><div class="slot-attempts">${(s.observations??[]).map(attemptMarkup).join('')}</div></details>`;
}
// A missed or overdue check, or a run of them collapsed into one row with its range and count. There is nothing to
// open, so a row is not a disclosure.
function runRow(row){
 const missed=row.kind==='missed',single=row.count===1;
 const what=missed?(single?'Scheduled check missed (no result available)':`${row.count} scheduled checks missed (no result available)`):(single?'Scheduled check overdue (not run yet)':`${row.count} scheduled checks overdue (not run yet)`);
 return `<div class="slot-row slot-${row.kind}" ${rowData(row,` data-first="${row.first}" data-last="${row.last}" data-count="${row.count}" data-interval="${row.interval}"`)}>${timeCell(single?escape(clock(row.first)):range(row.first,row.last),row.last)}${hiddenDot}${resultCell(missed?'unknown':'overdue',missed?'No result':'Overdue')}${hiddenDot}<span class="slot-meta">${escape(what)}</span></div>`;
}
// A paused or maintenance span, neutral: when it began (and ended), and what it means for the checks. A span's clock
// stays whole, so "since" or "until" wraps above it in a narrow time column.
function spanRow(row,monitor){
 const paused=row.kind==='paused',until=monitor.definition.maintenanceUntil;
 const whole=t=>`<span class="keep-line">${escape(clock(t))}</span>`;
 const when=row.to===null?(row.fromKnown?`since ${whole(row.from)}`:'ongoing'):row.fromKnown?range(row.from,row.to):`until ${whole(row.to)}`;
 const what=paused?['No scheduled checks while paused']:row.to===null?[...(Number.isSafeInteger(until)&&until>row.from?[`Until ${clock(until)}`]:[]),'checks continue, alerts are suppressed']:['Checks continued, alerts were suppressed'];
 return `<div class="slot-row slot-span" ${rowData(row,` data-from="${row.from}" data-to="${row.to??''}"`)}>${timeCell(when,row.to??row.from)}${hiddenDot}${resultCell(row.kind,paused?'Paused':'Maintenance')}${hiddenDot}<span class="slot-meta">${metaLine(what)}</span></div>`;
}
function historyMarkup(timeline,monitor){
 if(!timeline.rows.length)return '<p class="history-empty">No results. Status and uptime are Unknown.</p>';
 const row=r=>r.slot?slotRow(r,monitor.revision):r.count?runRow(r):spanRow(r,monitor);
 return `<div class="check-list" data-now="${timeline.now}" data-grace="${timeline.graceMs}">${timeline.rows.map(row).join('')}</div>`;
}
// The strip: the list's rows oldest first, one place each between the oldest and newest times. A run is one hollow
// ring with its count; a manual check is a small diamond in its result's colour; a span is a short neutral bar.
const markClass={passed:'passed',failed:'failed',running:'running',noresult:'unknown',missed:'missed',overdue:'overdue',paused:'span paused',maintenance:'span maintenance'};
function stripMarkup(timeline){
 const marks=timeline.strip;
 if(!marks.length)return '';
 const mark=row=>{const data=rowData(row,` data-count="${row.count??1}"`);if(row.count>1)return `<span class="strip-run ${escape(row.kind)}" ${data}>+${row.count}</span>`;return `<span class="ui-dot ${row.kind==='manual'?`manual ${markClass[row.result]}`:markClass[row.kind]}" ${data}></span>`};
 const many=marks.length>1||marks[0].oldestTime!==marks[0].effectiveTime;
 return `<span class="strip-time">${escape(clock(marks[0].oldestTime))}</span><div class="ui-strip">${marks.map(mark).join('')}</div>${many?`<span class="strip-time">${escape(clock(marks.at(-1).effectiveTime))}</span>`:''}`;
}
function renderMissing({header,actions,area,id}){
 document.title='Monitor not found · Uptime';
 header.innerHTML=`${backLink}<div class="monitor-title"><h1 id="monitor-detail-heading">Monitor not found</h1></div><p class="subtitle">This installation has no monitor at this address.</p>`;
 actions.innerHTML='';
 area.innerHTML=`<section class="empty ui-empty monitor-missing"><p>No monitor has the id <code class="ui-mono">${escape(id)}</code>. It may have been deleted, or the link may be incomplete.</p><a class="ui-button primary" id="missing-back" href="/app">Back to monitors</a></section>`;
}

// header: the page header's title block (.top > div); actions: .actions; area: #content-area.
export function renderMonitorPage({header,actions,area,data,id,api,action,readUnavailable}){
 for(const detail of area.querySelectorAll('#raw-history details')){if(detail.open)openHistory.add(detail.dataset.slot);else openHistory.delete(detail.dataset.slot)}
 for(const detail of area.querySelectorAll('#monitor-incidents details')){if(detail.open)openIncidents.add(detail.dataset.incident);else openIncidents.delete(detail.dataset.incident)}
 const m=data.monitors.find(m=>m.id===id);
 if(!m){renderMissing({header,actions,area,id});return}
 const historyFocus=document.activeElement?.id,definitionOpen=area.querySelector('#assertion-definition')?.open??false,historyHeight=area.querySelector('#raw-history')?.getBoundingClientRect().height,previousStrip=area.querySelector('#history-strip')?.innerHTML??'';
 document.title=`${m.definition.name} · Uptime`;
 header.innerHTML=titleBlock(m,readUnavailable);
 actions.innerHTML=actionButtons(m)+'<button id="erase-monitor" class="danger">Erase monitor</button>';
 actions.querySelector('#erase-monitor').onclick=()=>confirmErasure({kind:'monitor',name:m.definition.name,onConfirm:async name=>{const result=await action(()=>api(`/api/monitors/${encodeURIComponent(m.id)}/erase`,'POST',{name}),{pending:'Erasing monitor…',success:'Monitor and dependent records erased.'});if(result.ok){document.title='Monitor erased · Uptime';showErasureReceipt(result.result.receipt)}}});
 area.innerHTML=pageBody(m,readUnavailable,definitionOpen,data);
 bindHeartbeatKey(area,m,{api,action});
 const incidentHost=area.querySelector('#monitor-incidents');api(`/api/monitors/${encodeURIComponent(m.id)}/incidents`).then(incidents=>{if(incidentHost.isConnected){incidentHost.innerHTML=incidentMarkup(incidents,openIncidents);if(historyFocus?.startsWith('incident-')&&document.activeElement?.tagName==='BODY')document.getElementById(historyFocus)?.focus({preventScroll:true})}},error=>{if(incidentHost.isConnected)incidentHost.textContent='Incident history unavailable: '+error.message});
 actions.querySelector('#run-monitor').onclick=()=>action(()=>api(`/api/monitors/${m.id}/run`,'POST',{}),{pending:'Requesting a manual check…',success:'Manual check queued. Manual checks do not change uptime.'});
 if(!isFlow(m.definition)&&m.definition.type!=='heartbeat')actions.querySelector('#edit').onclick=()=>{location.href='/app/monitor?monitor='+encodeURIComponent(m.id)};
 actions.querySelector('#pause').onclick=()=>{if(!m.definition.enabled&&Object.values(m.definition.assignments??{}).some(a=>!(data.runner.runners??[]).some(r=>r.runnerId===a.runnerId&&!r.revokedAt))){location.href='/app/monitor?monitor='+encodeURIComponent(m.id);return}return action(()=>api(`/api/monitors/${m.id}`,'PATCH',{...m.definition,enabled:!m.definition.enabled}),{pending:m.definition.enabled?'Pausing monitor…':'Authorizing and resuming…',success:m.definition.enabled?'Monitor paused. Historical observations remain available.':'Monitor authorized and resumed. New scheduled results are required.'})};
 actions.querySelector('#maintenance').onclick=()=>action(()=>api(`/api/monitors/${m.id}`,'PATCH',{...m.definition,maintenanceUntil:m.definition.maintenanceUntil>Date.now()?0:Date.now()+900000}));
 const history=area.querySelector('#raw-history'),strip=area.querySelector('#history-strip');
 // Keep the previous list height and strip while the history reloads, so the page does not jump on each refresh.
 if(historyHeight)history.style.minHeight=`${historyHeight}px`;
 strip.innerHTML=previousStrip;
 const key=encodeURIComponent(m.id);
 Promise.all([api(`/api/monitors/${key}/history`),api(`/api/monitors/${key}/revisions`)]).then(([slots,revisions])=>{
  if(!history.isConnected)return;
  const timeline=buildTimeline({slots,now:Number.isSafeInteger(data.now)?data.now:Date.now(),monitor:m,revisions});
  history.innerHTML=historyMarkup(timeline,m);history.style.minHeight='';strip.innerHTML=stripMarkup(timeline);
  const flowHistory=area.querySelector('#flow-revisions');if(flowHistory)flowHistory.innerHTML=flowRevisions(revisions);
  if(historyFocus?.startsWith('history-')&&document.activeElement?.tagName==='BODY')document.getElementById(historyFocus)?.focus({preventScroll:true});
 },error=>{if(history.isConnected){history.textContent=error.message;strip.innerHTML=''}});
}
