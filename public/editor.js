(async()=>{
 const form=document.querySelector('#monitor-form'),message=document.querySelector('#editor-feedback');
 document.documentElement.classList.remove('editor-ready');
 const api=async(path,method='GET',data)=>{const r=await fetch(path,{method,headers:{'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),value=await r.json();if([401,403].includes(r.status))window.dispatchEvent(new Event('uptime:auth-lost'));if(!r.ok)throw Error(value.error);return value};
 try{
  const {additionalAssertions,assembleAssertions}=await import('./editor-definition.mjs');
  const {minutesToMilliseconds,secondsToMilliseconds}=await import('./editor-units.mjs');
  const id=new URL(location.href).searchParams.get('monitor'),overview=await api('/api/overview');
  const definition=id?overview.monitors.find(m=>m.id===id)?.definition:{name:'',url:'',method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:2000,retries:1,probes:['local-a'],failureQuorum:1,confirmSlots:2,recoverSlots:2,freshnessMs:180000,enabled:true,maintenanceUntil:0};
  if(!definition)throw Error('Monitor missing');
  document.title=id?'Edit monitor · Uptime':'New monitor · Uptime';document.querySelector('h1').textContent=id?'Edit monitor':'New monitor';
  // An existing monitor's Back, Cancel and save return to its page; a new monitor's return to the list.
  const returnTo=id?'/app/monitors/'+encodeURIComponent(id):'/app',back=document.querySelector('.editor-back');
  back.href=returnTo;if(id)back.lastChild.textContent='Back to monitor';document.querySelector('.editor-cancel').href=returnTo;
  const values={...definition,status:definition.assertions.status,body:definition.assertions.bodyIncludes??'',headerName:definition.assertions.header?.name??'',headerValue:definition.assertions.header?.equals??'',additional:JSON.stringify(additionalAssertions(definition.assertions),null,2),intervalMinutes:definition.intervalMs/60000,timeoutSeconds:definition.timeoutMs/1000,freshnessMinutes:definition.freshnessMs/60000};
  for(const [key,value] of Object.entries(values))if(form.elements.namedItem(key))form.elements.namedItem(key).value=String(value);
  form.elements.url.required=definition.type!=='heartbeat';
  const probes=document.querySelector('#settings-probes');
  for(const [index,name] of ['local-a','local-b','local-c'].entries()){
   const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='probes';input.value=name;input.checked=definition.probes.includes(name);input.disabled=true;label.append(input,document.createTextNode(`Local check ${index+1}`));probes.append(label);
  }
  const value=name=>form.elements.namedItem(name).value;
  form.onsubmit=async event=>{
   event.preventDefault();if(!form.reportValidity())return;
   const button=form.querySelector('button[type=submit]');button.disabled=true;message.removeAttribute('data-error');message.textContent='Saving monitor…';
   try{
    const assertions=assembleAssertions({status:value('status'),body:value('body'),headerName:value('headerName'),headerValue:value('headerValue'),additional:value('additional')});
    const result={...definition,name:value('name'),url:value('url'),method:value('method'),assertions,intervalMs:minutesToMilliseconds(value('intervalMinutes')),timeoutMs:secondsToMilliseconds(value('timeoutSeconds')),freshnessMs:minutesToMilliseconds(value('freshnessMinutes'))};
    for(const name of ['retries','failureQuorum','confirmSlots','recoverSlots'])result[name]=Number(value(name));
    result.probes=[...probes.querySelectorAll('input:checked')].map(input=>input.value);
    await api(id?`/api/monitors/${id}`:'/api/monitors',id?'PATCH':'POST',result);location.href=returnTo;
   }catch(error){message.textContent=error.message;message.setAttribute('data-error','');button.disabled=false}
  };
  document.querySelector('#editor-signout').onclick=async event=>{event.preventDefault();try{await api('/api/auth/sign-out','POST',{});window.dispatchEvent(new Event('uptime:auth-lost'));location.href='/login'}catch(error){message.textContent=error.message;message.setAttribute('data-error','')}};
  form.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(control=>control.disabled=false);
  document.documentElement.classList.add('editor-ready');message.textContent='Request credentials stay in the runner installation.';
 }catch(error){message.textContent=error.message+' — return to the console to sign in.';message.setAttribute('data-error','')}
})();
