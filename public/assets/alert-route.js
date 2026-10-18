import {escape} from '/console-format.js';
import {dialogFocusReturn} from '/notification-dialogs.js';
import {scopeNames,summaryMarkup,previewMarkup,historyMarkup,contactOptionsMarkup,importMarkup,importMappingMarkup} from './alert-route-markup.js';
export {alertRoutePanel} from './alert-route-markup.js';
const path=id=>`/api/monitors/${encodeURIComponent(id)}/alert-route`;
function styles(){if(document.querySelector('link[href="/assets/alert-route.css"]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/assets/alert-route.css';document.head.append(link)}
function readContactSettings(selected){
 return Object.fromEntries(selected.map(contact=>{
  const row=contact.closest('[data-route-contact]'),setting=key=>row.querySelector(`[data-route-setting=${key}]`);
  const repeatMinutes=Number(setting('repeatMinutes').value);
  return [contact.value,{
   delayMinutes:Number(setting('delayMinutes').value),repeatMinutes,
   maxRepeats:repeatMinutes&&setting('maxRepeats').value!==''?Number(setting('maxRepeats').value):null,
   recovery:setting('recovery').checked,stopOnAck:setting('stopOnAck').checked,
  }];
 }));
}
export function bindAlertRoutePanel(area,monitor,{api,action}){
 styles();const host=area.querySelector('#alert-route-summary'),button=area.querySelector('#edit-alert-route');if(!host||!button)return;
 button.onclick=()=>openAlertRouteDialog({monitor,api,action});
 api(path(monitor.id)).then(data=>{if(!host.isConnected)return;host.innerHTML=summaryMarkup(data);button.disabled=false},error=>{if(host.isConnected){host.textContent=`Alert route unavailable: ${error.message}`;button.disabled=false}});
}
// Attached to document.body, so the normal five-second monitor refresh cannot
// replace the edited form, its preview or the current focus.
export async function openAlertRouteDialog({monitor,api,action}){
 styles();const returnFocus=dialogFocusReturn('edit-alert-route'),dialog=document.createElement('dialog');
 dialog.className='editor notification-dialog alert-route-dialog';dialog.setAttribute('aria-labelledby','route-dialog-heading');
 dialog.innerHTML=`<h2 id="route-dialog-heading">Alert route for ${escape(monitor.definition.name)}</h2><p>Confirmed incidents use the first selected policy: monitor → service → group → installation. Choose inheritance explicitly at each narrower scope.</p><div id="route-dialog-body"><p role="status">Loading current policy…</p></div><p id="route-error" class="form-error" role="alert"></p><div class="buttons"><button type="button" id="route-close">Close</button></div>`;
 let busy=false;
 dialog.querySelector('#route-close').onclick=()=>dialog.close();
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 dialog.addEventListener('close',()=>{dialog.remove();returnFocus()},{once:true});
 document.body.append(dialog);dialog.showModal();
 const body=dialog.querySelector('#route-dialog-body'),error=dialog.querySelector('#route-error');
 try{
  const data=await api(path(monitor.id));if(!dialog.isConnected)return dialog;
  body.innerHTML=`<form id="route-form"><label for="route-scope">Change route for</label><select id="route-scope" name="scope">${data.policies.map(p=>`<option value="${p.scope}" ${p.scope!=='installation'&&!p.value?'disabled':''}>${escape(scopeNames[p.scope])}${p.value&&p.scope!=='monitor'?` — ${escape(p.value)}`:''}</option>`).join('')}</select><p id="route-scope-note"></p><label for="route-mode">Recipient policy</label><select id="route-mode" name="mode"></select><fieldset id="route-contact-fields"><legend>Selected destinations</legend><div id="route-contact-options"></div></fieldset><p id="route-empty-note"></p><button type="submit" id="route-preview-button">Preview route</button></form>${importMarkup(data.recipients)}<section id="route-preview" aria-live="polite" hidden></section><button type="button" id="route-apply" class="primary" disabled>Apply reviewed route</button><details><summary>Current policy and boundaries</summary>${summaryMarkup(data)}<ul>${data.gaps.map(g=>`<li>${escape(g)}</li>`).join('')}</ul><p><a href="/app#notifications">Manage destinations and delivery history</a></p></details>${historyMarkup(data)}`;
  const form=body.querySelector('form'),scope=form.elements.scope,mode=form.elements.mode,fields=body.querySelector('#route-contact-fields'),importForm=body.querySelector('#route-import-form'),review=body.querySelector('#route-preview'),apply=body.querySelector('#route-apply');
  let preview=null;
  const invalidate=()=>{preview=null;review.hidden=true;review.replaceChildren();apply.disabled=true;error.textContent=''};
  const updateContacts=()=>{for(const row of fields.querySelectorAll('[data-route-contact]')){const selected=mode.value==='selected'&&row.querySelector('[name=destination]').checked;row.querySelector('fieldset').disabled=!selected;row.querySelector('[data-route-setting=maxRepeats]').disabled=!selected||Number(row.querySelector('[data-route-setting=repeatMinutes]').value)===0}};
  const updateMode=()=>{updateContacts();fields.disabled=mode.value!=='selected';body.querySelector('#route-empty-note').textContent=mode.value==='selected'?'Selecting no contacts deliberately leaves this scope with no alert recipient.':mode.value==='inherit'?'This scope adds no contacts. The next selected scope supplies the complete recipient list.':'All enabled installation destinations are selected; missing credentials still exclude a contact.'};
  const renderContacts=policy=>{
   const contacts=data.recipients.filter(d=>d.kind||policy.destinationIds.includes(d.id));for(const id of policy.destinationIds)if(!contacts.some(d=>d.id===id))contacts.push({id,name:'Missing or erased destination',enabled:false,credentialsAvailable:false});
   body.querySelector('#route-contact-options').innerHTML=contactOptionsMarkup(contacts,policy);
  };
  const updateScope=()=>{
   const policy=data.policies.find(p=>p.scope===scope.value);
   mode.innerHTML=policy.scope==='installation'?'<option value="all">All enabled destinations</option><option value="selected">Only selected destinations</option>':'<option value="inherit">Inherit from broader scopes</option><option value="selected">Only selected destinations</option>';
   mode.value=policy.mode;
   renderContacts(policy);
   body.querySelector('#route-scope-note').textContent=scope.value==='monitor'?'This setting follows this monitor across label changes.':scope.value==='installation'?'This changes the installation default for every monitor that inherits it.':`This changes every monitor labelled with this ${scope.value}. Monitor selection overrides service; service selection overrides group.`;
   updateMode();invalidate();
  };
  const lock=value=>{busy=value;dialog.setAttribute('aria-busy',String(value));for(const control of dialog.querySelectorAll('button,select,input,textarea'))control.disabled=value;if(!value){updateMode();apply.disabled=!preview;for(const option of scope.options)option.disabled=option.value!=='installation'&&!data.policies.find(p=>p.scope===option.value).value}};
  scope.onchange=updateScope;mode.onchange=()=>{updateMode();invalidate()};fields.onchange=()=>{updateContacts();invalidate()};body.addEventListener('input',()=>{updateContacts();invalidate()});importForm.onchange=invalidate;updateScope();
  const showPreview=result=>{
   preview=result;review.innerHTML=previewMarkup(preview);review.hidden=false;
   for(const button of review.querySelectorAll('[data-route-test]'))button.onclick=async()=>{
    if(busy)return;lock(true);const status=review.querySelector('#route-test-status');
    try{const result=await api(`/api/notifications/destinations/${encodeURIComponent(button.dataset.routeTest)}/test`,'POST',{});status.textContent=`Labelled test queued (${result.eventId}). Check delivery history for the provider outcome.`}catch(problem){status.textContent=problem.message}finally{if(dialog.isConnected)lock(false)}
   };
  };
  let mappingIndex=1;
  body.querySelector('#route-import-add').onclick=()=>{const mappings=body.querySelector('#route-import-mappings');mappings.insertAdjacentHTML('beforeend',importMappingMarkup(data.recipients,mappingIndex++));invalidate();mappings.lastElementChild.querySelector('input').focus()};
  importForm.onclick=event=>{const remove=event.target.closest('[data-remove-mapping]');if(remove){const row=remove.closest('.route-import-mapping'),next=row.nextElementSibling??row.previousElementSibling;row.remove();invalidate();(next?.querySelector('input')??body.querySelector('#route-import-add')).focus()}};
  importForm.onsubmit=async event=>{
   event.preventDefault();if(busy)return;invalidate();
   const mappings=[...importForm.querySelectorAll('.route-import-mapping')].map(row=>[row.querySelector('[name=sourceContactId]').value.trim(),row.querySelector('[name=localDestinationId]').value]);
   if(!mappings.length||mappings.some(([id,destination])=>!id||!destination)){error.textContent='Map each source contact ID to a local destination before previewing.';return}
   if(new Set(mappings.map(([id])=>id)).size!==mappings.length){error.textContent='Use each source contact ID only once.';return}
   const policy=data.policies.find(p=>p.scope===scope.value),input={source:importForm.elements.source.value,document:importForm.elements.document.value,contactMap:Object.fromEntries(mappings),scope:scope.value,expectedRevision:policy.revision};
   lock(true);
   try{
    const result=await api(path(monitor.id)+'/import-preview','POST',input);if(!dialog.isConnected)return;
    scope.value=result.input.scope;updateScope();mode.value=result.input.mode;renderContacts({...data.policies.find(p=>p.scope===scope.value),...result.input});updateMode();showPreview(result);
   }catch(problem){error.textContent=problem.message}finally{if(dialog.isConnected)lock(false)}
  };
  form.onsubmit=async event=>{
   event.preventDefault();if(busy)return;invalidate();
   const policy=data.policies.find(p=>p.scope===scope.value),selected=mode.value==='selected'?[...fields.querySelectorAll('[name=destination]:checked')]:[];
   const input={scope:scope.value,mode:mode.value,expectedRevision:policy.revision,destinationIds:selected.map(c=>c.value),contactSettings:readContactSettings(selected)};
   lock(true);
   try{const result=await api(path(monitor.id)+'/preview','POST',input);if(dialog.isConnected)showPreview(result);
   }catch(problem){error.textContent=problem.message}finally{if(dialog.isConnected)lock(false)}
  };
  apply.onclick=async()=>{
   if(busy||!preview)return;lock(true);const reviewed=preview;let failure='Route could not be saved.';
   try{
    const result=await action(async()=>{try{return await api(path(monitor.id)+'/apply','POST',{...reviewed.input,digest:reviewed.digest})}catch(problem){failure=problem.message;throw problem}}, {pending:'Saving reviewed alert route…',success:'Alert route saved. Existing incidents retain their original recipients.',onSuccess:()=>dialog.close()});
    if(!result.ok&&dialog.isConnected){invalidate();error.textContent=failure+' Close and reopen to read the current policy.'}
   }finally{if(dialog.isConnected)lock(false)}
  };
 }catch(problem){if(dialog.isConnected){body.textContent='';error.textContent=problem.message}}
 return dialog;
}
