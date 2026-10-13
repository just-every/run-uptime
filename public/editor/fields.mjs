import {additionalAssertions,assembleAssertions} from '../editor-definition.mjs';
import {minutesToMilliseconds,secondsToMilliseconds} from '../editor-units.mjs';
// The monitor fields, shared by the full form and by every proposal row that expands into the same fields. A root is
// the form or a row's copy of the field markup; fields are found by name inside it.
export const FIELD_NAMES=['name','url','method','status','body','headerName','headerValue','additional','intervalMinutes','timeoutSeconds','retries','confirmSlots','recoverSlots','freshnessMinutes'];
const control=(root,name)=>root.querySelector(`[name="${name}"]`);
export function fieldValues(definition){
 const {assertions}=definition;
 return {name:definition.name,url:definition.url,method:definition.method,status:assertions.status,body:assertions.bodyIncludes??'',headerName:assertions.header?.name??'',headerValue:assertions.header?.equals??'',additional:JSON.stringify(additionalAssertions(assertions),null,2),
  intervalMinutes:definition.intervalMs/60000,timeoutSeconds:definition.timeoutMs/1000,retries:definition.retries,confirmSlots:definition.confirmSlots,recoverSlots:definition.recoverSlots,freshnessMinutes:definition.freshnessMs/60000};
}
export function fillFields(root,definition){
 const values=fieldValues(definition);
 for(const name of FIELD_NAMES){const element=control(root,name);if(element)element.value=String(values[name])}
}
// The definition the fields now describe, on top of the one they were filled from (type, network and the rest pass through).
export function readFields(root,definition){
 const value=name=>control(root,name).value;
 const assertions=assembleAssertions({status:value('status'),body:value('body'),headerName:value('headerName'),headerValue:value('headerValue'),additional:value('additional')});
 const result={...definition,name:value('name'),url:value('url'),method:value('method'),assertions,intervalMs:minutesToMilliseconds(value('intervalMinutes')),timeoutMs:secondsToMilliseconds(value('timeoutSeconds')),freshnessMs:minutesToMilliseconds(value('freshnessMinutes'))};
 for(const name of ['retries','confirmSlots','recoverSlots'])result[name]=Number(value(name));
 return result;
}
// A copy of the form's field cards for one proposal row: no runner boxes (the console assigns those), unique ids, enabled.
export function cloneFields(form,suffix){
 const copy=form.querySelector('.editor-columns').cloneNode(true);
 copy.querySelector('#settings-probes')?.remove();
 const policy=copy.querySelector('.policy-panel'),heading=document.createElement('h2');heading.textContent='When to alert';policy.prepend(heading);
 const renamed=new Map();
 for(const element of copy.querySelectorAll('[id]')){renamed.set(element.id,`${element.id}-${suffix}`);element.id=renamed.get(element.id)}
 for(const element of copy.querySelectorAll('[aria-describedby],[aria-labelledby]'))for(const attribute of ['aria-describedby','aria-labelledby'])if(element.hasAttribute(attribute))element.setAttribute(attribute,element.getAttribute(attribute).split(/\s+/).map(id=>renamed.get(id)??id).join(' '));
 for(const element of copy.querySelectorAll('[disabled]'))element.disabled=false;
 return copy;
}
export const fieldControls=root=>[...root.querySelectorAll('input,select,textarea')];
