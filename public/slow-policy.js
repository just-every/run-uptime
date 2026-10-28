import {escape} from './console-format.js';
import {dialogFocusReturn} from './notification-dialogs.js';
import {patch} from './dom-patch.js';
import {scheduleDescription} from './assets/alert-route-markup.js';

const policyPath=id=>`/api/monitors/${encodeURIComponent(id)}/slow-policy`;
const explanation='Slow notices track response time separately from downtime. They do not open outage incidents or reduce uptime. A latency assertion can still fail a check as down.';
function styles(){
 if(document.querySelector('link[href="/slow-policy.css"]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href='/slow-policy.css';document.head.append(link);
}
function summaryMarkup(slow,destinations){
 if(!slow)return '<p><strong>Slow notices are off.</strong></p>';
 const evaluation=slow.mode==='percentile'?`p${slow.percentile} over ${slow.slots} scheduled slots`:`${slow.slots} consecutive scheduled slot${slow.slots===1?'':'s'}`;
 const locations=slow.locations==='all'?'All configured locations':slow.locations.join(', ');
 const route=slow.destinationIds===null?'Inherit this monitor’s alert route':!slow.destinationIds.length?'No recipients selected':destinations?slow.destinationIds.map(id=>destinations.find(d=>d.id===id)?.name??'Missing destination').join(', '):`${slow.destinationIds.length} selected destination${slow.destinationIds.length===1?'':'s'}`;
 const schedules=destinations&&slow.destinationIds?.length?`<details><summary>Contact schedules</summary><ul>${slow.destinationIds.map(id=>`<li>${escape(destinations.find(d=>d.id===id)?.name??'Missing destination')}: ${escape(scheduleDescription(slow.contactSettings?.[id]))}</li>`).join('')}</ul></details>`:'';
 return `<p><strong>Slow notices are on.</strong> Above ${escape(slow.thresholdMs)} ms · ${escape(evaluation)}.</p><p>Locations: ${escape(locations)}.</p><p>Recipients: ${escape(route)}.</p>${schedules}`;
}
export function slowPolicyPanel(monitor){
 if(monitor.definition.type==='heartbeat')return '';
 return `<section class="ui-card panel slow-policy-panel" aria-labelledby="slow-policy-heading" data-owned="${escape(monitor.id)}"><h2 id="slow-policy-heading">Slow-response notices</h2><div id="slow-policy-summary" role="status">${summaryMarkup(monitor.definition.slow)}</div><button type="button" id="edit-slow-policy">Edit slow-response policy</button></section>`;
}
function locationMarkup(probes,slow){
 const selected=slow?.locations==='all'?[]:slow?.locations??[];
 return probes.map((probe,index)=>`<label class="slow-choice" for="slow-location-${index}"><input type="checkbox" name="location" id="slow-location-${index}" value="${escape(probe)}" ${selected.includes(probe)?'checked':''}><span>${escape(probe)}</span></label>`).join('');
}
function contactScheduleMarkup(prefix,name,settings={}){
 return `<fieldset class="slow-contact-schedule"><legend>Schedule for ${escape(name)}</legend><div class="slow-field-grid">
 <label class="slow-field" for="${prefix}-delay">Delay (minutes)<input id="${prefix}-delay" data-slow-setting="delayMinutes" type="number" min="0" max="1440" step="1" required value="${escape(settings.delayMinutes??0)}"></label>
 <label class="slow-field" for="${prefix}-repeat">Repeat every (minutes; 0 = off)<input id="${prefix}-repeat" data-slow-setting="repeatMinutes" type="number" min="0" max="1440" step="1" required value="${escape(settings.repeatMinutes??0)}"></label>
 <label class="slow-field" for="${prefix}-max">Maximum repeats (blank = unlimited)<input id="${prefix}-max" data-slow-setting="maxRepeats" type="number" min="1" max="1000" step="1" value="${escape(settings.maxRepeats??'')}"></label></div>
 <label class="slow-choice" for="${prefix}-recovery"><input id="${prefix}-recovery" data-slow-setting="recovery" type="checkbox" ${settings.recovery===false?'':'checked'}><span>Send slow-recovered notice</span></label>
 <label class="slow-choice" for="${prefix}-ack"><input id="${prefix}-ack" data-slow-setting="stopOnAck" type="checkbox" ${settings.stopOnAck?'checked':''}><span>Stop repeats on acknowledgement</span></label></fieldset>`;
}
function destinationMarkup(destinations,slow){
 const ids=slow?.destinationIds??[],contacts=[...destinations];
 for(const id of ids)if(!contacts.some(d=>d.id===id))contacts.push({id,name:'Missing or erased destination',enabled:false});
 return contacts.length?contacts.map((destination,index)=>{
  const prefix=`slow-destination-${index}`;
  return `<div class="slow-contact" data-slow-contact><label class="slow-choice" for="${prefix}"><input type="checkbox" name="destination" id="${prefix}" value="${escape(destination.id)}" ${ids.includes(destination.id)?'checked':''}><span>${escape(destination.name)}${destination.kind?` <span class="slow-choice-detail">(${escape(destination.kind)})</span>`:''}${destination.enabled?'':' <span class="slow-choice-detail">— disabled or unavailable; will not receive notices</span>'}</span></label>${contactScheduleMarkup(prefix,destination.name,slow?.contactSettings?.[destination.id])}</div>`;
 }).join(''):'<p>No local destinations. <a href="/app/settings/alerts">Manage notification destinations</a>.</p>';
}
function formMarkup({definition,destinations,slow}){
 return `<form id="slow-policy-form">
 <label class="slow-choice" for="slow-enabled"><input type="checkbox" id="slow-enabled" name="enabled" ${slow?'checked':''}><span>Enable slow-response notices</span></label>
 <fieldset id="slow-settings"><legend>Slow-response policy</legend>
 <label class="slow-field" for="slow-threshold">Response-time threshold (milliseconds)<input id="slow-threshold" name="thresholdMs" type="number" min="1" max="${escape(Math.min(600000,definition.timeoutMs-1))}" step="1" required value="${escape(slow?.thresholdMs??'')}" aria-describedby="slow-threshold-help"></label>
 <p class="ui-helper" id="slow-threshold-help">Enter a whole-millisecond threshold below this check’s saved timeout (${escape(definition.timeoutMs)} ms). A response that times out cannot confirm Slow.</p>
 <div class="slow-field-grid"><label class="slow-field" for="slow-mode">Evaluation mode<select id="slow-mode" name="mode"><option value="consecutive" ${slow?.mode==='percentile'?'':'selected'}>Consecutive slow slots</option><option value="percentile" ${slow?.mode==='percentile'?'selected':''}>Percentile over a slot window</option></select></label>
 <label class="slow-field" for="slow-slots"><span id="slow-slots-label">Consecutive scheduled slots</span><input id="slow-slots" name="slots" type="number" min="1" max="100" step="1" required value="${escape(slow?.slots??'')}"></label>
 <label class="slow-field" for="slow-percentile">Percentile<select id="slow-percentile" name="percentile">${[50,95,99].map(value=>`<option value="${value}" ${value===(slow?.percentile??95)?'selected':''}>p${value}</option>`).join('')}</select></label></div>
 <p class="ui-helper" id="slow-mode-help" aria-live="polite"></p>
 <label class="slow-field" for="slow-location-mode">Locations<select id="slow-location-mode" name="locationMode"><option value="all" ${!slow||slow.locations==='all'?'selected':''}>All configured locations</option><option value="selected" ${slow&&slow.locations!=='all'?'selected':''}>Selected locations</option></select></label>
 <fieldset id="slow-locations"><legend>Locations to evaluate</legend>${locationMarkup(definition.probes,slow)}</fieldset>
 <label class="slow-field" for="slow-route-mode">Recipients for Slow and slow-recovered notices<select id="slow-route-mode" name="routeMode"><option value="inherit" ${slow?.destinationIds==null?'selected':''}>Inherit this monitor’s alert route</option><option value="selected" ${slow?.destinationIds!=null?'selected':''}>Only selected destinations</option></select></label>
 <fieldset id="slow-destinations"><legend>Local notification destinations</legend>${destinationMarkup(destinations,slow)}</fieldset>
 <p class="ui-helper" id="slow-route-help" aria-live="polite"></p>
 </fieldset><div class="buttons"><button type="submit" class="primary" id="save-slow-policy">Save slow-response policy</button></div></form>`;
}
function importMarkup(){
 return `<details class="slow-import"><summary>Import Site24x7 threshold profile</summary><p>Paste a saved static Website threshold profile. Choose one source scope and severity. The current Locations selection above maps that scope to local checks; external geography is not inferred. Preview replaces the policy fields for review and does not save.</p>
 <form id="slow-import-form"><label class="slow-field" for="slow-import-document">Saved threshold profile JSON<textarea id="slow-import-document" name="document" rows="8" required spellcheck="false"></textarea></label>
 <div class="slow-field-grid"><label class="slow-field" for="slow-import-scope">Source location scope<select id="slow-import-scope" name="scope" required><option value="">Choose a source scope</option><option value="primary">Primary</option><option value="secondary">Secondary</option></select></label>
 <label class="slow-field" for="slow-import-severity">Source severity<select id="slow-import-severity" name="severity" required><option value="">Choose a source severity</option><option value="2">Trouble (2)</option><option value="3">Critical (3)</option></select></label></div>
 <button type="submit" id="preview-slow-import">Preview imported Slow policy</button></form></details><p id="slow-import-status" role="status" tabindex="-1"></p>`;
}
function updateFields(form){
 const enabled=form.elements.enabled.checked,percentile=form.elements.mode.value==='percentile';
 form.querySelector('#slow-settings').disabled=!enabled;
 form.elements.percentile.disabled=!percentile;
 form.querySelector('#slow-slots-label').textContent=percentile?'Scheduled slots in the window':'Consecutive scheduled slots';
 form.querySelector('#slow-mode-help').textContent=percentile?'Compare the selected percentile with the threshold over a window of 1–100 scheduled slots.':'Require 1–100 consecutive scheduled slots above the threshold. Percentile does not apply in this mode.';
 form.querySelector('#slow-locations').disabled=form.elements.locationMode.value==='all';
 form.querySelector('#slow-destinations').disabled=form.elements.routeMode.value==='inherit';
 form.querySelector('#slow-route-help').textContent=form.elements.routeMode.value==='inherit'?'Use the recipients and contact schedules resolved by this monitor’s alert route.':'Delays begin when Slow is confirmed. Only checked destinations receive notices. Selecting none deliberately leaves Slow notices without a recipient.';
 for(const row of form.querySelectorAll('[data-slow-contact]')){
  const selected=row.querySelector('[name="destination"]').checked;
  row.querySelector('.slow-contact-schedule').disabled=!selected;
  row.querySelector('[data-slow-setting="maxRepeats"]').disabled=!selected||Number(row.querySelector('[data-slow-setting="repeatMinutes"]').value)===0;
 }
}
function readLocations(form){
 const locations=form.elements.locationMode.value==='all'?'all':[...form.querySelectorAll('[name="location"]:checked')].map(input=>input.value);
 if(Array.isArray(locations)&&!locations.length)throw Error('Select at least one location, or choose all configured locations.');
 return locations;
}
function readPolicy(form){
 if(!form.elements.enabled.checked)return null;
 const locations=readLocations(form);
 const selected=[...form.querySelectorAll('[name="destination"]:checked')],inherit=form.elements.routeMode.value==='inherit';
 const slow={thresholdMs:Number(form.elements.thresholdMs.value),mode:form.elements.mode.value,slots:Number(form.elements.slots.value),percentile:Number(form.elements.percentile.value),locations,destinationIds:inherit?null:selected.map(input=>input.value)};
 if(!inherit)slow.contactSettings=Object.fromEntries(selected.map(contact=>{
  const row=contact.closest('[data-slow-contact]'),setting=key=>row.querySelector(`[data-slow-setting="${key}"]`),repeatMinutes=Number(setting('repeatMinutes').value);
  return [contact.value,{delayMinutes:Number(setting('delayMinutes').value),repeatMinutes,maxRepeats:repeatMinutes&&setting('maxRepeats').value!==''?Number(setting('maxRepeats').value):null,recovery:setting('recovery').checked,stopOnAck:setting('stopOnAck').checked}];
 }));
 return slow;
}
function lock(dialog,busy){
 dialog.setAttribute('aria-busy',String(busy));
 for(const control of dialog.querySelectorAll('button,input,select,textarea,fieldset')){
  if(busy){control.dataset.slowDisabled=String(control.disabled);control.disabled=true}
  else if(control.dataset.slowDisabled!==undefined){control.disabled=control.dataset.slowDisabled==='true';delete control.dataset.slowDisabled}
 }
}
async function openDialog(monitor,{api,action}){
 const existing=document.getElementById('slow-policy-dialog');if(existing){existing.focus();return}
 const returnFocus=dialogFocusReturn('edit-slow-policy'),dialog=document.createElement('dialog');
 dialog.id='slow-policy-dialog';dialog.className='editor notification-dialog slow-policy-dialog';
 dialog.setAttribute('aria-labelledby','slow-dialog-heading');dialog.setAttribute('aria-describedby','slow-dialog-description');
 dialog.innerHTML=`<h2 id="slow-dialog-heading">Slow-response policy for ${escape(monitor.definition.name)}</h2><p id="slow-dialog-description">${explanation}</p><div id="slow-dialog-body"><p role="status">Loading current slow-response policy…</p></div><p id="slow-policy-error" class="form-error" role="alert" tabindex="-1"></p><div class="buttons"><button type="button" id="slow-close">Close</button></div>`;
 let busy=false;
 const close=dialog.querySelector('#slow-close'),body=dialog.querySelector('#slow-dialog-body'),error=dialog.querySelector('#slow-policy-error');
 const showError=message=>{error.textContent=message;error.focus()};
 close.onclick=()=>dialog.close();
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 dialog.addEventListener('close',()=>{dialog.remove();returnFocus()},{once:true});
 // Keeping the form on document.body preserves it through monitor polling.
 document.body.append(dialog);dialog.showModal();close.focus();
 const renderForm=data=>{
  body.innerHTML=formMarkup(data)+importMarkup();
  const form=body.querySelector('#slow-policy-form'),importForm=body.querySelector('#slow-import-form');
  form.addEventListener('change',()=>{error.textContent='';updateFields(form)});
  form.addEventListener('input',()=>{error.textContent='';updateFields(form)});updateFields(form);
  if(document.activeElement===close)form.elements.enabled.focus();
  form.onsubmit=async event=>{
   event.preventDefault();if(busy||!form.reportValidity())return;
   let slow;try{slow=readPolicy(form)}catch(problem){showError(problem.message);return}
   busy=true;error.textContent='';lock(dialog,true);
   let failure='The slow-response policy could not be saved.',conflict=false;
   try{
    const result=await action(async()=>{
     try{return await api(policyPath(monitor.id),'POST',{expectedRevision:data.revision,slow})}
     catch(problem){failure=problem.message;conflict=problem.status===409;throw problem}
    },{pending:'Saving slow-response policy…',success:slow?'Slow-response policy saved.':'Slow-response notices turned off.',onSuccess:()=>dialog.close()});
    if(!result.ok&&dialog.isConnected)showError(result.accepted===false?'Another action is still finishing. Try saving again when it completes.':failure+(conflict?' Close and reopen this dialog to read the current settings.':''));
   }catch(problem){if(dialog.isConnected)showError(problem.message)}
   finally{busy=false;if(dialog.isConnected){lock(dialog,false);updateFields(form);if(conflict){form.elements.enabled.disabled=true;form.querySelector('#slow-settings').disabled=true;form.querySelector('#save-slow-policy').disabled=true}}}
  };
  importForm.onsubmit=async event=>{
   event.preventDefault();if(busy||!importForm.reportValidity())return;
   let input;
   try{
    let saved;try{saved=JSON.parse(importForm.elements.document.value)}catch{throw Error('Use valid saved Site24x7 threshold profile JSON.')}
    const selected=readLocations(form);
    input={source:'site24x7',document:saved,scope:importForm.elements.scope.value,severity:Number(importForm.elements.severity.value),locations:selected==='all'?[...data.definition.probes]:selected};
   }catch(problem){showError(problem.message);return}
   busy=true;error.textContent='';lock(dialog,true);
   try{
    const preview=await api(policyPath(monitor.id)+'/import-preview','POST',input);
    const fresh=await api(policyPath(monitor.id));
    if(!dialog.isConnected)return;
    if(fresh.revision!==preview.revision)throw Error('Monitor changed during import preview. Close and reopen this dialog, then preview against the current settings.');
    lock(dialog,false);renderForm({...fresh,slow:preview.slow});
    const status=body.querySelector('#slow-import-status');status.textContent='Imported Slow policy is ready to review. Check the locations and recipients, then choose Save slow-response policy to apply it.';status.focus();
   }catch(problem){if(dialog.isConnected)showError(problem.message)}
   finally{busy=false;if(dialog.isConnected)lock(dialog,false)}
  };
 };
 try{
  const data=await api(policyPath(monitor.id));if(dialog.isConnected)renderForm(data);
 }catch(problem){if(dialog.isConnected){body.replaceChildren();showError(`Slow-response policy unavailable: ${problem.message} Close and reopen this dialog to try again.`)}}
}
function statusMarkup(status){
 if(!status)return '';
 const open=status.kind==='slow';
 return `<p><strong>${open?'Slow is open':'Slow recovered'}</strong> · ${escape(new Date(status.observedAt).toLocaleString())}</p><p>${escape(status.explanation)}</p>${open?`<button type="button" id="acknowledge-slow" ${status.acknowledgedAt?'disabled':''}>${status.acknowledgedAt?'Slow acknowledged':'Acknowledge Slow'}</button>${status.acknowledgedAt?`<p>Acknowledged ${escape(new Date(status.acknowledgedAt).toLocaleString())}.</p>`:''}`:''}`;
}
export function bindSlowPolicyPanel(area,monitor,{api,action}){
 styles();const host=area.querySelector('#slow-policy-summary'),button=area.querySelector('#edit-slow-policy');if(!host||!button)return;
 button.onclick=()=>openDialog(monitor,{api,action});
 api(policyPath(monitor.id)).then(data=>{
  if(!host.isConnected)return;
  patch(host,summaryMarkup(data.slow,data.destinations)+statusMarkup(data.status));
  const ack=host.querySelector('#acknowledge-slow');
  if(ack)ack.onclick=()=>action(()=>api(`/api/monitors/${encodeURIComponent(monitor.id)}/slow-ack`,'POST',{eventId:data.status.id}),{pending:'Acknowledging Slow…',success:'Slow acknowledged. Reminders set to stop on acknowledgement will end; health is unchanged.'});
 },problem=>{if(host.isConnected)host.textContent=`Slow-response policy unavailable: ${problem.message}`});
}
