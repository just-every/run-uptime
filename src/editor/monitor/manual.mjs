import {api} from './api.mjs';
import {fillFields,readFields} from './fields.mjs';
import {mountProbeControls} from './probes.mjs';
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
 form.querySelector('button[type=submit]').disabled=true;
 form.onsubmit=event=>event.preventDefault();
}
export function mountManualForm({form,overview,definition,id,returnTo,message,preserveFields=false}){
 if(!preserveFields)prepareManualForm(form,definition);
 const probes=mountProbeControls(form.querySelector('#settings-probes'),overview,definition,id);
 const value=name=>form.elements.namedItem(name).value;
 form.onsubmit=async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const button=form.querySelector('button[type=submit]');button.disabled=true;message.removeAttribute('data-error');message.textContent='Saving monitor…';
  try{
   const result=readFields(form,definition);
   result.probes=[...probes.querySelectorAll('input:checked')].map(input=>input.value);
   result.assignments=Object.fromEntries(result.probes.map(name=>[name,{runnerId:value('runner-'+name),...(value('canary-'+name)?{canaryUrl:value('canary-'+name)}:{})}]));
   await api(id?`/api/monitors/${id}`:'/api/monitors',id?'PATCH':'POST',result);location.href=returnTo;
  }catch(error){message.textContent=error.message;message.setAttribute('data-error','');button.disabled=false;form.querySelector('.editor-footer').scrollIntoView({block:'end'})}
 };
 form.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(control=>control.disabled=false);
 showType(form,form.elements.checkType.value);
 for(const checkbox of probes.querySelectorAll('input[type=checkbox]'))checkbox.onchange();
 message.textContent='Request credentials stay in the runner installation.';
}
// A new monitor the owner fills in by hand, starting from the website address they already gave.
export function prefillManualForm(form,{url='',name=''}={}){
 form.elements.url.value=url;if(!form.elements.name.value)form.elements.name.value=name;
}
