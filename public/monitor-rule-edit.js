import {ADDABLE} from './monitor-rules-table.js';
// Pass/fail rules and locations changed in place on a monitor's page (U15). Every editor is a <details> (a rule's chip, the
// two number chips, "+ Add a rule", "+ Location"): one is open at a time, Esc cancels and Enter saves. Save sends the
// monitor's full definition from the latest refresh with the one change (PATCH /api/monitors/<id>, as Pause does), so each
// save is one new revision; the server's save() is the validator and its message shows in the editor's row.
// root.monitorPage is the monitor page's live state: m and data from the latest refresh, api, action, ui ({adding, errors}),
// area and draw().
const PROBES=['local-a','local-b','local-c'];
// The probes for the ticked locations: each keeps the probe it had, a newly ticked one takes the first free probe. Kept in
// step with assignmentsFor in src/editor/monitor/check-from.mjs, which the console's static modules cannot import.
function assignmentsFor(definition,runnerIds){
 const had=new Map(Object.entries(definition.assignments??{}).filter(([,a])=>runnerIds.includes(a.runnerId)).map(([probe,a])=>[a.runnerId,probe]));
 const free=PROBES.filter(probe=>![...had.values()].includes(probe)),assignments={};
 for(const runnerId of runnerIds)assignments[had.get(runnerId)??free.shift()]={runnerId};
 const probes=Object.keys(assignments).sort();
 return {probes,assignments:Object.fromEntries(probes.map(probe=>[probe,assignments[probe]]))};
}
// A typed status as the API takes it: one code is a number, several codes or ranges a list ("200, 2xx").
const statusValue=text=>{const codes=text.split(',').map(part=>part.trim()).filter(Boolean).map(part=>/^\d{3}$/.test(part)?Number(part):part);return codes.length===1&&typeof codes[0]==='number'?codes[0]:codes};
// A typed JSON value: true, 12 or "12" are JSON; anything else (ok) is text.
const jsonValue=text=>{const value=text.trim();try{return JSON.parse(value)}catch{return value}};
// The definition with one change: a rule's new value (or without it), a number of checks, or the ticked locations.
function changed(m,kind,form,{remove=false}={}){
 const d=m.definition,assertions={...d.assertions},field=name=>form.elements.namedItem(name)?.value??'';
 if(kind==='confirmSlots'||kind==='recoverSlots')return {...d,[kind]:Number(field('value'))};
 if(kind==='locations'){
  const {probes,assignments}=assignmentsFor(d,[...form.querySelectorAll('input[name=location]:checked')].map(box=>box.value));
  return {...d,probes,assignments,failureQuorum:Math.min(d.failureQuorum??1,probes.length),...(m.externalCheck?.own?{canaryUrl:m.externalCheck.own}:{})};
 }
 if(remove)delete assertions[kind];
 else if(kind==='status')assertions.status=statusValue(field('status'));
 else if(kind==='bodyIncludes'||kind==='bodyExcludes')assertions[kind]=field('text');
 else if(kind==='bodyRegex')assertions.bodyRegex={pattern:field('pattern'),flags:field('flags')};
 else if(kind==='header')assertions.header={name:field('name').trim(),equals:field('equals')};
 else if(kind==='json')assertions.json={path:field('path').trim(),equals:jsonValue(field('equals'))};
 else if(kind==='latencyMs')assertions.latencyMs=Math.round(Number(field('seconds'))*1000);
 return {...d,assertions};
}
const COPY={
 locations:{pending:'Saving locations…',success:saved=>`Locations saved as revision ${saved.revision}. Each starts with its next check.`},
 remove:{pending:'Removing the rule…',success:saved=>`Rule removed. Saved as revision ${saved.revision}.`},
 rule:{pending:'Saving the rule…',success:saved=>`Saved as revision ${saved.revision}. The next check uses it.`},
};
// A tick list never goes past its limit and keeps one location ticked. Runs on every change and after every redraw, which
// restores the controls' markup attributes.
export function syncPicker(root){
 const group=root.querySelector('#location-picker .loc-ticks');if(!group)return;
 const boxes=[...group.querySelectorAll('input[name=location]')],ticked=boxes.filter(box=>box.checked).length,limit=Number(group.dataset.limit);
 for(const box of boxes)box.disabled=box.checked?ticked===1:ticked>=limit;
}
function close(page,details,{focus=true}={}){
 const kind=details.dataset.kind;details.open=false;details.querySelector('form')?.reset();
 delete page.ui.errors[kind];
 if(page.ui.adding===kind){page.ui.adding=null;page.draw();if(focus)page.area.querySelector('#add-rule > summary')?.focus();return}
 page.draw();if(focus)details.querySelector('summary')?.focus();
}
async function save(page,details,body,copy){
 const kind=details.dataset.kind,{m,api,action,ui}=page;
 delete ui.errors[kind];
 const result=await action(async()=>{try{return await api(`/api/monitors/${encodeURIComponent(m.id)}`,'PATCH',body)}catch(problem){ui.errors[kind]=problem.message;throw problem}},
  {pending:copy.pending,success:copy.success,onSuccess:()=>{details.open=false;if(ui.adding===kind)ui.adding=null}});
 // Refused: the editor stays open with its message and the typed value, and focus goes back to its first field. A removed
 // rule's row is gone: focus goes to "+ Add a rule", where it can be added again.
 if(result.ok)(details.isConnected?details.querySelector('summary'):page.area.querySelector('#add-rule > summary'))?.focus({preventScroll:true});
 else if(details.isConnected)details.querySelector('form input')?.focus({preventScroll:true});
}
export function bindEditing(root){
 const live=()=>root.monitorPage;
 // One editor open at a time: opening one cancels any other. Opening puts focus in its first field.
 root.addEventListener('toggle',event=>{
  const page=live(),toggled=event.target;if(!toggled.matches?.('details.in-place'))return;
  if(toggled.open){
   for(const other of root.querySelectorAll('details.in-place[open]'))if(other!==toggled)close(page,other,{focus:false});
   if(toggled.id==='location-picker')syncPicker(root);
   toggled.querySelector('input:not(:disabled),.add-menu button')?.focus({preventScroll:true});
  }
  // An open editor's row may span the card; a closed one may not.
  page.refit();
 },true);
 // Esc cancels the open editor from its own fields and from anywhere else on the page (focus left on the page, a column's
 // name, a header button), but not from another field or while a dialog is open; focus goes back to its chip.
 const escape=event=>{
  if(!root.isConnected){removeEventListener('keydown',escape);return}
  if(event.key!=='Escape'||event.defaultPrevented||document.querySelector('dialog[open]'))return;
  const details=root.querySelector('details.in-place[open]'),target=event.target;
  if(!details||(!details.contains(target)&&target.closest?.('input,select,textarea,[contenteditable]')))return;
  event.preventDefault();close(live(),details);
 };
 addEventListener('keydown',escape);
 root.addEventListener('change',event=>{if(event.target.closest('#location-picker'))syncPicker(root)});
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const page=live(),details=button.closest('details.in-place'),act=button.dataset.action;
  if(act==='cancel-edit'&&details)close(page,details);
  else if(act==='remove-rule'&&details)save(page,details,changed(page.m,details.dataset.kind,details.querySelector('form'),{remove:true}),COPY.remove);
  else if(act==='add-rule'&&ADDABLE[button.dataset.rule]){
   details.open=false;page.ui.adding=button.dataset.rule;page.draw();
   root.querySelector(`#edit-${button.dataset.rule} input`)?.focus();
  }else if(act==='open-picker'){const picker=root.querySelector('#location-picker');if(picker)picker.open=true}
 });
 root.addEventListener('submit',event=>{
  const form=event.target.closest('form[data-edit]');if(!form)return;
  event.preventDefault();
  const page=live(),details=form.closest('details.in-place'),kind=form.dataset.edit;
  if(!form.reportValidity())return;
  save(page,details,changed(page.m,kind,form),COPY[kind==='locations'?'locations':'rule']);
 });
}
