import type {HostedScheduleClaim} from './hosted-scheduled-claim.server.ts'
import {expireCheckLeases} from './hosted-lease.server.ts'
import {hostedObservationId,hostedResultStatement,nativeObservationIdGuard} from './hosted-results.server.ts'
import {hostedAvailabilityRecord,hostedAvailabilityStatement,hostedAvailabilityTail} from './hosted-availability.server.ts'
import {mutationGuard} from './audit.server.ts'
import {classifyStorage} from './storage-error.ts'
import {agentRunnerTask} from '../agent-door/work.server.ts'
import {snapshotSettings,snapshotStatements} from './failure-snapshots.server.ts'
import {notificationPreferences} from './notification-preferences.server.ts'
import {scheduleHeartbeatEvaluation} from './heartbeat-jobs.server.ts'
// @ts-ignore Shared calendar is also used by the console preview.
import {activeMaintenance,intervals} from './planned-maintenance.mjs'
import {get,type Bindings} from './control.server.ts'
import {runnerIdentity} from './runner-registration.server.ts'
import {externalCheck,liveExternalCheck} from './external-check.server.ts'
import {snapshotHeartbeat,validateHeartbeatSnapshot} from './heartbeat.server.ts'
import {validateEvidence} from './evidence.server.ts'
import {acceptanceMs,missedSlots,nextDueAfter} from './schedule.ts'
import {finalAttempts,terminalSlot,projectAttempts,foldAttempts} from './attempt-projection.ts'
import {attemptSnapshot,checkpointStatement} from './attempt-checkpoint.server.ts'
import {classifyAttempts} from './attempt-classification.ts'
import {slowNotice} from './slow-notices.server.ts'
import {incidentEvent} from './notification-content.ts'
import {dependencyEvent} from './dependency-notices.ts'
import {incidentDeliveryStatements} from './alert-route-delivery.server.ts'
import {HOSTED_RUNNER_ID} from './hosted-runner.ts'
import {definitionChange,definitionChangeNote} from './flow-changes.server.ts'
import {expiryNotices,openExpiryWarnings} from './expiry-notices.server.ts'
// @ts-ignore Edition flow vocabulary is JavaScript shared with the runner.
import {flowDigest} from './flow.mjs'
import {claimDebt,debtStatements} from './cleanup-debt.server.ts'
import {claimGrants} from './effect-grants.server.ts'
// A vantage only ever runs its newest scheduled slot of a monitor. Once a newer scheduled slot is assigned to its runner (the runner
// fell behind: a long flow on its machine, a stalled machine), its part of an older slot is never delivered, and that slot keeps the
// part as missing evidence (coverage incomplete) rather than running it moments before the next one. Every scheduled slot is created
// at least one interval after each vantage's previous delivery (see the delivery below), so a vantage's own consecutive checks stay
// one interval apart however late it polls. `slot` is the slot about to be delivered and ?2 its runner.
const newest=(slot:string)=>`NOT EXISTS(SELECT 1 FROM slots c JOIN slots n ON n.monitor_id=c.monitor_id AND n.manual=0 AND n.due_at>c.due_at WHERE c.id=${slot} AND c.manual=0 AND (json_extract(n.hosted,'$.runnerId')=?2 OR EXISTS(SELECT 1 FROM runner_assignments na WHERE na.slot_id=n.id AND na.runner_id=?2)))`
export async function claimAttempt(env:Bindings,runnerId:string,{monitorId=null}:{monitorId?:string|null}={}){
 const delegated=await agentRunnerTask(env,runnerId,monitorId);if(delegated)return delegated;
 return nativeClaimAttempt(env,runnerId,monitorId,false)
}
// Trusted shared-door executor only; public runner protocols never choose this.
export async function claimAdmittedAttempt(env:Bindings,runnerId:string,{monitorId=null}:{monitorId?:string|null}={}){return nativeClaimAttempt(env,runnerId,monitorId,true)}
async function nativeClaimAttempt(env:Bindings,runnerId:string,monitorId:string|null,admitted:boolean){
 const now=Date.now();
 await expireCheckLeases(env.DB,now).run();
 const pendingRows=(await env.DB.prepare(`SELECT s.*,m.definition AS current_definition FROM slots s JOIN monitors m ON m.id=s.monitor_id JOIN runner_assignments a ON a.slot_id=s.id WHERE a.runner_id=?2 AND a.delivered_at IS NULL AND s.status='running' AND s.hosted IS NULL AND s.lease_until>?3 AND (?4 IS NULL OR s.monitor_id=?4) AND ${newest('s.id')} ORDER BY s.manual,s.due_at`).bind(null,runnerId,now,monitorId).all<any>()).results;
 const allowed=async(row:any)=>admitted||!await env.DB.prepare('SELECT 1 FROM uptime_agent_revisions WHERE monitor_id=? AND revision=? UNION ALL SELECT 1 FROM uptime_agent_manual WHERE slot_id=?').bind(row.monitor_id??row.id,row.current_revision??row.revision,row.id).first();
 const admittedPending=[];for(const row of pendingRows)if(await allowed(row))admittedPending.push(row);
 const pending=admittedPending.find(row=>activeMaintenance(JSON.parse(row.current_definition),now)?.mode!=='pause');
 let slot=pending;
 if(!slot){
  const queuedRows=(await env.DB.prepare("SELECT s.*,m.definition AS current_definition,m.revision AS current_revision FROM slots s JOIN monitors m ON m.id=s.monitor_id WHERE s.status='queued' AND s.manual=1 AND (? IS NULL OR s.monitor_id=?) AND (json_extract(s.definition,'$.assignments') IS NULL OR EXISTS(SELECT 1 FROM json_each(json_extract(s.definition,'$.assignments')) a WHERE json_extract(a.value,'$.runnerId')=?)) ORDER BY s.due_at").bind(monitorId,monitorId,runnerId).all<any>()).results;
  for(const queued of queuedRows){if(!await allowed(queued))continue;const definition=JSON.parse(queued.current_definition);if(!definition.enabled||queued.current_revision!==queued.revision){await env.DB.prepare("UPDATE slots SET status='interrupted' WHERE id=?").bind(queued.id).run()}else if(activeMaintenance(definition,now)?.mode!=='pause'){slot=queued;break}}
  if(!slot){
   const target=monitorId===null?'':'AND id=?3';
   const bindings=monitorId===null?[now,runnerId]:[now,runnerId,monitorId];
   const due=(await env.DB.prepare(`SELECT * FROM monitors WHERE next_due<=?1 AND json_extract(definition,'$.enabled')=1 ${target} AND (json_extract(definition,'$.assignments') IS NULL OR EXISTS(SELECT 1 FROM json_each(json_extract(monitors.definition,'$.assignments')) a WHERE json_extract(a.value,'$.runnerId')=?2)) ORDER BY next_due`).bind(...bindings).all<any>()).results;
   // Calendar filtering considers every due monitor: a paused first row must
   // never starve unrelated monitors, or move their configured schedule.
   const admittedDue=[];for(const row of due)if(await allowed(row))admittedDue.push(row);
   const row=admittedDue.find(row=>activeMaintenance(JSON.parse(row.definition),now)?.mode!=='pause');
   if(row){const definition=JSON.parse(row.definition),id=`${row.id}:${row.revision}:${row.next_due}`,until=now+acceptanceMs(definition);
    // The next scheduled check is due no sooner than one interval after this claim. Each vantage that takes its part of the check
    // later raises it to one interval after its own delivery, and completed results to one interval after the latest vantage's
    // reported start: a late check moves later due times back rather than running any vantage's checks closer.
    await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count) SELECT ?,id,revision,next_due,'running',definition,'',?,? FROM monitors WHERE id=? AND revision=? AND next_due=?").bind(id,until,missedSlots(row.next_due,now,definition.intervalMs),row.id,row.revision,row.next_due),env.DB.prepare('UPDATE monitors SET next_due=? WHERE id=? AND revision=? AND next_due=? AND EXISTS(SELECT 1 FROM slots WHERE id=?)').bind(Math.max(nextDueAfter(row.next_due,now,definition.intervalMs),now+definition.intervalMs),row.id,row.revision,row.next_due,id)]);
    slot=await env.DB.prepare('SELECT * FROM slots WHERE id=?').bind(id).first<any>()
   }
  }
 }
 if(!slot||slot.hosted!=null)return null;
 const definition=JSON.parse(slot.definition),legacy=definition.assignments?null:await runnerIdentity(env);
 const assignments=definition.assignments??Object.fromEntries(definition.probes.map((p:string)=>[p,{runnerId:legacy?.runner_id,networkLabel:legacy?.network_label}]));
 const until=slot.status==='queued'?now+acceptanceMs(definition):slot.lease_until;
 await env.DB.batch([...(slot.status==='queued'?[env.DB.prepare("UPDATE slots SET status='running',lease_owner='',lease_until=? WHERE id=? AND status='queued'").bind(until,slot.id)]:[]),...definition.probes.map((p:string)=>env.DB.prepare("INSERT OR IGNORE INTO runner_assignments(slot_id,probe,runner_id) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM slots WHERE id=? AND status='running' AND lease_until>?)").bind(slot.id,p,assignments[p].runnerId,slot.id,now))]);
 const mine=definition.probes.filter((p:string)=>assignments[p].runnerId===runnerId);
 if(!mine.length)return null;
 // Record delivery at the transaction, not request entry: a claim delayed past
 // an older slot's classification deadline must not retroactively skip it.
 const current=await get(env,slot.monitor_id);if(!current||activeMaintenance(current.definition,Date.now())?.mode==='pause')return null;
 const pauseRanges=intervals({...current.definition,maintenanceUntil:0,maintenanceWindows:(current.definition.maintenanceWindows??[]).filter((window:any)=>window.mode==='pause')},now,until);
 // A revision that follows Settings checks the External check URL Settings holds now, not the copy it was saved with; each
 // delivered part records the URL it was handed, so its history says what was checked.
 const task=Object.values(assignments).some((a:any)=>a.canaryUrl)?liveExternalCheck({...definition,assignments},await externalCheck(env)):{...definition,assignments};
 const deliveryTime="MAX(?3,CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER))";
 const maintenanceGuard=`EXISTS(SELECT 1 FROM monitors WHERE id=?5 AND revision=?6) AND NOT EXISTS(SELECT 1 FROM json_each(?7) w WHERE ${deliveryTime}>=json_extract(w.value,'$.startsAt') AND ${deliveryTime}<json_extract(w.value,'$.endsAt'))`;
 const changes=await env.DB.batch([...mine.map((p:string)=>env.DB.prepare(`UPDATE runner_assignments SET delivered_at=${deliveryTime},external_check_url=?8 WHERE slot_id=?1 AND probe=?4 AND runner_id=?2 AND delivered_at IS NULL AND ${newest('?1')} AND EXISTS(SELECT 1 FROM slots WHERE id=?1 AND lease_until>${deliveryTime}) AND ${maintenanceGuard}`).bind(slot.id,runnerId,now,p,current.id,current.revision,JSON.stringify(pauseRanges),task.assignments[p].canaryUrl??null)),
  // New delivery resolves older undelivered classifications. Fence snapshots
  // in the same transaction so a concurrent checkpoint cannot freeze an old
  // missing classification after this runner has demonstrably advanced.
  env.DB.prepare('UPDATE evidence_generation SET generation=generation+1 WHERE monitor_id=? AND EXISTS(SELECT 1 FROM runner_assignments WHERE slot_id=? AND runner_id=? AND delivered_at>=?)').bind(slot.monitor_id,slot.id,runnerId,now),
  // Also when the monitor was edited since this slot: by the shorter of the two intervals, as an edit itself schedules.
  ...(slot.manual?[]:[env.DB.prepare("UPDATE monitors SET next_due=MAX(next_due,(SELECT MAX(delivered_at) FROM runner_assignments WHERE slot_id=?4 AND runner_id=?5)+MIN(?2,json_extract(definition,'$.intervalMs'))) WHERE id=?3 AND EXISTS(SELECT 1 FROM runner_assignments WHERE slot_id=?4 AND runner_id=?5 AND delivered_at>=?1)").bind(now,definition.intervalMs,slot.monitor_id,slot.id,runnerId)])]);
 const probes=mine.filter((_:string,i:number)=>changes[i].meta.changes);
 if(!probes.length)return null;
 return snapshotHeartbeat(env,{...await claimDebt(env,slot.monitor_id,definition),...await claimGrants(env,slot.monitor_id,Date.now()),snapshotPolicy:await snapshotSettings(env,slot.monitor_id),id:slot.id,monitorId:slot.monitor_id,revision:slot.revision,dueAt:slot.due_at,definition:task,probes,acceptUntil:until})
}
// Only the in-process executor can supply the immutable claim it just received.
export async function completeHostedAttempts(env:Bindings,task:HostedScheduleClaim,attempts:any[]){
 const slot={id:task.id,monitor_id:task.monitorId,revision:task.revision,due_at:task.dueAt,lease_until:task.acceptUntil,
  manual:false,status:'running',definition:JSON.stringify(task.savedDefinition)};
 const identified=attempts.map(o=>({...o,id:hostedObservationId(o.id,task.dueAt)}));
 return acceptAttempts(env,{slotId:task.id,attempts:identified},HOSTED_RUNNER_ID,{slot,probes:task.probes});
}
export function completeAttempts(env:Bindings,input:any,runnerId:string){return acceptAttempts(env,input,runnerId)}
async function acceptAttempts(env:Bindings,input:any,runnerId:string,hosted?:{slot:any;probes:string[]}){
 const now=Date.now(),slot=hosted?.slot??await env.DB.prepare('SELECT * FROM slots WHERE id=?').bind(input.slotId).first<any>();
 if(!slot||!['running','complete'].includes(slot.status)||slot.lease_until<=now)throw Error('Invalid or expired acceptance window');
 const definition=JSON.parse(slot.definition),attempts=input.attempts;
 if(!Array.isArray(attempts)||!attempts.length||attempts.length>9)throw Error('Invalid observations');
 const assigned=hosted?.probes??(await env.DB.prepare('SELECT probe FROM runner_assignments WHERE slot_id=? AND runner_id=?').bind(slot.id,runnerId).all<{probe:string}>()).results.map(r=>r.probe);
 const seen=new Set();
 for(const o of attempts){if(!assigned.includes(o.probe))throw Error('Attempt requires its assigned runner');if(o.credentialBinding&&o.credentialBinding.monitorId!==slot.monitor_id)throw Error('Credential diagnostic monitor mismatch');validateEvidence(o,definition,slot.due_at,now);if(o.completedAt>slot.lease_until)throw Error('Attempt outside acceptance window');const key=`${o.probe}:${o.attempt}`;if(seen.has(key))throw Error('Duplicate observation');seen.add(key)}
 if(definition.type==='heartbeat')await validateHeartbeatSnapshot(env,slot,attempts);
 // A flow observation names the exact revision it ran: its digest is the digest of the flow in this slot's definition.
 if(definition.type==='flow'){const digest=await flowDigest(definition.flow);for(const o of attempts)if(o.outcome!=='runner_error'&&o.flow?.digest!==digest)throw Error('Flow evidence does not name this revision')}
 for(;;){
  const commitAt=Date.now();if(commitAt>=slot.lease_until)throw Error('Acceptance authority expired');
  const snapshot=await attemptSnapshot(env,slot.monitor_id,slot.revision,definition,now,slot.id,false,Boolean(hosted));
  const {generation,hostedGeneration,observations:stored}=snapshot;
  const fresh=attempts.filter((o:any)=>!stored.some(s=>s.slot_id===slot.id&&s.probe===o.probe&&s.attempt===o.attempt));
  if(!fresh.length)return {accepted:true,duplicate:true};
  const freshRows=fresh.map((o:any)=>({slot_id:slot.id,probe:o.probe,attempt:o.attempt,evidence:JSON.stringify(withoutSnapshot(o)),received_at:now}));
  const slotStored=stored.filter(o=>o.slot_id===slot.id),combined=[...stored,...freshRows];
  const slotEvidence=[...slotStored,...freshRows].map(o=>JSON.parse(o.evidence));
  for(const probe of definition.probes){const chain=combined.filter(o=>o.slot_id===slot.id&&o.probe===probe).map(o=>JSON.parse(o.evidence)).sort((a,b)=>a.attempt-b.attempt);if(chain.some((o,i)=>i<chain.length-1&&o.outcome!=='target_failure'))throw Error('Contradictory retry evidence')}
  const m=await get(env,slot.monitor_id);if(!m)throw Error('Monitor absent');
  const classified=classifyAttempts(definition,snapshot.slots,combined,now);
  const state=projectAttempts(definition,classified,combined,now,snapshot.checkpoint),current=m.revision===slot.revision&&!slot.manual;
  // DEPENDENCY-002: a followed catalog service raises dependency notices on the same confirmed transitions, never incidents.
  const followed=await env.DB.prepare('SELECT entry_id,catalog_version,scope FROM followed_services WHERE monitor_id=?').bind(m.id).first<any>(),openKind=followed?'dependency':'trigger',closeKind=followed?'dependency_recovery':'recovery';
  const last=await env.DB.prepare("SELECT kind,event FROM outbox WHERE monitor_id=? AND kind IN (?,?) AND status<>'imported-inactive' ORDER BY rowid DESC LIMIT 1").bind(m.id,openKind,closeKind).first<any>();
  const open=last?.kind===openKind;if(open&&state.targetState==='Healthy'&&state.recoveryStreak<definition.recoverSlots){state.targetState=state.underlyingState='Recovering';if(!state.maintenance)state.state='Recovering';state.confirmedFailure=true}state.notificationOpen=open;state.incidentKey=open?JSON.parse(last.event).incidentKey:null;state.incidentRevision=open?JSON.parse(last.event).monitorRevision??null:null;const changed=open?await definitionChange(env,m.id,state.incidentRevision,slot.revision,definition):null;if(changed){state.definitionChange=changed;state.reason+=definitionChangeNote(changed)}
  const kind=current&&!state.maintenance?(state.targetState==='Failing'&&!open?openKind:state.targetState==='Healthy'&&open?closeKind:null):null;
  if(kind){state.notificationOpen=kind===openKind;if(kind===openKind){state.incidentKey=`${followed?'dependency':'incident'}:${slot.id}`;state.incidentRevision=slot.revision}}
  const authority=`EXISTS(SELECT 1 FROM slots WHERE id=? AND status IN ('running','complete')
   AND lease_until>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)))
   AND EXISTS(SELECT 1 FROM runners WHERE runner_id=? AND revoked_at IS NULL)`;
  const terminal=terminalSlot(definition,slotEvidence);
  const availability=hosted?JSON.stringify(hostedAvailabilityRecord(
   {...slot,status:terminal?'complete':slot.status},definition,slotEvidence)):'';
  const statements:D1PreparedStatement[]=[];
  if(hosted){
   // Compare both native and hosted evidence under the D1 transaction. The
   // same monitor write publishes the new clock, state and settled checkpoint.
   const guard=`status IN ('running','complete') AND lease_until>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))
    AND EXISTS(SELECT 1 FROM evidence_generation g JOIN monitors m ON m.id=g.monitor_id
     WHERE g.monitor_id=? AND g.generation=? AND m.hosted_generation=?)
    AND EXISTS(SELECT 1 FROM runners WHERE runner_id=? AND revoked_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM observations WHERE id IN(SELECT value FROM json_each(?)))`;
   statements.push(hostedResultStatement(env,slot,slotStored,freshRows,definition,terminal,availability,guard,
    [Date.now(),slot.monitor_id,generation,hostedGeneration,runnerId,JSON.stringify(fresh.map((o:any)=>o.id))]),
    mutationGuard(env,'changes()=1'),hostedAvailabilityStatement(env.DB,slot.id,m.id));
  }else{
   statements.push(env.DB.prepare(`UPDATE evidence_generation SET generation=generation+1,projection_id=?
    WHERE monitor_id=? AND generation=? AND EXISTS(SELECT 1 FROM monitors WHERE id=monitor_id AND hosted_generation=?)
    AND ${authority}`).bind(crypto.randomUUID(),slot.monitor_id,generation,hostedGeneration,slot.id,Date.now(),runnerId),
     mutationGuard(env,'changes()=1'));
   if(terminal)statements.push(env.DB.prepare("UPDATE slots SET status='complete' WHERE id=? AND status<>'complete'").bind(slot.id));
   for(const o of fresh){
    const guard=nativeObservationIdGuard(env,o.id);
    if(guard)statements.push(guard);
    statements.push(env.DB.prepare('INSERT INTO observations(id,slot_id,probe,attempt,evidence) VALUES(?,?,?,?,?)')
     .bind(o.id,slot.id,o.probe,o.attempt,JSON.stringify(withoutSnapshot(o))));
   }
  }
  // A failed scheduled source invalidates its last live review durably, in the evidence transaction.
  // Recovery never renews review; only the owner's successful live check does. This survives evidence retention.
  if(followed&&current){
   const failed=fresh.filter((o:any)=>o.outcome==='runner_error'||o.checks?.some((c:any)=>c.assertion==='dependency'));
   if(failed.length)statements.push(env.DB.prepare(`UPDATE followed_services SET checked_at=NULL WHERE monitor_id=? AND checked_at<? AND EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)`).bind(m.id,Math.max(...failed.map((o:any)=>o.completedAt)),m.id,slot.revision));
  }
  statements.push(...await snapshotStatements(env,slot.monitor_id,slot.id,fresh,'1',[]));
  // API-004: incomplete cleanup becomes retained debt with the observations or not at all. Live steps spent their grant before
  // they were sent (spendGrant), so a result never adds to or caps that spend.
  statements.push(...debtStatements(env,slot,fresh,'1',[],now));
  if(!hosted)for(const o of fresh)statements.push(env.DB.prepare(`UPDATE runner_assignments SET received_times=json_set(received_times,?,?) WHERE slot_id=? AND probe=?`).bind(`$."${o.attempt}"`,now,slot.id,o.probe));
  if(!hosted&&snapshot.checkpointUpdate)statements.push(checkpointStatement(env,slot.monitor_id,slot.revision,snapshot.checkpointUpdate));
  if(kind){
   const trigger=kind===closeKind?await env.DB.prepare("SELECT event FROM outbox WHERE monitor_id=? AND kind=? AND json_extract(event,'$.incidentKey')=? AND status<>'imported-inactive' ORDER BY rowid DESC LIMIT 1").bind(m.id,openKind,state.incidentKey).first<{event:string}>():null;
   const slotObservations=finalAttempts(definition,slotEvidence);
   const event=followed?dependencyEvent({kind:kind as 'dependency'|'dependency_recovery',monitor:m,followed,slotId:slot.id,now,origin:env.UPTIME_ORIGIN,observations:slotObservations,previous:trigger?JSON.parse(trigger.event):null}):incidentEvent({id:`${slot.id}:${kind}`,kind,monitor:m,slotId:slot.id,now,state,observations:slotObservations,origin:env.UPTIME_ORIGIN,incidentKey:state.incidentKey,contextVersion:2,timeZone:(await notificationPreferences(env)).timeZone,trigger:trigger?JSON.parse(trigger.event):null});
   statements.push(env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,monitor_id,slot_id,kind,event) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)`).bind(event.id,m.id,slot.id,kind,JSON.stringify(event),m.id,m.revision));
   statements.push(...incidentDeliveryStatements(env,event,'1',[]));
  }
  if(current&&!state.maintenance){
   const event=await slowNotice(env,m,slot,fresh,now);
   if(event){
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,monitor_id,slot_id,kind,event) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)`).bind(event.id,m.id,slot.id,event.kind,JSON.stringify(event),m.id,m.revision));
    statements.push(...incidentDeliveryStatements(env,event,'1',[],definition.slow));
   }
  }
  // Staged expiry warnings and renewals (TLS-001, DOMAIN-001) follow the same current-revision and maintenance rules as incidents.
  if(current&&!state.maintenance&&['tls','domain'].includes(definition.type)){
   const notices=expiryNotices({monitor:m,slotId:slot.id,observations:finalAttempts(definition,slotEvidence),now,open:await openExpiryWarnings(env,m.id),origin:env.UPTIME_ORIGIN});
   for(const {kind:noticeKind,event} of notices){
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,monitor_id,slot_id,kind,event) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)`).bind(event.id,m.id,slot.id,noticeKind,JSON.stringify(event),m.id,m.revision));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at) SELECT ?||':'||id,?,id,name,kind,credential_id,?,? FROM notification_destinations WHERE enabled=1 AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM outbox WHERE id=? AND slot_id=?)`).bind(event.id,event.id,JSON.stringify(event),now,event.id,slot.id));
   }
  }
  const started=Math.max(...slotEvidence.filter(o=>o.attempt===0).map(o=>o.startedAt));
  const next=Number.isSafeInteger(started)?started+definition.intervalMs:null;
  if(hosted){
   // Unlike a signed runner, the Worker has supplied all attempts at
   // once. Fold this result if no earlier mutable slot blocks the cursor.
   const update=terminal&&classified[0]?.id===slot.id?{
    dueAt:slot.due_at,slotId:slot.id,checkpoint:foldAttempts(definition,[classified[0]],combined,snapshot.checkpoint),
   }:snapshot.checkpointUpdate;
   const checkpoint=update?JSON.stringify({...update,revision:slot.revision}):null;
   statements.push(env.DB.prepare(`UPDATE monitors
    SET hosted_generation=hosted_generation+1,
        hosted_slot=CASE WHEN hosted_slot=?5 AND ?7 THEN NULL ELSE hosted_slot END,
        hosted_availability_tail=${hostedAvailabilityTail('?5','?8')},
        state=CASE WHEN revision=?2 THEN ?3 ELSE state END,
        next_due=CASE WHEN revision=?2 AND ?4 IS NOT NULL THEN MAX(next_due,?4) ELSE next_due END,
        hosted_checkpoint=CASE WHEN revision=?2 THEN COALESCE(?6,hosted_checkpoint) ELSE hosted_checkpoint END
    WHERE id=?1`).bind(m.id,slot.revision,JSON.stringify(state),next,slot.id,checkpoint,Number(terminal),availability));
  }else if(current){
   statements.push(env.DB.prepare(`UPDATE monitors SET state=?,next_due=CASE WHEN ? IS NULL OR
    (json_extract(definition,'$.type')='heartbeat' AND next_due<=?) THEN next_due ELSE MAX(next_due,?) END
    WHERE id=? AND revision=?`).bind(JSON.stringify(state),next,slot.due_at,next,m.id,m.revision));
  }
  // Losing the authority check aborts the batch before evidence, state or
  // pending notifications can change, including on a concurrent erasure.
  try{await env.DB.batch(statements)}
  catch(error){
   if(classifyStorage(error)?.class!=='guard_conflict')throw error;
   if(!await env.DB.prepare("SELECT 1 FROM slots JOIN runners ON runners.runner_id=? WHERE slots.id=? AND slots.status IN ('running','complete') AND slots.lease_until>? AND runners.revoked_at IS NULL").bind(runnerId,slot.id,Date.now()).first())throw Error('Acceptance authority expired');
   const latest=await env.DB.prepare(`SELECT generation,hosted_generation FROM evidence_generation g JOIN monitors m ON m.id=g.monitor_id
    WHERE g.monitor_id=?`).bind(slot.monitor_id).first<{generation:number;hosted_generation:number}>();
   if(latest?.generation===generation&&latest.hosted_generation===hostedGeneration)throw error;
   continue;
  }
  if(current&&definition.type==='heartbeat')await scheduleHeartbeatEvaluation(env,m.id,false,Math.max(...attempts.map((o:any)=>o.heartbeatJob?.failure?.at??o.heartbeatJob?.receivedAt??o.heartbeatJob?.baselineAt??0)));
  if(!hosted)await env.DB.prepare('UPDATE runners SET last_contact_at=? WHERE runner_id=? AND revoked_at IS NULL').bind(now,runnerId).run();
  // Installation runner contact is an authenticated runner request; the Worker's own checks are not one.
  if(runnerId!==HOSTED_RUNNER_ID)await env.DB.prepare('INSERT INTO runner_contact(id,last_contact_at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET last_contact_at=excluded.last_contact_at').bind(now).run();
  return {accepted:true,state:current?state:null,...(hosted?{contactAt:now}:{})}
 }
}

function withoutSnapshot({failureSnapshot,...observation}:any){return observation}
