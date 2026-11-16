import {api} from './api.mjs';
import {fillFields,readFields} from './fields.mjs';
import {mountCheckFrom,assignmentsFor} from './check-from.mjs';
import {setDependencyChoices} from './metadata-fields.mjs';
import {showType,TYPE_TIMING} from './protocol-fields.mjs';
import {advancedHolds,openAdvanced} from './advanced.mjs';
// The full monitor form: what a new monitor starts from by hand, and the only way to edit an existing one.
export const NEW_MONITOR={name:'',url:'',method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:2000,retries:1,probes:['local-a'],failureQuorum:1,confirmSlots:2,recoverSlots:2,freshnessMs:180000,enabled:true,maintenanceUntil:0};
// "Unknown after" is how long a result stays usable. A new monitor's follows its interval (three intervals, at least three
// minutes, at most a day) until it is set by hand, and the form says so when it is shorter than the interval it must outlast.
function followInterval(form,isNew){
 const interval=form.elements.intervalMinutes,fresh=form.elements.freshnessMinutes,note=form.querySelector('[data-freshness-note]');
 let manual=false;
 const check=()=>{if(note)note.hidden=!(Number(fresh.value)<Number(interval.value))};
 fresh.addEventListener('input',()=>{manual=true;check()});
 interval.addEventListener('input',()=>{const minutes=Number(interval.value);if(isNew&&!manual&&minutes>0)fresh.value=String(Math.min(1440,Math.max(3,3*minutes)));check()});
 form.elements.checkType.addEventListener('change',()=>setTimeout(check,0));
 check();
}
export function prepareManualForm(form,definition){
 fillFields(form,definition);
 if(!form.dataset.freshnessBound){form.dataset.freshnessBound='true';followInterval(form,!definition.name)}
 form.elements.url.required=definition.type!=='heartbeat';
 form.querySelectorAll('input,select,textarea').forEach(control=>control.disabled=false);
 showType(form,form.elements.checkType.value);
 // A new monitor takes each type's usual timing when the type changes; an existing monitor keeps its own.
 form.elements.checkType.onchange=()=>{const type=form.elements.checkType.value;showType(form,type);if(!definition.name)for(const [name,value] of Object.entries(TYPE_TIMING[type]))form.elements.namedItem(name).value=String(value)};
 form.elements.networkScope.onchange=()=>showType(form,form.elements.checkType.value);
 form.querySelector('button[type=submit]').disabled=true;
 form.onsubmit=event=>event.preventDefault();
}
export function mountManualForm({form,overview,definition,id,returnTo,message,monitors=[],preserveFields=false}){
 if(!preserveFields)prepareManualForm(form,definition);
 setDependencyChoices(form,monitors.filter(monitor=>monitor.id!==id),definition.dependencies);
 const checkFrom=mountCheckFrom(form.querySelector('#check-from'),{overview,definition,externalCheck:overview.externalCheck,isNew:!id});
 openAdvanced(form,advancedHolds(definition,NEW_MONITOR,{ownExternalUrl:checkFrom.ownUrl()}));
 form.onsubmit=async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const button=form.querySelector('button[type=submit]');button.disabled=true;message.removeAttribute('data-error');message.textContent='Saving monitor…';
  try{
   const heartbeat=form.elements.checkType.value==='heartbeat',runnerIds=checkFrom.runnerIds(),own=heartbeat?'':checkFrom.ownUrl();
   if(!heartbeat&&!runnerIds.length)throw Error('Choose at least one location to check from.');
   // The server decides whether the monitor follows Settings: it does unless it has its own External check URL.
   const result={...readFields(form,definition),...(!heartbeat?assignmentsFor(definition,runnerIds):{}),...(own?{canaryUrl:own}:{})};
   delete result.externalCheck;result.failureQuorum=Math.min(result.failureQuorum??1,result.probes.length);
   const saved=await api(id?`/api/monitors/${id}`:'/api/monitors',id?'PATCH':'POST',result);
   // Only a successful explicit creation requests the one-time URL on the next page. No secret enters storage.
   if(!id&&heartbeat&&saved?.id)sessionStorage.setItem('uptime-heartbeat-created',saved.id);
   location.href=id||!saved?.id?returnTo:`/app/monitors/${encodeURIComponent(saved.id)}`;
  }catch(error){message.textContent=error.message;message.setAttribute('data-error','');button.disabled=false;form.querySelector('.editor-footer').scrollIntoView({block:'end'})}
 };
 form.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(control=>control.disabled=false);
 showType(form,form.elements.checkType.value);
 checkFrom.update();
 message.textContent='';
}
// A new monitor the owner fills in by hand, starting from the website address they already gave.
export function prefillManualForm(form,{url='',name=''}={}){
 form.elements.url.value=url;if(!form.elements.name.value)form.elements.name.value=name;
}
