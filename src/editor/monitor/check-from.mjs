// The form's "Check from": a tick list of the owner's locations, one check of the monitor each (a probe, src/domain/policy.mjs).
// The engine runs at most three checks a monitor and two for a browser flow, so the list stops there and says so. A location
// already checking the monitor keeps its probe, so its history and slow-response settings stay with it. Under Advanced, the
// monitor's own External check URL: empty, the monitor follows the one in Settings, live.
const PROBES=['local-a','local-b','local-c'];
export const locationLimit=type=>type==='flow'?2:PROBES.length;
// The locations that have joined, in the console's order (src/domain/runner-registration.server.ts); one still waiting to join
// is left out, and the built-in one stands in until anything has joined.
export function liveRunners(overview){
 const active=(overview.runner.runners??[]).filter(row=>!row.revokedAt),joined=active.filter(row=>row.lastContactAt!==null);
 return joined.length?joined:active.slice(0,1);
}
// The probes for the ticked locations: each keeps the probe it had, a newly ticked one takes the first free probe.
export function assignmentsFor(definition,runnerIds){
 const had=new Map(Object.entries(definition.assignments??{}).filter(([,a])=>runnerIds.includes(a.runnerId)).map(([probe,a])=>[a.runnerId,probe]));
 const free=PROBES.filter(probe=>![...had.values()].includes(probe)),assignments={};
 for(const runnerId of runnerIds)assignments[had.get(runnerId)??free.shift()]={runnerId};
 const probes=Object.keys(assignments).sort();
 return {probes,assignments:Object.fromEntries(probes.map(probe=>[probe,assignments[probe]]))};
}
const hostOf=url=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}};
// The rule the code applies (src/domain/policy.mjs), in words: two locations must agree, or one while the external check still
// loads from it. Locations sharing a name are one network, as the engine counts them. A second location needs no external
// check unless the monitor has its own.
export function agreementText(names,host,own){
 const networks=[...new Set(names)];
 if(!networks.length)return 'Choose at least one location.';
 if(networks.length===1)return host?`Down when it fails from ${networks[0]} while ${host} still loads there.`:`Down when it fails from ${networks[0]}.`;
 return own&&host?`Down when it fails from 2 locations, or from 1 while ${host} still loads there.`:'Down when it fails from 2 locations.';
}
const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
// Fills the fieldset and returns what the save reads: the ticked runner IDs and the monitor's own External check URL.
export function mountCheckFrom(fieldset,{overview,definition,externalCheck,isNew}){
 const runners=(overview.runner.runners??[]).filter(row=>!row.revokedAt),live=liveRunners(overview),limit=locationLimit(definition.type);
 const assigned=definition.assignments?Object.values(definition.assignments).map(a=>a.runnerId):runners.filter(row=>row.builtIn).map(row=>row.runnerId);
 const ticked=new Set(isNew?live.slice(0,limit).map(row=>row.runnerId):assigned);
 // Every location but one still waiting to join (unless this monitor already checks from it); this computer's own location is
 // listed before its runner first reports in.
 const shown=runners.filter(row=>row.builtIn||row.hosted||row.lastContactAt!==null||ticked.has(row.runnerId)),names=shown.map(row=>row.networkLabel);
 // A name two locations share gets a short id, so the two can be told apart.
 const nameOf=row=>names.filter(name=>name===row.networkLabel).length>1?`${row.networkLabel} · ${row.runnerId.slice(5,9)}`:row.networkLabel;
 const legend=fieldset.querySelector('legend');fieldset.replaceChildren(legend);
 const list=element('div','location-picks');list.setAttribute('role','group');list.setAttribute('aria-labelledby','check-from-legend');legend.id='check-from-legend';
 for(const row of shown){
  const label=element('label','location-pick'),input=element('input');input.type='checkbox';input.name='locations';input.value=row.runnerId;input.checked=ticked.has(row.runnerId);
  label.append(input,element('span','location-pick-name',nameOf(row)));list.append(label);
 }
 const note=element('p','helper ui-helper location-limit',`Up to ${limit} locations per monitor.`);note.id='location-limit';
 const rule=element('p','agreement-rule helper ui-helper');rule.id='agreement-rule';rule.setAttribute('aria-live','polite');
 const more=element('p','probe-more');more.innerHTML='<a class="ui-link" href="/app/locations">Add a location</a>';
 const advanced=element('details','check-from-advanced'),summary=element('summary','', 'Advanced'),field=element('label','', 'External check URL (optional)'),own=element('input'),help=element('p','helper ui-helper','A site you do not run. Empty uses the one in Settings.');
 own.type='url';own.name='externalCheckUrl';own.id='external-check-own';own.placeholder=overview.runner.externalCheckUrl??'';own.value=externalCheck?.own??'';own.setAttribute('aria-describedby','external-check-own-help');help.id='external-check-own-help';
 field.append(own);advanced.append(summary,field,help);advanced.open=Boolean(own.value);
 fieldset.append(list,note,rule,more,advanced);
 const boxes=[...list.querySelectorAll('input[name=locations]')];
 const update=()=>{
  const chosen=boxes.filter(box=>box.checked),full=chosen.length>=limit;
  for(const box of boxes)box.disabled=!box.checked&&full;
  note.classList.toggle('is-full',full);
  rule.textContent=agreementText(chosen.map(box=>shown.find(row=>row.runnerId===box.value).networkLabel),hostOf(own.value.trim()||overview.runner.externalCheckUrl),Boolean(own.value.trim()));
 };
 list.addEventListener('change',update);own.addEventListener('input',update);update();
 // `update` again once the form enables its controls, so a full list keeps its unticked locations disabled.
 return {runnerIds:()=>boxes.filter(box=>box.checked).map(box=>box.value),ownUrl:()=>own.value.trim(),update};
}
