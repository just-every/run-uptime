import {firstMount,patch} from './dom-patch.js';
import {escape} from './console-format.js';
import {externalCheckSection} from './external-check.js';
import {saveAsYouGo,savedLine,failureLine} from './settings-save.js';
// Settings › General: the installation's one time zone, which alerts, reports, maintenance and job schedules use (it saves
// as it changes), and the External check URL (public/external-check.js), which keeps its one-step Save.
export function renderGeneral({area,data,api,refresh}){
 patch(area,'<div class="settings-area"><section class="ui-card set-card" id="settings-time-zone" data-owned="time-zone" aria-labelledby="time-zone-heading"></section><section class="ui-card set-card external-check" id="external-check" data-owned="external-check"></section></div>');
 const zone=area.querySelector('#settings-time-zone'),external=area.querySelector('#external-check');
 if(firstMount(zone))mountZone(zone,{data,api,refresh});else showZone(zone,data.timeZone);
 if(firstMount(external))externalCheckSection(external,{url:data.runner.externalCheckUrl,api,refresh});
}
const zones=current=>[...new Set([...Intl.supportedValuesOf('timeZone'),'UTC',current])].sort();
function mountZone(card,{data,api,refresh}){
 card.innerHTML=`<div class="card-head"><h2 id="time-zone-heading">Time zone</h2>${savedLine('time-zone-saved')}</div><select id="installation-time-zone" name="timeZone" aria-labelledby="time-zone-heading" aria-describedby="time-zone-help time-zone-failure">${zones(data.timeZone).map(zone=>`<option>${escape(zone)}</option>`).join('')}</select><p class="ui-helper" id="time-zone-help">Alerts, reports, maintenance and job schedules use it.</p>${failureLine('time-zone-failure')}`;
 const select=card.querySelector('select');select.value=data.timeZone;
 const save=saveAsYouGo({saved:card.querySelector('#time-zone-saved'),failure:card.querySelector('#time-zone-failure'),send:async timeZone=>{await api('/api/notifications/preferences','PATCH',{timeZone});await refresh()}});
 select.onchange=()=>{void save(select.value)};
}
// A zone changed elsewhere shows here too, unless this card is saving or holding a refused choice.
function showZone(card,timeZone){
 const select=card.querySelector('select');
 if(!select||!timeZone||select.value===timeZone||document.activeElement===select||['saving','refused'].includes(card.querySelector('#time-zone-saved').dataset.state))return;
 if(![...select.options].some(option=>option.value===timeZone))select.add(new Option(timeZone));
 select.value=timeZone;
}
