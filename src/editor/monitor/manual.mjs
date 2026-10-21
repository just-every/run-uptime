import {api} from './api.mjs';
import {fillFields,readFields} from './fields.mjs';
import {mountCheckFrom,assignmentsFor} from './check-from.mjs';
import {setDependencyChoices} from './metadata-fields.mjs';
import {showType,TYPE_TIMING} from './protocol-fields.mjs';
// The full monitor form: what a new monitor starts from by hand, and the only way to edit an existing one.
export const NEW_MONITOR={name:'',url:'',method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:2000,retries:1,probes:['local-a'],failureQuorum:1,confirmSlots:2,recoverSlots:2,freshnessMs:180000,enabled:true,maintenanceUntil:0};
export function prepareManualForm(form,definition){
 fillFields(form,definition);
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
 form.onsubmit=async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const button=form.querySelector('button[type=submit]');button.disabled=true;message.removeAttribute('data-error');message.textContent='Saving monitor…';
  try{
   const runnerIds=checkFrom.runnerIds(),own=checkFrom.ownUrl();
   if(!runnerIds.length)throw Error('Choose at least one location to check from.');
   // The server decides whether the monitor follows Settings: it does unless it has its own External check URL.
   const result={...readFields(form,definition),...assignmentsFor(definition,runnerIds),...(own?{canaryUrl:own}:{})};
   delete result.externalCheck;result.failureQuorum=Math.min(result.failureQuorum??1,result.probes.length);
   const saved=await api(id?`/api/monitors/${id}`:'/api/monitors',id?'PATCH':'POST',result);location.href=id||!saved?.id?returnTo:`/app/monitors/${encodeURIComponent(saved.id)}`;
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
