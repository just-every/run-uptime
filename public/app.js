import {createCatalog} from './catalog.js';
import {createActionFeedback} from './action-feedback.mjs';
import {icon} from './console-format.js';
import {listSummary} from './monitor-list.js';
import {monitorIdFromPath,renderMonitorPage} from './monitor-page.js';
import {locationsMarkup,addPanelMarkup,addingLocation,startAdding,bindLocations} from './locations.js';
import {AREAS,renderSettings} from './settings-view.js';
import {savesSettled,savePending,holdRefused,refusalPending} from './settings-save.js';
import {rememberZone} from './installation-zone.js';
import {patch} from './dom-patch.js';
// Each console screen has a stable path: a section (/app/monitors, /app/locations) or a Settings area (/app/settings/<area>;
// /app/settings itself opens Alerts, first in its menu). On a section a link to another section or area switches the view in
// place and pushes its path, so Back, Forward, reload and a copied link land on the same screen without loading a document.
// A monitor's page is a route of its own: a section link there pushes the path too, and the router mounts the console afresh
// for that section (src/routes/_console.tsx). Links opened in a new tab are left to the browser.
const SECTIONS=['monitors','locations','settings'];
// The view (and Settings area) a console path names, or null for any other path.
function routeOf(path){
 const [,section,area]=/^\/app\/([a-z]+)(?:\/([^/]+))?\/?$/.exec(path)??[];
 if(!SECTIONS.includes(section)||area&&section!=='settings')return null;
 return section==='settings'?{view:'settings',area:Object.hasOwn(AREAS,area??'')?area:'alerts'}:{view:section};
}
const pathOf=({view,area})=>view==='settings'?`/app/settings/${area}`:`/app/${view}`;
const TITLES={monitors:'Monitors',locations:'Locations',signout:'Sign out'};
function mountConsole(){if(window.uptimeBooted)return;window.uptimeBooted=true;const pageId=monitorIdFromPath(location.pathname),entry=routeOf(location.pathname);let data=null,view=pageId!==null?'monitor':entry?.view??(location.pathname.split('/')[2]||'monitors'),settingsArea=entry?.area??null,feedback,readUnavailable=false,redirecting=false,closed=false,polling,shown=null;const $=s=>document.querySelector(s);
// /app/settings, or an area Settings does not have, opens Alerts at its own path.
if(entry&&location.pathname!==pathOf(entry))history.replaceState(history.state,'',pathOf(entry)+location.search+location.hash);
// A monitor's page started its first reads while the document parsed (src/ui/console-prefetch.ts); each is used once.
function takePrefetched(path){const early=window.uptimePrefetch?.[path];if(!early)return null;delete window.uptimePrefetch[path];return Date.now()-early.at<15000?early.response:null}
async function api(path,method='GET',body){if(closed)throw Error('The console is closed. Sign in again to continue.');const response=await((method==='GET'?takePrefetched(path):null)??fetch(path,{method,headers:{'content-type':'application/json','x-uptime-time-zone':Intl.DateTimeFormat().resolvedOptions().timeZone},...(method==='GET'?{signal:AbortSignal.timeout(10000)}:{}),body:body===undefined?undefined:JSON.stringify(body)})),result=await response.json();if([401,403].includes(response.status))window.dispatchEvent(new Event('uptime:auth-lost'));if(!response.ok)throw Object.assign(Error(result.error??`Request ${response.status}`),{status:response.status});return result}
const notice=text=>feedback?.announceBackground(text);
const catalog=createCatalog({api,action});
if(!document.querySelector('link[href="/catalog.css"]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/catalog.css';document.head.append(style)}
function disposeConsole(){
 if(closed)return;closed=true;feedback?.dispose();clearInterval(polling);data=null;
 window.uptimeBooted=false;
 window.removeEventListener('pagehide',closeConsole);window.removeEventListener('pageshow',restored);window.removeEventListener('popstate',followHistory);window.removeEventListener('uptime:console-unmount',disposeConsole);window.removeEventListener('beforeunload',holdUnsaved);
 document.removeEventListener('click',guardBusyNavigation,true);document.removeEventListener('click',followSection);
 controlsObserver.disconnect();lockedControls.clear();lockedLinks.clear();
 document.documentElement.classList.remove('signed-in');
}
function closeConsole(){
 if(closed)return;disposeConsole();
 window.dispatchEvent(new Event('uptime:auth-lost'));window.dispatchEvent(new Event('uptime:console-closed'));
 document.documentElement.classList.remove('signed-in');
 for(const host of [area,right,header,actions,n,...sidebar.querySelectorAll('nav')])host.replaceChildren();
 document.body.replaceChildren(...document.body.querySelectorAll('link[rel=stylesheet]'));
}
const navigateToLogin=()=>{if(redirecting)return;redirecting=true;closeConsole();location.replace('/login')};
window.addEventListener('pagehide',closeConsole);
window.addEventListener('uptime:console-unmount',disposeConsole);
// A history restore reloads through the document's server-side authority check.
function restored(event){if(event.persisted)location.reload()}
window.addEventListener('pageshow',restored);
async function refresh(options){if(closed||document.querySelector('dialog[open]'))return;return feedback.refresh(options)}
async function action(fn,options){const focusId=document.activeElement?.id,result=await feedback.run(fn,options);if(result.accepted&&focusId)document.getElementById(focusId)?.focus({preventScroll:true});return result}
// The menus are the document's own markup (src/ui/console.html), painted before this module loads; here they only follow the
// view. In Settings the sidebar shows the Settings menu (data-menu="settings" on .app): one attribute, so switching menus
// never remounts either. Exactly one entry is current, the Settings area or the section; a monitor's page marks Monitors.
const app=$('.app'),sidebar=$('.sidebar');
function markCurrent(){
 if(view==='settings')app.dataset.menu='settings';else delete app.dataset.menu;
 for(const link of sidebar.querySelectorAll('a[data-view],a[data-area]')){
  if(view==='settings'?link.dataset.area===settingsArea:link.dataset.view===view)link.setAttribute('aria-current','page');
  else if(link.dataset.view==='monitors'&&view==='monitor')link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
 }
}
// The heading and the tab title name the section or Settings area being shown, an area under the eyebrow Settings; a
// monitor's page names itself once it has read the monitor.
function setHeading(){if(view==='monitor')return;const name=view==='settings'?AREAS[settingsArea]:TITLES[view];$('.top h1').textContent=name;$('.top .eyebrow').hidden=view!=='settings';document.title=name+(view==='settings'?' · Settings':'')+' · Uptime'}
// An outcome notice belongs to the section where the action ran.
function leaveSection(){notice('');feedback?.clearAction()}
markCurrent();
// While an action or its reconciliation is pending, lockControls marks every console link aria-disabled and this one
// guard keeps it from leaving the view, so the action's outcome notice is shown where the action was requested.
function guardBusyNavigation(event){if(!feedback.busy||!event.target.closest('a[aria-disabled="true"]'))return;event.preventDefault();event.stopImmediatePropagation()}
document.addEventListener('click',guardBusyNavigation,true);
// Sign out is a real destination too, so opening or reloading its URL completes the same action.
async function signOut(){const result=await action(()=>api('/api/auth/sign-out','POST',{}),{pending:'Signing out…',success:'Signed out.'});if(result.ok)navigateToLogin()}
sidebar.addEventListener('click',event=>{if(event.target.closest('a')?.dataset.view!=='signout'||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();void savesSettled().then(()=>{if(!holdRefused())void signOut()})});
// Leaving a Settings area while a value saves waits for the save; a refused value keeps the area once, with its reason and
// Retry in view, so an edit is never dropped without a word (public/settings-save.js). Reloading or closing the tab
// meanwhile asks first.
async function followSection(event){const a=event.target.closest('a[href]');if(!a||event.defaultPrevented||event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||a.target&&a.target!=='_self'||a.hasAttribute('download'))return;const url=new URL(a.href),next=url.origin===location.origin?routeOf(url.pathname):null;if(!next)return;event.preventDefault();if(savePending())await savesSettled();if(holdRefused())return;const path=(next.view==='settings'?pathOf(next):url.pathname)+url.search+url.hash;if(path!==location.pathname+location.search+location.hash)history.pushState(null,'',path);if(pageId===null)showSection(next)}
document.addEventListener('click',followSection);
function holdUnsaved(event){if(savePending()||refusalPending())event.preventDefault()}
window.addEventListener('beforeunload',holdUnsaved);
// Back and Forward between sections switch in place too; any other entry (a monitor's page, the editor) is the router's.
function followHistory(){if(closed||pageId!==null)return;const next=routeOf(location.pathname);if(next)showSection(next)}
window.addEventListener('popstate',followHistory);
// The monitor list reads its search, filters and selection from the path it is entered at (public/catalog.js).
function showSection(next){if(next.view==='monitors')catalog.read();view=next.view;settingsArea=next.area??null;leaveSection();setHeading();markCurrent();render()}
const header=$('.top > div'),actions=$('.actions');
const n=document.createElement('div');n.id='notice';n.className='ui-notice';n.hidden=true;n.innerHTML='<p id="action-notice" role="status" hidden></p><p id="read-notice" role="status" hidden></p><p id="background-notice" role="status" hidden></p>';$('.top').after(n);
const title=$('.table-title');title.innerHTML='<h2 id="table-heading">Destinations &amp; delivery</h2>';const area=$('.table-scroll');area.id='content-area';const right=$('.right');right.id='side-panel';
// Only the alerts help (Settings › Alerts) and a location being added use the side column; every other view has the full
// width.
const sideHidden=()=>!(view==='settings'&&settingsArea==='alerts'||view==='locations'&&addingLocation());
right.hidden=sideHidden();
// The monitor list's one summary line, under its heading (public/monitor-list.js).
const summary=$('.list-summary');
if(view==='monitor'){title.hidden=true;area.setAttribute('aria-label','Monitor details');area.querySelector('.loading-note').textContent='Loading monitor…';$('.top h1').textContent='Monitor';$('.subtitle').textContent='Loading…';$('.subtitle').hidden=false}
else{setHeading();$('.subtitle').hidden=true;actions.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.id==='new-monitor')window.dispatchEvent(new Event('uptime:new-monitor'));else if(button.id==='add-many-monitors')catalog.openAdd();else if(button.id==='add-location-button')startAdding({api,action,render})})}
// Each view's buttons beside its heading. "Add many monitors" is the list's door to the Bulk add dialog until New monitor's
// "Other ways to add" holds it as "Paste many URLs or a CSV"; U21 round R3's "Other ways to add" commit removes it.
const viewActions={monitors:()=>`<button type="button" class="ui-link" id="add-many-monitors">Add many monitors</button><button class="primary" id="new-monitor">${icon('plus')}New monitor</button>`,locations:()=>`<button class="primary" id="add-location-button"${addingLocation()?' disabled':''}>${icon('plus')}Add location</button>`};
const lockedControls=new Map(),lockedLinks=new Map();
// Async tasks and dialogs can insert controls without rendering the whole view.
// Observe those insertions before the browser can offer a click on a busy console.
const controlsObserver=new MutationObserver(records=>{if(!closed&&feedback?.busy&&records.some(record=>record.addedNodes.length))lockControls(true)});
controlsObserver.observe(document.body,{childList:true,subtree:true});
// The first read failed, so nothing is loading any more: a static note replaces the skeleton until a read succeeds, and
// a monitor's page drops its "Loading…" subtitle.
function firstReadFailed(){const list=area.querySelector('.loading-list');if(!list)return;list.classList.add('read-failed');list.querySelector('.loading-note').textContent=view==='monitor'?'This monitor could not be read yet.':`${view==='settings'?AREAS[settingsArea]:TITLES[view]} could not be read yet.`;if(view==='monitor')$('.subtitle').textContent='';right.querySelector('.loading-panel')?.remove()}
// Busy disables every form control and marks every link aria-disabled (the click guard above blocks them); idle restores
// each to what it was, then redraws, so a control whose state the action changed shows its current state. Links stay
// focusable, so focus on a link survives the action. aria-busy changes first, so that redraw already reads idle: a monitor
// page's draw keeps its controls locked while a read lands during an action, and must not lock them again once it is over.
function lockControls(busy){area.setAttribute('aria-busy',String(busy));if(busy){for(const control of document.querySelectorAll('button,input,select,textarea')){if(!lockedControls.has(control))lockedControls.set(control,control.disabled);control.disabled=true}for(const a of document.querySelectorAll('a[href]')){if(!lockedLinks.has(a))lockedLinks.set(a,a.getAttribute('aria-disabled'));a.setAttribute('aria-disabled','true')}}else{const locked=lockedControls.size>0||lockedLinks.size>0;for(const [control,disabled]of lockedControls)if(control.isConnected)control.disabled=disabled;lockedControls.clear();for(const [a,previous]of lockedLinks)if(previous===null)a.removeAttribute('aria-disabled');else a.setAttribute('aria-disabled',previous);lockedLinks.clear();if(locked)render()}}
feedback=createActionFeedback({load:()=>api(view==='monitor'?`/api/overview?monitor=${encodeURIComponent(pageId)}`:'/api/overview'),lock:lockControls,publish:state=>{if(closed)return;for(const [name,channel]of Object.entries({action:state.action,read:state.read,background:state.background})){const host=$('#'+name+'-notice'),lead=channel.state==='unavailable'?channel.message.indexOf(': ')+1:0;if(lead>0){const body=document.createElement('span');body.append(Object.assign(document.createElement('strong'),{textContent:channel.message.slice(0,lead)}),channel.message.slice(lead));host.replaceChildren(body)}else host.textContent=channel.message;host.hidden=!channel.message;if(channel.state)host.dataset.state=channel.state}n.hidden=![state.action.message,state.read.message,state.background.message].some(Boolean)},render:(next,state)=>{if(closed)return;if(state.error?.status===401){navigateToLogin();return}if(!next){if(state.readUnavailable)firstReadFailed();return}data=next;rememberZone(next);readUnavailable=state.readUnavailable;render();if(!state.error&&!state.readUnavailable)document.documentElement.classList.add('signed-in')}});

function renderMonitors(){patch(summary,listSummary(data,readUnavailable));catalog.render({area,data,readUnavailable})}
function renderLocations(){patch(area,locationsMarkup(data));patch(right,addPanelMarkup(data));bindLocations({area,right,data:()=>data,api,action,refresh,render})}
// Each view patches its markup into the page (public/dom-patch.js), so a refresh changes only what changed: open
// disclosures, focus, typed values and scroll stay. Switching views starts the new view from empty hosts.
function render(){if(!data||document.querySelector('dialog[open]'))return;
 // With no monitors yet, the list opens the new-monitor form instead of an empty table.
 if(view==='monitors'&&!readUnavailable&&!data.monitors.length){if(!redirecting){redirecting=true;location.replace('/app/monitors/new')}return}
 const screen=view==='settings'?'settings/'+settingsArea:view;
 if(screen!==shown){area.replaceChildren();right.replaceChildren();shown=screen}right.hidden=sideHidden();
 markCurrent();
 if(view==='monitor')renderMonitorPage({header,actions,area,data,id:pageId,api,action,readUnavailable});
 else{patch(actions,viewActions[view]?.()??'');actions.hidden=!viewActions[view];summary.hidden=view!=='monitors';title.hidden=settingsArea!=='alerts'||view!=='settings';
  setHeading();
  area.setAttribute('aria-label',view==='settings'?AREAS[settingsArea]:{locations:'Locations'}[view]??'Monitor list');
  if(view==='monitors')renderMonitors();else if(view==='locations')renderLocations();else if(view==='settings')renderSettings(settingsArea,{area,right,data,api,action,refresh:()=>refresh(),notice,closeConsole,navigateToLogin,closed:()=>closed,readUnavailable})}
 if(feedback.busy)lockControls(true)}
{const flash=sessionStorage.getItem('uptime-notice');if(flash){sessionStorage.removeItem('uptime-notice');notice(flash)}}
if(view==='signout')void signOut();else{refresh();polling=setInterval(refresh,5000)}
}
window.addEventListener('uptime:console-mount',mountConsole);
