// The monitor page. A new monitor starts from a website address (editor/discovery.mjs); the full form (editor/manual.mjs)
// is the way to edit an existing monitor, or to fill in a new one by hand. Field code is shared in editor/fields.mjs.
(async()=>{
 const form=document.querySelector('#monitor-form'),message=document.querySelector('#editor-feedback'),notice=document.querySelector('#editor-notice');
 document.documentElement.classList.remove('editor-ready');
 try{
  const {api}=await import('./editor/api.mjs');
  const {mountManualForm,prefillManualForm,NEW_MONITOR}=await import('./editor/manual.mjs');
  const params=new URL(location.href).searchParams,id=params.get('monitor'),overview=await api('/api/overview');
  const definition=id?overview.monitors.find(m=>m.id===id)?.definition:NEW_MONITOR;
  if(!definition)throw Error('Monitor missing');
  document.title=id?'Edit monitor · Uptime':'New monitor · Uptime';document.querySelector('h1').textContent=id?'Edit monitor':'New monitor';
  // An existing monitor's Back, Cancel and save return to its page; a new monitor's return to the list.
  const returnTo=id?'/app/monitors/'+encodeURIComponent(id):'/app',back=document.querySelector('.editor-back');
  back.href=returnTo;if(id)back.lastChild.textContent='Back to monitor';form.querySelector('.editor-cancel').href=returnTo;
  mountManualForm({form,overview,definition,id,returnTo,message});
  document.querySelector('#editor-signout').onclick=async event=>{event.preventDefault();try{await api('/api/auth/sign-out','POST',{});window.dispatchEvent(new Event('uptime:auth-lost'));location.href='/login'}catch(error){notice.textContent=error.message;notice.hidden=false}};
  if(id)form.hidden=false;
  else{
   const description=document.querySelector('.editor-description');description.hidden=true;
   const showManualForm=({url:typed=''}={})=>{
    const url=typed&&!/^[a-z][a-z0-9+.-]*:\/\//i.test(typed)?'https://'+typed:typed;
    document.querySelector('#discovery').hidden=true;description.hidden=false;form.hidden=false;
    let host='';try{host=new URL(url).hostname.replace(/^www\./,'')}catch{}
    prefillManualForm(form,{url,name:host});
    form.elements.namedItem(url?'name':'url').focus();
   };
   const {mountDiscovery}=await import('./editor/discovery.mjs');
   mountDiscovery({form,overview,openCheck:params.get('discovery'),showManualForm});
  }
  document.documentElement.classList.add('editor-ready');
 }catch(error){form.hidden=false;message.textContent=error.message+' — return to the console to sign in.';message.setAttribute('data-error','')}
})();
