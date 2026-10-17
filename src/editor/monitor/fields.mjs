import {fillTlsFields,readTlsFields,showTlsFields} from './tls-fields.mjs';
import {fillMetadata,readMetadata} from './metadata-fields.mjs';
import {additionalAssertions,assembleAssertions} from './definition.mjs';
import {minutesToMilliseconds,secondsToMilliseconds} from './units.mjs';
import {PROTOCOL_TYPES,fillProtocol,readProtocol,showType,checkTypeOf} from './protocol-fields.mjs';
// The monitor fields, shared by the full form and by every proposal row that expands into the same fields. A root is
// the form or a row's copy of the field markup; fields are found by name inside it.
export const FIELD_NAMES=['name','url','method','status','body','bodyExcludes','regexPattern','regexFlags','headerName','headerValue','additional','intervalMinutes','timeoutSeconds','retries','confirmSlots','recoverSlots','freshnessMinutes'];
const control=(root,name)=>root.querySelector(`[name="${name}"]`);
export function fieldValues(definition){
 const {assertions}=definition;
 return {name:definition.name,url:PROTOCOL_TYPES.includes(definition.type)?'':definition.url,method:definition.method??'GET',status:Array.isArray(assertions.status)?assertions.status.join(', '):assertions.status??200,body:assertions.bodyIncludes??'',bodyExcludes:assertions.bodyExcludes??'',regexPattern:assertions.bodyRegex?.pattern??'',regexFlags:assertions.bodyRegex?.flags??'',headerName:assertions.header?.name??'',headerValue:assertions.header?.equals??'',additional:JSON.stringify(additionalAssertions(assertions),null,2),
  intervalMinutes:definition.intervalMs/60000,timeoutSeconds:definition.timeoutMs/1000,retries:definition.retries,confirmSlots:definition.confirmSlots,recoverSlots:definition.recoverSlots,freshnessMinutes:definition.freshnessMs/60000};
}
export function fillFields(root,definition){
 fillMetadata(root,definition);
 fillTlsFields(root,definition);
 const values=fieldValues(definition);
 for(const name of FIELD_NAMES){const element=control(root,name);if(element)element.value=String(values[name])}
 if(control(root,'checkType')){fillProtocol(root,definition);showType(root,checkTypeOf(definition))}else showTlsFields(root);
}
// The definition the fields now describe, on top of the one they were filled from (type, network and the rest pass through).
export function readFields(root,definition){
 const value=name=>control(root,name).value;
 const type=control(root,'checkType')?.value??'http';
 // Settings of other types never travel with the one selected.
 const {url,method,tcp,dns,tls,domain,tlsTrust,request,...rest}=definition;
 const timing={...readMetadata(root,definition),name:value('name'),intervalMs:minutesToMilliseconds(value('intervalMinutes')),timeoutMs:secondsToMilliseconds(value('timeoutSeconds')),freshnessMs:minutesToMilliseconds(value('freshnessMinutes'))};
 for(const name of ['retries','confirmSlots','recoverSlots'])timing[name]=Number(value(name));
 if(PROTOCOL_TYPES.includes(type)){const {settings,assertions}=readProtocol(root,type);return {...rest,...timing,type,[type]:settings,assertions}}
 if(PROTOCOL_TYPES.includes(rest.type))rest.type='http';
 const assertions=assembleAssertions({status:value('status'),body:value('body'),bodyExcludes:value('bodyExcludes'),regexPattern:value('regexPattern'),regexFlags:value('regexFlags'),headerName:value('headerName'),headerValue:value('headerValue'),additional:value('additional')});
 return {...rest,...timing,...readTlsFields(root),url:value('url'),method:value('method'),assertions};
}
// A copy of the form's field cards for one proposal row: no runner boxes (the console assigns those), unique ids, enabled.
export function cloneFields(form,suffix){
 const copy=form.querySelector('.editor-columns').cloneNode(true);
 copy.querySelector('#settings-probes')?.remove();
 // A proposal is an HTTP or keyword monitor: its copy has no type choice and no other type's fields.
 copy.querySelector('[name="checkType"]')?.closest('label')?.remove();copy.querySelector('.type-help')?.remove();
 for(const group of copy.querySelectorAll('.type-fields'))if(group.dataset.types!=='http')group.remove();
 const policy=copy.querySelector('.policy-panel'),heading=document.createElement('h2');heading.textContent='When to alert';policy.prepend(heading);
 const renamed=new Map();
 for(const element of copy.querySelectorAll('[id]')){renamed.set(element.id,`${element.id}-${suffix}`);element.id=renamed.get(element.id)}
 for(const element of copy.querySelectorAll('[aria-describedby],[aria-labelledby]'))for(const attribute of ['aria-describedby','aria-labelledby'])if(element.hasAttribute(attribute))element.setAttribute(attribute,element.getAttribute(attribute).split(/\s+/).map(id=>renamed.get(id)??id).join(' '));
 for(const element of copy.querySelectorAll('[disabled]'))element.disabled=false;
 return copy;
}
export const fieldControls=root=>[...root.querySelectorAll('input,select,textarea')];
