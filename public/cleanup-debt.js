// API-004: open and resolved cleanup debt for one monitor, and the owner's explicit resolution. It loads once when mounted
// and again only after the owner resolves a debt, so a background refresh never remounts it or clears a typed note.
import {escape,ago} from './console-format.js';
import {firstMount} from './dom-patch.js';
const path=id=>`/api/monitors/${encodeURIComponent(id)}/cleanup-debt`;
const fixtures=d=>d.type==='api'?d.api.steps.some(s=>s.phase==='cleanup'):Boolean(d.flow?.fixtures);
function styles(){
 if(document.querySelector('link[href="/cleanup-debt.css"]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href='/cleanup-debt.css';document.head.append(link);
}
export function cleanupDebtPanel(m){
 if(!fixtures(m.definition))return '';
 return `<section class="ui-card panel cleanup-debt" aria-labelledby="cleanup-debt-heading" data-owned="${escape(m.id)}"><h2 id="cleanup-debt-heading">Cleanup debt</h2><div id="cleanup-debt-list">Loading…</div><p id="cleanup-debt-status" role="status"></p></section>`;
}
const facts=d=>`${escape(d.step)} · ${escape(d.attempts)} ${d.attempts===1?'attempt':'attempts'} · ${escape(d.category)} · ${escape(ago(d.createdAt))}`;
function markup(data){
 const open=data.open.length?`<ul class="cleanup-debt-open">${data.open.map((d,i)=>`<li><p>${facts(d)}</p><form data-debt="${escape(d.id)}"><label for="cleanup-note-${i}">Note</label><input id="cleanup-note-${i}" name="note" maxlength="300" required><button type="submit">Resolve</button></form></li>`).join('')}</ul>`:'<p>No open cleanup debt.</p>';
 const limit=data.open.length>=data.limit?`<p class="cleanup-debt-limit"><strong>Setup is stopped</strong> until you resolve one.</p>`:'';
 const resolved=data.resolved.length?`<details><summary>Resolved (${data.resolved.length})</summary><ul>${data.resolved.map(d=>`<li>${facts(d)} · ${escape(d.note)}</li>`).join('')}</ul></details>`:'';
 return `<p>Teardown that did not finish. Clean up by hand, then resolve. At ${escape(data.limit)} open, setup stops.</p>${limit}${open}${resolved}`;
}
export function mountCleanupDebt(area,m,api){
 const host=area.querySelector('.cleanup-debt');if(!firstMount(host))return;
 styles();
 const list=host.querySelector('#cleanup-debt-list'),status=host.querySelector('#cleanup-debt-status');
 const load=()=>api(path(m.id)).then(data=>{if(host.isConnected)list.innerHTML=markup(data)},error=>{if(host.isConnected)list.textContent=error.message});
 host.addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-debt]');if(!form)return;event.preventDefault();
  const button=form.querySelector('button');button.disabled=true;
  try{await api(`${path(m.id)}/${encodeURIComponent(form.dataset.debt)}/resolve`,'POST',{note:form.querySelector('input').value});status.textContent='Cleanup debt resolved.';await load()}
  catch(error){status.textContent=error.message;button.disabled=false}
 });
 load();
}
