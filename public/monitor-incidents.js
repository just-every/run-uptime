import {escape,humaneDuration} from './console-format.js';
import {locationNamer,statusText,checkReason} from './monitor-rules.js';
const at=value=>`<time datetime="${new Date(value).toISOString()}">${escape(new Date(value).toLocaleString())}</time>`;
const outcomes={pass:'Passed',target_failure:'Failed',runner_error:'Could not run'};
// Read the event's own slot and immutable definition, never today's criteria. Older events may outlive the recent-slot
// window; their recorded reason stays available, and absent measurements are not filled from a newer check.
function eventEvidence(event,name,{slots=[],revisions=[],runners=[]}={}){
 const slot=slots.find(row=>row.id===event.slotId),definition=slot?.definition??revisions.find(row=>row.revision===event.monitorRevision)?.definition;
 const place=definition?locationNamer(definition,runners):name,used=new Map();
 return event.probes.map(probe=>{
  const index=used.get(probe.name)??0;used.set(probe.name,index+1);
  const observation=slot?.observations?.filter(o=>o.probe===probe.name)[index];
  const statusFailed=observation?.checks?.some(c=>c.assertion==='status'&&!c.pass);
  const onlyFailure=event.probes.filter(p=>p.outcome==='target_failure').length===1&&probe.outcome==='target_failure';
  const recordedStatus=statusFailed?observation.status:!slot&&onlyFailure&&event.webhookContext?.failedAssertion==='status'?event.webhookContext.httpStatusCode:null;
  const reason=statusFailed?observation.checks.filter(c=>!c.pass).map(c=>checkReason(c,observation,definition)).join('; '):recordedStatus?`Got ${recordedStatus}${definition?.assertions?.status!==undefined?`; expected ${statusText(definition.assertions.status)}`:'; expected status is unavailable in recent history'}`:probe.reason;
  return {probe:probe.name,place:place(probe.name),outcome:outcomes[probe.outcome]??'Unknown result',reason};
 });
}
const evidence=(event,rows)=>`<p>${escape(event.explanation)}</p><ul>${rows.map(row=>`<li>${escape(row.place)}: ${escape(row.outcome)} · ${escape(row.reason)}</li>`).join('')}</ul>`;
function notificationContext(incident,rows){
 const context=incident.recovery?.incidentContext??incident.trigger.incidentContext;
 if(!context)return '';
 return `<h4>Notification context</h4><p>Original down reason: ${escape(context.originalReason)}</p><dl class="ui-dl"><div><dt>Confirmed start (UTC)</dt><dd>${escape(new Date(context.confirmedStartedAt).toISOString())}</dd></div><div><dt>Confirmed recovery (UTC)</dt><dd>${context.confirmedRecoveredAt===null?'Not confirmed':escape(new Date(context.confirmedRecoveredAt).toISOString())}</dd></div><div><dt>Confirmed downtime</dt><dd>${context.downtimeSeconds===null?'Ongoing':`${escape(context.downtimeHuman)} (${escape(context.downtimeSeconds)} seconds)`}</dd></div></dl><ul>${context.failedLocations.map(location=>{const recorded=rows.find(row=>row.probe===location.probe&&row.outcome==='Failed');return `<li>${escape(recorded?.place??location.name)}: ${escape(recorded?.reason??location.reason)}</li>`}).join('')}</ul><p><a href="${escape(context.incidentUrl)}">Link to this incident</a></p>`;
}
export function incidentMarkup(incidents,name=()=> 'Unavailable location',history={}){
 if(!incidents.length)return '<p>No confirmed incidents recorded.</p>';
 return incidents.map(incident=>{
  const trigger=eventEvidence(incident.trigger,name,history),recovery=incident.recovery?eventEvidence(incident.recovery,name,history):null;
  return `<article class="incident-record" data-key="incident-${escape(incident.key)}"><h3>${incident.endedAt===null?'Open incident':'Recovered incident'}${incident.imported?' · imported history':''}</h3><dl class="ui-dl"><div><dt>Started</dt><dd>${at(incident.startedAt)}</dd></div><div><dt>Ended</dt><dd>${incident.endedAt===null?'Still open':at(incident.endedAt)}</dd></div><div><dt>Duration${incident.endedAt===null?' so far':''}</dt><dd>${escape(humaneDuration(incident.durationMs))}</dd></div></dl><button type="button" data-incident-work="${escape(incident.id??incident.trigger.id)}">Notes and follow-up</button><details data-incident="${escape(incident.key)}"><summary id="incident-${escape(incident.key)}">Incident evidence</summary><h4>Failure confirmed · revision ${incident.trigger.monitorRevision}</h4>${evidence(incident.trigger,trigger)}${incident.recovery?`<h4>Recovery confirmed · revision ${incident.recovery.monitorRevision}</h4>${evidence(incident.recovery,recovery)}`:''}${notificationContext(incident,trigger)}<button type="button" data-incident-snapshots="${escape(incident.id??incident.trigger.id)}">Load incident failure snapshots</button><div aria-live="polite" data-owned="snapshots"></div></details></article>`;
 }).join('');
}
