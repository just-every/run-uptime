import {dialogFocusReturn} from './notification-dialogs.js';

// Metadata and the last outcome survive console polling; credentials never do.
const state={name:'',days:'90',outcome:null,busy:false,keys:[]};
let currentHost=null;
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node};
const date=value=>value?new Date(value).toLocaleString():'Never';

function showMetricsKey(secret){
 const returnFocus=dialogFocusReturn('create-metrics-key');
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
 currentHost=host;host.id='metrics-tools';host.classList.add('archive-tools');host.setAttribute('aria-labelledby','metrics-heading');
 const heading=element('h3','Metrics export');heading.id='metrics-heading';
 const help=element('p','Create a read-only key for Prometheus or another metrics client. Keys only authorize the metrics export; they cannot change monitors or settings. ');
 const guide=element('a','Metrics guide');guide.href='/docs/metrics';help.append(guide);
 const form=element('form');form.id='metrics-key-form';
 const nameLabel=element('label','Key name'),name=element('input');name.id='metrics-key-name';name.name='name';name.required=true;name.maxLength=100;name.autocomplete='off';name.value=state.name;nameLabel.htmlFor=name.id;nameLabel.append(name);
 const daysLabel=element('label','Days to expiry'),days=element('input');days.id='metrics-key-days';days.name='days';days.type='number';days.min='1';days.max='366';days.step='1';days.required=true;days.value=state.days;daysLabel.htmlFor=days.id;daysLabel.append(days);
 const create=element('button','Create metrics key','primary');create.id='create-metrics-key';create.type='submit';create.disabled=state.busy;
 const status=element('p');status.id='metrics-key-status';status.setAttribute('role','status');
 const list=element('div');list.id='metrics-key-list';
 const showOutcome=()=>{status.textContent=state.outcome?.text??'';status.hidden=!state.outcome;status.className=state.outcome?`ui-callout${state.outcome.error?' error':''}`:''};
 name.oninput=()=>{state.name=name.value};days.oninput=()=>{state.days=days.value};
 const renderList=()=>{
  list.replaceChildren();
  if(!state.keys.length){list.append(element('p','No metrics keys yet.'));return}
  for(const key of state.keys){
   const row=element('section',undefined,'ui-card panel');row.dataset.metricsKey=key.id;
   const label=element('h4',key.name);label.style.overflowWrap='anywhere';
   const scope=element('p',`Scope: ${(key.scopes??[]).join(', ')} (read only)`);
   const details=element('p',`Created: ${date(key.createdAt)} · Expires: ${date(key.expiresAt)} · Last used: ${date(key.lastUsedAt)}`);
   const revoked=Boolean(key.revokedAt),expired=Number(key.expiresAt)<=Date.now();
   const summary=element('p',revoked?`Revoked: ${date(key.revokedAt)}`:expired?'Expired':'Active');
   row.append(label,scope,details,summary);
   if(!revoked){
    const revoke=element('button',`Revoke ${key.name}`);revoke.type='button';revoke.disabled=state.busy;revoke.style.whiteSpace='normal';revoke.style.overflowWrap='anywhere';
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
   // The response token is transferred directly into the dialog's custody.
   create.disabled=false;create.focus();showMetricsKey(result.token);delete result.token;
   state.outcome={text:'Metrics key created. Save the key before closing the dialog.'};
   state.name='';name.value='';state.keys=await api('/api/metrics/keys');
  }catch(error){state.outcome={error:true,text:error.message}}
  finally{state.busy=false;redraw()}
 };
 form.append(nameLabel,daysLabel,create);host.replaceChildren(heading,help,form,status,list);redraw();
 api('/api/metrics/keys').then(keys=>{state.keys=keys;redraw()}).catch(error=>{state.outcome={error:true,text:error.message};redraw()});
}
