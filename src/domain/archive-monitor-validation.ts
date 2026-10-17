// @ts-ignore Policy is maintained JavaScript.
import {validateDefinition} from './policy.mjs'
import {validateIncidentContext} from './notification-context.ts'
import {validateEvidence} from './evidence.server.ts'
import {clock,identity,object,unique,type Tables} from './archive-schema.ts'
/** A historical synthetic address is a definition, never a receiving grant. */
export function historicalDefinition(text:any){
 if(typeof text!=='string')throw Error('Invalid archive definition');
 const definition=JSON.parse(text);
 if(!object(definition)||Object.keys(definition).some(k=>!['name','type','network','url','method','request','heartbeat','probes','assertions','intervalMs','timeoutMs','retries','failureQuorum','confirmSlots','recoverSlots','freshnessMs','enabled','maintenanceUntil','maintenanceWindows','assignments','flow','project','environment','service','group','tags','owner','outcome','dependencies'].includes(k)))throw Error('Invalid archive definition fields');
 const port=typeof definition.url==='string'&&/^http:\/\/127\.0\.0\.1:[0-9]+\//.test(definition.url)?Number(new URL(definition.url).port):null;
 validateDefinition(definition,port===null?[]:[port]);return definition;
}
export function validateMonitorTables(t:Tables,now:number){
 const monitors=unique(t.monitors,r=>r.id,'monitor'),revisions=unique(t.revisions,r=>`${r.monitor_id}:${r.revision}`,'revision'),slots=unique(t.slots,r=>r.id,'slot');
 if(monitors.size>100)throw Error('Archive monitor bound exceeded: 100');
 for(const r of t.migrations){if(![1,2,3].includes(r.version))throw Error('Unsupported migration');clock(r.applied_at,'migration')}
 unique(t.migrations,r=>String(r.version),'migration');
 for(const r of t.revisions){identity(r.monitor_id,'revision monitor');if(!monitors.has(r.monitor_id)||!Number.isSafeInteger(r.revision)||r.revision<1||r.revision>=Number.MAX_SAFE_INTEGER)throw Error('Invalid revision reference');historicalDefinition(r.definition);clock(r.created_at,'revision')}
 for(const r of t.monitors){
  historicalDefinition(r.definition);clock(r.next_due,'monitor');const state=JSON.parse(r.state);
  // Prior installations retained sparse state; absent flags remain absent in history.
  if(!object(state)||Object.keys(state).some(k=>!['state','targetState','underlyingState','evidenceState','coverageState','candidate','regions','denominator','fails','unknown','failureStreak','recoveryStreak','confirmedFailure','notificationOpen','maintenance','reason','evaluatedAt','incidentKey','failingVantages','incidentRevision','definitionChange'].includes(k))||!['Unknown','Healthy','Degraded','Failing','Recovering','Maintenance','Paused'].includes(state.state)||['confirmedFailure','notificationOpen'].some(k=>Object.hasOwn(state,k)&&typeof state[k]!=='boolean'))throw Error('Invalid archive monitor state');
  const revision=revisions.get(`${r.id}:${r.revision}`);
  if(!Number.isSafeInteger(r.revision)||r.revision<1||!revision||JSON.stringify(JSON.parse(r.definition))!==JSON.stringify(JSON.parse(revision.definition)))throw Error('Current definition mismatch');
 }
 for(const r of t.slots){
  const revision=revisions.get(`${r.monitor_id}:${r.revision}`);historicalDefinition(r.definition);
  if(!Number.isSafeInteger(r.revision)||r.revision<1||!revision||JSON.stringify(JSON.parse(r.definition))!==JSON.stringify(JSON.parse(revision.definition))||![0,1].includes(r.manual))throw Error('Slot revision mismatch');
  if(!['complete','running','queued','interrupted'].includes(r.status)||!Number.isSafeInteger(r.missed_count)||r.missed_count<0||typeof r.lease_owner!=='string')throw Error('Invalid slot');clock(r.due_at,'slot');clock(r.lease_until,'lease');
 }
 unique(t.observations,r=>r.id,'observation');unique(t.observations,r=>`${r.slot_id}:${r.probe}:${r.attempt}`,'attempt');
 const observations=new Map<string,any[]>();
 for(const r of t.observations){const slot=slots.get(r.slot_id),o=JSON.parse(r.evidence);if(!slot||o.id!==r.id||o.probe!==r.probe||o.attempt!==r.attempt)throw Error('Invalid observation reference');if(o.credentialBinding&&o.credentialBinding.monitorId!==slot.monitor_id)throw Error('Credential diagnostic monitor mismatch');validateEvidence(o,JSON.parse(slot.definition),slot.due_at,now,'historical-restore');const list=observations.get(r.slot_id)??[];list.push(o);observations.set(r.slot_id,list)}
 for(const slot of t.slots){const definition=JSON.parse(slot.definition),all=observations.get(slot.id)??[];for(const probe of definition.probes){const chain=all.filter(o=>o.probe===probe).sort((a,b)=>a.attempt-b.attempt);if((slot.status==='complete'&&(!chain.length||(definition.assignments&&chain.at(-1).outcome==='target_failure'&&chain.at(-1).attempt!==definition.retries)))||chain.some((o,i)=>(!definition.assignments&&o.attempt!==i)||(i>0&&chain[i-1].outcome!=='target_failure')))throw Error('Invalid restored attempt chain')}}
 unique(t.outbox,r=>r.id,'outbox');
 for(const r of t.outbox){const slot=slots.get(r.slot_id),event=JSON.parse(r.event);validateIncidentContext(event);if(!slot||slot.monitor_id!==r.monitor_id||slot.manual||event.id!==r.id||event.slotId!==r.slot_id||event.monitorId!==r.monitor_id||event.kind!==r.kind||event.visibility!=='private'||!['trigger','recovery','expiry','renewal'].includes(r.kind))throw Error('Outbox reference mismatch');if(!['pending','sending','sent','accepted','delivered','failed','imported-inactive'].includes(r.status))throw Error('Invalid outbox status');clock(r.lease_until,'outbox lease');if(r.receipt!==null&&typeof r.receipt!=='string')throw Error('Invalid outbox receipt')}
 return {monitors,revisions,slots};
}
