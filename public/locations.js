import {escape,icon,ago} from './console-format.js';
import {firstMount} from './dom-patch.js';
import {confirmDestination,containModalKeyboard,dialogFocusReturn} from './notification-dialogs.js';
// Locations (/app#locations): where checks run from. Each location is a runner, named after where it runs
// (src/domain/location-name.ts). The owner renames one, removes one, or adds another. The list is patched on each refresh
// (public/dom-patch.js). The add panel shows the new location's command, with its one-time join key, only until the location
// joins; then it offers to check every monitor from there too, applied by Done. Closing the panel before the location has
// joined (Cancel) removes the location again.
const FRESH_MS=120000;
let adding=null;
const monitorsUsing=(data,runnerId)=>data.monitors.filter(m=>Object.values(m.definition.assignments??{}).some(a=>a.runnerId===runnerId)).length;
export const activeLocations=data=>(data.runner.runners??[]).filter(r=>!r.revokedAt);
function lastSeen(runner,now){
 if(runner.hosted)return '<span class="ui-pill fresh">Hosted</span>';
 if(runner.lastContactAt===null)return '<span class="ui-pill never">Waiting to join</span>';
 return `<span class="ui-pill ${now-runner.lastContactAt<=FRESH_MS?'fresh':'stale'}">${escape(ago(runner.lastContactAt))}</span>`;
}
export function locationsMarkup(data){
 const badge=runner=>runner.builtIn&&!data.runner.hosted?'<span class="location-badge">This computer</span>':runner.runnerId===adding?.runnerId&&runner.lastContactAt!==null?'<span class="location-badge new">Just joined</span>':'';
 const row=runner=>`<tr data-key="location-${escape(runner.runnerId)}"><td data-label="Location"><span class="location-name">${escape(runner.networkLabel)}</span>${badge(runner)}</td><td data-label="Last seen">${lastSeen(runner,data.now)}</td><td data-label="Monitors">${monitorsUsing(data,runner.runnerId)}</td><td class="location-actions"><button type="button" class="ui-link" data-rename="${escape(runner.runnerId)}">Rename<span class="ui-visually-hidden"> ${escape(runner.networkLabel)}</span></button>${runner.hosted?'':`<button type="button" class="ui-link" data-remove="${escape(runner.runnerId)}">Remove<span class="ui-visually-hidden"> ${escape(runner.networkLabel)}</span></button>`}</td></tr>`;
 return `<div class="monitor-list"><table class="ui-table ui-table--stack-md locations-table" id="locations-table" aria-label="Locations"><thead><tr><th scope="col">Location</th><th scope="col">Last seen</th><th scope="col">Monitors</th><th scope="col"><span class="ui-visually-hidden">Actions</span></th></tr></thead><tbody>${activeLocations(data).map(row).join('')}</tbody></table></div>`;
}
// The three steps while a location is being added; once it joins, what it joined as and the offer. Empty otherwise, which
// hides the side column.
export function addPanelMarkup(data){
 if(!adding)return '';
 const joined=activeLocations(data).find(r=>r.runnerId===adding.runnerId&&r.lastContactAt!==null),head='<h2 id="add-location-heading">Add a location</h2>';
 if(joined)return `<section class="ui-card panel add-location" id="add-location" aria-labelledby="add-location-heading">${head}<p class="location-joined" id="location-joined" role="status">${icon('check-circle')}${escape(joined.networkLabel)} joined${joined.networkLabel===adding.name?'':' · named after where it runs'}</p>${checkAllOffer(data,joined.runnerId)}<button type="button" id="add-location-done" class="primary">Done</button></section>`;
 return `<section class="ui-card panel add-location" id="add-location" aria-labelledby="add-location-heading">${head}<ol class="add-steps"><li><h3>Copy this command</h3>${adding.local?'<p class="location-local" id="location-local">Only this computer can reach this Uptime. To add another machine, deploy Uptime or make it reachable over HTTPS.</p>':''}<pre id="location-command">${escape(adding.command)}</pre><button type="button" id="copy-location-command">${icon('copy')}Copy</button></li><li><h3>Run it on the machine to check from</h3><p>It needs Node 22 or later.</p></li><li><h3>It joins here</h3><p class="location-waiting" id="location-waiting" role="status">Waiting for it to join…</p></li></ol><button type="button" id="add-location-done">Cancel</button></section>`;
}
// "Check all monitors from here too", on by default: every monitor that does not check from the new location yet, except one
// already at the most locations a monitor has (three, two for a browser flow), which the line beneath counts.
const full=m=>m.definition.probes.length>=(m.definition.type==='flow'?2:3);
function checkAllOffer(data,runnerId){
 const others=data.monitors.filter(m=>!Object.values(m.definition.assignments??{}).some(a=>a.runnerId===runnerId)),crowded=others.filter(full).length;
 const note=crowded?`<p class="helper ui-helper" id="check-all-note">${crowded===1?'1 monitor already checks':`${crowded} monitors already check`} from the most locations a monitor can.</p>`:'';
 if(others.length===crowded)return note;
 return `<label class="check-all"><input type="checkbox" id="check-all-monitors"${adding.checkAll?' checked':''}>Check all monitors from here too</label>${note}`;
}
const checkedAll=(name,result)=>`${name} now checks ${result.added.length===1?'1 more monitor':`${result.added.length} more monitors`}.${result.refused.length?` Not added: ${result.refused.map(row=>`${row.name} (${row.reason.replace(/\.$/,'')})`).join('; ')}.`:''}`;
export const addingLocation=()=>adding!==null;
// The command the new machine runs: it downloads this installation's runner script and starts it with the one-time join key.
// It needs Node 22 or later and network access to this Uptime, not an Uptime folder.
const command=({origin,joinKey})=>`curl -fsSL ${origin}/uptime-runner.mjs -o uptime-runner.mjs && node uptime-runner.mjs ${origin} ${joinKey}`;
const localOnly=origin=>{try{const host=new URL(origin).hostname;return ['127.0.0.1','localhost','[::1]'].includes(host)||host.endsWith('.localhost')}catch{return false}};
// A new location: the server makes its runner and one-time join key; its name follows from where it joins from.
export async function startAdding({api,action,render}){
 const result=await action(()=>api('/api/runners','POST',{}),{pending:'Adding a location…',success:''});
 if(!result.ok)return;
 adding={runnerId:result.result.runnerId,name:result.result.networkLabel,command:command(result.result),local:localOnly(result.result.origin),checkAll:true};render();
 // Below the list on a narrow screen: bring the panel to the top of the view.
 const panel=document.querySelector('#add-location');
 if(matchMedia('(max-width: 1199px)').matches)panel?.scrollIntoView({block:'start'});
 document.querySelector('#copy-location-command')?.focus({preventScroll:true});
}
// `data` reads the latest overview, so a click acts on the list as it is now.
export function bindLocations({area,right,data,api,action,refresh,render}){
 const table=area.querySelector('#locations-table');
 if(firstMount(table))table.addEventListener('click',event=>{
  const rename=event.target.closest('[data-rename]'),remove=event.target.closest('[data-remove]');
  if(rename)renameDialog({runner:activeLocations(data()).find(r=>r.runnerId===rename.dataset.rename),api,action,refresh});
  if(remove){
   const place=activeLocations(data()).find(r=>r.runnerId===remove.dataset.remove);
   confirmDestination({title:`Remove ${place?.networkLabel??'this location'}?`,explanation:'Its runner stops checking.',button:'Remove',tone:'danger',
    onConfirm:()=>action(()=>api('/api/runners/'+encodeURIComponent(remove.dataset.remove),'DELETE'),{pending:'Removing location…',success:'Location removed.'})});
  }
 });
 const panel=right.querySelector('#add-location');
 if(firstMount(panel)){panel.addEventListener('change',event=>{if(event.target.id==='check-all-monitors')adding.checkAll=event.target.checked});panel.addEventListener('click',async event=>{
  if(event.target.closest('#add-location-done')){
   const runner=activeLocations(data()).find(r=>r.runnerId===adding.runnerId),id=encodeURIComponent(adding.runnerId);
   if(runner?.lastContactAt===null)await action(()=>api('/api/runners/'+id,'DELETE'),{pending:'Cancelling…',success:''});
   // Joined: Done applies the offer in one step. A refusal keeps the panel open to try again.
   else if(runner&&panel.querySelector('#check-all-monitors')?.checked){
    const result=await action(()=>api(`/api/runners/${id}/check-all`,'POST',{}),{pending:'Adding it to your monitors…',success:result=>checkedAll(runner.networkLabel,result)});
    if(!result.ok)return;
   }
   adding=null;render();document.querySelector('#add-location-button')?.focus();return}
  const copy=event.target.closest('#copy-location-command');if(!copy)return;
  try{await navigator.clipboard.writeText(adding.command);copy.lastChild.textContent='Copied'}
  catch{getSelection().selectAllChildren(panel.querySelector('#location-command'));copy.lastChild.textContent='Selected: copy it'}
 })}
}
function renameDialog({runner,api,action,refresh}){
 if(!runner)return;
 const returnFocus=dialogFocusReturn(),dialog=document.createElement('dialog');dialog.className='editor notification-dialog';
 dialog.innerHTML=`<form><h2 id="rename-location-heading">Rename location</h2><label>Name<input id="location-name" name="networkLabel" maxlength="80" required value="${escape(runner.networkLabel)}"></label><div class="buttons"><button type="button" class="secondary" data-cancel>Cancel</button><button type="submit" class="primary">Save</button></div></form>`;
 dialog.id='rename-location-dialog';dialog.setAttribute('aria-labelledby','rename-location-heading');document.body.append(dialog);containModalKeyboard(dialog);
 const form=dialog.querySelector('form'),input=form.elements.networkLabel;
 dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
 form.onsubmit=async event=>{event.preventDefault();dialog.close();await action(()=>api('/api/runners/'+encodeURIComponent(runner.runnerId),'PATCH',{networkLabel:input.value}),{pending:'Renaming location…',success:'Location renamed.'})};
 dialog.addEventListener('close',()=>{dialog.remove();returnFocus();refresh()},{once:true});
 dialog.showModal();input.select();
}
