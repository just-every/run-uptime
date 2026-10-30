import {escape} from './console-format.js';
import {mountWebhookEditor} from './webhook-editor.js';
import {containModalKeyboard,dialogFocusReturn,confirmDestination,showSecret,showErasureReceipt} from './notification-dialogs.js';
import {drillLines} from './alert-drills.js';
import {deliveryReason} from './sent-alerts.js';
const path=id=>`/api/notifications/destinations/${encodeURIComponent(id)}`;
// Add destination, and a destination's Edit dialog (Settings › Alerts), with the webhook editor's custom requests. Edit also
// holds what a destination's row does not
// show: Enabled, the request preview (in the webhook editor), the latest test's three lines, Rotate secret (signed webhooks)
// and Delete at its foot, each with today's confirm, one-time secret and erasure receipt. Lists show saved email addresses
// to the owner; URL capabilities and signing secrets are never returned by the list API or reconstructed here.
export function destinationDialog(destination,{notes,api,action}){
 const returnFocus=dialogFocusReturn('add-destination'),dialog=document.createElement('dialog');dialog.className='editor notification-dialog destination-dialog';
 const email=destination?.kind==='email',recover=destination?.credentialsAvailable===false,signed=destination?.kind==='webhook'&&!recover&&destination.webhookSigning!==false;
 const fields=destination?(email?`<label>Email address<input name="address" type="email" autocomplete="off" required value="${escape(destination.address??'')}"></label>`:`<label>${recover?'Re-enter destination URL':'Replacement destination URL (optional)'}<input name="url" type="url" autocomplete="off" ${recover?'required':''} placeholder="https://hooks.example.com/..."></label><p class="ui-helper">The stored URL stays private. ${recover?'Enter the URL to restore sending.':'Leave this blank to keep it, or enter a replacement URL.'} Replacing it cancels queued sends using the old credentials.${destination.kind==='webhook'?' Save the new signing secret in your receiver.':''}</p>`):`<div class="dialog-field"><label for="destination-kind">Type</label><select id="destination-kind" name="kind"><option value="email">Email</option><option value="webhook">Webhook</option><option value="slack">Slack incoming webhook</option></select></div><label id="destination-address-label">Email address<input name="address" type="email" autocomplete="email" required value="${escape(notes.ownerEmail??'')}"></label><label id="destination-url-label" hidden>Destination URL<input name="url" type="url" autocomplete="off" placeholder="https://hooks.example.com/..." disabled></label><p id="destination-privacy" class="ui-callout" hidden>Use a public HTTPS URL. URLs and signing secrets do not appear in lists or archives.</p>`;
 const latest=destination?.latestDrill?`<details class="latest-test"><summary>Latest test</summary>${drillLines(destination,escape,drill=>deliveryReason(drill,notes))}</details>`:'';
 const rotate=signed?'<div class="destination-secret"><button type="button" data-rotate-secret>Rotate secret</button><p class="ui-helper">The old secret stops working at once.</p></div>':'';
 dialog.innerHTML=`<form><h2 id="destination-dialog-title">${destination?`Edit ${escape(destination.name)}`:'Add destination'}</h2><label>Name (optional)<input name="name" maxlength="100" value="${escape(destination?.name??'')}"></label>${fields}<label class="enabled-control"><input name="enabled" type="checkbox" ${destination?.enabled===false?'':'checked'}> Enabled</label>${latest}${rotate}<p class="form-error" role="alert"></p><div class="buttons">${destination?'<button type="button" class="danger" data-delete-destination>Delete</button>':''}<button type="button" class="secondary" data-cancel>Cancel</button><button type="submit">${destination?'Save destination':'Create destination'}</button></div></form>`;
 dialog.setAttribute('aria-labelledby','destination-dialog-title');document.body.append(dialog);containModalKeyboard(dialog);dialog.showModal();
 const form=dialog.querySelector('form'),close=()=>dialog.close();dialog.querySelector('[data-cancel]').onclick=close;dialog.addEventListener('close',()=>{dialog.remove();returnFocus()},{once:true});
 const webhook=mountWebhookEditor(form,{destination,api});dialog.addEventListener('close',()=>webhook.clear(),{once:true});
 if(!destination)form.elements.kind.onchange=()=>{const email=form.elements.kind.value==='email';dialog.querySelector('#destination-address-label').hidden=!email;dialog.querySelector('#destination-url-label').hidden=email;dialog.querySelector('#destination-privacy').hidden=email;form.elements.address.disabled=!email;form.elements.address.required=email;form.elements.url.disabled=email;form.elements.url.required=!email;webhook.update()};
 // Rotate and Delete each confirm on top of this dialog; confirming closes it before the action runs.
 dialog.querySelector('[data-rotate-secret]')?.addEventListener('click',()=>confirmDestination({title:`Rotate the secret for ${destination.name}?`,explanation:'The old secret stops working immediately. Queued sends using it are cancelled. Save the new secret and update your receiver before future notifications can verify.',button:'Rotate signing secret',onConfirm:async()=>{close();const r=await action(()=>api(path(destination.id)+'/rotate','POST',{}),{pending:'Rotating signing secret…',success:'Signing secret rotated. Update your receiver with the new secret.'});if(r.ok)showSecret(r.result.signingSecret,destination.name)}}));
 dialog.querySelector('[data-delete-destination]')?.addEventListener('click',()=>confirmDestination({title:`Delete ${destination.name}?`,explanation:'Its name, address, credentials and delivery history will be permanently erased. The anonymous audit remains.',button:'Delete destination',tone:'danger',onConfirm:async()=>{close();const result=await action(()=>api(path(destination.id),'DELETE'),{pending:'Erasing destination…',success:'Destination and dependent delivery records erased.'});if(result.ok)showErasureReceipt(result.result.receipt)}}));
 form.onsubmit=async event=>{
  event.preventDefault();const values={name:form.elements.name.value,enabled:form.elements.enabled.checked};
  if(destination){if(email)values.address=form.elements.address.value;else if(form.elements.url.value.trim())values.url=form.elements.url.value.trim()}
  else{values.kind=form.elements.kind.value;values[values.kind==='email'?'address':'url']=form.elements[values.kind==='email'?'address':'url'].value}
  const kind=destination?.kind??values.kind;values.name=values.name.trim()||(kind==='email'?`Email ${values.address}`:kind==='slack'?'Slack':'Webhook').slice(0,100);
  try{Object.assign(values,webhook.read())}catch(error){dialog.querySelector('.form-error').textContent=error.message;return}
  let result,failure;
  const response=await action(async()=>{try{result=await api(destination?path(destination.id):'/api/notifications/destinations',destination?'PATCH':'POST',values)}catch(error){failure=error.message;throw error}close()},{pending:'Saving destination…',success:kind==='email'&&!notes.mailConfigured?'Destination saved. Email is not set up, so it cannot send yet: Set up email is above Destinations.':'Destination saved.'});
  if(response.ok)returnFocus();
  if(response.ok&&result.signingSecret)showSecret(result.signingSecret,values.name);
  else if(!response.ok&&dialog.isConnected)dialog.querySelector('.form-error').textContent=failure||'Destination could not be saved. Check the entered details.';
 };
}
