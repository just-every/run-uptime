import {editorState,manualPath} from '../../ui/monitor-editor-path.mjs';
import {api} from './api.mjs';
import {mountManualForm,prepareManualForm,prefillManualForm,NEW_MONITOR} from './manual.mjs';
import {mountDiscovery} from './discovery.mjs';
import {bindRules} from './rules.mjs';
import {showType} from './protocol-fields.mjs';
import {mountServiceCatalog} from './catalog.mjs';
import {mountDiscoverySources} from './sources.mjs';

// Static fields are editable immediately. Current runner configuration and
// existing definitions always come from the owner API before Save is enabled.
// Setup and the empty console send the owner to the same website-first create screen.
export async function mountMonitorEditor(signal){
 const form=document.querySelector('#monitor-form'),message=document.querySelector('#editor-feedback'),notice=document.querySelector('#editor-notice');
 const state=editorState(location.pathname),id=state.id,discovery=document.querySelector('#discovery');
 const description=document.querySelector('.editor-description'),manual=document.querySelector('#discovery-manual');
 const loading=document.querySelector('#editor-loading');
 document.querySelector('h1').textContent=id?'Edit monitor':'New monitor';
 document.documentElement.classList.remove('editor-ready','editor-context-ready');
 if(!form.dataset.rulesBound){form.dataset.rulesBound='true';bindRules(form)}
 let first=false;
 const showManualForm=({url:typed='',network='public'}={})=>{
  const url=typed&&!/^[a-z][a-z0-9+.-]*:\/\//i.test(typed)?'https://'+typed:typed;
  history.replaceState(history.state,'',manualPath({url,network}));
  discovery.hidden=true;description.hidden=!description.textContent;form.hidden=false;
  let host='';try{host=new URL(url).hostname.replace(/^www\./,'')}catch{}
  prefillManualForm(form,{url,name:host});
  form.elements.networkScope.value=network;showType(form,form.elements.checkType.value);
  form.elements.namedItem(url?'name':'url').focus();
 };
 const firstLook=()=>{
  document.title='Add your first monitor · Uptime';document.querySelector('h1').textContent='Add your first monitor';
  document.querySelector('.editor-back').hidden=true;form.querySelector('.editor-cancel').hidden=true;
  const links=document.querySelector('.editor-first-links');links.hidden=false;
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
   document.querySelector('#discovery-help').textContent='Checking which runners are available…';
   manual.onclick=()=>showManualForm();
   if(first)firstLook();
   if(state.manual)showManualForm(state);
   document.documentElement.classList.add('editor-ready');
  }
  const overview=await context;
  if(signal.aborted)return;
  loading.hidden=true;first=!id&&overview.first&&!state.discovery;if(first)firstLook();
  const definition=id?overview.definition:NEW_MONITOR;
  if(!definition)throw Error('Monitor missing');
  if(!first){document.title=id?'Edit monitor · Uptime':'New monitor · Uptime';document.querySelector('h1').textContent=id?'Edit monitor':'New monitor'}
  const returnTo=id?'/app/monitors/'+encodeURIComponent(id):'/app/monitors',back=document.querySelector('.editor-back');
  back.href=returnTo;if(id)back.lastChild.textContent='Back to monitor';form.querySelector('.editor-cancel').href=returnTo;
  form.querySelector('.loading-note')?.remove();
  mountManualForm({form,overview,definition,id,returnTo,message,monitors:await others,preserveFields:!id});
  document.querySelector('#editor-signout').onclick=async event=>{event.preventDefault();try{await api('/api/auth/sign-out','POST',{});window.dispatchEvent(new Event('uptime:auth-lost'));location.href='/login'}catch(error){notice.textContent=error.message;notice.hidden=false}};
  if(id)form.hidden=false;
  // Without a runner that can look at a website (a hosted installation with no private runner in contact, outside a demo),
  // the form is the working path, so it comes first; public checks still run in the Cloudflare Worker.
  else if(overview.runner.hosted&&!overview.runner.privateRunnerReady&&overview.runner.workerDiscovery!==true){
   manual.onclick=null;showManualForm();
   description.textContent='Fill in what to check. Public checks run in the Cloudflare Worker. Website discovery, which proposes monitors for you, needs a private runner: see ';
   const link=Object.assign(document.createElement('a'),{href:'/docs/runner',textContent:'Private runner instructions'});description.append(link,'.');description.hidden=false;
  }else{
   const opened=!form.hidden,focused=document.activeElement;
   manual.onclick=null;
   document.querySelector('#discovery-help').textContent='Your runner opens the site from your network, looks around, and proposes monitors that are already filled in.';
   document.querySelector('#discovery-url').disabled=false;document.querySelector('#discovery-check').disabled=false;
   const dispose=mountDiscovery({form,overview,openCheck:opened?null:state.discovery,showManualForm});
   signal.addEventListener('abort',dispose,{once:true});
   signal.addEventListener('abort',mountServiceCatalog({overview,opened}),{once:true});
   signal.addEventListener('abort',mountDiscoverySources({overview,opened}),{once:true});
   if(opened){discovery.hidden=true;focused?.focus()}
  }
  document.documentElement.classList.add('editor-ready','editor-context-ready');
 }catch(error){if(signal.aborted)return;loading.hidden=true;form.querySelector('.loading-note')?.remove();form.hidden=false;message.textContent=error.message+' — return to the console to sign in.';message.setAttribute('data-error','')}
}
