import {escape,humaneDuration} from './console-format.js';
import {moreInfo,dayClock} from './monitor-status.js';
import {openSlow} from './monitor-status-line.js';
import {responseTime} from './monitor-rules.js';
import {COVERAGE_RULE,coverage,coverageLegend} from './monitor-coverage.js';
import {alertRoutePanel,bindAlertRoutePanel} from './assets/alert-route.js';
import {reportPanel,mountReportPanel} from './monitor-report.js';
import {snapshotPanel,mountSnapshots} from './failure-snapshots.js';
import {slowPolicyPanel,bindSlowPolicyPanel} from './slow-policy.js';
import {maintenancePanel,bindMaintenancePanel} from './planned-maintenance.js';
import {heartbeatJobsPanel,bindHeartbeatJobs} from './heartbeat-jobs.js';
import {bindHeartbeatKey} from './heartbeat-key.js';
import {cleanupDebtPanel,mountCleanupDebt} from './cleanup-debt.js';
import {followedServicePanel,bindFollowedPanel} from './followed-service.js';
import {isFlow,flowPanel,bindFlowProfile} from './flow-panel.js';
import {isProtocol} from './protocol-panel.js';
// The rest of a monitor's page, folded into one card (U15): each fold is a <details> with its title and a one-line summary.
// Its panel mounts on the fold's first open, through the panel's own bind function, and stays mounted while the page is;
// a fold the page keeps current from its own reads (Incidents, Full check details) is always there. Each fold's id is the
// hash that opens it (/app/monitors/<id>#alerts). The panels' own modules and markup are unchanged; a panel whose heading
// repeats its fold's title shows it only to assistive technology.

// The heartbeat's receipts: where the job reports and how long a success lasts, then the key. The schedule and runs follow.
function receipts(m,data){
 return `${data.runner.hosted?`<section class="ui-card panel"><h2>Private runner required</h2><p>The Cloudflare Worker accepts heartbeat receipts. A private runner evaluates them on schedule; receipts alone cannot make this monitor Healthy. ${data.runner.privateRunnerReady?'A private runner has fresh contact.':'No private runner has fresh contact. Start this command from the checkout that deployed this installation:'}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere"><code>${escape(data.runner.privateRunnerCommand)}</code></pre><a href="/docs/runner">Private runner instructions</a></section>`:''}<section class="ui-card panel heartbeat" aria-labelledby="heartbeat-heading"><h2 id="heartbeat-heading">Heartbeat receipts</h2><dl class="heartbeat-details ui-dl"><div><dt>Receipt path</dt><dd><code class="ui-mono">/api/heartbeats/${escape(m.id)}</code></dd></div><div><dt>Success age limit (period + grace)</dt><dd>${escape(humaneDuration((m.definition.heartbeat?.maxAgeMs??0)+(m.definition.heartbeat?.graceMs??0)))}</dd></div></dl><p>Your job sends an empty JSON object to the receipt path with its heartbeat key and an increasing <code>X-Heartbeat-Sequence</code>. A receipt alone does not change health; the next scheduled check reads it. <a id="heartbeat-docs-link" href="/docs/monitors">Heartbeat instructions</a></p><button id="issue-heartbeat-key">Issue heartbeat key</button><p>Issuing a key replaces the previous key and clears its receipts. Save the new key when it appears.</p></section>`;
}
// Reports: the 24-hour and 7-day bars with the coverage rule behind its "?", then the period report.
function coverageWindows(m,{since,now}){
 const window=(label,metrics)=>`<div class="coverage-window"><h3>${label}</h3>${coverage(metrics,label,'large',{since,now})}</div>`;
 return window('Last 24 hours',m.availability?.last24h)+window('Last 7 days',m.availability?.last7d);
}
const reportsCoverage=(m,seen,data)=>`<div class="report-coverage"><div class="coverage-windows">${coverageWindows(m,{since:seen.start,now:data.now})}</div><div class="coverage-foot">${coverageLegend}${moreInfo('Uptime counts only observed time.',escape(COVERAGE_RULE)+' Passing is the share of observed time when every configured check passed. Percentages are rounded to two decimals, passing down and failing and Unknown up, and never to 0% or 100% unless exact. Manual runs and retries do not add observed time.','coverage-note','About coverage')}</div></div>`;
// Full check details: the engine's own reason and the saved check as JSON; a private network grant and a certificate trust
// exception say what they mean here (the header shows each as a chip). A monitor edited in a file erases from here, and a
// refused erase says why under its button (the console's notice is at the top of the page, out of view down here).
function details(m,ui){
 const d=m.definition,trust=d.tlsTrust?.mode==='fingerprint'?'a pinned leaf fingerprint':d.tlsTrust?.mode==='ca'?'an owner-supplied CA':'certificate errors ignored';
 const json=JSON.stringify(d.type==='mail'?d.mail:d.type==='api'?d.api:isProtocol(d)?{[d.type]:d[d.type],assertions:d.assertions}:d.assertions,null,2);
 return (d.network==='private'?`<p class="details-note" id="details-private">Private network · runner-local grant <code>${escape(d.privateGrantRef)}</code>. Each connection requires its current host, address and port permission.</p>`:'')
  +(d.tlsTrust?`<p class="details-note" id="details-trust">Certificate trust exception: ${trust}. Initial HTTPS origin only; a private runner applies this setting. Full certificate results remain visible on TLS certificate monitors.</p>`:'')
  +`<p class="engine-status">${escape(m.state.reason)}</p><pre>${escape(json)}</pre>`
  +(isFlow(d)||d.type==='heartbeat'?`<p class="details-erase"><button type="button" class="ui-link danger" id="erase-monitor" data-action="erase-monitor">Erase monitor…</button></p><p class="edit-error" role="alert" id="edit-error-erase">${escape(ui.errors.erase??'')}</p>`:'');
}
// "Today", "Yesterday" or "Mon, Oct 20".
function day(t,now){
 const start=x=>{const d=new Date(x);d.setHours(0,0,0,0);return d.getTime()},days=Math.round((start(now)-start(t))/86400000);
 return days===0?'Today':days===1?'Yesterday':days===-1?'Tomorrow':new Date(t).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});
}
const summaries={
 alerts:({route})=>{if(!route)return '';if(!route.readyCount)return 'Nobody yet';const names=route.recipients.filter(r=>r.selected&&r.eligible).map(r=>r.name);return names.length?`${names.slice(0,2).join(', ')}${names.length>2?` +${names.length-2}`:''}`:`${route.readyCount} destination${route.readyCount===1?'':'s'}`},
 incidents:({incidents},now)=>{if(!incidents)return '';const open=incidents.find(i=>i.endedAt===null);if(open)return `Open since ${dayClock(open.startedAt,now)}`;const last=incidents.find(i=>now-i.endedAt<=30*86400000);return last?`${day(last.endedAt,now)} · ${humaneDuration(last.durationMs)}`:'None in 30 days'},
 snapshots:({snapshots})=>snapshots?snapshots.count?`${snapshots.count}${snapshots.more?'+':''} saved`:'None saved':'',
 slow:(seen,now,m)=>{const slow=openSlow(m,seen.slow);return slow?`Open since ${dayClock(slow.observedAt,now)}`:m.definition.slow?`Over ${responseTime(m.definition.slow.thresholdMs)}`:'Off'},
 maintenance:(seen,now,m)=>{
  if(m.maintenanceEndsAt>now)return `Until ${dayClock(m.maintenanceEndsAt,now)}`;
  const windows=(m.definition.maintenanceWindows??[]).filter(w=>w.weekly||w.endsAt>now),next=windows.filter(w=>!w.weekly).sort((a,b)=>a.startsAt-b.startsAt)[0];
  return !windows.length?'None planned':next&&windows.length===1?day(next.startsAt,now):`${windows.length} planned`;
 },
 followed:({followed})=>followed?.review?'Needs review':'',
 cleanup:({debt})=>debt?.open.length?`${debt.open.length} open`:'Resolved',
 heartbeat:({receipt})=>receipt===false?'No receipt yet':'',
};
// The folds this monitor has, in order: its type's own first, then the ones every monitor has.
export function foldsFor(m,data,seen,ui){
 const d=m.definition,list=[],now=Number.isSafeInteger(data.now)?data.now:Date.now();
 if(d.type==='heartbeat')list.push({id:'heartbeat',title:'Heartbeat',body:()=>receipts(m,data)+heartbeatJobsPanel(m),mount:(area,o)=>{bindHeartbeatKey(area,m,o);bindHeartbeatJobs(area,m,o)}});
 if(isFlow(d))list.push({id:'flow',title:'Browser flow',same:true,body:()=>flowPanel(m,data),mount:(area,o)=>bindFlowProfile(area,m,o)});
 if(d.tags?.includes('dependency'))list.push({id:'followed',title:'Followed service',same:true,body:()=>followedServicePanel(m),mount:(area,o)=>bindFollowedPanel(area,m,o)});
 if(seen.debt&&(seen.debt.open.length||seen.debt.resolved.length))list.push({id:'cleanup',title:'Cleanup debt',same:true,body:()=>cleanupDebtPanel(m),mount:(area,{api})=>mountCleanupDebt(area,m,api)});
 list.push({id:'alerts',title:'Alerts',same:true,body:()=>alertRoutePanel(m),mount:(area,o)=>bindAlertRoutePanel(area,m,o)});
 list.push({id:'incidents',title:'Incidents',always:true,body:()=>`<div id="monitor-incidents" data-owned="${escape(m.id)}">Loading incident history…</div>`});
 list.push({id:'reports',title:'Reports',body:()=>reportsCoverage(m,seen,data)+reportPanel(m),mount:(area,{api})=>mountReportPanel(area,m,api,data.runner.runners)});
 if(['http','keyword','flow'].includes(d.type))list.push({id:'snapshots',title:'Failure snapshots',same:true,body:()=>snapshotPanel(m),mount:(area,{api})=>mountSnapshots(area,m,api,data.runner.runners)});
 if(d.type!=='heartbeat')list.push({id:'slow',title:'Slow-response notices',same:true,body:()=>slowPolicyPanel(m),mount:(area,o)=>bindSlowPolicyPanel(area,m,o)});
 list.push({id:'maintenance',title:'Planned maintenance',same:true,body:()=>maintenancePanel(m),mount:(area,o)=>bindMaintenancePanel(area,m,o)});
 list.push({id:'details',title:'Full check details',always:true,body:()=>details(m,ui)});
 return list.map(fold=>({...fold,summary:summaries[fold.id]?.(seen,now,m)??''}));
}
export const FOLD_IDS=['heartbeat','flow','followed','cleanup','alerts','incidents','reports','snapshots','slow','maintenance','details'];
// shown: the folds whose panels are mounted (opened at least once), or every fold while a deep link looks for its target.
export function foldsCard(folds,shown){
 return `<section class="ui-card folds-card" id="folds-card">${folds.map(fold=>`<details class="fold" id="${fold.id}"><summary><span class="fold-title">${fold.title}</span><span class="fold-sum">${fold.summary?`<span class="ui-visually-hidden">: </span>${escape(fold.summary)}`:''}</span></summary><div class="fold-body${fold.same?' same-title':''}">${fold.always||shown(fold.id)?fold.body():''}</div></details>`).join('')}</section>`;
}
// Each mounted fold's panel binds through its own function, on every refresh as it always has.
export function mountFolds(area,folds,mounted,deps){
 for(const fold of folds)if(fold.mount&&mounted.has(fold.id))fold.mount(area,deps);
}
