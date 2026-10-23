import {escape} from './console-format.js';
import {dialogFocusReturn} from './notification-dialogs.js';
import {localDateTime,localStart,modeDescription,windowDescription} from './maintenance-calendar.js';
import {plannerFields,previewMarkup} from './maintenance-markup.js';
export {maintenancePanel} from './maintenance-markup.js';

function ensureMaintenanceStyles(){if(document.querySelector('link[href="/planned-maintenance.css"]'))return;const style=document.createElement('link');style.rel='stylesheet';style.href='/planned-maintenance.css';document.head.append(style)}
function createDialog(title,openerId){
 const returnFocus=dialogFocusReturn(openerId),dialog=document.createElement('dialog');
 dialog.className='editor notification-dialog maintenance-dialog';
 dialog.setAttribute('aria-labelledby','maintenance-dialog-heading');
 dialog.innerHTML=`<h2 id="maintenance-dialog-heading">${escape(title)}</h2>`;
 dialog.addEventListener('close',()=>{dialog.remove();returnFocus()},{once:true});
 return dialog;
}
function lockDialog(dialog,busy){
 dialog.setAttribute('aria-busy',String(busy));
 for(const control of dialog.querySelectorAll('button,input,select,textarea,fieldset')){
  if(busy){control.dataset.maintenanceDisabled=String(control.disabled);control.disabled=true}
  else if(control.dataset.maintenanceDisabled!==undefined){control.disabled=control.dataset.maintenanceDisabled==='true';delete control.dataset.maintenanceDisabled}
 }
}

// The modal owns its form for its whole lifetime. Console polling never rebuilds
// it, and any edited input invalidates the exact server preview before apply.
export function openMaintenanceDialog({monitors,api,action}){
 if(!monitors?.length)return;ensureMaintenanceStyles();
 const selection=[...monitors],monitorIds=selection.map(m=>m.id);
 const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 const start=localDateTime(Date.now()+3600000,timeZone),fromDate=start.slice(0,10);
 const untilDate=new Date(Date.parse(fromDate+'T00:00:00Z')+28*86400000).toISOString().slice(0,10);
 const dialog=createDialog('Plan maintenance','plan-maintenance');
 dialog.innerHTML+=`<p>Applies to ${selection.length} selected monitor${selection.length===1?'':'s'}:</p><ul class="maintenance-scope" tabindex="0" aria-label="Selected monitors">${selection.map(m=>`<li>${escape(m.definition.name)} <code>${escape(m.id)}</code></li>`).join('')}</ul>
 <form id="maintenance-form">${plannerFields(timeZone,start,fromDate,untilDate)}<p class="form-error" role="alert" id="maintenance-error"></p>
 <section id="maintenance-preview" class="maintenance-preview" aria-labelledby="maintenance-preview-heading" hidden></section>
 <div class="buttons"><button type="button" id="maintenance-close">Cancel</button><button type="submit" id="maintenance-preview-button">Preview occurrences</button><button type="button" class="primary" id="maintenance-apply" disabled>Apply maintenance</button></div></form>`;
 const form=dialog.querySelector('form'),error=dialog.querySelector('#maintenance-error'),review=dialog.querySelector('#maintenance-preview'),apply=dialog.querySelector('#maintenance-apply');
 let preview=null,busy=false;
 const invalidate=()=>{preview=null;review.hidden=true;review.replaceChildren();apply.disabled=true};
 const schedule=()=>{const weekly=form.elements.schedule.value==='weekly';form.querySelector('[data-once]').hidden=weekly;form.elements.startsLocal.disabled=weekly;form.querySelector('[data-weekly]').hidden=!weekly;form.querySelector('[data-weekly]').disabled=!weekly;form.elements.duration.max=weekly?'1440':'527040'};
 form.addEventListener('input',()=>{invalidate();error.textContent=''});
 form.addEventListener('change',()=>{invalidate();error.textContent='';schedule()});
 dialog.querySelector('#maintenance-close').onclick=()=>dialog.close();
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;invalidate();error.textContent='';
  let request;
  try{
   const values=new FormData(form),duration=Number(values.get('duration'));
   const window={id:crypto.randomUUID(),name:String(values.get('name')).trim(),timeZone:String(values.get('timeZone')).trim(),mode:values.get('mode')};
   if(values.get('schedule')==='weekly')Object.assign(window,{weekly:{weekdays:values.getAll('weekday').map(Number),localTime:values.get('localTime'),durationMinutes:duration,fromDate:values.get('fromDate'),untilDate:values.get('untilDate')},dstPolicy:'skip-gap-first-repeat'});
   else{const startsAt=localStart(values.get('startsLocal'),window.timeZone);Object.assign(window,{startsAt,endsAt:startsAt+duration*60000})}
   request={monitorIds,window};
  }catch(problem){error.textContent=problem.message;return}
  busy=true;lockDialog(dialog,true);
  try{
   const result=await api('/api/maintenance/preview','POST',request);
   if(!dialog.isConnected)return;
   preview=result;review.innerHTML=previewMarkup(result);review.hidden=false;
  }catch(problem){if(dialog.isConnected)error.textContent=problem.message}
  finally{busy=false;lockDialog(dialog,false);apply.disabled=!preview;if(preview){review.tabIndex=-1;review.focus({preventScroll:true});review.scrollIntoView({block:'nearest'})}}
 };
 apply.onclick=async()=>{
  if(busy||!preview)return;
  const reviewed=preview;busy=true;error.textContent='';
  let failure='Maintenance could not be applied. Preview again before applying.';
  try{
   const result=await action(async()=>{
    try{return await api('/api/maintenance/apply','POST',{monitorIds:reviewed.scope.monitorIds,window:reviewed.window,from:reviewed.from,to:reviewed.to,digest:reviewed.digest})}
    catch(problem){failure=problem.message;throw problem}
   },{pending:'Applying reviewed maintenance…',success:'Maintenance applied to the reviewed monitors.',onSuccess:()=>dialog.close()});
   if(!result.ok&&dialog.isConnected){invalidate();error.textContent=failure+' Review current schedules and preview again.'}
  }finally{busy=false}
 };
 document.body.append(dialog);dialog.showModal();form.elements.name.focus();
 return dialog;
}

// Fetch the current revision before offering the cancellation for review. The
// subsequent revision guard refuses a concurrent change instead of overwriting it.
export async function cancelMaintenanceWindow({monitor,windowId,api,action}){
 const dialog=createDialog('Cancel maintenance window',`cancel-maintenance-${windowId}`);
 dialog.innerHTML+='<p role="status" id="maintenance-cancel-status">Reading the current window and monitor revision…</p><div class="buttons"><button type="button" id="maintenance-keep">Keep window</button><button type="button" id="maintenance-confirm-cancel" class="danger" disabled>Cancel window</button></div>';
 const status=dialog.querySelector('#maintenance-cancel-status'),confirm=dialog.querySelector('#maintenance-confirm-cancel');
 let busy=false;
 dialog.querySelector('#maintenance-keep').onclick=()=>dialog.close();
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 document.body.append(dialog);dialog.showModal();dialog.querySelector('#maintenance-keep').focus();
 try{
  const overview=await api(`/api/overview?monitor=${encodeURIComponent(monitor.id)}`);
  if(!dialog.isConnected)return;
  const current=overview.monitors.find(m=>m.id===monitor.id),window=current?.definition.maintenanceWindows?.find(w=>w.id===windowId);
  if(!window)throw Error('This maintenance window no longer exists. Close this dialog to refresh the monitor.');
  status.textContent=`Cancel “${window.name}” for ${current.definition.name} (${current.id}), revision ${current.revision}? ${windowDescription(window)}. ${modeDescription(window.mode)}. Past results and maintenance periods remain in history.`;
  confirm.disabled=false;
  confirm.onclick=async()=>{
   if(busy)return;busy=true;let failure='Cancellation could not complete.';
   try{
    const result=await action(async()=>{try{return await api('/api/maintenance/cancel','POST',{monitorIds:[current.id],windowId,revisions:{[current.id]:current.revision}})}catch(problem){failure=problem.message;throw problem}},
     {pending:'Cancelling maintenance window…',success:'Maintenance window cancelled. Historical results remain available.',onSuccess:()=>dialog.close()});
    if(!result.ok&&dialog.isConnected){status.textContent=failure+' Close and reopen cancellation to review the current revision.';confirm.disabled=true}
   }finally{busy=false}
  };
 }catch(problem){if(dialog.isConnected)status.textContent=problem.message}
 return dialog;
}

// Quiet alerts for 15 min starts the quick window (a new revision with maintenanceUntil); End now ends it.
const quietAlerts=(monitor,until,{api,action})=>action(()=>api(`/api/monitors/${encodeURIComponent(monitor.id)}`,'PATCH',{...monitor.definition,maintenanceUntil:until}),until?{pending:'Starting maintenance…',success:`In maintenance until ${new Date(until).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}.`}:{pending:'Ending maintenance…',success:'Maintenance ended.'});
export function bindMaintenancePanel(area,monitor,{api,action}){
 ensureMaintenanceStyles();
 area.querySelector('#plan-maintenance').onclick=()=>openMaintenanceDialog({monitors:[monitor],api,action});
 const quiet=area.querySelector('#quiet-alerts'),end=area.querySelector('#end-quiet-alerts');
 if(quiet)quiet.onclick=()=>quietAlerts(monitor,Date.now()+900000,{api,action});
 if(end)end.onclick=()=>quietAlerts(monitor,0,{api,action});
 for(const button of area.querySelectorAll('[data-cancel-maintenance]'))button.onclick=()=>cancelMaintenanceWindow({monitor,windowId:button.dataset.cancelMaintenance,api,action});
}
