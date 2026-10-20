import {escape} from '/console-format.js';
import {reasons,scheduleDescription} from './alert-route-markup.js';
// DELIVERY-002 fallback chain: up to three named contacts, in order, after the selected contacts, and the deadline an
// uncertain send waits before the next contact is alerted. Built from the route editor's existing schedule controls.
const slots=3;
export function fallbackSummaryMarkup(data){
 const chain=data.fallback??[];if(!chain.length)return '';
 return `<p>Fallback: ${chain.map(f=>escape(f.name)).join(' → ')}; uncertain deadline ${escape(String(data.fallbackDeadlineSeconds))} s.</p>`;
}
export function fallbackPreviewMarkup(data){
 const chain=data.fallback??[];
 return `<h3>Fallback chain</h3>${chain.length?`<ul class="route-recipients">${chain.map(f=>`<li><div><strong>${escape(f.name)}</strong>${f.kind?` <span>${escape(f.kind)}</span>`:''}<p>Fallback ${f.order} · ${escape(reasons[f.reason]??f.reason)}</p><p class="route-recipient-schedule">${escape(scheduleDescription(f.contactSettings))}</p></div></li>`).join('')}</ul><p>Each fallback gets the trigger only after an earlier contact fails or stays uncertain for ${escape(String(data.fallbackDeadlineSeconds))} seconds.</p>`:'<p>No fallback contacts.</p>'}`;
}
function slotMarkup(contacts,policy,index){
 const id=policy.fallback?.destinationIds?.[index]??'',settings=policy.contactSettings?.[id]??{},prefix=`route-fallback-${index}`;
 return `<fieldset class="route-contact-schedule" data-route-fallback><legend>Fallback ${index+1}</legend><div class="route-schedule-numbers"><label class="route-fallback-contact" for="${prefix}">Contact<select id="${prefix}" data-route-fallback-contact><option value="">None</option>${contacts.map(d=>`<option value="${escape(d.id)}" ${d.id===id?'selected':''}>${escape(d.name)}</option>`).join('')}</select></label><label for="${prefix}-delay">Delay (minutes)<input id="${prefix}-delay" data-route-fallback-setting="delayMinutes" type="number" min="0" max="1440" step="1" required value="${escape(String(settings.delayMinutes??0))}"></label></div><div class="route-schedule-switches"><label for="${prefix}-recovery"><input id="${prefix}-recovery" data-route-fallback-setting="recovery" type="checkbox" ${settings.recovery===false?'':'checked'}>Send recovery</label></div></fieldset>`;
}
export function mountRouteFallback(after,data,scope,mode){
 if(!document.querySelector('link[href="/assets/alert-route-fallback.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/assets/alert-route-fallback.css';document.head.append(link)}
 const fields=document.createElement('fieldset');fields.id='route-fallback-fields';after.after(fields);
 const render=()=>{
  const policy=data.policies.find(p=>p.scope===scope.value),contacts=data.recipients.filter(d=>d.kind);
  fields.innerHTML=`<legend>Fallback contacts</legend><p>If a selected contact fails, or stays uncertain past the deadline, the next fallback gets the alert.</p><div class="route-schedule-numbers"><label for="route-fallback-deadline">Uncertain deadline (seconds)<input id="route-fallback-deadline" type="number" min="5" max="3600" step="1" required value="${escape(String(policy.fallback?.deadlineSeconds??120))}"></label></div>${Array.from({length:slots},(_,i)=>slotMarkup(contacts,policy,i)).join('')}`;
  sync();
 };
 const sync=()=>{fields.disabled=mode.value!=='selected'};
 scope.addEventListener('change',render);mode.addEventListener('change',sync);render();
 return {
  // Adds the chain and each fallback contact's ROUTING-002 schedule to the route input.
  apply(input){
   if(input.mode!=='selected')return input;
   const chosen=[...fields.querySelectorAll('[data-route-fallback]')].map(slot=>{const value=key=>slot.querySelector(`[data-route-fallback-setting=${key}]`);return {id:slot.querySelector('[data-route-fallback-contact]').value,delayMinutes:Number(value('delayMinutes').value),recovery:value('recovery').checked}}).filter(slot=>slot.id);
   return {...input,fallback:{destinationIds:chosen.map(slot=>slot.id),deadlineSeconds:Number(fields.querySelector('#route-fallback-deadline').value)},contactSettings:{...input.contactSettings,...Object.fromEntries(chosen.map(slot=>[slot.id,{delayMinutes:slot.delayMinutes,repeatMinutes:0,maxRepeats:null,recovery:slot.recovery,stopOnAck:false}]))}};
  },
 };
}
