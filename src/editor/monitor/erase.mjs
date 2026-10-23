import {api} from './api.mjs';
// "Erase monitor…" at the foot of a monitor's Edit page (U21 D1: the monitor page has no More menu, so erasing lives here).
// The confirm is the console's own typed-name dialog (public/notification-dialogs.js confirmErasure), loaded from its public
// path when it is first needed, with the dialog styles the console uses; the erase then returns to the monitor list with
// the console's notice, as it did from the monitor page. The module is imported by its full URL: Vite's dev server leaves
// such an import as it is, where it would add ?import to a path and refuse a public file.
const dialogs='/notification-dialogs.js';
function confirmDialog(){
 if(!document.querySelector('link[href="/notifications.css"]'))document.head.append(Object.assign(document.createElement('link'),{rel:'stylesheet',href:'/notifications.css'}));
 return import(/* @vite-ignore */ new URL(dialogs,location.origin).href);
}
export function mountErase(form,{id,name,message}){
 const button=form.querySelector('#erase-monitor');if(!button)return;
 button.hidden=!id;if(!id)return;
 button.onclick=async()=>{
  let confirmErasure;
  try{({confirmErasure}=await confirmDialog())}catch(error){message.textContent=error.message;message.setAttribute('data-error','');return}
  confirmErasure({kind:'monitor',name,onConfirm:async typed=>{
   button.disabled=true;message.removeAttribute('data-error');message.textContent='Erasing monitor…';
   try{await api(`/api/monitors/${encodeURIComponent(id)}/erase`,'POST',{name:typed});sessionStorage.setItem('uptime-notice',`Erased ${name}.`);location.assign('/app/monitors')}
   catch(error){message.textContent=error.message;message.setAttribute('data-error','');button.disabled=false}
  }});
 };
}
