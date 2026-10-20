// The "Up when" rule list of the monitor form, and of each proposal's copy of it: a rule with a value shows, the others
// wait in the Add rule menu. Removing a rule empties its fields, so it is not saved. Status is always there.
const filled=row=>[...row.querySelectorAll('input')].some(input=>input.value.trim());
export function syncRules(root){
 let waiting=0;
 for(const row of root.querySelectorAll('.rule-row[data-rule]')){
  if(row.dataset.rule==='status')continue;
  row.hidden=!filled(row)&&row.dataset.added!=='true';
  const item=root.querySelector(`[data-add-rule="${row.dataset.rule}"]`);if(item)item.hidden=!row.hidden;
  if(row.hidden)waiting++;
 }
 const menu=root.querySelector('.add-rule');if(menu)menu.hidden=waiting===0;
}
export function bindRules(root){
 root.addEventListener('click',event=>{
  const add=event.target.closest('[data-add-rule]'),remove=event.target.closest('[data-remove-rule]');
  if(!add&&!remove)return;
  const row=root.querySelector(`.rule-row[data-rule="${(add??remove).dataset[add?'addRule':'removeRule']}"]`);
  if(add){row.dataset.added='true';syncRules(root);add.closest('details').open=false;row.querySelector('input').focus();return}
  for(const input of row.querySelectorAll('input'))input.value='';
  delete row.dataset.added;syncRules(root);
  root.querySelector('.add-rule summary')?.focus();
  root.dispatchEvent(new Event('input',{bubbles:true}));
 });
}
