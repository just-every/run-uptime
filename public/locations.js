import {escape,icon,ago} from './console-format.js';
import {firstMount} from './dom-patch.js';
// Locations (/app#locations): where checks run from. Each location is a runner, named after where it runs
// (src/domain/location-name.ts). The owner renames one, removes one, or adds another. The list is patched on each refresh
// (public/dom-patch.js); the add panel keeps the new location's command, whose key is shown only there, until Done.
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
// The three steps while a location is being added; empty otherwise, which hides the side column.
export function addPanelMarkup(data){
 if(!adding)return '';
 const joined=activeLocations(data).find(r=>r.runnerId===adding.runnerId&&r.lastContactAt!==null);
 return `<section class="ui-card panel add-location" id="add-location" aria-labelledby="add-location-heading"><h2 id="add-location-heading">Add a location</h2><ol class="add-steps"><li><h3>Copy this command</h3><pre id="location-command">${escape(adding.command)}</pre><button type="button" id="copy-location-command">${icon('copy')}Copy</button></li><li><h3>Run it on the new machine</h3><p>In an Uptime folder, with Node 22.</p></li><li><h3>It joins here</h3>${joined?`<p class="location-joined" id="location-joined" role="status">${icon('check-circle')}${escape(joined.networkLabel)} joined</p>`:'<p class="location-waiting" id="location-waiting" role="status">Waiting for it to join…</p>'}</li></ol><button type="button" class="primary" id="add-location-done">Done</button></section>`;
}
export const addingLocation=()=>adding!==null;
function command(runner){
 const quote=value=>"'"+String(value).replaceAll("'","'\"'\"'")+"'";
 const settings={UPTIME_CONTROL_ORIGIN:window.location.origin,UPTIME_RUNNER_ID:runner.runnerId,UPTIME_RUNNER_KEY:runner.key};
 if(window.location.protocol==='http:'&&window.location.hostname==='127.0.0.1')settings.UPTIME_LOCAL_REVIEW='true';
 return Object.entries(settings).map(([name,value])=>`export ${name}=${quote(value)}`).join('\n')+'\nnode runners/src/private-runner.mjs';
}
// A new location: the server makes its runner and key; its name follows from where it joins from.
export async function startAdding({api,action,render}){
 const result=await action(()=>api('/api/runners','POST',{}),{pending:'Adding a location…',success:'Run the command on the machine you want to check from.'});
 if(!result.ok)return;
 adding={runnerId:result.result.runnerId,command:command(result.result)};render();
 document.querySelector('#copy-location-command')?.focus();
}
// `data` reads the latest overview, so a click acts on the list as it is now.
export function bindLocations({area,right,data,api,action,refresh,render}){
 const table=area.querySelector('#locations-table');
 if(firstMount(table))table.addEventListener('click',event=>{
  const rename=event.target.closest('[data-rename]'),remove=event.target.closest('[data-remove]');
  if(rename)renameDialog({runner:activeLocations(data()).find(r=>r.runnerId===rename.dataset.rename),api,action,refresh});
  if(remove){
   if(!confirm('Remove this location? Its runner stops checking.'))return;
   action(()=>api('/api/runners/'+encodeURIComponent(remove.dataset.remove),'DELETE'),{pending:'Removing location…',success:'Location removed.'});
  }
 });
 const panel=right.querySelector('#add-location');
 if(firstMount(panel))panel.addEventListener('click',async event=>{
  if(event.target.closest('#add-location-done')){adding=null;render();document.querySelector('#add-location-button')?.focus();return}
  const copy=event.target.closest('#copy-location-command');if(!copy)return;
  try{await navigator.clipboard.writeText(adding.command);copy.lastChild.textContent='Copied'}
  catch{getSelection().selectAllChildren(panel.querySelector('#location-command'));copy.lastChild.textContent='Selected: copy it'}
 });
}
function renameDialog({runner,api,action,refresh}){
 if(!runner)return;
 const dialog=document.createElement('dialog'),form=document.createElement('form'),title=document.createElement('h3'),label=document.createElement('label'),input=document.createElement('input'),buttons=document.createElement('p'),save=document.createElement('button'),cancel=document.createElement('button');
 const returnTo=document.activeElement;
 dialog.id='rename-location-dialog';title.id='rename-location-heading';title.textContent='Rename location';dialog.setAttribute('aria-labelledby',title.id);
 input.id='location-name';input.name='networkLabel';input.required=true;input.maxLength=80;input.value=runner.networkLabel;label.append('Name',input);
 save.type='submit';save.className='primary';save.textContent='Save';cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();
 buttons.className='dialog-actions';buttons.append(save,cancel);form.append(title,label,buttons);dialog.append(form);document.body.append(dialog);
 form.onsubmit=async event=>{event.preventDefault();dialog.close();await action(()=>api('/api/runners/'+encodeURIComponent(runner.runnerId),'PATCH',{networkLabel:input.value}),{pending:'Renaming location…',success:'Location renamed.'})};
 dialog.addEventListener('close',()=>{dialog.remove();returnTo?.focus?.();refresh()},{once:true});
 dialog.showModal();input.select();
}
