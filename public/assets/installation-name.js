import {savedLine,failureLine,saveAsYouGo} from '../settings-save.js';

export function updateInstalledName(data){
 const name=data.installationName;
 if(typeof name!=='string'||!name)return;
 const source=document.querySelector('script[data-uptime-brand-script]');if(source)source.dataset.name=name;
 for(const label of document.querySelectorAll('[data-rer-name]'))if(label.textContent!==name)label.textContent=name;
 document.title=name==='Uptime'?name:`${name} · Uptime`;
}

export function mountInstallationName(card,{data,api,refresh}){
 card.innerHTML=`<div class="card-head"><h2 id="installation-name-heading">Installation name</h2>${savedLine('installation-name-saved')}</div><input id="installation-name" name="installationName" required maxlength="120" autocomplete="off" aria-labelledby="installation-name-heading" aria-describedby="installation-name-failure">${failureLine('installation-name-failure')}`;
 const input=card.querySelector('input');input.value=data.installationName;input.disabled=data.access?.role!=='owner';
 const save=saveAsYouGo({saved:card.querySelector('#installation-name-saved'),failure:card.querySelector('#installation-name-failure'),send:async installationName=>{
  const result=await api('/api/installation-name','PATCH',{installationName});
  data.installationName=result.installationName;updateInstalledName(data);await refresh();
 }});
 input.onchange=()=>{void save(input.value)};
}

export function showInstallationName(card,name){
 const input=card.querySelector('input');
 if(!input||input.value===name||document.activeElement===input||['saving','refused'].includes(card.querySelector('.saved').dataset.state))return;
 input.value=name;
}
