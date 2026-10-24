import {escape,icon,breakableUrl,humaneDuration,shownState} from './console-format.js';
import {patch,firstMount} from './dom-patch.js';
import {confirmErasure} from './notification-dialogs.js';
import {locationNamer} from './monitor-rules.js';
import {joinNames,failureOf,waitForCheck} from './monitor-status.js';
import {statusCard,bindStatusActions} from './monitor-status-line.js';
import {rulesTable} from './monitor-rules-table.js';
import {bindEditing,syncPicker} from './monitor-rule-edit.js';
import {recentChecks,historyMarkup} from './monitor-recent-checks.js';
import {foldsFor,foldsCard,mountFolds,FOLD_IDS} from './monitor-folds.js';
import {incidentMarkup} from './monitor-incidents.js';
import {bindIncidentWork} from './incident-work.js';
import {bindIncidentSnapshots} from './failure-snapshots.js';
import {buildTimeline,checkResultSummary} from './monitor-timeline.js';
import {isFlow,flowRevisions} from './flow-panel.js';
import {PROTOCOL_KINDS,expiryPanel} from './protocol-panel.js';
import {PAGESPEED_KINDS,pageSpeedPanel} from './pagespeed-panel.js';
// One monitor's page (/app/monitors/<id>), rendered by public/app.js into the console shell on every refresh (U15, build C
// with U21's deltas). This file composes it: the header (back link, name and state, URL, kind and interval, quiet chips for
// a private network or a certificate exception, then Run now, Edit and Pause), and in #content-area the status card, a TLS,
// domain or page-speed monitor's own panel, the "Up or down" table and Recent checks, and beside them (under them below
// 720 px) the folds. It also makes the page's own reads (incidents, history and revisions, who is told, an open Slow notice,
// a followed service's review, cleanup debt) and keeps what they found in `seen`, which every region renders from.
// Each draw patches the markup into the page (public/dom-patch.js), so only what changed is touched: open folds and
// editors, typed values, focus and scroll stay through every refresh (U9).

// The id in /app/monitors/<id>, or null on any other path. The server answers an id that does not decode with its 404
// page, so this page only sees ids that decode.
export function monitorIdFromPath(pathname){
 const match=pathname.match(/^\/app\/monitors\/([^/]+)\/?$/);
 return match?decodeURIComponent(match[1]):null;
}

const kinds={mail:'Mail protocol',api:'API transaction',http:'HTTP check',keyword:'Keyword check',heartbeat:'Heartbeat',flow:'Browser flow',...PROTOCOL_KINDS,...PAGESPEED_KINDS};
const backLink='<a class="back-link ui-link" id="monitor-back" href="/app/monitors"><span class="ui-icon" data-icon="chevron" aria-hidden="true"></span><span class="ui-visually-hidden">Back to </span>Monitors</a>';
// "every 1 minute", "every 15 seconds", "every 1 hour 30 minutes": the interval with its units spelled out.
const unitWords={d:'day',h:'hour',min:'minute',s:'second'};
const spokenInterval=ms=>humaneDuration(ms).replace(/(\d+) (d|h|min|s)\b/g,(_,n,unit)=>`${n} ${unitWords[unit]}${n==='1'?'':'s'}`);
const fixtures=d=>d.type==='api'?d.api.steps.some(s=>s.phase==='cleanup'):Boolean(d.flow?.fixtures);

// Each monitor's page across refreshes: what its reads found (seen), and for the page as mounted now, what the owner opened
// (ui: the mounted folds, the rule being added, an editor's error, a deep link still to follow).
const pages=new Map();
function pageOf(id){if(!pages.has(id))pages.set(id,{id,seen:{},tickets:{},ui:null});return pages.get(id)}
const linkTarget=()=>{try{return decodeURIComponent(location.hash.slice(1))||null}catch{return null}};
const freshUi=()=>({mounted:new Set(),adding:null,errors:{},hash:linkTarget(),probing:false,incident:null,heartbeat:false,reading:null});

function titleBlock(m,readUnavailable){
 const d=m.definition,state=shownState(m,readUnavailable);
 const where=d.type==='heartbeat'?`<p class="subtitle monitor-target">Incoming heartbeat at <code class="ui-mono">/api/heartbeats/${escape(m.id)}</code></p>`:`<p class="subtitle monitor-target ui-url">${breakableUrl(d.url)}</p>`;
 const chips=(d.network==='private'?'<a class="header-chip" href="#details">Private network</a>':'')+(d.tlsTrust?'<a class="header-chip" href="#details">Certificate exception</a>':'');
 return `${backLink}<div class="monitor-title"><h1 id="monitor-detail-heading">${escape(d.name)}</h1><span class="ui-pill badge ${escape(state.toLowerCase())}" id="monitor-state">${escape(state)}</span></div>${where}<p class="monitor-kind"><span class="keep-line">${escape(kinds[d.type??'http']??'Check')} ·</span> every ${escape(spokenInterval(d.intervalMs))}${chips?` <span class="header-chips">${chips}</span>`:''}</p>`;
}
function actionButtons(m){
 const d=m.definition,edit=isFlow(d)||d.type==='heartbeat'?`<a class="ui-button" id="edit" href="/docs/definitions">${icon('pencil')}Edit in a file</a>`:`<button id="edit">${icon('pencil')}Edit</button>`;
 return `<button id="run-monitor" class="primary" ${d.enabled?'':'disabled'}>${icon('play')}Run now</button>${edit}<button id="pause"${d.enabled?'':' class="resume"'}>${icon(d.enabled?'pause':'play')}${d.enabled?'Pause':'Resume'}</button>`;
}
function pageMarkup(page){
 const {m,data,readUnavailable,seen,ui}=page;
 page.folds=foldsFor(m,data,seen,ui);
 return `<div class="monitor-page" id="monitor-page" data-monitor="${escape(m.id)}">${statusCard(m,{readUnavailable,data,seen})}${expiryPanel(m,data)}${pageSpeedPanel(m)}`
  +`<div class="monitor-columns"><div class="monitor-main">${rulesTable(m,{data,newest:seen.newest,earlier:seen.earlier,ui})}${recentChecks(m,seen.timeline)}</div>`
  +`<div class="monitor-side">${foldsCard(page.folds,id=>ui.probing||ui.mounted.has(id))}</div></div></div>`;
}
const deps=page=>({api:page.api,action:page.action});
// Patches the page from what it knows now. The reads and the fold binds are not here: a refresh starts them once (render).
function draw(page){
 const {area,seen}=page;if(!area?.isConnected)return;
 patch(area,pageMarkup(page));
 const root=area.querySelector('#monitor-page');root.monitorPage=page;
 if(firstMount(root))bindPage(root);
 const incidents=area.querySelector('#monitor-incidents');
 if(firstMount(incidents)){bindIncidentWork(incidents,page.api);bindIncidentSnapshots(incidents,page.api);if(seen.incidents)patch(incidents,incidentMarkup(seen.incidents,locationNamer(page.m.definition,page.data.runner.runners??[])))}
 const flowHistory=area.querySelector('#flow-revisions');if(flowHistory&&seen.revisions)patch(flowHistory,flowRevisions(seen.revisions));
 syncPicker(root);
 // A read that lands while an action runs keeps the console's controls and links locked (public/app.js lockControls).
 if(area.getAttribute('aria-busy')==='true'){for(const control of area.querySelectorAll('button,input,select,textarea'))control.disabled=true;for(const link of area.querySelectorAll('a[href]'))link.setAttribute('aria-disabled','true')}
 followLink(page);
}
// A fold's panel mounts on its first open, through its own bind function.
function openFold(page,id,{show=true}={}){
 const fold=page.area.querySelector(`details.fold#${id}`);if(!fold)return null;
 if(!page.ui.mounted.has(id)){page.ui.mounted.add(id);draw(page);page.folds.find(f=>f.id===id)?.mount?.(page.area,deps(page));if(id==='snapshots')countSnapshots(page)}
 if(show)fold.open=true;
 return fold;
}
// The snapshot count for its fold's summary, read once when the fold first opens.
function countSnapshots(page){
 page.api(`/api/monitors/${encodeURIComponent(page.m.id)}/failure-snapshots`).then(data=>{page.seen.snapshots={count:data.items.length,more:Boolean(data.next)};draw(page)},()=>{});
}
// A link to anything on the page (/app/monitors/<id>#incident-<key> from an alert email, #alerts, #details): open the fold and
// every disclosure holding it, then scroll to it. A target inside a fold not mounted yet is looked for with every fold's
// markup drawn once; a target that comes with a read (an incident, a check) waits for that read.
function followLink(page){
 const {ui,area,seen}=page,target=ui.hash;if(!target)return;
 if(FOLD_IDS.includes(target)){
  if(!area.querySelector(`details.fold#${target}`)){if(ui.reading&&!ui.reading.size)ui.hash=null;return}
  ui.hash=null;const fold=openFold(page,target);requestAnimationFrame(()=>fold?.scrollIntoView({block:'start'}));
  return;
 }
 const element=document.getElementById(target);
 if(!element||!area.contains(element)){
  if(!ui.probing&&page.folds.some(f=>!f.always&&!ui.mounted.has(f.id))){ui.probing=true;queueMicrotask(()=>draw(page))}
  else if(ui.reading&&!ui.reading.size){ui.hash=null;if(ui.probing){ui.probing=false;queueMicrotask(()=>draw(page))}}
  return;
 }
 ui.hash=null;
 const fold=element.closest('details.fold');
 if(ui.probing){ui.probing=false;if(fold&&!fold.open)openFold(page,fold.id,{show:false});else draw(page)}
 const found=document.getElementById(target);if(!found)return;
 for(let node=found;node&&node!==area;node=node.parentElement)if(node.localName==='details')node.open=true;
 requestAnimationFrame(()=>found.scrollIntoView({block:'start'}));
}
// Listeners the page binds once per mount: the editors, the status card's actions, the folds, links within the page and
// erasing a monitor that is edited in a file (the others erase from their Edit page).
function bindPage(root){
 bindEditing(root);
 bindStatusActions(root);
 root.addEventListener('toggle',event=>{const fold=event.target;if(fold.matches?.('details.fold')&&fold.open)openFold(root.monitorPage,fold.id)},true);
 const follow=()=>{if(!root.isConnected){removeEventListener('hashchange',follow);return}root.monitorPage.ui.hash=linkTarget();followLink(root.monitorPage)};
 addEventListener('hashchange',follow);
 root.addEventListener('click',event=>{
  const page=root.monitorPage,link=event.target.closest('a[href^="#"]');
  if(link&&link.hash===location.hash){page.ui.hash=linkTarget();followLink(page)}
  if(!event.target.closest('[data-action="erase-monitor"]'))return;
  const {m,api,action}=page;
  // A refusal (a fresh second factor, say) is kept for Full check details to show under the button, as an editor's is, and
  // brought into view there.
  confirmErasure({kind:'monitor',name:m.definition.name,onConfirm:async name=>{
   delete page.ui.errors.erase;
   const result=await action(async()=>{try{return await api(`/api/monitors/${encodeURIComponent(m.id)}/erase`,'POST',{name})}catch(problem){page.ui.errors.erase=problem.message;throw problem}},{pending:'Erasing monitor…',success:`Erased ${m.definition.name}.`,onSuccess:()=>{sessionStorage.setItem('uptime-notice',`Erased ${m.definition.name}.`);location.assign('/app/monitors')}});
   if(result.accepted&&!result.ok)document.getElementById('edit-error-erase')?.scrollIntoView({block:'nearest'});
  }});
 });
}
// One read of the page's own: its newest answer wins; an older answer that lands late is dropped. ui.reading holds the reads
// of the page's first round still unanswered, so a link waits for them before it gives up.
function read(page,name,start,apply,fail){
 const ticket=page.tickets[name]=(page.tickets[name]??0)+1,ui=page.ui;
 if(!ui.started)(ui.reading??=new Set()).add(name);
 // An answer is drawn before a waiting link gives up, so a fold that this read adds (Cleanup debt) is there to open.
 start().then(value=>{if(page.tickets[name]!==ticket)return;apply(value);ui.reading?.delete(name);draw(page)},problem=>{ui.reading?.delete(name);if(page.tickets[name]===ticket)fail?.(problem);if(ui.reading&&!ui.reading.size&&ui.hash)followLink(page)});
}
const readFailure=(host,what,retry)=>{
 if(!host?.isConnected)return;
 const button=Object.assign(document.createElement('button'),{type:'button',textContent:'Retry'});button.onclick=retry;
 host.replaceChildren(`Couldn’t load ${what}. `,button);
};
function load(page){
 const {m,api,seen,area}=page,d=m.definition,key=encodeURIComponent(m.id),runners=page.data.runner.runners??[],name=locationNamer(d,runners);
 const incidents=()=>read(page,'incidents',()=>api(`/api/monitors/${key}/incidents`),list=>{
  seen.incidents=list;seen.since=list.find(i=>i.endedAt===null)?.startedAt;
  const host=area.querySelector('#monitor-incidents');if(host)patch(host,incidentMarkup(list,name));
  // The Incidents fold opens itself while an incident is open (U21 D7), once for each incident.
  const open=list.find(i=>i.endedAt===null);
  if(open&&page.ui.incident!==open.key){page.ui.incident=open.key;openFold(page,'incidents')}
 },()=>readFailure(area.querySelector('#monitor-incidents'),'incident history',incidents));
 incidents();
 const history=()=>read(page,'history',()=>Promise.all([api(`/api/monitors/${key}/history`),api(`/api/monitors/${key}/revisions`)]),([slots,revisions])=>{
  const now=Number.isSafeInteger(page.data.now)?page.data.now:Date.now(),timeline=buildTimeline({slots,now,monitor:page.m,revisions});
  seen.timeline=timeline;seen.revisions=revisions;
  const host=area.querySelector('#raw-history');if(host)patch(host,historyMarkup(timeline,page.m,runners));
  const failed=slots.filter(s=>!s.manual&&checkResultSummary(s).state==='failed').sort((a,b)=>b.due_at-a.due_at)[0];
  seen.failure=failed?failureOf(failed,locationNamer(failed.definition,runners)):null;
  seen.start=revisions.length?Math.min(...revisions.map(r=>r.start)):undefined;
  const complete=slots.filter(s=>!s.manual&&s.status==='complete').sort((a,b)=>b.due_at-a.due_at);
  seen.newest=complete.find(s=>s.revision===page.m.revision);seen.earlier=complete[0];
  if(d.type==='heartbeat'){
   seen.receipt=slots.some(s=>s.observations?.some(o=>o.heartbeatReceivedAt));
   // The Heartbeat fold opens by itself until the first receipt arrives.
   if(!page.ui.heartbeat){page.ui.heartbeat=true;if(!seen.receipt)queueMicrotask(()=>openFold(page,'heartbeat'))}
  }
 },()=>{readFailure(area.querySelector('#raw-history'),'recent checks',history)});
 history();
 read(page,'route',()=>api(`/api/monitors/${key}/alert-route`),route=>{seen.route=route});
 if(d.slow&&d.type!=='heartbeat')read(page,'slow',()=>api(`/api/monitors/${key}/slow-policy`),policy=>{seen.slow=policy.status});else seen.slow=null;
 if(d.tags?.includes('dependency'))read(page,'followed',()=>api('/api/service-catalog'),catalog=>{const item=catalog.followed.find(f=>f.monitorId===m.id);seen.followed=item?{review:item.review.state==='needs_review'}:null});
 if(fixtures(d))read(page,'debt',()=>api(`/api/monitors/${key}/cleanup-debt`),debt=>{seen.debt=debt});
}
function renderMissing({header,actions,area,id}){
 document.title='Monitor not found · Uptime';
 patch(header,`${backLink}<div class="monitor-title"><h1 id="monitor-detail-heading">Monitor not found</h1></div><p class="subtitle">This installation has no monitor at this address.</p>`);
 actions.replaceChildren();
 patch(area,`<section class="empty ui-empty monitor-missing"><p>No monitor has the id <code class="ui-mono">${escape(id)}</code>. It may have been deleted, or the link may be incomplete.</p><a class="ui-button primary" id="missing-back" href="/app/monitors">Back to monitors</a></section>`);
}
// header: the page header's title block (.top > div); actions: .actions; area: #content-area.
export function renderMonitorPage({header,actions,area,data,id,api,action,readUnavailable}){
 const m=data.monitors.find(m=>m.id===id);
 if(!m){renderMissing({header,actions,area,id});return}
 const page=pageOf(m.id);
 if(!page.ui||area.querySelector('#monitor-page')?.dataset.monitor!==m.id)page.ui=freshUi();
 Object.assign(page,{m,data,readUnavailable,api,action,area,draw:()=>draw(page)});
 document.title=`${m.definition.name} · Uptime`;
 patch(header,titleBlock(m,readUnavailable));
 header.monitorPage=page;
 if(firstMount(header))header.addEventListener('click',event=>{const link=event.target.closest('a.header-chip');if(link&&link.hash===location.hash){header.monitorPage.ui.hash=linkTarget();followLink(header.monitorPage)}});
 patch(actions,actionButtons(m));
 draw(page);
 mountFolds(area,page.folds,page.ui.mounted,deps(page));
 load(page);page.ui.started=true;
 const d=m.definition,name=locationNamer(d,data.runner.runners??[]),where=joinNames([...new Set((d.probes??[]).map(name))])||'your locations';
 actions.querySelector('#run-monitor').onclick=()=>action(async()=>{const queued=await api(`/api/monitors/${m.id}/run`,'POST',{});return await waitForCheck({api,id:m.id,slotId:queued.slotId,name})},{pending:`Checking from ${where}…`,success:outcome=>outcome??'Check queued. Its result will appear in Recent checks.'});
 if(!isFlow(d)&&d.type!=='heartbeat')actions.querySelector('#edit').onclick=()=>{location.href='/app/monitors/'+encodeURIComponent(m.id)+'/edit'};
 actions.querySelector('#pause').onclick=()=>{if(!d.enabled&&Object.values(d.assignments??{}).some(a=>!(data.runner.runners??[]).some(r=>r.runnerId===a.runnerId&&!r.revokedAt))){location.href='/app/monitors/'+encodeURIComponent(m.id)+'/edit';return}return action(()=>api(`/api/monitors/${m.id}`,'PATCH',{...d,enabled:!d.enabled}),{pending:d.enabled?'Pausing monitor…':'Authorizing and resuming…',success:d.enabled?'Monitor paused. Historical observations remain available.':'Monitor authorized and resumed. New scheduled results are required.'})};
}
