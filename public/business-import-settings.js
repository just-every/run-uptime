import {escape} from './console-format.js';
import {firstMount} from './dom-patch.js';
import {saveAsYouGo,savedLine,failureLine} from './settings-save.js';
// Settings › Integrations · Business imports, shown only on an installation linked to Business. Allowing owner-approved
// imports saves as it changes; revoking a grant signing key asks once, under that key, since it cannot be undone here. The
// card is data-owned (public/settings-integrations.js), so the console's refresh keeps an open disclosure or a pending save.
export function businessImportSettings(card,api){
 if(firstMount(card)){card.hidden=true;mount(card,api)}
}
function mount(card,api){
 card.innerHTML=`<div class="card-head"><h2 id="business-import-heading">Business imports</h2>${savedLine('business-import-saved')}</div><label class="business-import-allow"><input type="checkbox" id="business-import-enabled" name="enabled" aria-describedby="business-import-failure">Allow owner-approved imports from Business</label><details id="business-import-keys"><summary>Grant signing keys</summary><ul class="rows" id="business-import-key-list"></ul></details>${failureLine('business-import-failure')}<p id="business-import-status" class="ui-helper" role="status"></p>`;
 const enabled=card.querySelector('#business-import-enabled'),keys=card.querySelector('#business-import-key-list'),status=card.querySelector('#business-import-status');
 let saved=null;
 async function read(){
  saved=await api('/api/business-import-settings');card.hidden=!saved.linked;enabled.checked=saved.enabled;
  const ids=[...new Set([...saved.keys,...saved.revokedKeyIds])];
  keys.innerHTML=ids.map((id,index)=>{const revoked=saved.revokedKeyIds.includes(id);return `<li data-key-id="${escape(id)}"><div class="who"><strong class="definition-digest">Key ${escape(id)}</strong><small>${revoked?'Revoked: grants it signed are refused':'Trusted'}</small></div>${revoked?'':`<button type="button" class="ui-link quiet-action" data-revoke-key="${index}">Revoke…<span class="ui-visually-hidden"> key ${escape(id)}</span></button>`}</li>`}).join('')||'<li class="rows-note">No signing key IDs are configured.</li>';
  for(const button of keys.querySelectorAll('[data-revoke-key]'))button.onclick=()=>confirmRevoke(button,ids[Number(button.dataset.revokeKey)]);
 }
 const save=saveAsYouGo({saved:card.querySelector('#business-import-saved'),failure:card.querySelector('#business-import-failure'),send:body=>api('/api/business-import-settings','POST',body)});
 // Once a save answered, the card shows the settings as the server now holds them.
 const saveAndRead=async body=>{if(await save(body))await read().catch(error=>{status.className='settings-failure';status.textContent=`Saved, but the settings could not be read again: ${error.message}`})};
 enabled.onchange=()=>{if(saved)void saveAndRead({enabled:enabled.checked,revokedKeyIds:saved.revokedKeyIds})};
 // The one change here with outside effects: it asks under its key, in the page, never in a dialog.
 function confirmRevoke(button,id){
  const ask=document.createElement('div');ask.className='business-import-confirm';
  ask.innerHTML=`<p>Revoke key ${escape(id)}? Business grants signed by it are refused, and this cannot be undone here.</p><div class="btn-row"><button type="button" class="danger">Revoke key</button><button type="button">Keep it</button></div>`;
  const [revoke,keep]=ask.querySelectorAll('button');button.closest('li').append(ask);button.hidden=true;revoke.focus();
  keep.onclick=()=>{ask.remove();button.hidden=false;button.focus()};
  revoke.onclick=()=>{ask.remove();button.hidden=false;void saveAndRead({enabled:saved.enabled,revokedKeyIds:[...saved.revokedKeyIds,id]})};
 }
 read().then(()=>{status.textContent=saved.keys.length?'':'No trusted signing keys are configured.'},error=>{card.hidden=false;status.className='settings-failure';status.textContent=`Business import settings could not be read: ${error.message}`});
}
