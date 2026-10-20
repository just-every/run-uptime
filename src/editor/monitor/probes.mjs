// The form's "Check from": up to three locations, each one check, with an optional external check URL that overrides
// the installation's External check URL (Settings; shown as the field's placeholder). Field names stay probes /
// runner-<probe> / canary-<probe>, which the save reads.
const SLOTS=['local-a','local-b','local-c'];
// The locations that have joined, in the order the console assigns them to checks (src/domain/runner-registration.server.ts);
// a location still waiting to join is left out, and the built-in one stands in until anything has joined.
export function liveRunners(overview){
 const active=(overview.runner.runners??[]).filter(row=>!row.revokedAt),joined=active.filter(row=>row.lastContactAt!==null);
 return joined.length?joined:active.slice(0,1);
}
// A new monitor starts checked from every live location, up to the three checks a monitor has.
export function everyLocation(overview,definition){
 const live=liveRunners(overview).slice(0,SLOTS.length),probes=SLOTS.slice(0,live.length);
 return {...definition,probes,assignments:Object.fromEntries(probes.map((probe,i)=>[probe,{runnerId:live[i].runnerId}]))};
}
export function mountProbeControls(probes,overview,definition){
 const runners=(overview.runner.runners??[]).filter(row=>!row.revokedAt),names=runners.map(row=>row.networkLabel);
 // A name two locations share gets a short id, so the two can be told apart.
 const optionText=row=>names.filter(name=>name===row.networkLabel).length>1?`${row.networkLabel} · ${row.runnerId.slice(5,9)}`:row.networkLabel;
 for(const [index,name] of SLOTS.entries()){
  const group=document.createElement('div');group.className='probe-assignment';probes.append(group);
  const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='probes';input.value=name;input.checked=definition.probes.includes(name);input.disabled=true;
  const select=document.createElement('select');select.name=`runner-${name}`;select.setAttribute('aria-label',`Location for check ${index+1}`);
  for(const row of runners){const option=document.createElement('option');option.value=row.runnerId;option.textContent=optionText(row);select.append(option)}
  if(definition.assignments?.[name])select.value=definition.assignments[name].runnerId;
  label.className='probe-pick';label.append(input,document.createTextNode(`Check ${index+1}`));group.append(label,select);
  const canaryLabel=document.createElement('label'),canary=document.createElement('input');canaryLabel.className='probe-canary';canaryLabel.textContent=`External check URL for check ${index+1} (optional)`;canary.type='url';canary.placeholder=overview.runner.externalCheckUrl??'';canary.name=`canary-${name}`;const own=definition.assignments?.[name]?.canaryUrl;canary.value=own&&own!==overview.runner.externalCheckUrl?own:'';canaryLabel.append(canary);group.append(canaryLabel);
  input.onchange=()=>{select.required=input.checked;select.disabled=canary.disabled=!input.checked;group.classList.toggle('is-off',!input.checked)};
 }
 const help=document.createElement('p');help.className='helper ui-helper';help.textContent='Leave an external check URL empty to use the one set in Settings.';probes.append(help);
 const more=document.createElement('p');more.className='probe-more';more.innerHTML='<a class="ui-link" href="/app#locations">Add a location</a>';probes.append(more);
 return probes;
}
// The fixed agreement rule, in words, with the installation's external check host (src/domain/policy.mjs).
export function agreementText(overview){
 let host='';try{host=new URL(overview.runner.externalCheckUrl).hostname}catch{}
 return host?`Down only when seen from 2 locations, or from 1 while ${host} still loads.`:'Down only when seen from 2 locations.';
}
