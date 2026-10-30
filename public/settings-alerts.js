import {patch,firstMount} from './dom-patch.js';
import {clausesMarkup} from './alert-clauses.js';
import {destinationsMarkup} from './alert-destinations.js';
import {sentAlertsMarkup} from './sent-alerts.js';
import {destinationDialog} from './notifications.js';
import {mountDefaultRoute} from './alert-route-default.js';
import {mountCategories} from './root-cause-categories.js';
// Settings › Alerts: who hears about an incident and what was sent, in four cards (Destinations, Who is told by default,
// Root-cause categories and Sent alerts), with one clause above Destinations for each thing that stops an alert. Every
// five-second overview redraws the clauses, the destination rows and the sent alerts in place (public/dom-patch.js); the two
// middle cards fill themselves (data-owned), so a choice not yet applied, a typed name or a pending save survives it.
const routes=new WeakMap();let current;
export function renderAlerts({area,data,api,action,readUnavailable}){
 const notes=data.notifications;current={notes,api,action};
 patch(area,`<div class="settings-area alerts-area"><div class="alert-clauses">${clausesMarkup(notes,readUnavailable)}</div><section class="ui-card set-card" id="alert-destinations" aria-labelledby="destinations-heading">${destinationsMarkup(notes)}</section><div class="alerts-split"><section class="ui-card set-card" id="default-route" data-owned="default-route" aria-labelledby="default-route-heading"></section><section class="ui-card set-card" id="root-cause-categories" data-owned="root-cause-categories" aria-labelledby="categories-heading"></section></div><section class="ui-card set-card" id="sent-alerts" aria-labelledby="sent-alerts-heading">${sentAlertsMarkup(notes)}</section></div>`);
 const page=area.querySelector('.alerts-area'),route=area.querySelector('#default-route'),categories=area.querySelector('#root-cause-categories'),reports=area.querySelector('#report-schedule-controls');
 if(firstMount(page))page.addEventListener('click',openFromPage);
 if(firstMount(route))routes.set(route,mountDefaultRoute(route,{api,notes}));else routes.get(route)?.update(notes);
 if(firstMount(categories))mountCategories(categories,{api});
 // Scheduled reports fill their own host once (public/assets/report-schedule-controls.js).
 if(!reports.hasChildNodes())void import('./assets/report-schedule-controls.js').then(({reportScheduleControls})=>reportScheduleControls(reports,{data,api}));
 const add=document.getElementById('add-destination');if(add)add.onclick=()=>destinationDialog(null,current);
}
// A row's Send test and Edit, and a clause's fix, which opens the destination's Edit dialog.
function openFromPage(event){
 const {notes,api,action}=current,find=id=>notes.destinations.find(d=>d.id===id);
 const edit=event.target.closest('[data-edit-destination]'),test=event.target.closest('[data-send-test]');
 if(edit){const d=find(edit.dataset.editDestination);if(d)destinationDialog(d,current);return}
 const d=test&&find(test.dataset.sendTest);
 if(d)void action(()=>api(`/api/notifications/destinations/${encodeURIComponent(d.id)}/${d.webhookTemplate?'test':'drill'}`,'POST',{}),{pending:'Sending test…',success:`Test queued for ${d.name}. Its result shows under Sent alerts.`});
}
