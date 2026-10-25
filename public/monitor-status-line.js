import {escape,icon,shownState} from './console-format.js';
import {statusLine,clock,dayClock,joinNames} from './monitor-status.js';
import {share} from './monitor-coverage.js';
import {responseTime,locationNamer} from './monitor-rules.js';
import {quietAlerts} from './planned-maintenance.js';
// A monitor page's status card (U15 with U21's deltas): one sentence first with the 24-hour passing share beside it, then
// what holds right now, each with its one action (an open Slow notice, setup stopped by cleanup debt, a followed service
// that needs review, a hosted console's slow start), a read that failed with its Retry, and while nobody is told, the way to
// tell someone. `seen` is what the page's own reads found (public/monitor-page.js).

// An open Slow notice: the newest Slow event of the monitor's policy, not yet recovered.
export const openSlow=(m,status)=>m.definition.slow&&status?.kind==='slow'?status:null;
function slowLine(m,slow,runners){
 const name=locationNamer(m.definition,runners),where=joinNames([...new Set((slow.probes??[]).map(probe=>name(probe.name)))]);
 const action=slow.acknowledgedAt?'<span class="held-done" id="slow-acknowledged" tabindex="-1">Acknowledged</span>':'<button type="button" class="ui-link" id="acknowledge-slow" data-action="ack-slow">Acknowledge</button>';
 return {text:`Slow${where?` from ${where}`:''} since ${dayClock(slow.observedAt,Date.now())} · over ${responseTime(m.definition.slow.thresholdMs)}`,action};
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
// A long word in the sentence (a JSON path) may break after its dots and brackets, so the sentence wraps inside the card.
const breakable=text=>escape(text).replace(/[^\s<>&]{24,}/g,word=>word.replace(/([.[\]/])(?=.)/g,'$1<wbr>'));
// The reads the card depends on, by the words a failure names.
const READS={route:'who is told',slow:'the open Slow notice',followed:'the followed service’s review',debt:'cleanup debt'};
export function statusCard(m,{readUnavailable,data,seen}){
 const d=m.definition,state=m.state.state,shown=shownState(m,readUnavailable),slow=openSlow(m,seen.slow),runners=data.runner.runners??[];
 let tone=readUnavailable?'unknown':!d.enabled?'paused':{Healthy:'up',Failing:'down',Maintenance:'maint',Degraded:'degraded',Recovering:'recovering'}[state]??'unknown';
 let text=statusLine(m,{readUnavailable,data,seen}),action='',slowMain=false;
 if(tone==='maint'&&d.maintenanceUntil>Date.now())action='<button type="button" class="ui-link" id="end-maintenance" data-action="end-maintenance">End now</button>';
 if(tone==='up'&&slow){({text,action}=slowLine(m,slow,runners));tone='slow';slowMain=true}
 const held=[];
 if(slow&&!slowMain&&!readUnavailable){const line=slowLine(m,slow,runners);held.push(['slow',`<span>${escape(line.text)}</span> ${line.action}`])}
 if(seen.debt&&seen.debt.open.length>=seen.debt.limit)held.push(['debt','<span>Setup is stopped until a cleanup is resolved.</span> <a class="ui-link" href="#cleanup">Cleanup debt</a>']);
 if(seen.followed?.review)held.push(['review','<span>The followed service’s catalog entry needs review.</span> <a class="ui-link" href="#followed">Review it</a>']);
 if(startingUp(m,data))held.push(['startup','<span>Checks run while you use this console; Cloudflare can take up to two hours to start background checks.</span>']);
 for(const [name,what] of Object.entries(READS))if(seen.failed?.has(name))held.push([`read-${name}`,`<span>Couldn’t load ${what}.</span> <button type="button" class="ui-link" data-action="retry-read" data-read="${name}">Retry</button>`]);
 const told=seen.route&&!seen.route.readyCount?`<p class="status-told" id="status-told">${icon('bell')}<span>Nobody is told.</span> <a class="ui-link" href="/app/notifications">Add a notification →</a></p>`:'';
 return `<section class="ui-card status-card ${tone}" id="status-card"><div class="status-row"><p class="state-line"><span class="state-text"><span class="status-explanation" id="monitor-status" tabindex="-1" data-state="${escape(shown.toLowerCase())}">${breakable(text)}</span>${action?' '+action:''}</span></p>${passing(m,data,seen)}</div>`
  +held.map(([key,html])=>`<p class="status-held" data-key="held-${key}">${html}</p>`).join('')+told+'</section>';
}
// Where focus goes once a card action is done and its button has gone: the "Acknowledged" that replaced Acknowledge, else
// the status sentence (the console puts focus back itself when the pressed control is still there).
function settle(root,{to}){
 requestAnimationFrame(()=>{if(root.isConnected&&(document.activeElement===document.body||!document.activeElement))(root.querySelector(to)??root.querySelector('#monitor-status'))?.focus({preventScroll:true})});
}
// The card's own actions: End now for the quick quiet-alerts maintenance, acknowledging an open Slow notice, and Retry for a
// read that failed.
export function bindStatusActions(root){
 root.addEventListener('click',async event=>{
  const button=event.target.closest('#status-card [data-action]');if(!button)return;
  const page=root.monitorPage,{m,api,action}=page,key=encodeURIComponent(m.id);
  if(button.dataset.action==='end-maintenance'){await quietAlerts(m,{end:true,api,action});settle(root,{to:'#monitor-status'})}
  if(button.dataset.action==='ack-slow'&&page.seen.slow){
   await action(()=>api(`/api/monitors/${key}/slow-ack`,'POST',{eventId:page.seen.slow.id}),{pending:'Acknowledging Slow…',success:'Slow acknowledged. Reminders set to stop on acknowledgement will end; health is unchanged.'});
   settle(root,{to:'#slow-acknowledged'});
  }
  if(button.dataset.action==='retry-read')page.retry(button.dataset.read);
 });
}
