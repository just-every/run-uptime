import {escape} from './console-format.js';
import {patch} from './dom-patch.js';
// DEPENDENCY-002 on a followed service's monitor page: what the provider states (its own claim, never your application's
// health), whether its catalog entry needs review, which of your monitors, services and groups the owner linked to it (a link
// is what lets one acknowledgment cover an application incident and this provider's notice), and its dependency notices.
const STATE={operational:'The provider states it is operational.',issue:'The provider states an issue.',unknown:'Unknown: the provider’s status could not be read.',waiting:'Waiting for the first scheduled check.'};
const at=value=>new Date(value).toLocaleString();
function styles(){
 if(document.querySelector('link[href="/followed-service.css"]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href='/followed-service.css';document.head.append(link);
}
export function followedServicePanel(monitor){
 if(!monitor.definition.tags?.includes('dependency'))return '';
 return `<section class="ui-card panel followed-panel" aria-labelledby="followed-heading" data-owned="${escape(monitor.id)}" hidden><h2 id="followed-heading">Followed service</h2><div id="followed-body"></div></section>`;
}
const noticeRow=notice=>`<li data-key="notice-${escape(notice.id)}"><p><strong>${escape(notice.title)}</strong> · ${escape(at(notice.observedAt))}${notice.recoveredAt!==null?` · recovered ${escape(at(notice.recoveredAt))}`:' · still open'}</p><p>The provider stated: ${escape(notice.stated)}. This was a dependency notice: it opened no Uptime incident.</p>${notice.state==='open'&&notice.acknowledgedAt===null?`<button type="button" data-ack-notice="${escape(notice.id)}">Acknowledge notice</button>`:notice.acknowledgedAt!==null?`<p>Acknowledged ${escape(at(notice.acknowledgedAt))}.</p>`:''}</li>`;
function body(item,notices,monitors){
 // monitors: what the provider can be linked to, read with the catalog (the monitor page itself holds only this monitor).
 const review=item.review.state==='needs_review'?`<div class="followed-review" role="note"><p><strong>Needs review.</strong></p><ul>${item.review.reasons.map(reason=>`<li>${escape(reason)}</li>`).join('')}</ul><button type="button" data-review-followed>Check the source and review</button></div>`:'<p>The catalog entry and its status source are current.</p>';
 const linked=item.linked.map(id=>monitors.find(m=>m.id===id)).filter(Boolean);
 const services=[...new Set(monitors.map(m=>m.service).filter(Boolean))].filter(name=>name!==item.entryName),groups=[...new Set(monitors.map(m=>m.group).filter(Boolean))];
 return `<p><strong>${escape(item.entryName)}${item.component?` · ${escape(item.component)}${item.region?` (${escape(item.region)})`:''}`:' · whole provider'}</strong> · catalog version ${item.catalogVersion}</p>
 <p>${escape(STATE[item.sourceState]??STATE.unknown)} This is the provider’s own claim from <span class="ui-mono">${escape(item.source??'')}</span>; it is attributed context and never proof that your application is up or down. A provider issue sends a dependency notice through this monitor’s alert route and opens no Uptime incident.</p>${review}
 <h3>Linked to</h3>${linked.length?`<ul>${linked.map(m=>`<li data-key="link-${escape(m.id)}">${escape(m.name)} <button type="button" data-unlink-monitor="${escape(m.id)}" aria-label="Unlink ${escape(m.name)}">Unlink</button></li>`).join('')}</ul>`:'<p>Nothing is linked. Without a link, an overlapping provider issue shows beside an incident only as coincident in time, and never groups acknowledgment.</p>'}
 <form data-link-form><label>Link this provider to<select name="kind"><option value="monitor">A monitor</option><option value="service">A service</option><option value="group">A group</option></select></label><label>Which<select name="target">${monitors.map(m=>`<option value="${escape(m.id)}" data-kind="monitor">${escape(m.name)}</option>`).join('')}${services.map(name=>`<option value="${escape(name)}" data-kind="service" hidden>${escape(name)}</option>`).join('')}${groups.map(name=>`<option value="${escape(name)}" data-kind="group" hidden>${escape(name)}</option>`).join('')}</select></label><button>Link</button></form>
 <h3>Dependency notices</h3>${notices.length?`<ul class="followed-notices">${notices.map(noticeRow).join('')}</ul>`:'<p>No provider issue has been stated yet.</p>'}`;
}
export function bindFollowedPanel(area,monitor,{api,action}){
 const section=area.querySelector('.followed-panel');if(!section)return;
 styles();
 const host=section.querySelector('#followed-body');
 async function load(){
  const document_=await api('/api/service-catalog');
  const item=document_.followed.find(f=>f.monitorId===monitor.id);
  if(!host.isConnected)return;
  if(!item){section.hidden=true;return}
  section.hidden=false;
  patch(host,body(item,document_.notices.filter(n=>n.monitorId===monitor.id),document_.monitors));
  const form=host.querySelector('[data-link-form]'),kind=form.elements.kind,target=form.elements.target;
  const filter=()=>{let first=null;for(const option of target.options){const show=option.dataset.kind===kind.value;option.hidden=!show;option.disabled=!show;if(show&&!first)first=option}target.value=first?.value??''};
  kind.onchange=filter;filter();
  form.onsubmit=event=>{event.preventDefault();if(!target.value)return;action(()=>api(`/api/followed-services/${encodeURIComponent(monitor.id)}/links`,'POST',{kind:kind.value,target:target.value,linked:true}).then(load),{pending:'Linking…',success:'Linked. An incident on what you linked now groups acknowledgment with this provider’s notices.'})};
  for(const button of host.querySelectorAll('[data-unlink-monitor]'))button.onclick=()=>action(()=>api(`/api/followed-services/${encodeURIComponent(monitor.id)}/links`,'POST',{kind:'monitor',target:button.dataset.unlinkMonitor,linked:false}).then(load),{pending:'Unlinking…',success:'Unlinked.'});
  for(const button of host.querySelectorAll('[data-ack-notice]'))button.onclick=()=>action(()=>api(`/api/dependency-notices/${encodeURIComponent(button.dataset.ackNotice)}/acknowledge`,'POST',{}).then(load),{pending:'Acknowledging…',success:'Notice acknowledged.'});
  const review=host.querySelector('[data-review-followed]');
  if(review)review.onclick=()=>action(async()=>{
   const entry=document_.entries.find(e=>e.id===item.entryId)??(await api('/api/service-catalog')).entries.find(e=>e.id===item.entryId);
   const spec={entry:item.entryId,scope:item.scope==='whole'?'whole':'components',...(item.scope==='component'?{components:[entry.components.find(c=>c.name===item.component&&(c.region??null)===(item.region??null))?.key]}:{})};
   const {id}=await api('/api/service-catalog/checks','POST',spec);
   for(let i=0;i<120;i++){const job=await api(`/api/discoveries/${encodeURIComponent(id)}`);if(job.status==='done'){if(!job.result.ok)throw Error(`The source ${job.result.detail}`);break}if(['failed','expired'].includes(job.status))throw Error(job.error||'The check did not finish.');await new Promise(r=>setTimeout(r,1000))}
   await api(`/api/followed-services/${encodeURIComponent(monitor.id)}/review`,'POST',{check:id});await load();
  },{pending:'Checking the status source…',success:'Reviewed. The monitor now reads the catalog’s current source as a new revision.'});
 }
 load().catch(problem=>{if(host.isConnected){section.hidden=false;host.textContent=`Followed service unavailable: ${problem.message}`}});
}
