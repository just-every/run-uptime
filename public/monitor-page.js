import {escape,icon,breakableUrl,humaneDuration,shownState} from './console-format.js';
import {patch,firstMount} from './dom-patch.js';
import {confirmErasure} from './notification-dialogs.js';
import {locationNamer} from './monitor-rules.js';
import {joinNames,waitForCheck} from './monitor-status.js';
import {statusCard,bindStatusActions} from './monitor-status-line.js';
import {rulesTable} from './monitor-rules-table.js';
import {bindEditing,syncPicker} from './monitor-rule-edit.js';
import {fitTable} from './monitor-table-fit.js';
import {recentChecks,historyMarkup,fitStrip} from './monitor-recent-checks.js';
import {foldsFor,foldsCard,mountFolds} from './monitor-folds.js';
import {incidentMarkup} from './monitor-incidents.js';
import {bindIncidentWork} from './incident-work.js';
import {bindIncidentSnapshots} from './failure-snapshots.js';
import {flowRevisions,isFlow} from './flow-panel.js';
import {PROTOCOL_KINDS,expiryPanel} from './protocol-panel.js';
import {PAGESPEED_KINDS,pageSpeedPanel} from './pagespeed-panel.js';
import {loadPage} from './monitor-reads.js';
import {followLink,openFold,linkTarget} from './monitor-links.js';
// One monitor's page (/app/monitors/<id>), rendered by public/app.js into the console shell on every refresh (U15, build C
// with U21's deltas). This file composes it: the header (back link, name and state, URL, kind and interval, quiet chips for
// a private network or a certificate exception, then Run now, Edit and Pause), and in #content-area the status card, a TLS,
// domain or page-speed monitor's own panel, the "Up or down" table and Recent checks, and beside them (under them below
// 720 px) the folds. What the page's own reads found (public/monitor-reads.js) is kept in `seen`, which every region renders
// from. Each draw patches the markup into the page (public/dom-patch.js), so only what changed is touched: open folds and
// editors, typed values, focus and scroll stay through every refresh (U9).

// The id in /app/monitors/<id>, or null on any other path. The server answers an id that does not decode with its 404
// page, so this page only sees ids that decode.
export function monitorIdFromPath(pathname){
 const match=pathname.match(/^\/app\/monitors\/([^/]+)\/?$/);
 return match?decodeURIComponent(match[1]):null;
}

const kinds={mail:'Mail protocol',api:'API transaction',http:'HTTP check',keyword:'Keyword check',heartbeat:'Heartbeat',flow:'Browser flow',...PROTOCOL_KINDS,...PAGESPEED_KINDS};
const backLink='<a class="back-link ui-link" id="monitor-back" href="/app/monitors"><span class="ui-icon" data-icon="chevron" aria-hidden="true"></span><span class="ui-visually-hidden">Back to </span>Monitors</a>';
// "every 1 minute", "every 15 seconds", "every 1 hour 30 minutes": the interval with its units spelled out. humaneDuration
// joins each number to its unit with a no-break space, and so does this.
const unitWords={d:'day',h:'hour',min:'minute',s:'second'};
const spokenInterval=ms=>humaneDuration(ms).replace(/(\d+)\u00a0(d|h|min|s)\b/g,(_,n,unit)=>`${n}\u00a0${unitWords[unit]}${n==='1'?'':'s'}`);

// Each monitor's page across refreshes: what its reads found (seen), how its table and strip last measured (fit, strip), and
// for the page as mounted now, what the owner opened (ui: the mounted folds, the rule being added, an editor's error, a link
// to follow).
const pages=new Map();
function pageOf(id){if(!pages.has(id))pages.set(id,{id,seen:{failed:new Set()},tickets:{},fit:{mode:'beside',spans:new Set()},strip:undefined,ui:null});return pages.get(id)}
const freshUi=()=>({mounted:new Set(),adding:null,errors:{},hash:linkTarget(),probing:false,incident:null,heartbeat:false,reading:null,settle:null});

function titleBlock(m,readUnavailable){
 const d=m.definition,state=shownState(m,readUnavailable);
 const where=d.type==='heartbeat'?`<p class="subtitle monitor-target">Incoming heartbeat at <code class="ui-mono">/api/heartbeats/${escape(m.id)}</code></p>`:`<p class="subtitle monitor-target ui-url">${breakableUrl(d.url)}</p>`;
 const chips=(d.network==='private'?'<a class="header-chip" href="#details">Private network</a>':'')+(d.tlsTrust?'<a class="header-chip" href="#details">Certificate exception</a>':'');
 return `${backLink}<div class="monitor-title"><h1 id="monitor-detail-heading">${escape(d.name)}</h1><span class="ui-pill badge ${escape(state.toLowerCase())}" id="monitor-state">${escape(state)}</span></div>${where}${m.preparedBy?`<p class="subtitle">Prepared by ${escape(m.preparedBy.label)}. Scheduled observations remain independent.</p>`:''}<p class="monitor-kind"><span class="keep-line">${escape(kinds[d.type??'http']??'Check')} ·</span> every ${escape(spokenInterval(d.intervalMs))}${chips?` <span class="header-chips">${chips}</span>`:''}</p>`;
}
function actionButtons(m){
 const d=m.definition,edit=isFlow(d)||d.type==='heartbeat'?`<a class="ui-button" id="edit" href="/docs/definitions">${icon('pencil')}Edit in a file</a>`:`<button id="edit">${icon('pencil')}Edit</button>`;
 return `<button id="run-monitor" class="primary" ${d.enabled?'':'disabled'}>${icon('play')}Run now</button>${edit}<button id="pause"${d.enabled?'':' class="resume"'}>${icon(d.enabled?'pause':'play')}${d.enabled?'Pause':'Resume'}</button>`;
}
// The table shows a check of the monitor's current revision only: after a save, until the next history read brings one,
// each location waits for its next check.
function pageMarkup(page){
 const {m,data,readUnavailable,seen,ui}=page;
 page.folds=foldsFor(m,data,seen,ui);
 return `<div class="monitor-page" id="monitor-page" data-monitor="${escape(m.id)}">${statusCard(m,{readUnavailable,data,seen})}${expiryPanel(m,data)}${pageSpeedPanel(m)}`
  +`<div class="monitor-columns"><div class="monitor-column-main">${rulesTable(m,{data,newest:seen.newest?.revision===m.revision?seen.newest:undefined,earlier:seen.earlier,ui,fit:page.fit})}${recentChecks(m,seen.timeline,page.strip)}</div>`
  +`<div class="monitor-column-side">${foldsCard(page.folds,id=>ui.probing||ui.mounted.has(id))}</div></div></div>`;
}
// The table's layout for its current width, names and words (public/monitor-table-fit.js); the page says whether it is in
// one column (public/monitor-page.css --monitor-columns). Then the marks of Recent checks' strip that fit its width.
function refit(page){
 const root=page.area?.querySelector('#monitor-page'),table=root?.querySelector('#rule-grid');if(!table)return;
 page.fit=fitTable(table,{oneColumn:getComputedStyle(root).getPropertyValue('--monitor-columns').trim()==='1'});
 page.strip=fitStrip(root.querySelector('#history-strip'));
}
// Patches the page from what it knows now. The reads and the fold binds are not here: a refresh starts them once (render).
function draw(page){
 const {area,seen}=page;if(!area?.isConnected)return;
 patch(area,pageMarkup(page));
 const root=area.querySelector('#monitor-page');root.monitorPage=page;
 if(firstMount(root))bindPage(root);
 const incidents=area.querySelector('#monitor-incidents');
 if(firstMount(incidents)){bindIncidentWork(incidents,page.api);bindIncidentSnapshots(incidents,page.api);if(seen.incidents)patch(incidents,incidentMarkup(seen.incidents,page.name))}
 const history=area.querySelector('#raw-history');
 if(firstMount(history)&&seen.timeline)patch(history,historyMarkup(seen.timeline,page.m,page.data.runner.runners??[]));
 const flowHistory=area.querySelector('#flow-revisions');if(flowHistory&&seen.revisions)patch(flowHistory,flowRevisions(seen.revisions));
 syncPicker(root);
 // A read that lands while an action runs keeps the console's controls and links locked (public/app.js lockControls).
 if(area.getAttribute('aria-busy')==='true'){for(const control of area.querySelectorAll('button,input,select,textarea'))control.disabled=true;for(const link of area.querySelectorAll('a[href]'))link.setAttribute('aria-disabled','true')}
 refit(page);
 followLink(page);
}
const deps=page=>({api:page.api,action:page.action});
// Listeners the page binds once per mount: the editors, the status card's actions, the folds, links within the page, the
// table's width, and erasing a monitor that is edited in a file (the others erase from their Edit page).
function bindPage(root){
 bindEditing(root);
 bindStatusActions(root);
 root.addEventListener('toggle',event=>{const fold=event.target;if(fold.matches?.('details.fold')&&fold.open)openFold(root.monitorPage,fold.id)},true);
 const follow=()=>{if(!root.isConnected){removeEventListener('hashchange',follow);return}root.monitorPage.ui.hash=linkTarget();followLink(root.monitorPage)};
 addEventListener('hashchange',follow);
 let width=0;
 const resized=new ResizeObserver(([entry])=>{if(!root.isConnected){resized.disconnect();return}const next=Math.round(entry.contentRect.width);if(next!==width){width=next;refit(root.monitorPage)}});
 resized.observe(root);
 const fonts=()=>{if(root.isConnected)refit(root.monitorPage);else document.fonts?.removeEventListener('loadingdone',fonts)};
 document.fonts?.ready.then(fonts);document.fonts?.addEventListener('loadingdone',fonts);
 root.addEventListener('click',event=>{
  const page=root.monitorPage,link=event.target.closest('a[href^="#"]');
  if(link&&link.hash===location.hash){page.ui.hash=linkTarget();followLink(page)}
  if(!event.target.closest('[data-action="erase-monitor"]'))return;
  const {m,api,action}=page;
  // A refusal (a fresh second factor, say) is kept for Full check details to show under the button, as an editor's is, and
  // brought into view there with focus back on the button.
  confirmErasure({kind:'monitor',name:m.definition.name,onConfirm:async name=>{
   delete page.ui.errors.erase;
   const result=await action(async()=>{try{return await api(`/api/monitors/${encodeURIComponent(m.id)}/erase`,'POST',{name})}catch(problem){page.ui.errors.erase=problem.message;throw problem}},{pending:'Erasing monitor…',success:`Erased ${m.definition.name}.`,onSuccess:()=>{sessionStorage.setItem('uptime-notice',`Erased ${m.definition.name}.`);location.assign('/app/monitors')}});
   if(result.accepted&&!result.ok){document.getElementById('edit-error-erase')?.scrollIntoView({block:'nearest'});document.getElementById('erase-monitor')?.focus({preventScroll:true})}
  }});
 });
}
function renderMissing({header,actions,area,id}){
 document.title='Monitor not found · Uptime';
 patch(header,`${backLink}<div class="monitor-title"><h1 id="monitor-detail-heading">Monitor not found</h1></div><p class="subtitle">This installation has no monitor at this address.</p>`);
 actions.replaceChildren();
 patch(area,`<section class="empty ui-empty monitor-missing"><p>No monitor has the id <code class="ui-mono">${escape(id)}</code>. It may have been deleted, or the link may be incomplete.</p><a class="ui-button primary" id="missing-back" href="/app/monitors">Back to monitors</a></section>`);
}
// header: the page header's title block (.top > div); actions: .actions; area: #content-area. While it shows a monitor the
// console's header carries the page's header root, .monitor-page-header (public/monitor-page.css).
export function renderMonitorPage({header,actions,area,data,id,api,action,readUnavailable}){
 header.parentElement.classList.add('monitor-page-header');
 const m=data.monitors.find(m=>m.id===id);
 if(!m){renderMissing({header,actions,area,id});return}
 const page=pageOf(m.id);
 if(!page.ui||area.querySelector('#monitor-page')?.dataset.monitor!==m.id)page.ui=freshUi();
 Object.assign(page,{m,data,readUnavailable,api,action,area,name:locationNamer(m.definition,data.runner.runners??[]),draw:()=>draw(page),refit:()=>refit(page),openFold:id=>openFold(page,id),deps:()=>deps(page)});
 document.title=`${m.definition.name} · Uptime`;
 patch(header,titleBlock(m,readUnavailable));
 header.monitorPage=page;
 if(firstMount(header))header.addEventListener('click',event=>{const link=event.target.closest('a.header-chip');if(link&&link.hash===location.hash){header.monitorPage.ui.hash=linkTarget();followLink(header.monitorPage)}});
 patch(actions,actionButtons(m));
 draw(page);
 mountFolds(area,page.folds,page.ui.mounted,deps(page));
 loadPage(page);page.ui.started=true;
 const d=m.definition,where=joinNames([...new Set((d.probes??[]).map(page.name))])||'your locations';
 actions.querySelector('#run-monitor').onclick=()=>action(async()=>{const queued=await api(`/api/monitors/${m.id}/run`,'POST',{});return await waitForCheck({api,id:m.id,slotId:queued.slotId,name:page.name})},{pending:`Checking from ${where}…`,success:outcome=>outcome??'Check queued. Its result will appear in Recent checks.'});
 if(!isFlow(d)&&d.type!=='heartbeat')actions.querySelector('#edit').onclick=()=>{location.href='/app/monitors/'+encodeURIComponent(m.id)+'/edit'};
 actions.querySelector('#pause').onclick=()=>{if(!d.enabled&&Object.values(d.assignments??{}).some(a=>!(data.runner.runners??[]).some(r=>r.runnerId===a.runnerId&&!r.revokedAt))){location.href='/app/monitors/'+encodeURIComponent(m.id)+'/edit';return}return action(()=>api(`/api/monitors/${m.id}`,'PATCH',{...d,enabled:!d.enabled}),{pending:d.enabled?'Pausing monitor…':'Authorizing and resuming…',success:d.enabled?'Monitor paused. Historical observations remain available.':'Monitor authorized and resumed. New scheduled results are required.'})};
}
