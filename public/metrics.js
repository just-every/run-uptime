import {ago} from './console-format.js';
import {dialogFocusReturn} from './notification-dialogs.js';
// Settings › Integrations · Metrics keys: read-only keys for Prometheus or another metrics reader. Each key is a row with
// Revoke; Create key opens Key name and Days to expiry in place, and the new key is shown once, in a dialog. What was typed,
// whether the form is open and the last outcome survive console polling; a credential never does.
const state={name:'',days:'90',open:false,outcome:null,busy:false,keys:[]};
let currentHost=null;
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node};
const day=value=>new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short'});

function showMetricsKey(secret){
 const returnFocus=dialogFocusReturn('metrics-key-open');
 const dialog=element('dialog',undefined,'editor notification-dialog secret-dialog');
 const title=element('h2','Save your metrics key');title.id='metrics-secret-heading';dialog.setAttribute('aria-labelledby',title.id);
 const explanation=element('p','This key is shown once. Save it in your metrics client now; it cannot be retrieved after closing. It grants read-only access to the metrics export.');
 const code=element('code',secret,'one-time-secret token');
 const copy=element('button','Copy metrics key','copy-secret');copy.type='button';
 const feedback=element('p',undefined,'copy-feedback');feedback.setAttribute('role','status');
 const close=element('button','I saved it — close','primary secret-close');close.type='button';
 const clear=()=>{
  secret='';code.textContent='';code.remove();feedback.textContent='';
  copy.onclick=null;close.onclick=null;dialog.oncancel=null;dialog.onclose=null;
 };
 const dismiss=()=>{clear();if(dialog.open)dialog.close();dialog.remove();returnFocus()};
 copy.onclick=async()=>{
  try{await navigator.clipboard.writeText(secret);if(dialog.isConnected){feedback.dataset.state='success';feedback.textContent='Copied — save it in your metrics client.'}}
  catch{if(dialog.isConnected){feedback.dataset.state='error';feedback.textContent='Copy could not complete. Select and copy the key above.'}}
 };
 close.onclick=dismiss;dialog.oncancel=event=>{event.preventDefault();dismiss()};dialog.onclose=dismiss;
 dialog.append(title,explanation,code,copy,feedback,close);document.body.append(dialog);dialog.showModal();copy.focus();
}

export function metricsSection(host,api){
 if(!host)return;
 currentHost=host;
 const head=element('div',undefined,'card-head'),heading=element('h2','Metrics keys');heading.id='metrics-heading';
 const open=element('button','Create key','ui-compact');open.type='button';open.id='metrics-key-open';open.setAttribute('aria-controls','metrics-key-form');head.append(heading,open);
 const list=element('ul',undefined,'rows');list.id='metrics-key-list';list.setAttribute('aria-labelledby','metrics-heading');
 const form=element('form',undefined,'metrics-key-form');form.id='metrics-key-form';
 const nameLabel=element('label','Key name'),name=element('input');name.id='metrics-key-name';name.name='name';name.required=true;name.maxLength=100;name.autocomplete='off';name.value=state.name;nameLabel.append(name);
 const daysLabel=element('label','Days to expiry'),days=element('input');days.id='metrics-key-days';days.name='days';days.type='number';days.min='1';days.max='366';days.step='1';days.required=true;days.value=state.days;daysLabel.append(days);
 const fields=element('div',undefined,'field-row');fields.append(nameLabel,daysLabel);
 const create=element('button','Create metrics key','primary');create.id='create-metrics-key';create.type='submit';
 const cancel=element('button','Cancel');cancel.type='button';
 const buttons=element('div',undefined,'btn-row');buttons.append(create,cancel);form.append(fields,buttons);
 const help=element('p','For Prometheus or another metrics reader. ','ui-helper'),guide=element('a','Metrics guide');guide.href='/docs/metrics';help.append(guide);
 const status=element('p');status.id='metrics-key-status';status.setAttribute('role','status');
 const showOutcome=()=>{status.textContent=state.outcome?.text??'';status.hidden=!state.outcome;status.className=state.outcome?.error?'settings-failure':'ui-helper'};
 const showForm=()=>{form.hidden=!state.open;open.setAttribute('aria-expanded',String(state.open));open.hidden=state.open};
 name.oninput=()=>{state.name=name.value};days.oninput=()=>{state.days=days.value};
 open.onclick=()=>{state.open=true;showForm();name.focus()};
 cancel.onclick=()=>{state.open=false;showForm();open.focus()};
 const meta=key=>key.revokedAt?`Revoked ${day(key.revokedAt)}`:Number(key.expiresAt)<=Date.now()?'Expired':`Read-only · expires ${day(key.expiresAt)} · ${key.lastUsedAt?'used '+ago(key.lastUsedAt):'never used'}`;
 const renderList=()=>{
  list.replaceChildren();
  if(!state.keys.length){list.append(element('li','No metrics keys yet.','rows-note'));return}
  for(const key of state.keys){
   const row=element('li'),who=element('div',undefined,'who');row.dataset.metricsKey=key.id;who.append(element('strong',key.name),element('small',meta(key)));row.append(who);
   if(!key.revokedAt){
    const revoke=element('button','Revoke','ui-link quiet-action');revoke.type='button';revoke.disabled=state.busy;revoke.append(element('span',` ${key.name}`,'ui-visually-hidden'));
    revoke.onclick=async()=>{
     state.busy=true;create.disabled=true;revoke.disabled=true;
     try{await api(`/api/metrics/keys/${encodeURIComponent(key.id)}`,'DELETE');state.outcome={text:`Revoked ${key.name}.`};state.keys=await api('/api/metrics/keys')}
     catch(error){state.outcome={error:true,text:error.message}}
     finally{state.busy=false;redraw()}
    };
    row.append(revoke);
   }
   list.append(row);
  }
 };
 const redraw=()=>{if(currentHost===host&&host.isConnected){showOutcome();renderList();create.disabled=state.busy}};
 form.onsubmit=async event=>{
  event.preventDefault();if(state.busy||!form.reportValidity())return;
  const count=Number(days.value);
  if(!Number.isInteger(count)||count<1||count>366){state.outcome={error:true,text:'Enter a whole number of days from 1 to 366.'};showOutcome();return}
  if(!name.value.trim()){state.outcome={error:true,text:'Enter a key name.'};showOutcome();name.focus();return}
  state.busy=true;create.disabled=true;state.outcome={text:'Creating metrics key…'};showOutcome();
  try{
   const result=await api('/api/metrics/keys','POST',{name:name.value.trim(),expiresAt:Date.now()+count*86400000});
   // The response token is transferred directly into the dialog's custody; the form closes behind it.
   state.open=false;showForm();open.focus();showMetricsKey(result.token);delete result.token;
   state.outcome={text:'Metrics key created. Save the key before closing the dialog.'};
   state.name='';name.value='';state.keys=await api('/api/metrics/keys');
  }catch(error){state.outcome={error:true,text:error.message}}
  finally{state.busy=false;redraw()}
 };
 host.replaceChildren(head,list,form,help,status);showForm();redraw();
 api('/api/metrics/keys').then(keys=>{state.keys=keys;redraw()}).catch(error=>{state.outcome={error:true,text:error.message};redraw()});
}
