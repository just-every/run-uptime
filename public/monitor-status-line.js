import {escape,icon,shownState} from './console-format.js';
import {statusLine,clock,joinNames} from './monitor-status.js';
import {share} from './monitor-coverage.js';
import {responseTime,locationNamer} from './monitor-rules.js';
// A monitor page's status card (U15 with U21's deltas): one sentence first, the 24-hour passing share beside it, then what
// holds right now, each with its one action (an open Slow notice, setup stopped by cleanup debt, a followed service that needs
// review, a hosted console's slow start), and while nobody is told, the way to tell someone. `seen` is what the page's own
// reads found (public/monitor-page.js).

// An open Slow notice: the newest Slow event of the monitor's policy, not yet recovered.
export const openSlow=(m,status)=>m.definition.slow&&status?.kind==='slow'?status:null;
function slowLine(m,slow,runners){
 const name=locationNamer(m.definition,runners),where=joinNames([...new Set((slow.probes??[]).map(probe=>name(probe.name)))]);
 const action=slow.acknowledgedAt?'<span class="held-done" id="slow-acknowledged">Acknowledged</span>':'<button type="button" class="ui-link" id="acknowledge-slow" data-action="ack-slow">Acknowledge</button>';
 return {text:`Slow${where?` from ${where}`:''} since ${clock(slow.observedAt)} · over ${responseTime(m.definition.slow.thresholdMs)}`,action};
}
// A hosted console's first checks wait for Cloudflare to start its background runs.
const startingUp=(m,data)=>Object.values(m.definition.assignments??{}).some(a=>(data.runner.runners??[]).some(r=>r.runnerId===a.runnerId&&r.hosted))&&!data.runner.demo&&!data.runner.cronStarted&&!m.availability?.lastCheckAt&&m.state.targetState==='Unknown';
// "99.93% passing · last 24 hours"; a monitor younger than the window says since when.
function passing(m,data,seen){
 const day=m.availability?.last24h;
 if(!day||!Number.isFinite(day.observedMs)||day.observedMs<=0||!Number.isFinite(day.windowMs))return '';
 const young=Number.isFinite(seen.start)&&Number.isFinite(data.now)&&seen.start>data.now-day.windowMs;
 return `<p class="status-share" id="status-share"><strong>${escape(share(day.upMs,day.observedMs,Math.floor,{fixed:false}))}</strong> passing · ${young?`since ${escape(clock(seen.start))}`:'last 24 hours'}</p>`;
}
export function statusCard(m,{readUnavailable,data,seen}){
 const d=m.definition,state=m.state.state,shown=shownState(m,readUnavailable),slow=openSlow(m,seen.slow),runners=data.runner.runners??[];
 let tone=readUnavailable?'unknown':!d.enabled?'paused':{Healthy:'up',Failing:'down',Maintenance:'maint',Degraded:'degraded',Recovering:'recovering'}[state]??'unknown';
 let text=statusLine(m,{readUnavailable,data,seen}),action='',slowMain=false;
 if(tone==='maint'&&d.maintenanceUntil>Date.now())action='<button type="button" class="ui-link" id="end-maintenance" data-action="end-maintenance">End now</button>';
 if(tone==='up'&&slow){({text,action}=slowLine(m,slow,runners));tone='slow';slowMain=true}
 const held=[];
 if(slow&&!slowMain&&!readUnavailable){const line=slowLine(m,slow,runners);held.push(['slow',`${escape(line.text)} ${line.action}`])}
 if(seen.debt&&seen.debt.open.length>=seen.debt.limit)held.push(['debt','Setup is stopped until a cleanup is resolved. <a class="ui-link" href="#cleanup">Cleanup debt</a>']);
 if(seen.followed?.review)held.push(['review','The followed service’s catalog entry needs review. <a class="ui-link" href="#followed">Review it</a>']);
 if(startingUp(m,data))held.push(['startup','Checks run while you use this console; Cloudflare can take up to two hours to start background checks.']);
 const told=seen.route&&!seen.route.readyCount?`<p class="status-told" id="status-told">${icon('bell')}<span>Nobody is told.</span> <a class="ui-link" href="/app/notifications">Add a notification →</a></p>`:'';
 return `<section class="ui-card status-card ${tone}" id="status-card"><div class="status-row"><p class="state-line"><span class="state-text"><span class="status-explanation" id="monitor-status" data-state="${escape(shown.toLowerCase())}">${escape(text)}</span>${action?' '+action:''}</span></p>${passing(m,data,seen)}</div>`
  +held.map(([key,html])=>`<p class="status-held" data-key="held-${key}">${html}</p>`).join('')+told+'</section>';
}
// The card's own actions: End now for the quick quiet-alerts maintenance, and acknowledging an open Slow notice.
export function bindStatusActions(root){
 root.addEventListener('click',event=>{
  const button=event.target.closest('#status-card [data-action]');if(!button)return;
  const page=root.monitorPage,{m,api,action}=page,key=encodeURIComponent(m.id);
  if(button.dataset.action==='end-maintenance')action(()=>api(`/api/monitors/${key}`,'PATCH',{...m.definition,maintenanceUntil:0}),{pending:'Ending maintenance…',success:'Maintenance ended.'});
  if(button.dataset.action==='ack-slow'&&page.seen.slow)action(()=>api(`/api/monitors/${key}/slow-ack`,'POST',{eventId:page.seen.slow.id}),{pending:'Acknowledging Slow…',success:'Slow acknowledged. Reminders set to stop on acknowledgement will end; health is unchanged.'});
 });
}
