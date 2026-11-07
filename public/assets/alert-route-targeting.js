import {escape} from '/console-format.js';
// ROUTING-001 targeting controls in the route editor: teams, environment / severity / location / origin filters, and the
// route's quiet hours, either a daily window or US business hours (weekly). Everything here is read back from the saved
// policy and sent with each reviewed route, so a console edit never drops a field the API or CLI saved.
const severities=[['critical','Critical (outage)'],['warning','Warning (Slow)'],['info','Info (dependency notice)']];
const origins=[['monitor','Monitor outage'],['slow','Slow response'],['dependency','Dependency notice']];
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const usZones=['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'];
const list=values=>values.length<2?values.join(''):`${values.slice(0,-1).join(', ')} and ${values.at(-1)}`;
// One line for a route's targeting, shared by the summary, the review and the history.
export function targetingLine(policy,data){
 const parts=[],teams=(policy.teamIds??[]).map(id=>data.teams?.find(t=>t.id===id)?.name??'Missing team');
 if(teams.length)parts.push(`teams ${list(teams)}`);
 const f=policy.filters??{};
 if(f.environments)parts.push(f.environments.length?`environment ${list(f.environments)}`:'no environment');
 if(f.severities)parts.push(f.severities.length?`severity ${list(f.severities)}`:'no severity');
 if(f.origins)parts.push(f.origins.length?`origin ${list(f.origins)}`:'no origin');
 if(f.regions)parts.push(f.regions.length?`locations ${list(f.regions.map(id=>data.locations?.find(l=>l.id===id)?.label??id))}`:'no location');
 const q=policy.quietHours;
 if(q)parts.push(q.openDays?`quiet outside ${q.openDays.map(d=>days[d]).join(', ')} ${q.start}–${q.end} (${q.timeZone})`:`quiet ${q.start}–${q.end} (${q.timeZone})`);
 return parts.join(' · ');
}
const checks=(name,items,chosen)=>items.map(([value,label],i)=>`<label class="route-target-check" for="route-${name}-${i}"><input id="route-${name}-${i}" type="checkbox" data-filter-value="${name}" value="${escape(value)}" ${chosen?.includes(value)?'checked':''}>${escape(label)}</label>`).join('');
function filterMarkup(key,title,body,active){
 return `<fieldset class="route-target-filter" data-filter="${key}"><legend>${title}</legend><label for="route-limit-${key}" class="route-target-check"><input id="route-limit-${key}" type="checkbox" data-filter-limit ${active?'checked':''}>Only some</label><div class="route-target-choices" ${active?'':'hidden'}>${body}</div></fieldset>`;
}
function quietKind(q){return !q?'none':q.openDays?'business':'daily'}
function markup(policy,data){
 const f=policy.filters??{},q=policy.quietHours,zone=q?.timeZone??usZones[0],open=q?.openDays??[1,2,3,4,5],kind=quietKind(q);
 const teams=data.teams?.length?data.teams.map((t,i)=>`<label class="route-target-check" for="route-team-${i}"><input id="route-team-${i}" type="checkbox" data-team value="${escape(t.id)}" ${policy.teamIds?.includes(t.id)?'checked':''}>${escape(t.name)}${t.enabled?'':' (disabled)'}</label>`).join(''):'<p>No teams yet. Create one under <a href="/app/settings/alerts">Settings › Alerts</a>.</p>';
 const locations=data.locations?.length?checks('regions',data.locations.map(l=>[l.id,l.label===l.id?l.id:`${l.label} (${l.id})`]),f.regions):'<p>This monitor has no configured locations.</p>';
 return `<fieldset id="route-targeting-fields"><legend>Teams, filters and quiet hours</legend>
<fieldset class="route-target-teams"><legend>Teams</legend><p>A team member is told only through their own verified email contact, after they opt in on the Alerts page.</p>${teams}</fieldset>
${filterMarkup('environments','Environment',`<label for="route-environments">Environments (comma separated)<input id="route-environments" data-filter-text placeholder="production, staging" value="${escape((f.environments??[]).join(', '))}"></label>${data.environment?`<p>This monitor is labelled “${escape(data.environment)}”.</p>`:'<p>This monitor has no environment label, so it cannot match a limited environment.</p>'}`,f.environments)}
${filterMarkup('severities','Severity',checks('severities',severities,f.severities),f.severities)}
${filterMarkup('regions','Locations',locations,f.regions)}
${filterMarkup('origins','Alert origin',checks('origins',origins,f.origins),f.origins)}
<p>Leave “Only some” off to match everything. Turning it on with nothing chosen matches no alerts.</p>
<fieldset class="route-target-quiet"><legend>Quiet hours for this route</legend><label for="route-quiet-kind">Hold alerts</label><select id="route-quiet-kind"><option value="none" ${kind==='none'?'selected':''}>Never</option><option value="daily" ${kind==='daily'?'selected':''}>During a daily quiet window</option><option value="business" ${kind==='business'?'selected':''}>Outside US business hours</option></select>
<div class="route-schedule-numbers" id="route-quiet-fields"><label for="route-quiet-zone">Time zone<input id="route-quiet-zone" list="route-quiet-zones" required value="${escape(zone)}"></label><datalist id="route-quiet-zones">${usZones.map(z=>`<option value="${z}">`).join('')}</datalist><label for="route-quiet-start"><span data-quiet-start-label></span><input id="route-quiet-start" type="time" required value="${escape(q?.start??'22:00')}"></label><label for="route-quiet-end"><span data-quiet-end-label></span><input id="route-quiet-end" type="time" required value="${escape(q?.end??'07:00')}"></label></div>
<fieldset id="route-business-days"><legend>Business days</legend>${days.map((d,i)=>`<label class="route-target-check" for="route-day-${i}"><input id="route-day-${i}" type="checkbox" data-day value="${i}" ${open.includes(i)?'checked':''}>${d}</label>`).join('')}</fieldset>
<p id="route-quiet-note"></p></fieldset></fieldset>`;
}
export function mountRouteTargeting(after,data,scope,mode){
 if(!document.querySelector('link[href="/assets/alert-route-targeting.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/assets/alert-route-targeting.css';document.head.append(link)}
 const host=document.createElement('div');host.id='route-targeting';after.after(host);
 let last='none';
 const sync=()=>{
  const root=host.querySelector('#route-targeting-fields');if(!root)return;
  root.disabled=mode.value!=='selected';
  for(const f of root.querySelectorAll('[data-filter]'))f.querySelector('.route-target-choices').hidden=!f.querySelector('[data-filter-limit]').checked;
  const kind=root.querySelector('#route-quiet-kind').value,start=root.querySelector('#route-quiet-start'),end=root.querySelector('#route-quiet-end');
  root.querySelector('#route-quiet-fields').hidden=kind==='none';root.querySelector('#route-business-days').hidden=kind!=='business';
  root.querySelector('[data-quiet-start-label]').textContent=kind==='business'?'Open from':'Quiet from';root.querySelector('[data-quiet-end-label]').textContent=kind==='business'?'Open until':'Quiet until';
  root.querySelector('#route-quiet-note').textContent=kind==='business'?'Every contact on this route, fallback contacts included, waits outside these hours, including all weekend.':kind==='daily'?'Every contact on this route, fallback contacts included, waits until the window ends. An end before the start means overnight.':'';
  if(kind!==last){if(kind==='business'&&last!=='business'){start.value='09:00';end.value='17:00'}else if(kind==='daily'&&last==='business'){start.value='22:00';end.value='07:00'}last=kind}
  for(const required of [root.querySelector('#route-quiet-zone'),start,end])required.required=kind!=='none';
 };
 const render=()=>{
  const policy=data.policies.find(p=>p.scope===scope.value);host.innerHTML=markup(policy,data);last=quietKind(policy.quietHours);sync();
 };
 host.addEventListener('change',sync);scope.addEventListener('change',render);mode.addEventListener('change',sync);render();
 return {
  // Adds the saved-or-edited teams, filters and quiet hours to a selected-destinations route input.
  apply(input){
   if(input.mode!=='selected')return input;
   const root=host.querySelector('#route-targeting-fields'),filters={};
   for(const f of root.querySelectorAll('[data-filter]')){
    if(!f.querySelector('[data-filter-limit]').checked)continue;const key=f.dataset.filter;
    filters[key]=key==='environments'?f.querySelector('[data-filter-text]').value.split(',').map(v=>v.trim()).filter(Boolean):[...f.querySelectorAll('[data-filter-value]:checked')].map(c=>c.value);
   }
   const kind=root.querySelector('#route-quiet-kind').value,quiet={timeZone:root.querySelector('#route-quiet-zone').value.trim(),start:root.querySelector('#route-quiet-start').value,end:root.querySelector('#route-quiet-end').value};
   return {...input,teamIds:[...root.querySelectorAll('[data-team]:checked')].map(c=>c.value),filters,quietHours:kind==='none'?null:kind==='business'?{...quiet,openDays:[...root.querySelectorAll('[data-day]:checked')].map(c=>Number(c.value))}:quiet};
  },
 };
}
