import {fillTlsFields,readTlsFields,showTlsFields} from './tls-fields.mjs';
import {fillMetadata,readMetadata} from './metadata-fields.mjs';
import {assembleAssertions,showJsonValue} from './definition.mjs';
import {syncRules} from './rules.mjs';
import {minutesToMilliseconds,secondsToMilliseconds} from './units.mjs';
import {PROTOCOL_TYPES,fillProtocol,readProtocol,showType,checkTypeOf} from './protocol-fields.mjs';
// The monitor fields, shared by the full form and by every proposal row that expands into the same fields. A root is
// the form or a row's copy of the field markup; fields are found by name inside it.
export const FIELD_NAMES=['name','url','method','status','body','bodyExcludes','regexPattern','regexFlags','headerName','headerValue','jsonPath','jsonEquals','latencyMs','intervalMinutes','timeoutSeconds','retries','confirmSlots','recoverSlots','freshnessMinutes'];
const control=(root,name)=>root.querySelector(`[name="${name}"]`);
export function fieldValues(definition){
 const {assertions}=definition;
 return {name:definition.name,url:PROTOCOL_TYPES.includes(definition.type)?'':definition.url,method:definition.method??'GET',status:Array.isArray(assertions.status)?assertions.status.join(', '):assertions.status??200,body:assertions.bodyIncludes??'',bodyExcludes:assertions.bodyExcludes??'',regexPattern:assertions.bodyRegex?.pattern??'',regexFlags:assertions.bodyRegex?.flags??'',headerName:assertions.header?.name??'',headerValue:assertions.header?.equals??'',jsonPath:assertions.json?.path??'',jsonEquals:assertions.json?showJsonValue(assertions.json.equals):'',latencyMs:PROTOCOL_TYPES.includes(definition.type)?'':assertions.latencyMs??'',
  intervalMinutes:definition.intervalMs/60000,timeoutSeconds:definition.timeoutMs/1000,retries:definition.retries,confirmSlots:definition.confirmSlots,recoverSlots:definition.recoverSlots,freshnessMinutes:definition.freshnessMs/60000};
}
export function fillFields(root,definition){
 fillMetadata(root,definition);
 fillTlsFields(root,definition);
 const values=fieldValues(definition);
 for(const name of FIELD_NAMES){const element=control(root,name);if(element)element.value=String(values[name])}
 if(control(root,'checkType')){fillProtocol(root,definition);showType(root,checkTypeOf(definition))}else showTlsFields(root);
 syncRules(root);
}
// The definition the fields now describe, on top of the one they were filled from (type, network and the rest pass through).
export function readFields(root,definition){
 const value=name=>control(root,name).value;
 const type=control(root,'checkType')?.value??'http';
 // Settings of other types never travel with the one selected.
 const {url,method,network:oldNetwork,privateGrantRef:oldGrant,api,mail,tcp,udp,ping,dns,tls,domain,tlsTrust,request,...rest}=definition;
 const privateScope=control(root,'networkScope')?.value==='private'&&['http','tcp'].includes(type);
 const timing={...(privateScope?{network:'private',privateGrantRef:control(root,'privateGrantRef').value.trim()}:{}),...readMetadata(root,definition),name:value('name'),intervalMs:minutesToMilliseconds(value('intervalMinutes')),timeoutMs:secondsToMilliseconds(value('timeoutSeconds')),freshnessMs:minutesToMilliseconds(value('freshnessMinutes'))};
 for(const name of ['retries','confirmSlots','recoverSlots'])timing[name]=Number(value(name));
 if(type==='mail')return {...rest,...timing,type,network:'public',mail:JSON.parse(control(root,'mailSettings').value),assertions:{}};
 if(type==='api'){const ref=control(root,'apiCredentialRef').value.trim();return {...rest,...timing,type,network:'public',url:control(root,'apiUrl').value,api:JSON.parse(control(root,'apiSettings').value),...(ref?{request:{credentialRef:ref}}:{}),assertions:{status:200}}}
 if(PROTOCOL_TYPES.includes(type)){const {settings,assertions}=readProtocol(root,type);return {...rest,...timing,type,[type]:settings,assertions}}
 if([...PROTOCOL_TYPES,'api','mail'].includes(rest.type))rest.type='http';
 const assertions=assembleAssertions({status:value('status'),body:value('body'),bodyExcludes:value('bodyExcludes'),regexPattern:value('regexPattern'),regexFlags:value('regexFlags'),headerName:value('headerName'),headerValue:value('headerValue'),jsonPath:value('jsonPath'),jsonEquals:value('jsonEquals'),latencyMs:value('latencyMs')});
 return {...rest,...timing,...readTlsFields(root),url:value('url'),method:value('method'),assertions};
}
// A copy of the form's field cards for one proposal row: no locations (the console assigns those), unique ids, enabled.
// Its rule list is bound by the row (bindRules).
export function cloneFields(form,suffix){
 const copy=form.querySelector('.editor-columns').cloneNode(true);
 copy.querySelector('#settings-probes')?.remove();
 // A proposal is an HTTP or keyword monitor: its copy has no type choice and no other type's fields.
 copy.querySelector('[name="checkType"]')?.closest('label')?.remove();copy.querySelector('.type-help')?.remove();
 for(const group of copy.querySelectorAll('.type-fields'))if(group.dataset.types!=='http')group.remove();
 const renamed=new Map();
 for(const element of copy.querySelectorAll('[id]')){renamed.set(element.id,`${element.id}-${suffix}`);element.id=renamed.get(element.id)}
 for(const element of copy.querySelectorAll('[aria-describedby],[aria-labelledby]'))for(const attribute of ['aria-describedby','aria-labelledby'])if(element.hasAttribute(attribute))element.setAttribute(attribute,element.getAttribute(attribute).split(/\s+/).map(id=>renamed.get(id)??id).join(' '));
 for(const element of copy.querySelectorAll('[disabled]'))element.disabled=false;
 return copy;
}
export const fieldControls=root=>[...root.querySelectorAll('input,select,textarea')];
