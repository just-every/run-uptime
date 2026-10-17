import {dialogFocusReturn} from './notification-dialogs.js';

export function notificationPreferencesDialog({timeZone,api,action}){
 const returnFocus=dialogFocusReturn('notification-time-zone'),dialog=document.createElement('dialog');
 dialog.className='editor notification-dialog';dialog.setAttribute('aria-labelledby','notification-zone-heading');
 dialog.innerHTML=`<h2 id="notification-zone-heading">Alert time zone</h2><p>New incidents use this zone in email, Slack and webhook context. An open incident keeps its original zone through recovery.</p><form><label for="notification-zone">IANA time zone</label><input id="notification-zone" name="timeZone" list="notification-zones" required maxlength="80"><datalist id="notification-zones">${['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','UTC'].map(zone=>`<option value="${zone}"></option>`).join('')}</datalist><p class="form-error" role="alert"></p><div class="buttons"><button type="button" class="secondary">Cancel</button><button class="primary">Save time zone</button></div></form>`;
 const input=dialog.querySelector('input');input.value=timeZone;input.oninput=()=>dialog.querySelector('[role=alert]').textContent='';
 dialog.querySelector('button[type=button]').onclick=()=>dialog.close();
 dialog.onclose=()=>{dialog.remove();returnFocus()};
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();const buttons=dialog.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
  const result=await action(()=>api('/api/notifications/preferences','PATCH',{timeZone:input.value.trim()}),{pending:'Saving alert time zone…',success:'Alert time zone saved for new incidents.'});
  if(result.ok)dialog.close();else{dialog.querySelector('[role=alert]').textContent='Choose a valid IANA time zone, such as America/Chicago.';buttons.forEach(b=>b.disabled=false);input.focus()}
 };
 document.body.append(dialog);dialog.showModal();input.focus();
}
