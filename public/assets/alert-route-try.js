import {escape} from '/console-format.js';
// Try the saved route (ROUTING-001): a sample reads who a confirmed alert of one class would reach at a chosen time
// without sending anything; a drill sends the ordinary labelled alert drill to exactly the contacts that sample reads as
// ready now. Contacts held by quiet hours or excluded by a filter, team or credential are listed with why and get nothing.
export const classes=[['trigger','Outage (critical)'],['slow','Slow response (warning)'],['dependency','Dependency notice (info)']];
export const outcomeText={ready:'Would be told now',held_quiet:'Held until quiet hours end',excluded:'Excluded',queued:'Drill queued',refused:'Drill refused',fallback_only:'Fallback only'};
const reasonText={not_selected:'not selected by the route',team_recipient_ineligible:'team member has not opted in, or is out of scope',disabled:'contact disabled',credentials_missing:'credentials missing',mail_not_configured:'mail sender unavailable',destination_missing:'destination missing',filter_environments:'environment filter',filter_severities:'severity filter',filter_origins:'origin filter',filter_regions:'location filter'};
const memberReason={no_consent:'has not opted in',team_disabled:'team is disabled',consent_inactive_or_out_of_scope:'opt-in paused, rotated or out of scope'};
export function resultMarkup(result){
 const rows=(result.results??result.recipients.filter(r=>r.selected).map(r=>({name:r.name,outcome:r.outcome,reason:r.reason,quietUntil:r.quietUntil}))).filter(r=>r.outcome!=='fallback_only');
 return `<ul class="route-recipients" data-try-results>${rows.map(r=>`<li><div><strong>${escape(r.name)}</strong><p>${escape(outcomeText[r.outcome]??r.outcome)}${r.outcome==='excluded'||r.outcome==='refused'?` — ${escape(reasonText[r.reason]??r.reason)}`:''}${r.quietUntil?` until ${escape(new Date(r.quietUntil).toLocaleString())}`:''}</p></div></li>`).join('')||'<li>This route reaches nobody for that alert.</li>'}</ul>${(result.excludedMembers??[]).length?`<p>Team members left out: ${result.excludedMembers.map(m=>escape(memberReason[m.reason]??m.reason)).join('; ')}.</p>`:''}`;
}
export function mountRouteTry(after,{api,monitor,probes,path}){
 const details=document.createElement('details');details.id='route-try';details.className='route-try';
 const failing=probes.map((p,i)=>`<label class="route-contact" for="route-try-probe-${i}"><input id="route-try-probe-${i}" type="checkbox" data-try-probe value="${escape(p.id)}" checked><span>${escape(p.label)}</span></label>`).join('');
 details.innerHTML=`<summary>Try this route</summary><p>Reads the saved route, so save changes first. A sample sends nothing; a drill sends a labelled drill to the contacts a sample reads as ready now.</p><label for="route-try-class">Alert class</label><select id="route-try-class">${classes.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><label for="route-try-at">At (your browser's time zone)</label><input id="route-try-at" type="datetime-local"><fieldset><legend>Locations that did not pass</legend>${failing}</fieldset><div class="buttons"><button type="button" id="route-try-sample">Check who is told</button><button type="button" id="route-try-drill">Send drill to ready contacts</button></div><div id="route-try-result" role="status"></div>`;
 after.after(details);
 const at=details.querySelector('#route-try-at'),out=details.querySelector('#route-try-result');
 const stamp=date=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
 at.value=stamp(new Date());
 const regions=()=>[...details.querySelectorAll('[data-try-probe]:checked')].map(i=>i.value);
 const run=async work=>{
  const buttons=[...details.querySelectorAll('button')];for(const b of buttons)b.disabled=true;out.textContent='Working…';
  try{out.innerHTML=resultMarkup(await work())}catch(problem){out.textContent=problem.message}finally{for(const b of buttons)b.disabled=false}
 };
 details.querySelector('#route-try-sample').onclick=()=>run(()=>api(`${path}/sample`,'POST',{kind:details.querySelector('#route-try-class').value,regions:regions(),at:new Date(at.value).getTime()}));
 details.querySelector('#route-try-drill').onclick=()=>run(()=>api(`${path}/drill`,'POST',{kind:details.querySelector('#route-try-class').value,regions:regions()}));
 return details;
}
