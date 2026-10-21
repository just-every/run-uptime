import {cloneFields,fieldControls,fillFields,readFields} from './fields.mjs';
import {bindRules} from './rules.mjs';
import {curlyQuotes,describeChecks} from './discovery-checks.mjs';
// One proposed monitor: a tick, what it is and why, the checks in plain words, and a chevron that opens the same fields
// as the full form. The row owns its fields; nothing is sent until the owner starts the monitors.
const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
export function createRow({proposal,index,form,onChange}){
 const proposed=proposal.definition,id=`proposal-${index}`;
 const item=element('li','proposal');item.dataset.key=proposal.key;
 const pick=element('input','proposal-pick');pick.type='checkbox';pick.id=`${id}-pick`;pick.checked=proposal.selected;pick.setAttribute('aria-labelledby',`${id}-name`);pick.setAttribute('aria-describedby',`${id}-url ${id}-outcome`);
 const summary=element('label','proposal-summary');summary.htmlFor=pick.id;
 const details=element('details','proposal-details'),edit=element('summary','proposal-edit','Edit');
 const identity=element('span','proposal-identity'),name=element('span','proposal-name'),url=element('span','proposal-url'),reason=element('span','proposal-reason',proposal.reason);
 name.id=`${id}-name`;url.id=`${id}-url`;identity.append(name,url,reason);
 const checks=element('span','proposal-checks'),checksText=element('span','proposal-checks-text');checks.append(element('span','proposal-checks-label','Checks'),checksText);
 summary.append(identity,checks);
 const fields=element('div','proposal-fields'),copy=cloneFields(form,String(index));fields.setAttribute('role','group');fields.setAttribute('aria-labelledby',`${id}-name`);fields.append(copy);
 details.append(edit,fields);
 const outcome=element('p','proposal-outcome');outcome.id=`${id}-outcome`;outcome.setAttribute('role','status');outcome.hidden=true;
 item.append(pick,summary,details,outcome);
 item.addEventListener('click',event=>{if(event.target===item&&!pick.disabled)pick.click()});
 bindRules(copy);fillFields(copy,proposed);
 const original=describeChecks(proposed).join('\n');
 // The summary follows the fields. Until the owner changes a check it keeps the runner's own wording for it.
 function refresh(){
  const text=copy.querySelector('[name=name]').value.trim(),address=copy.querySelector('[name=url]').value.trim();
  name.textContent=text||'Unnamed monitor';url.textContent=address;edit.setAttribute('aria-label',`Edit ${name.textContent}`);
  let words=proposal.checks.map(curlyQuotes);
  try{const now=describeChecks(readFields(copy,proposed));if(now.join('\n')!==original)words=now}catch{}
  checksText.textContent=words.join(' · ');
 }
 copy.addEventListener('input',()=>{refresh();onChange()});
 pick.addEventListener('change',onChange);
 refresh();
 let started=false;
 const row={
  element:item,
  get selected(){return pick.checked},
  get started(){return started},
  get name(){return copy.querySelector('[name=name]').value.trim()},
  get url(){return copy.querySelector('[name=url]').value.trim()},
  read:()=>readFields(copy,proposed),
  open(){details.open=true},
  // The first thing wrong with the fields, opened and ready to fix, or null.
  problem(){
   let message='',bad=fieldControls(copy).find(control=>!control.checkValidity());
   if(bad)message=bad.validationMessage;
   else try{readFields(copy,proposed)}catch(error){message=error.message;bad=copy.querySelector('.rule-row:not([hidden]) input')}
   if(!message)return null;
   details.open=true;return {control:bad,message};
  },
  setOutcome(state,detail){
   outcome.hidden=false;outcome.dataset.state=state;outcome.textContent='';
   if(state==='working')outcome.textContent='Starting this monitor…';
   if(state==='error'){outcome.textContent=detail;details.open=true;}
   if(state==='done'){
    started=true;pick.disabled=true;
    outcome.append('Started. ');
    const link=element('a','ui-link','Open the monitor');link.href=`/app/monitors/${encodeURIComponent(detail.id)}`;outcome.append(link);
    for(const control of fieldControls(copy))control.disabled=true;
    item.classList.add('is-started');
   }
   if(state==='working'||state==='done')details.open=false;
  },
  clearOutcome(){outcome.hidden=true;outcome.textContent='';delete outcome.dataset.state},
 };
 return row;
}
