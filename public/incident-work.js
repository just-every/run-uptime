import {detailMarkup,categoryRow} from './incident-work-markup.js';
import {escape} from './console-format.js';

export function bindIncidentWork(host,api){
 host.addEventListener('click',event=>{
  const button=event.target.closest('[data-incident-work]');
  if(button)openIncidentWork(button.dataset.incidentWork,api,button);
 });
}
async function openIncidentWork(id,api,opener){
 if(document.querySelector('#incident-work-dialog'))return;
 if(!document.querySelector('link[data-incident-work-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/incident-work.css';link.dataset.incidentWorkStyle='';document.head.append(link)}
 const dialog=document.createElement('dialog');dialog.id='incident-work-dialog';dialog.className='incident-work-dialog';dialog.setAttribute('aria-labelledby','incident-work-title');
 dialog.innerHTML='<div class="incident-dialog-head"><h2 id="incident-work-title">Incident notes and follow-up</h2><button type="button" data-close-incident aria-label="Close incident notes">Close</button></div><p data-incident-status role="status" aria-live="polite">Loading incident…</p><p data-incident-error role="alert" hidden></p><div data-incident-content></div>';
 document.body.append(dialog);dialog.showModal();
 dialog.querySelector('[data-close-incident]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{dialog.remove();(opener.isConnected?opener:document.querySelector('button[data-incident-work]'))?.focus({preventScroll:true})});
 const content=dialog.querySelector('[data-incident-content]'),status=dialog.querySelector('[data-incident-status]'),error=dialog.querySelector('[data-incident-error]');
 const endpoint=`/api/incidents/${encodeURIComponent(id)}`;
 let detail,settings,busy=false;
 const showError=problem=>{error.textContent=problem.message??String(problem);error.hidden=false;status.textContent='Changes were not saved.'};
 async function load(){
  [detail,settings]=await Promise.all([api(endpoint),api('/api/incident-settings')]);
  if(!dialog.isConnected)return;
  content.innerHTML=detailMarkup(detail,settings);status.textContent='Incident loaded.';
 }
 async function mutate(path,method,body,message){
  if(busy)return;busy=true;error.hidden=true;status.textContent='Saving…';
  const scroll=dialog.scrollTop;
  content.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{await api(path,method,body);await load();status.textContent=message;dialog.scrollTop=scroll}
  catch(problem){showError(problem);content.querySelectorAll('button').forEach(button=>button.disabled=false)}
  finally{busy=false}
 }
 content.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target,values=Object.fromEntries(new FormData(form));
  if(form.matches('[data-comment-add]'))return mutate(endpoint+'/comments','POST',{text:values.text},'Comment added.');
  if(form.matches('[data-comment-edit]'))return mutate(endpoint+'/comments/'+encodeURIComponent(form.dataset.commentEdit),'PATCH',{text:values.text,version:Number(form.dataset.version)},'Comment edited. Earlier text is in edit history.');
  if(form.matches('[data-root-cause]'))return mutate(endpoint+'/root-cause','PATCH',{categoryId:values.categoryId||null,text:values.text,version:detail.rootCause.version},'Root cause saved.');
  if(form.matches('[data-assignment]'))return mutate(endpoint+'/actions','POST',{kind:'assign',version:detail.version,ownerId:values.ownerId||null},'Incident owner saved.');
  if(form.matches('[data-categories]')){
   const categories=[...form.querySelectorAll('[data-category-id]')].filter(row=>!row.querySelector('[data-remove-category]').checked).map(row=>({id:row.dataset.categoryId,label:row.querySelector('input:not([type=checkbox])').value}));
   return mutate('/api/incident-settings','PATCH',{version:settings.version,categories},'Root-cause categories saved.');
  }
 });
 content.addEventListener('click',event=>{
  const action=event.target.closest('[data-incident-action]');
  if(action)return mutate(endpoint+'/actions','POST',{kind:action.dataset.incidentAction,version:detail.version},'Response action recorded.');
  const remove=event.target.closest('[data-delete-comment]');
  if(remove)return mutate(endpoint+'/comments/'+encodeURIComponent(remove.dataset.deleteComment)+'?version='+remove.dataset.version,'DELETE',undefined,'Comment text and history deleted.');
  if(event.target.closest('[data-add-category]')){content.querySelector('[data-category-rows]').insertAdjacentHTML('beforeend',categoryRow({id:crypto.randomUUID(),label:''}));return}
  if(event.target.closest('[data-incident-export]')){
   const url=URL.createObjectURL(new Blob([JSON.stringify(detail,null,2)+'\n'],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='uptime-incident.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
 });
 try{await load()}catch(problem){showError(problem)}
}
