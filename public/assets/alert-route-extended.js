import {escape} from '/console-format.js';
// ROUTING-001 console controls for the route fields beyond contacts: teams, filters (environment, severity, location,
// origin) and the route's hours (a daily quiet window, or weekly business hours). They read and write the same policy
// fields as the API, so an edit made here keeps whatever the API saved, and the dialog's own save keeps these fields.
const usZones=['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'];
const severities=[['critical','Critical (outage)'],['warning','Warning (Slow)'],['info','Info (dependency notice)']];
const origins=[['monitor','Monitor check'],['slow','Slow response'],['dependency','Dependency provider']];
const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const csv=value=>[...new Set(value.split(',').map(v=>v.trim()).filter(Boolean))];
const checked=(list,value)=>list?.includes(value)?'checked':'';
function limit(key,label,saved,inner){
 return `<fieldset class="route-filter" data-filter="${key}"><label class="route-filter-limit" for="route-limit-${key}"><input id="route-limit-${key}" type="checkbox" data-filter-limit ${saved?'checked':''}>${label}</label><div class="route-filter-values" ${saved?'':'hidden'}>${inner}<p class="route-filter-warning" ${saved&&!saved.length?'':'hidden'}>Nothing is chosen, so no alert will match this route.</p></div></fieldset>`;
}
export function extendedMarkup(policy,{teams,teamsError,probes}){
 const filters=policy.filters??{},quiet=policy.quietHours,kind=!quiet?'none':quiet.businessDays?'business':'quiet';
 const probeIds=probes.map(p=>p.id),others=(filters.regions??[]).filter(r=>!probeIds.includes(r));
 const zone=quiet?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone;
 return `<fieldset id="route-extended-fields"><legend>Teams, filters and hours</legend>
 <fieldset class="route-teams"><legend>Teams</legend>${teamsError?`<p role="status">Teams could not be read: ${escape(teamsError)}</p>`:teams.length?teams.map((t,i)=>`<label class="route-contact" for="route-team-${i}"><input id="route-team-${i}" type="checkbox" name="team" value="${escape(t.id)}" ${checked(policy.teamIds,t.id)}><span><strong>${escape(t.name)}</strong> · ${t.members.length} member${t.members.length===1?'':'s'}${t.enabled?'':' · disabled'}</span></label>`).join('')+'<p>A member is told only after opting in with their own verified email destination, and only for monitors their access covers.</p>':'<p>No teams yet. Create one under Settings › Alerts.</p>'}</fieldset>
 ${limit('environments','Only some environments',filters.environments,`<label for="route-environments">Environments, comma separated<input id="route-environments" data-filter-text value="${escape((filters.environments??[]).join(', '))}" placeholder="${escape('production, staging')}"></label>`)}
 ${limit('severities','Only some severities',filters.severities,severities.map(([v,l],i)=>`<label class="route-contact" for="route-severity-${i}"><input id="route-severity-${i}" type="checkbox" data-filter-option value="${v}" ${checked(filters.severities,v)}><span>${l}</span></label>`).join(''))}
 ${limit('origins','Only some origins',filters.origins,origins.map(([v,l],i)=>`<label class="route-contact" for="route-origin-${i}"><input id="route-origin-${i}" type="checkbox" data-filter-option value="${v}" ${checked(filters.origins,v)}><span>${l}</span></label>`).join(''))}
 ${limit('regions','Only some locations',filters.regions,`${probes.map((p,i)=>`<label class="route-contact" for="route-region-${i}"><input id="route-region-${i}" type="checkbox" data-filter-option value="${escape(p.id)}" ${checked(filters.regions,p.id)}><span>${escape(p.label)}${p.country?` · ${escape(p.country)}`:' · country not set'}</span></label>`).join('')}<label for="route-countries">Countries, comma separated (two letters, such as US)<input id="route-countries" data-filter-text value="${escape(others.join(', '))}" placeholder="US, DE"></label><p>An alert matches when a location that did not pass is chosen here, or is in one of these countries.</p>`)}
 <fieldset class="route-hours"><legend>Hours</legend><label for="route-hours-kind">Hold alerts</label><select id="route-hours-kind" data-hours-kind><option value="none" ${kind==='none'?'selected':''}>Never; send at any time</option><option value="quiet" ${kind==='quiet'?'selected':''}>During a daily quiet window</option><option value="business" ${kind==='business'?'selected':''}>Outside business hours</option></select>
 <div data-hours-fields ${kind==='none'?'hidden':''}><div class="route-schedule-numbers"><label for="route-hours-start"><span data-hours-start-label>${kind==='business'?'Business hours start':'Quiet from'}</span><input id="route-hours-start" data-hours-start type="time" required value="${escape(quiet?.start??'22:00')}"></label><label for="route-hours-end"><span data-hours-end-label>${kind==='business'?'Business hours end':'Quiet until'}</span><input id="route-hours-end" data-hours-end type="time" required value="${escape(quiet?.end??'07:00')}"></label><label for="route-hours-zone">Time zone<input id="route-hours-zone" data-hours-zone list="route-zones" required value="${escape(zone)}"></label></div><datalist id="route-zones">${usZones.map(z=>`<option value="${z}">`).join('')}</datalist>
 <div class="route-schedule-switches" data-business-days ${kind==='business'?'':'hidden'}>${dayNames.map((d,i)=>`<label for="route-day-${i}"><input id="route-day-${i}" type="checkbox" data-business-day value="${i}" ${(quiet?.businessDays??[1,2,3,4,5]).includes(i)?'checked':''}>${d}</label>`).join('')}</div>
 <p data-hours-note></p></div></fieldset></fieldset>`;
}
export function mountRouteExtended(host,{data,scope,mode,teams,teamsError,probes}){
 const root=document.createElement('div');host.after(root);
 const render=()=>{
  const policy=data.policies.find(p=>p.scope===scope.value);
  root.innerHTML=extendedMarkup(policy,{teams,teamsError,probes});
  sync();
 };
 const sync=()=>{
  const fields=root.querySelector('#route-extended-fields'),kind=root.querySelector('[data-hours-kind]').value;
  fields.disabled=mode.value!=='selected';
  for(const f of root.querySelectorAll('[data-filter]')){const on=f.querySelector('[data-filter-limit]').checked;f.querySelector('.route-filter-values').hidden=!on;f.querySelector('.route-filter-warning').hidden=!on||readFilter(f).length>0}
  root.querySelector('[data-hours-fields]').hidden=kind==='none';
  root.querySelector('[data-business-days]').hidden=kind!=='business';
  root.querySelector('[data-hours-start-label]').textContent=kind==='business'?'Business hours start':'Quiet from';
  root.querySelector('[data-hours-end-label]').textContent=kind==='business'?'Business hours end':'Quiet until';
  root.querySelector('[data-hours-note]').textContent=kind==='business'?'Alerts outside these days and hours wait until business hours start. Daylight-saving changes follow the time zone.':'Alerts wait until the window ends. An end before the start means overnight.';
 };
 const readFilter=f=>[...f.querySelectorAll('[data-filter-option]:checked')].map(i=>i.value).concat(...[...f.querySelectorAll('[data-filter-text]')].map(i=>csv(i.value)));
 root.addEventListener('change',sync);root.addEventListener('input',sync);
 scope.addEventListener('change',render);mode.addEventListener('change',sync);render();
 return {
  // Adds the teams, filters and hours the controls show; an inherit policy leaves the saved fields untouched.
  apply(input){
   if(input.mode!=='selected')return input;
   const filters={};
   for(const f of root.querySelectorAll('[data-filter]'))if(f.querySelector('[data-filter-limit]').checked)filters[f.dataset.filter]=[...new Set(readFilter(f))];
   const kind=root.querySelector('[data-hours-kind]').value,value=key=>root.querySelector(`[data-hours-${key}]`).value.trim();
   const quietHours=kind==='none'?null:{timeZone:value('zone'),start:value('start'),end:value('end'),...(kind==='business'?{businessDays:[...root.querySelectorAll('[data-business-day]:checked')].map(i=>Number(i.value))}:{})};
   const teamIds=[...root.querySelectorAll('[name=team]:checked')].map(i=>i.value);
   return {...input,teamIds,filters,quietHours};
  },
 };
}
