import {escape} from '../console-format.js';
import {patch} from '../dom-patch.js';
import {bindIncidentWork} from '../incident-work.js';

// Scoped members enter the existing console shell and incident dialog. Their
// daily list reads only incident work; workspace configuration stays restricted.
export function mountResponseConsole(identity){
 if(window.uptimeBooted)return;window.uptimeBooted=true;
 const app=document.querySelector('.app'),area=document.querySelector('.table-scroll');
 let stopped=false,polling;
 delete app.dataset.menu;
 if(!document.querySelector('link[data-response-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/assets/incident-console.css';style.dataset.responseStyle='';document.head.append(style)}
 document.querySelector('.top h1').textContent='Incident follow-up';
 document.querySelector('.top .eyebrow').hidden=true;
 document.querySelector('.top .subtitle').hidden=true;
 document.querySelector('.actions').replaceChildren();
 document.querySelector('.right').hidden=true;
 document.querySelector('.list-summary').hidden=true;
 document.title='Incident follow-up · Uptime';
 for(const link of app.querySelectorAll('.sidebar a')){
  const permitted=['/app/monitors','/app/signout'].includes(link.getAttribute('href'));
  link.hidden=!permitted;
  if(link.dataset.view==='monitors'){link.lastChild.textContent='Incident follow-up';link.setAttribute('aria-current','page')}
 }
 area.setAttribute('aria-label','Incident follow-up');
 const status=document.createElement('p');status.setAttribute('role','status');document.querySelector('.top').after(status);
 function stop(){stopped=true;clearInterval(polling);window.uptimeBooted=false;document.documentElement.classList.remove('signed-in');document.querySelector('#incident-work-dialog')?.remove();area.replaceChildren()}
 const signout=async()=>{await api('/api/auth/sign-out','POST',{});stop();location.replace('/login')};
 async function api(path,method='GET',body){
  const response=await fetch(path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();
  if(response.status===401){stop();location.replace('/login')}
  if(!response.ok)throw Error(data.error??'Incident work is unavailable');
  return data;
 }
 bindIncidentWork(area,api);
 for(const link of app.querySelectorAll('a[data-view="signout"]'))link.addEventListener('click',event=>{event.preventDefault();void signout()});
 const selected=/^\/app\/monitors\/([^/]+)\/?$/.exec(location.pathname)?.[1];
 async function refresh(){
  if(stopped||document.querySelector('dialog[open]'))return;
  try{
   const data=await api('/api/response-workspace');if(stopped)return;
   const monitors=selected?data.monitors.filter(row=>row.id===decodeURIComponent(selected)):data.monitors;
   patch(area,monitors.map(m=>`<section class="response-monitor"><h2>${escape(m.name)}</h2>${m.incidents.length?m.incidents.map(i=>`<article class="response-incident" data-key="${escape(i.id)}"><div><h3>${i.endedAt===null?'Open incident':'Recovered incident'}</h3><p>Confirmed <time datetime="${new Date(i.startedAt).toISOString()}">${escape(new Date(i.startedAt).toLocaleString())}</time></p></div><button type="button" data-incident-work="${escape(i.id)}">Notes and follow-up</button></article>`).join(''):'<p>No confirmed incidents recorded.</p>'}</section>`).join('')||'<p>No incident work in your scope.</p>');
   status.textContent='';document.documentElement.classList.add('signed-in');
  }catch(error){if(!stopped)status.textContent=error.message}
 }
 if(location.pathname==='/app/signout')void signout();else{void refresh();polling=setInterval(refresh,5000)}
 window.addEventListener('pagehide',stop,{once:true});
 window.addEventListener('uptime:console-unmount',stop,{once:true});
}
