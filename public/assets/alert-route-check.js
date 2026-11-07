import {escape} from '/console-format.js';
import {reasons} from './alert-route-markup.js';
// ROUTING-001 route check: for one alert class and set of locations, who the saved route would tell right now (or at a
// chosen time), who is excluded and why, and a route-aware sending drill to exactly the contacts that would be told.
const kinds=[['trigger','Outage (critical)'],['slow','Slow response (warning)'],['dependency','Dependency notice (info)']];
const outcomeText={ready:'Would be told now',held_quiet:'Held for quiet hours',excluded:'Excluded',fallback_only:'Fallback contact',drilled:'Drill queued',not_drilled:'Drill not sent'};
const when=value=>new Date(value).toLocaleString();
const rows=list=>`<ul class="route-recipients">${list.map(r=>`<li class="route-outcome"><div><strong>${escape(r.name)}</strong> <span data-outcome="${escape(r.outcome)}">${escape(outcomeText[r.outcome]??r.outcome)}</span><p>${escape(r.outcome==='ready'||r.outcome==='drilled'?'Ready':r.outcome==='held_quiet'?'Waiting for quiet hours to end':reasons[r.reason]??r.reason)}${r.quietUntil?` · until ${escape(when(r.quietUntil))}`:''}${r.teamIds?.length?' · via team':''}</p></div></li>`).join('')||'<li>No contact is selected by this route.</li>'}</ul>`;
export function mountRouteCheck(after,data,{monitor,api,lock}){
 const panel=document.createElement('section');panel.className='route-check-panel';panel.id='route-check';panel.setAttribute('aria-labelledby','route-check-heading');
 const locations=data.locations??[];
 panel.innerHTML=`<h3 id="route-check-heading">Check this saved route</h3><p>Shows who the saved route tells for one kind of alert, without sending. A drill sends a labelled test to each contact that would be told now, never to excluded or quiet-held contacts.</p><div class="route-schedule-numbers"><label for="route-check-kind">Alert kind<select id="route-check-kind">${kinds.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label for="route-check-at">At (blank = now)<input id="route-check-at" type="datetime-local"></label></div><fieldset id="route-check-locations"><legend>Locations that failed</legend>${locations.map((l,i)=>`<label class="route-target-check" for="route-check-loc-${i}"><input id="route-check-loc-${i}" type="checkbox" value="${escape(l.id)}" checked>${escape(l.label===l.id?l.id:`${l.label} (${l.id})`)}</label>`).join('')||'<p>No configured locations.</p>'}</fieldset><div class="btn-row"><button type="button" id="route-check-sample">Show who would be told</button><button type="button" id="route-check-drill">Send route drill</button></div><div id="route-check-result" role="status" aria-live="polite"></div>`;
 after.after(panel);
 const result=panel.querySelector('#route-check-result');
 const input=()=>({kind:panel.querySelector('#route-check-kind').value,regions:[...panel.querySelectorAll('#route-check-locations input:checked')].map(c=>c.value)});
 const run=async(label,work)=>{if(lock())return;result.textContent=label;for(const b of panel.querySelectorAll('button'))b.disabled=true;try{result.innerHTML=await work()}catch(problem){result.textContent=problem.message}finally{for(const b of panel.querySelectorAll('button'))b.disabled=false}};
 const path=`/api/monitors/${encodeURIComponent(monitor.id)}/alert-route`;
 panel.querySelector('#route-check-sample').onclick=()=>run('Checking the saved route…',async()=>{
  const at=panel.querySelector('#route-check-at').value,sample=await api(path+'/sample','POST',{...input(),at:at?new Date(at).getTime():Date.now()});
  return `<p>${sample.readyCount} would be told ${at?`at ${escape(when(new Date(at).getTime()))}`:'now'}.</p>${rows(sample.recipients.filter(r=>r.selected))}${sample.fallback.length?`<h4>Fallback contacts</h4>${rows(sample.fallback)}`:''}${sample.excludedMembers.length?`<p>${sample.excludedMembers.length} team member${sample.excludedMembers.length===1?' is':'s are'} not counted (no opt-in, paused, rotated or out of scope).</p>`:''}`;
 });
 panel.querySelector('#route-check-drill').onclick=()=>run('Sending route drill…',async()=>{
  const drill=await api(path+'/drill','POST',input());
  return `<p>${drill.outcomes.filter(o=>o.outcome==='drilled').length} drill${drill.outcomes.filter(o=>o.outcome==='drilled').length===1?'':'s'} queued. Results appear under Sent alerts in Settings.</p>${rows(drill.outcomes)}`;
 });
}
