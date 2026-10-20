import {dialogFocusReturn} from './notification-dialogs.js';
import {businessImportSettings} from './business-import-settings.js';
import {escape} from './console-format.js';
import {firstMount} from './dom-patch.js';
// The runner networks part of Runner / archive, patched into the panel on each refresh (public/dom-patch.js): the
// list follows the latest runner contact; the Business imports section and the add-runner form are data-owned, so a
// draft, an open disclosure or a pending request survives the refresh.
export function runnerSettingsMarkup(runners){
 const item=runner=>{const engines=Object.entries(runner.capabilities?.browsers??{}).filter(([,available])=>available).map(([engine])=>engine);
  const text=`${runner.networkLabel} · ${runner.runnerId} · ${runner.revokedAt?'Revoked':runner.lastContactAt?'Contact '+new Date(runner.lastContactAt).toLocaleString():'Never contacted'} · ${engines.length?'Flow browsers: '+engines.join(', '):'No browser for flows'} · ${runner.hosted?'Private networks require a Node runner':runner.capabilities?.privateNetwork?'Private network grants supported':'Update runner for private networks'}${runner.capabilities?.version?' · '+runner.capabilities.version:''}${runner.capabilities?.capacity?' · '+runner.capabilities.capacity+' check at a time':''}`;
  return `<li data-key="runner-${escape(runner.runnerId)}">${escape(text)}${!runner.revokedAt&&!runner.hosted?`<button data-revoke-runner="${escape(runner.runnerId)}">Revoke runner</button>`:''}</li>`};
 return `<section id="business-import-settings" aria-labelledby="business-import-heading" data-owned="business-import"></section><h3 id="runner-networks-heading">Runner networks</h3><ul id="runner-list">${runners.map(item).join('')}</ul><form id="runner-network-form" data-owned="runner-network-form"></form>`;
}
export function bindRunnerSettings(panel,api,refresh){
 businessImportSettings(panel.querySelector('#business-import-settings'),api);
 const form=panel.querySelector('#runner-network-form'),list=panel.querySelector('#runner-list');
 if(firstMount(form)){
  const label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button'),status=document.createElement('p');
  input.id='runner-network-label';label.textContent='Independent network label';input.required=true;input.maxLength=80;label.append(input);button.id='add-runner';button.type='submit';button.textContent='Add runner';status.id='runner-network-status';status.setAttribute('role','status');form.append(label,button,status);
  form.onsubmit=async event=>{event.preventDefault();const returnFocus=dialogFocusReturn();button.disabled=true;try{const result=await api('/api/runners','POST',{networkLabel:input.value});showRunnerCommand(result,refresh,returnFocus)}catch(error){status.textContent=error.message}finally{button.disabled=false}};
 }
 if(firstMount(list))list.addEventListener('click',async event=>{
  const button=event.target.closest('[data-revoke-runner]');if(!button)return;
  if(!confirm('Revoke this runner key? Its future requests will be refused.'))return;
  button.disabled=true;try{await api('/api/runners/'+encodeURIComponent(button.dataset.revokeRunner),'DELETE');await refresh()}catch(error){form.querySelector('#runner-network-status').textContent=error.message;button.disabled=false}
 });
}
function showRunnerCommand(runner,refresh,returnFocus){
 const quote=value=>"'"+String(value).replaceAll("'", "'\"'\"'")+"'";
 const settings={UPTIME_CONTROL_ORIGIN:window.location.origin,UPTIME_RUNNER_ID:runner.runnerId,UPTIME_RUNNER_KEY:runner.key,UPTIME_NETWORK_LABEL:runner.networkLabel};
 if(window.location.protocol==='http:'&&window.location.hostname==='127.0.0.1')settings.UPTIME_LOCAL_REVIEW='true';
 const command=Object.entries(settings).map(([name,value])=>`export ${name}=${quote(value)}`).join('\n')+'\nnode runners/src/private-runner.mjs';
 const dialog=document.createElement('dialog'),title=document.createElement('h3'),help=document.createElement('p'),value=document.createElement('pre'),close=document.createElement('button');
 dialog.id='runner-key-dialog';title.id='runner-key-heading';title.textContent='Start this private runner';dialog.setAttribute('aria-labelledby',title.id);
 help.textContent='From an installed Uptime checkout on this network, paste the complete command into your shell. Keep it private: the key is shown once. Keep the runner running under a supervisor.';
 value.textContent=command;close.textContent='Saved — close';close.onclick=()=>dialog.close();dialog.append(title,help,value,close);document.body.append(dialog);
 dialog.addEventListener('close',async()=>{value.textContent='';dialog.remove();await refresh();returnFocus()},{once:true});dialog.showModal();
}
