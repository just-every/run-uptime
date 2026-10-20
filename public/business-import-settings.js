import {firstMount} from './dom-patch.js';
// Business imports in Settings. Its section is data-owned (public/settings-view.js), so the console's refresh
// keeps a draft, an open disclosure or a pending request; this fills the section once, when it first appears.
export function businessImportSettings(row,api){
 if(firstMount(row)){row.hidden=true;createSettings(row,api);}
}

function createSettings(row,api){
 const heading=document.createElement('h3'),form=document.createElement('form'),label=document.createElement('label'),enabled=document.createElement('input'),details=document.createElement('details'),summary=document.createElement('summary'),help=document.createElement('p'),keys=document.createElement('div'),actions=document.createElement('p'),save=document.createElement('button'),reload=document.createElement('button'),status=document.createElement('p');
 heading.id='business-import-heading';heading.textContent='Business imports';
 form.id='business-import-form';enabled.type='checkbox';enabled.id='business-import-enabled';enabled.name='enabled';label.append(enabled,'Allow owner-approved imports from Business');
 summary.id='business-import-keys';summary.textContent='Grant signing keys';help.className='ui-helper';help.textContent='Revoke a signing key to refuse Business grants signed by that key. Revocation cannot be undone here.';
 details.append(summary,help,keys);save.type='submit';save.id='business-import-save';save.textContent='Save';reload.type='button';reload.id='business-import-reload';reload.textContent='Reload saved settings';actions.className='settings-buttons';actions.append(save,reload);
 status.id='business-import-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');enabled.setAttribute('aria-describedby',status.id);
 form.append(label,details,actions,status);row.append(heading,form);
 let saved=null,busy=false,checks=[];
 const show=(text,error=false)=>{status.textContent=text;status.className=error?'ui-callout error':'ui-helper'};
 const controls=()=>{enabled.disabled=busy||!saved;save.disabled=busy||!saved;reload.disabled=busy;for(const {input,id}of checks)input.disabled=busy||!saved||saved.revokedKeyIds.includes(id);form.setAttribute('aria-busy',String(busy))};
 const describe=()=>`${saved.enabled?'On. Owner-approved Business imports are allowed.':'Off. Business imports are refused.'}${saved.keys.length?'':' No trusted signing keys are configured.'}${saved.revokedKeyIds.length?` ${saved.revokedKeyIds.length} signing key(s) revoked.`:''}`;
 const changed=()=>show('Unsaved changes. Choose Save to apply them.');
 enabled.onchange=changed;
 async function read(){
  const result=await api('/api/business-import-settings');
  saved=result;row.hidden=!result.linked;enabled.checked=result.enabled;checks=[];keys.replaceChildren();
  for(const [index,id]of [...new Set([...result.keys,...result.revokedKeyIds])].entries()){
   const keyLabel=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),revoked=result.revokedKeyIds.includes(id);
   input.type='checkbox';input.id='business-import-key-'+index;input.name='revokedKeyIds';input.value=id;input.checked=revoked;input.onchange=changed;text.className='definition-digest';text.textContent=`${revoked?'Revoked':'Revoke'} key ${id}`;
   keyLabel.append(input,text);keys.append(keyLabel);checks.push({input,id});
  }
  if(!checks.length){const empty=document.createElement('p');empty.textContent='No signing key IDs are configured.';keys.append(empty)}
 }
 async function load(){
  if(busy)return;busy=true;controls();show('Loading saved Business import settings…');
  try{await read();show(describe())}
  catch(error){row.hidden=false;show(`Could not load Business import settings: ${error.message}`,true)}
  finally{busy=false;controls()}
 }
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!saved)return;
  const body={enabled:enabled.checked,revokedKeyIds:checks.filter(({input})=>input.checked).map(({id})=>id)};
  busy=true;controls();show('Saving Business import settings…');let written=false;
  try{
   await api('/api/business-import-settings','POST',body);written=true;saved=null;
   await read();show('Saved. '+describe());
  }catch(error){saved=null;show(written?`Save succeeded, but saved settings could not be read: ${error.message}. Reload saved settings to check.`:`Could not confirm the save: ${error.message}. Reload saved settings to check before saving again.`,true)}
  finally{busy=false;controls()}
 };
 reload.onclick=load;load();
}
