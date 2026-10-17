import {escape,humaneDuration} from './console-format.js';
const at=value=>`<time datetime="${new Date(value).toISOString()}">${escape(new Date(value).toLocaleString())}</time>`;
const evidence=event=>`<p>${escape(event.explanation)}</p><ul>${event.probes.map(probe=>`<li>${escape(probe.name)}: ${escape(probe.outcome)} · ${escape(probe.reason)}</li>`).join('')}</ul>`;
function notificationContext(incident){
 const context=incident.recovery?.incidentContext??incident.trigger.incidentContext;
 if(!context)return '';
 return `<h4>Notification context</h4><p>Original down reason: ${escape(context.originalReason)}</p><dl class="ui-dl"><div><dt>Confirmed start (UTC)</dt><dd>${escape(new Date(context.confirmedStartedAt).toISOString())}</dd></div><div><dt>Confirmed recovery (UTC)</dt><dd>${context.confirmedRecoveredAt===null?'Not confirmed':escape(new Date(context.confirmedRecoveredAt).toISOString())}</dd></div><div><dt>Confirmed downtime</dt><dd>${context.downtimeSeconds===null?'Ongoing':`${escape(context.downtimeHuman)} (${escape(context.downtimeSeconds)} seconds)`}</dd></div></dl><ul>${context.failedLocations.map(location=>`<li>${escape(location.name)} (${escape(location.probe)}): ${escape(location.reason)}</li>`).join('')}</ul><p><a href="${escape(context.incidentUrl)}">Link to this incident</a></p>`;
}
export function incidentMarkup(incidents,open=new Set()){
 if(!incidents.length)return '<p>No confirmed incidents recorded.</p>';
 return incidents.map(incident=>`<article class="incident-record"><h3>${incident.endedAt===null?'Open incident':'Recovered incident'}${incident.imported?' · imported history':''}</h3><dl class="ui-dl"><div><dt>Started</dt><dd>${at(incident.startedAt)}</dd></div><div><dt>Ended</dt><dd>${incident.endedAt===null?'Still open':at(incident.endedAt)}</dd></div><div><dt>Duration${incident.endedAt===null?' so far':''}</dt><dd>${escape(humaneDuration(incident.durationMs))}</dd></div></dl><details data-incident="${escape(incident.key)}"${open.has(incident.key)?' open':''}><summary id="incident-${escape(incident.key)}">Incident evidence</summary><h4>Failure confirmed · revision ${incident.trigger.monitorRevision}</h4>${evidence(incident.trigger)}${incident.recovery?`<h4>Recovery confirmed · revision ${incident.recovery.monitorRevision}</h4>${evidence(incident.recovery)}`:''}${notificationContext(incident)}</details></article>`).join('');
}
