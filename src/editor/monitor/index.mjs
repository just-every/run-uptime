import {editorState,manualPath} from '../../ui/monitor-editor-path.mjs';
import {api} from './api.mjs';
import {mountManualForm,prepareManualForm,prefillManualForm,NEW_MONITOR} from './manual.mjs';
import {mountDiscovery} from './discovery.mjs';
import {bindRules} from './rules.mjs';
import {showType} from './protocol-fields.mjs';
import {mountWays} from './ways.mjs';
import {openAdvanced,openFoldsAround} from './advanced.mjs';
import {mountErase} from './erase.mjs';

// Static fields are editable immediately. Current runner configuration and
// existing definitions always come from the owner API before Save is enabled.
// Setup and the empty console send the owner to the same website-first create screen.
export async function mountMonitorEditor(signal){
 const form=document.querySelector('#monitor-form'),message=document.querySelector('#editor-feedback'),notice=document.querySelector('#editor-notice');
 const state=editorState(location.pathname),id=state.id,discovery=document.querySelector('#discovery');
 const description=document.querySelector('.editor-description');
 const loading=document.querySelector('#editor-loading');
 // A link to a console section pushes its path and the router swaps in the console without loading a document, as the
 // console's own section links do (public/app.js). A link opened in a new tab is left to the browser.
 document.addEventListener('click',event=>{
  const a=event.target.closest('a[href]');if(!a||event.defaultPrevented||event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||a.target&&a.target!=='_self')return;
  const url=new URL(a.href);if(url.origin!==location.origin||!/^\/app\/(?:monitors|locations|notifications|archive|settings)\/?$/.test(url.pathname))return;
  event.preventDefault();history.pushState(null,'',url.pathname+url.search+url.hash);
 },{signal});
 document.querySelector('h1').textContent=id?'Edit monitor':'New monitor';
 document.documentElement.classList.remove('editor-ready','editor-context-ready');
 if(!form.dataset.rulesBound){form.dataset.rulesBound='true';bindRules(form)}
 // A field the browser will not save may sit in a closed Advanced or Labels: open the folds around it first.
 form.addEventListener('invalid',openFoldsAround,{capture:true,signal});
 let ways;
 // The form as a way to add: the website address typed in the card comes along, a private address opens Advanced with Private chosen.
 const showManualForm=({url:typed='',network}={})=>{
  const url=typed&&!/^[a-z][a-z0-9+.-]*:\/\//i.test(typed)?'https://'+typed:typed;
  if(url){let host='';try{host=new URL(url).hostname.replace(/^www\./,'')}catch{}prefillManualForm(form,{url,name:host})}
  if(network){form.elements.networkScope.value=network;showType(form,form.elements.checkType.value);if(network==='private')openAdvanced(form)}
  description.hidden=!description.textContent;
  ways.open('manual',{path:manualPath({url,network})});
  form.elements.namedItem(url?'name':'url').focus();
 };
 const firstLook=()=>{
  document.title='Add your first monitor · Uptime';document.querySelector('h1').textContent='Add your first monitor';
  document.querySelector('.editor-back').hidden=true;form.querySelector('.editor-cancel').hidden=true;
 };
 try{
  const context=api('/api/monitor-editor'+(id?'?monitor='+encodeURIComponent(id):''),'GET',undefined,{signal});
  // The other monitors, for the labels' "Depends on" list; the form works without them.
  const others=api('/api/overview','GET',undefined,{signal}).then(all=>all.monitors.map(monitor=>({id:monitor.id,name:monitor.definition.name})),()=>[]);
  if(!id){
   prepareManualForm(form,NEW_MONITOR);
   const loading=document.createElement('p');loading.className='loading-note';loading.role='status';loading.textContent='Loading locations…';
   form.querySelector('#check-from').append(loading);
   message.textContent='Locations are loading. You can fill in the monitor now.';
   description.hidden=true;discovery.hidden=false;
   document.querySelector('#discovery-url').disabled=true;document.querySelector('#discovery-check').disabled=true;
   ways=mountWays({root:document.querySelector('#other-ways'),form,overview:context,signal,openForm:()=>showManualForm({url:document.querySelector('#discovery-url').value.trim()})});
   if(state.way==='manual')showManualForm(state);else if(state.way)ways.open(state.way);
   document.documentElement.classList.add('editor-ready');
  }
  const overview=await context;
  if(signal.aborted)return;
  loading.hidden=true;const first=!id&&overview.first&&!state.discovery;if(first)firstLook();
  const definition=id?overview.definition:NEW_MONITOR;
  if(!definition)throw Error('Monitor missing');
  if(!first){document.title=id?'Edit monitor · Uptime':'New monitor · Uptime';document.querySelector('h1').textContent=id?'Edit monitor':'New monitor'}
  const returnTo=id?'/app/monitors/'+encodeURIComponent(id):'/app/monitors',back=document.querySelector('.editor-back');
  back.href=returnTo;if(id)back.lastChild.textContent='Back to monitor';form.querySelector('.editor-cancel').href=returnTo;
  form.querySelector('.loading-note')?.remove();
  mountManualForm({form,overview,definition,id,returnTo,message,monitors:await others,preserveFields:!id});
  mountErase(form,{id,name:definition.name,message});
  document.querySelector('#editor-signout').onclick=async event=>{event.preventDefault();try{await api('/api/auth/sign-out','POST',{});window.dispatchEvent(new Event('uptime:auth-lost'));location.href='/login'}catch(error){notice.textContent=error.message;notice.hidden=false}};
  if(id)form.hidden=false;
  else{
   // Without a runner that can look at a website (a hosted installation with no private runner in contact, outside a demo),
   // the form is the working path, so it opens first; public checks still run in the Cloudflare Worker.
   const hostedWithoutRunner=overview.runner.hosted&&!overview.runner.privateRunnerReady&&overview.runner.workerDiscovery!==true;
   const dispose=mountDiscovery({form,overview,openCheck:hostedWithoutRunner?null:state.discovery,showManualForm,onCheck:()=>ways.close(),focusInput:!ways.current});
   signal.addEventListener('abort',dispose,{once:true});
   if(hostedWithoutRunner&&!ways.current){
    showManualForm();
    description.textContent='Public checks run in the Cloudflare Worker. ';
    description.append(Object.assign(document.createElement('a'),{href:'/docs/runner',textContent:'Private runner instructions'}),'.');description.hidden=false;
   }
  }
  document.documentElement.classList.add('editor-ready','editor-context-ready');
 }catch(error){if(signal.aborted)return;loading.hidden=true;form.querySelector('.loading-note')?.remove();form.hidden=false;message.textContent=error.message+' — return to the console to sign in.';message.setAttribute('data-error','')}
}
