import {icon} from './console-format.js';
// Settings › General: the installation-wide External check URL. A page the owner does not run, checked from the same location,
// so a problem on the owner's own network is not reported as an outage. Every monitor follows it from its next check, unless
// the monitor has its own under Advanced. The URL keeps its one-step Save; its last outcome (Saved, with how many monitors
// keep their own, or the refusal) stays until the next save, and survives the console's periodic redraw.
let outcome=null;
export function externalCheckSection(section,{url,api,refresh}){
 section.setAttribute('aria-labelledby','external-check-heading');
 section.innerHTML=`<div class="card-head"><h2 id="external-check-heading">External check</h2><p class="saved" id="external-check-saved" role="status"></p></div><form id="external-check-form" novalidate><label for="external-check-url" class="ui-visually-hidden">External check URL</label><div class="field-row"><input id="external-check-url" name="externalCheckUrl" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" required aria-describedby="external-check-help external-check-status"><button type="submit" class="primary">Save</button></div></form><p class="ui-helper" id="external-check-help">A site you do not run, so a fault near one location is not called down.</p><p id="external-check-status" hidden></p>`;
 const form=section.querySelector('form'),input=form.elements.externalCheckUrl,button=form.querySelector('button'),saved=section.querySelector('#external-check-saved'),status=section.querySelector('#external-check-status');
 input.value=url??'';
 const show=()=>{
  saved.innerHTML=outcome?.saving?'Saving…':outcome&&!outcome.error?`${icon('check')}Saved`:'';
  status.hidden=!outcome?.text;status.textContent=outcome?.text??'';status.className=outcome?.error?'settings-failure':'ui-helper';status.setAttribute('role',outcome?.error?'alert':'status');
  if(outcome?.error)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');
 };
 show();
 form.onsubmit=async event=>{
  event.preventDefault();button.disabled=true;outcome={saving:true};show();
  try{const answer=await api('/api/external-check','POST',{url:input.value});input.value=answer.url;outcome={text:answer.own?`${answer.own===1?'1 monitor keeps its own':`${answer.own} monitors keep their own`}.`:''}}
  catch(error){outcome={error:true,text:`Not saved: ${error.message.replace(/\.$/,'')}.`}}
  show();button.disabled=false;
  if(!outcome.error)await refresh();
 };
}
