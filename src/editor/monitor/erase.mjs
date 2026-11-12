import {api} from './api.mjs';
// Erasure keeps the typed confirmation while the console verifies in place, then
// shows the committed receipt before returning to the monitor list.
const dialogs='/notification-dialogs.js';
function confirmDialog(){
 if(!document.querySelector('link[href="/notifications.css"]'))document.head.append(Object.assign(document.createElement('link'),{rel:'stylesheet',href:'/notifications.css'}));
 return import(/* @vite-ignore */ new URL(dialogs,location.origin).href);
}
export function mountErase(form,{id,name,message}){
 const button=form.querySelector('#erase-monitor');if(!button)return;
 button.hidden=!id;if(!id)return;
 button.onclick=async()=>{
  let confirmErasure,showErasureReceipt;
  try{({confirmErasure,showErasureReceipt}=await confirmDialog())}catch{message.textContent='Couldn’t open the erase confirmation. Try again.';message.setAttribute('data-error','');return}
  confirmErasure({kind:'monitor',name,onConfirm:async typed=>{
   button.disabled=true;message.removeAttribute('data-error');message.textContent='Erasing monitor…';
   try{const {receipt}=await api(`/api/monitors/${encodeURIComponent(id)}/erase`,'POST',{name:typed},{stepUp:true});message.textContent=`Erased ${name}.`;showErasureReceipt(receipt,{onClose:()=>{sessionStorage.setItem('uptime-notice',`Erased ${name}.`);location.assign('/app/monitors')}})}
   catch(error){message.textContent=error.message;message.setAttribute('data-error','');button.disabled=false;button.focus({preventScroll:true});message.scrollIntoView({block:'nearest'})}
  }});
 };
}
