import {escape,icon} from './console-format.js';
import {patch} from './dom-patch.js';
import {saveAsYouGo,savedLine,failureLine} from './settings-save.js';
// Root-cause categories (Settings › Alerts): the choices an incident's root cause offers (GET and PATCH
// /api/incident-settings, versioned). Each is a chip whose × removes it from future choices only; an incident keeps the
// category it was given (public/incident-work-markup.js names it as removed). + Add category opens one field, and Enter
// adds it. Both save at once and quietly; a refusal keeps the chip or the typed name, says why and offers Retry, and a list
// changed elsewhere is read again first. The card fills itself (data-owned), so a typed name survives the console's refresh.
const slug=label=>label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
export function mountCategories(card,{api}){
 let settings=null;
 card.innerHTML=`<div class="card-head"><h2 id="categories-heading">Root-cause categories</h2>${savedLine('categories-saved')}</div><ul class="category-chips" aria-labelledby="categories-heading"><li class="rows-note">Reading categories…</li></ul><button type="button" class="ui-link add-category" aria-expanded="false" aria-controls="category-add" hidden>+ Add category</button><form class="category-add" id="category-add" novalidate hidden><label for="category-name">New category</label><div class="field-row"><input id="category-name" name="label" maxlength="100" autocomplete="off" aria-describedby="category-name-note"><button type="submit" class="ui-compact">Add</button></div><p class="settings-failure" id="category-name-note" hidden></p></form>${failureLine('categories-failure')}`;
 const chips=card.querySelector('.category-chips'),opener=card.querySelector('.add-category'),form=card.querySelector('.category-add'),field=form.elements.label,note=card.querySelector('#category-name-note');
 const draw=()=>patch(chips,settings.categories.map(c=>`<li class="category-chip" data-key="category-${escape(c.id)}"><span id="category-label-${escape(c.id)}">${escape(c.label)}</span><button type="button" class="category-remove" data-remove-category="${escape(c.id)}" aria-label="Remove category" title="Remove category" aria-describedby="category-label-${escape(c.id)}">${icon('x')}</button></li>`).join(''));
 const say=text=>{note.textContent=text;note.hidden=!text};
 // A change is an operation on the list as it is when it is sent, so Retry after a refresh applies it to the current list.
 async function send(change){
  const current=settings.categories;
  if(change.remove&&!current.some(c=>c.id===change.remove))return;
  if(change.add&&current.some(c=>c.label.toLowerCase()===change.add.toLowerCase())){finishAdd();return}
  let id=slug(change.add??'')||crypto.randomUUID();for(let n=2;current.some(c=>c.id===id);n++)id=`${slug(change.add)}-${n}`;
  const categories=change.add?[...current,{id,label:change.add}]:current.filter(c=>c.id!==change.remove);
  try{settings=await api('/api/incident-settings','PATCH',{version:settings.version,categories})}
  catch(error){if(error.status===409){settings=await api('/api/incident-settings');draw();throw Error('the categories changed elsewhere since this page read them. Retry applies your change to the current list')}throw error}
  draw();if(change.add)finishAdd();
 }
 const save=saveAsYouGo({saved:card.querySelector('#categories-saved'),failure:card.querySelector('#categories-failure'),send});
 function finishAdd(){field.value='';say('');form.hidden=true;opener.setAttribute('aria-expanded','false');opener.focus()}
 opener.onclick=()=>{const open=form.hidden;form.hidden=!open;opener.setAttribute('aria-expanded',String(open));if(open)field.focus()};
 form.onsubmit=event=>{
  event.preventDefault();const label=field.value.trim();
  if(!label){say('Type a name for the category.');return}
  const taken=settings.categories.find(c=>c.label.toLowerCase()===label.toLowerCase());
  if(taken){say(`${taken.label} is already a category.`);return}
  say('');void save({add:label});
 };
 field.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();form.hidden=true;opener.setAttribute('aria-expanded','false');opener.focus()}});
 chips.addEventListener('click',event=>{
  const remove=event.target.closest('[data-remove-category]');if(!remove)return;
  const chip=remove.closest('li'),next=chip.nextElementSibling??chip.previousElementSibling;
  void save({remove:remove.dataset.removeCategory}).then(saved=>{if(saved&&!chip.isConnected)(next?.querySelector('button')??opener).focus()});
 });
 api('/api/incident-settings').then(read=>{settings=read;draw();opener.hidden=false},error=>{patch(chips,`<li class="rows-note">${error.status===403?'Only the owner manages root-cause categories.':`Root-cause categories could not be read: ${escape(error.message)}`}</li>`)});
}
