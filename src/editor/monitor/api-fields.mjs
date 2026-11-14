import {validateApiTransaction} from '../../domain/api-transaction.mjs';
import {parseStatus,parseJsonValue} from './definition.mjs';
import {input,area,select,value,element,scalarFields,readScalar} from './form-controls.mjs';
const phases=['setup','request','cleanup'];
const controls=(root,disabled)=>root.querySelectorAll('input,select,textarea,button').forEach(control=>control.disabled=disabled);
const optional=(title,body,open=false)=>`<details class="step-options"${open?' open':''}><summary>${title}</summary><div class="editor-fields">${body}</div></details>`;
function pairRow(kind,name='',v=''){
 const variable=kind==='variable',header=kind==='header',label=header?'Header name':variable?'Variable name':'Capture name';
 return element(`<div class="transaction-row" data-pair="${kind}"><div class="editor-pair">${input('key',label,name,header?'maxlength="80" required':'maxlength="40" pattern="[A-Za-z][A-Za-z0-9_]{0,39}" required')}${variable?`<div class="editor-pair">${scalarFields('Value',v)}</div>`:input('value',header?'Header value':'Response JSON path',v,header?'maxlength="4096"':'placeholder="$.id" required')}</div><button type="button" data-api-action="remove-row">Remove ${header?'header':variable?'variable':'capture'}</button></div>`);
}
function pairs(kind,title){return `<section class="editor-fields" aria-label="${title}"><h4>${title}</h4><div data-pairs="${kind}"></div><button type="button" data-api-action="add-${kind}">Add ${kind==='extract'?'captured value':kind}</button></section>`;}
function addPairs(root,kind,values={}){const list=root.querySelector(`[data-pairs="${kind}"]`);for(const [name,v] of Object.entries(values))list.append(pairRow(kind,name,v));}
function stepCard(step){
 const a=step.assertions??{status:200};
 const fields=element(`<fieldset class="transaction-step" data-api-step><legend>Step</legend><div class="step-toolbar"><button type="button" data-api-action="up">Move up</button><button type="button" data-api-action="down">Move down</button><button type="button" data-api-action="remove-step">Remove step</button></div><div class="editor-fields">
 ${input('name','Step name',step.name,'maxlength="80" required')}
 <div class="editor-pair">${select('method','Method',['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],step.method??'GET')}${input('url','Request URL',step.url,'maxlength="2048" placeholder="https://api.example.com/health" required')}</div>
 ${optional('Headers and body',pairs('header','Request headers')+area('body','Request body',step.body??'','maxlength="16384" spellcheck="false"')+`<p class="helper ui-helper">Use {{name}} for a previous captured value. Store authentication on your runner; do not paste a secret.</p>`,Boolean(step.headers&&Object.keys(step.headers).length||step.body!==undefined))}
 <section class="editor-fields" aria-label="Step assertions"><h4>Assertions</h4>${input('status','Expected status',Array.isArray(a.status)?a.status.join(', '):a.status??200,'placeholder="200, 2xx or 200-299" required')}
 ${optional('Additional assertions',`<div class="editor-pair">${input('bodyIncludes','Response contains',a.bodyIncludes,'maxlength="200"')}${input('bodyExcludes','Response must not contain',a.bodyExcludes,'maxlength="200"')}</div><div class="editor-pair">${input('regexPattern','Response pattern',a.bodyRegex?.pattern,'maxlength="500"')}${input('regexFlags','Pattern flags',a.bodyRegex?.flags,'maxlength="3"')}</div><div class="editor-pair">${input('headerName','Response header name',a.header?.name,'maxlength="80"')}${input('headerEquals','Response header equals',a.header?.equals,'maxlength="200"')}</div><div class="editor-pair">${input('jsonPath','Response JSON path',a.json?.path,'placeholder="$.ready"')}${input('jsonEquals','Response JSON equals',a.json?JSON.stringify(a.json.equals):'','placeholder="true"')}</div>${input('latencyMs','Responds within (milliseconds)',a.latencyMs,'type="number" min="1" max="60000" step="1"')}`,Object.keys(a).some(key=>key!=='status'))}</section>
 ${optional('Captured values',pairs('extract','Capture response values')+'<p class="helper ui-helper">Name a value and its response JSON path. Later steps can use {{name}}. Captured values stay on the runner.</p>',Boolean(step.extract))}
 ${optional('Live action',select('effect','Required owner grant',[['','No declared live action'],['live-payment','Live payment'],['refund','Refund'],['destructive-write','Destructive write']],step.effect??'')+'<p class="helper ui-helper">Live actions need an active owner grant before the runner can send them.</p>',Boolean(step.effect))}
 </div></fieldset>`);
 // Retain absent versus explicitly empty request bodies when opening an existing definition.
 fields.dataset.bodyPresent=String(step.body!==undefined);
 fields.querySelector('[data-field="body"]').addEventListener('input',()=>{fields.dataset.bodyPresent='true'});
 fields.dataset.headersPresent=String(step.headers!==undefined);
 addPairs(fields,'header',step.headers);addPairs(fields,'extract',step.extract);
 return fields;
}
function renumber(root){
 let total=0;
 for(const phase of phases){const list=root.querySelector(`[data-api-phase="${phase}"]`),steps=[...list.children];for(const [index,step] of steps.entries()){
  step.querySelector('legend').textContent=`${phase==='request'?'Request':phase==='setup'?'Setup':'Cleanup'} ${index+1}`;
  step.querySelector('[data-api-action="up"]').disabled=index===0;step.querySelector('[data-api-action="down"]').disabled=index===steps.length-1;
 }total+=steps.length;}
 root.querySelector('[data-step-count]').textContent=`${total} of 10 steps`;
 root.querySelectorAll('[data-api-action^="add-step-"]').forEach(button=>button.disabled=total>=10);
}
export function syncApi(root){
 const group=root.querySelector('[data-api-builder]');if(!group)return;
 const active=root.querySelector('[name="checkType"]').value==='api';controls(group,!active);if(active)renumber(root);
}
export function fillApi(root,settings){
 if(!root.querySelector('[data-api-builder]'))return;
 const api=settings??{variables:{},steps:[{name:'Health check',phase:'request',url:'',method:'GET',assertions:{status:200}}]};
 for(const phase of phases)root.querySelector(`[data-api-phase="${phase}"]`).replaceChildren(...api.steps.filter(step=>(step.phase??'request')===phase).map(stepCard));
 root.querySelector('[data-pairs="variable"]').replaceChildren();addPairs(root,'variable',api.variables);
 if(!root.dataset.apiBound){root.dataset.apiBound='true';root.addEventListener('click',event=>{
  const button=event.target.closest('[data-api-action]');if(!button)return;
  const action=button.dataset.apiAction,step=button.closest('[data-api-step]');
  if(action.startsWith('add-step-')){
   const phase=action.slice(9),list=root.querySelector(`[data-api-phase="${phase}"]`);if(root.querySelectorAll('[data-api-step]').length>=10)return;
   let number=1;const names=[...root.querySelectorAll('[data-api-step] [data-field="name"]')].map(field=>field.value);while(names.includes(`New ${phase} ${number}`))number++;
   let url='';try{url=new URL('/health',root.querySelector('[name="apiUrl"]').value).href}catch{}
   const added=stepCard({name:`New ${phase} ${number}`,phase,url,method:'GET'});list.append(added);added.querySelector('input').focus();
  }else if(['up','down'].includes(action)){
   const sibling=action==='up'?step.previousElementSibling:step.nextElementSibling;if(sibling){action==='up'?sibling.before(step):sibling.after(step);button.focus()}
  }else if(action==='remove-step'){
   const target=step.nextElementSibling??step.previousElementSibling,phase=step.parentElement.dataset.apiPhase;step.remove();(target?.querySelector('input')??root.querySelector(`[data-api-action="add-step-${phase}"]`)).focus();
  }else if(action==='remove-row'){
   const row=button.closest('[data-pair]'),kind=row.dataset.pair,list=row.parentElement;row.remove();list.parentElement.querySelector(`[data-api-action="add-${kind}"]`).focus();
  }else if(action.startsWith('add-')){
   const kind=action.slice(4),list=button.parentElement.querySelector(`[data-pairs="${kind}"]`),row=pairRow(kind);list.append(row);row.querySelector('input').focus();
  }
  syncApi(root);root.querySelector('[data-api-feedback]').textContent=action==='up'||action==='down'?'Step order updated.':action.startsWith('remove')?'Removed.':'Added.';
 });}
 syncApi(root);
}
function readPairs(root,kind){
 const out={};for(const row of root.querySelector(`[data-pairs="${kind}"]`).children){const key=value(row,'key').trim();if(!key)throw Error('Enter a name for each header, variable or captured value.');if(Object.hasOwn(out,key))throw Error(`Duplicate ${kind} name: ${key}`);Object.defineProperty(out,key,{value:kind==='variable'?readScalar(row):value(row,'value'),enumerable:true});}return out;
}
function readStep(root,phase){
 const v=field=>value(root,field),status=parseStatus(v('status')),assertions={status};
 for(const key of ['bodyIncludes','bodyExcludes'])if(v(key))assertions[key]=v(key);
 if(v('regexFlags')&&!v('regexPattern'))throw Error('Enter a response pattern before its flags.');
 if(v('regexPattern'))assertions.bodyRegex={pattern:v('regexPattern'),flags:v('regexFlags')};
 if(v('headerEquals')&&!v('headerName'))throw Error('Enter a response header name.');
 if(v('headerName'))assertions.header={name:v('headerName'),equals:v('headerEquals')};
 if(Boolean(v('jsonPath'))!==Boolean(v('jsonEquals')))throw Error('Enter both a response JSON path and the value it must equal.');
 if(v('jsonPath'))assertions.json={path:v('jsonPath'),equals:parseJsonValue(v('jsonEquals'))};
 if(v('latencyMs'))assertions.latencyMs=Number(v('latencyMs'));
 const headers=readPairs(root,'header'),extract=readPairs(root,'extract'),body=v('body');
 return {name:v('name'),phase,url:v('url').trim(),method:v('method'),...(Object.keys(headers).length||root.dataset.headersPresent==='true'?{headers}:{}),...(body||root.dataset.bodyPresent==='true'?{body}:{}),assertions,...(Object.keys(extract).length?{extract}:{}),...(v('effect')?{effect:v('effect')}:{})};
}
export function readApi(root){
 const steps=phases.flatMap(phase=>[...root.querySelector(`[data-api-phase="${phase}"]`).children].map(step=>readStep(step,phase)));
 return validateApiTransaction({variables:readPairs(root,'variable'),steps},{startUrl:root.querySelector('[name="apiUrl"]').value});
}
