import type {HostedClaimResult} from './hosted-scheduled-claim.server.ts'
import {hostedObservationId,hostedResultStatement,nativeObservationIdGuard} from './hosted-results.server.ts'
import {hostedAvailabilityRecord,hostedAvailabilityStatement,hostedAvailabilityTail} from './hosted-availability.server.ts'
import {mutationGuard} from './audit.server.ts'
import {classifyStorage} from './storage-error.ts'
import type {Bindings} from './control.server.ts'
import {validateHostedPass} from './hosted-pass-evidence.ts'
import {finalAttempts,terminalSlot,projectAttempts,foldAttempts} from './attempt-projection.ts'
import {attemptSnapshot,checkpointStatement,type AttemptClockRow,type ClaimedSlot} from './attempt-checkpoint.server.ts'
import {classifyAttempts} from './attempt-classification.ts'
import {HOSTED_RUNNER_ID} from './hosted-runner.ts'
import {QUIET_CONTENT_BYTES} from './quiet-checks.ts'
const utf8=new TextEncoder();
// Only the in-process executor can supply the immutable claim it just received.
export async function completeHostedAttempts(env:Bindings,task:HostedClaimResult,attempts:any[]){
 const slot={id:task.id,monitor_id:task.monitorId,revision:task.revision,due_at:task.dueAt,lease_until:task.acceptUntil,
  missed_count:task.missedCount,manual:false,status:'running'};
 const identified=attempts.map(o=>({...o,id:hostedObservationId(o.id,task.dueAt)}));
 // The claimed check's row in the scheduled tail, as its slot will read once this result writes it.
 const claimed={id:task.id,due_at:task.dueAt,lease_until:task.acceptUntil,assignments:JSON.stringify(task.probes.map(probe=>(
  {probe,delivered_at:task.deliveredAt,received_times:'{}'})))};
 return acceptAttempts(env,{slotId:task.id,attempts:identified},HOSTED_RUNNER_ID,{slot,definition:JSON.parse(task.encodedDefinition),
  encodedDefinition:task.encodedDefinition,clock:task.clock,claimed,probes:task.probes,cronNextDueAt:task.cronNextDueAt});
}
export function completeAttempts(env:Bindings,input:any,runnerId:string){return acceptAttempts(env,input,runnerId)}
async function acceptAttempts(env:Bindings,input:any,runnerId:string,hosted?:{slot:any;definition:any;encodedDefinition:string;clock?:AttemptClockRow;claimed:ClaimedSlot;probes:string[];cronNextDueAt:number|null}){
 const now=Date.now(),slot=hosted?.slot??await env.DB.prepare('SELECT * FROM slots WHERE id=?').bind(input.slotId).first<any>();
 if(!slot||!['running','complete'].includes(slot.status)||slot.lease_until<=now)throw Error('Invalid or expired acceptance window');
 const definition=hosted?.definition??JSON.parse(slot.definition),attempts=input.attempts;
 if(!Array.isArray(attempts)||!attempts.length||attempts.length>9)throw Error('Invalid observations');
 const assigned=hosted?.probes??(await env.DB.prepare('SELECT probe FROM runner_assignments WHERE slot_id=? AND runner_id=?').bind(slot.id,runnerId).all<{probe:string}>()).results.map(r=>r.probe);
 const seen=new Set();
 for(const o of attempts){
  if(!assigned.includes(o.probe))throw Error('Attempt requires its assigned runner');
  if(o.credentialBinding&&o.credentialBinding.monitorId!==slot.monitor_id)throw Error('Credential diagnostic monitor mismatch');
  if(!hosted||!validateHostedPass(o,definition,slot.due_at,now)){
   const {validateEvidence}=await import('./evidence.server.ts');
   validateEvidence(o,definition,slot.due_at,now);
  }
  if(o.completedAt>slot.lease_until)throw Error('Attempt outside acceptance window');
  const key=`${o.probe}:${o.attempt}`;
  if(seen.has(key))throw Error('Duplicate observation');
  seen.add(key);
 }
 if(definition.type==='heartbeat')await (await import('./heartbeat.server.ts')).validateHeartbeatSnapshot(env,slot,attempts);
 // A flow observation names the exact revision it ran: its digest is the digest of the flow in this slot's definition.
 if(definition.type==='flow'){
  // @ts-ignore The runner and Worker share the immutable flow digest.
  const {flowDigest}=await import('./flow.mjs');
  const digest=await flowDigest(definition.flow);for(const o of attempts)if(o.outcome!=='runner_error'&&o.flow?.digest!==digest)throw Error('Flow evidence does not name this revision')}
 let claimedClock=hosted?.clock;
 for(;;){
  const commitAt=Date.now();if(commitAt>=slot.lease_until)throw Error('Acceptance authority expired');
  const snapshot=await attemptSnapshot(env,slot.monitor_id,slot.revision,definition,now,slot.id,false,Boolean(hosted),claimedClock,hosted?.claimed);
  claimedClock=undefined;
  const {generation,hostedGeneration,observations:stored}=snapshot;
  const fresh=attempts.filter((o:any)=>!stored.some(s=>s.slot_id===slot.id&&s.probe===o.probe&&s.attempt===o.attempt));
  if(!fresh.length)return {accepted:true,duplicate:true};
  const evidence=fresh.map(withoutSnapshot);
  const freshRows=evidence.map((o:any)=>({slot_id:slot.id,probe:o.probe,attempt:o.attempt,evidence:JSON.stringify(o),received_at:now}));
  const slotStored=stored.filter(o=>o.slot_id===slot.id),combined=[...stored,...freshRows];
  const slotEvidence=[...slotStored.map(row=>JSON.parse(row.evidence)),...evidence];
  for(const probe of definition.probes){const chain=slotEvidence.filter(o=>o.probe===probe).sort((a,b)=>a.attempt-b.attempt);if(chain.some((o,i)=>i<chain.length-1&&o.outcome!=='target_failure'))throw Error('Contradictory retry evidence')}
  const context=await monitorContext(env,slot.monitor_id);if(!context)throw Error('Monitor absent');
  const {monitor:m,previous,claimBytes,followed,last,slow}=context;
  const classified=classifyAttempts(definition,snapshot.slots,combined,now);
  const state=projectAttempts(definition,classified,combined,now,snapshot.checkpoint),current=m.revision===slot.revision&&!slot.manual;
  // Followed catalog services raise dependency notices on the same confirmed transitions.
  const openKind=followed?'dependency':'trigger',closeKind=followed?'dependency_recovery':'recovery';
  const open=last?.kind===openKind;if(open&&state.targetState==='Healthy'&&state.recoveryStreak<definition.recoverSlots){state.targetState=state.underlyingState='Recovering';if(!state.maintenance)state.state='Recovering';state.confirmedFailure=true}state.notificationOpen=open;state.incidentKey=open?JSON.parse(last.event).incidentKey:null;state.incidentRevision=open?JSON.parse(last.event).monitorRevision??null:null;if(open){
   const {definitionChange,definitionChangeNote}=await import('./flow-changes.server.ts');
   const changed=await definitionChange(env,m.id,state.incidentRevision,slot.revision,definition);
   if(changed){state.definitionChange=changed;state.reason+=definitionChangeNote(changed)}
  }
  const kind=current&&!state.maintenance?(state.targetState==='Failing'&&!open?openKind:state.targetState==='Healthy'&&open?closeKind:null):null;
  if(kind){state.notificationOpen=kind===openKind;if(kind===openKind){state.incidentKey=`${followed?'dependency':'incident'}:${slot.id}`;state.incidentRevision=slot.revision}}
  const authority=`EXISTS(SELECT 1 FROM slots WHERE id=? AND status IN ('running','complete')
   AND lease_until>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)))
   AND EXISTS(SELECT 1 FROM runners WHERE runner_id=? AND revoked_at IS NULL)`;
  const terminal=terminalSlot(definition,slotEvidence);
  const availability=hosted?JSON.stringify(hostedAvailabilityRecord(
   {...slot,status:terminal?'complete':slot.status},definition,slotEvidence)):'';
  // A Worker result's own statements are chosen below, once its other effects are known.
  const statements:D1PreparedStatement[]=[];
  if(!hosted){
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
  if(fresh.some(o=>o.failureSnapshot)){
   const {snapshotStatements}=await import('./failure-snapshots.server.ts');
   statements.push(...await snapshotStatements(env,slot.monitor_id,slot.id,fresh,'1',[]));
  }
  // API-004: incomplete cleanup becomes retained debt with the observations or not at all. Live steps spent their grant before
  // they were sent (spendGrant), so a result never adds to or caps that spend.
  if(!hosted){
   const {debtStatements}=await import('./cleanup-debt.server.ts');
   statements.push(...debtStatements(env,slot,fresh,'1',[],now));
  }
  if(!hosted)for(const o of fresh)statements.push(env.DB.prepare(`UPDATE runner_assignments SET received_times=json_set(received_times,?,?) WHERE slot_id=? AND probe=?`).bind(`$."${o.attempt}"`,now,slot.id,o.probe));
  if(!hosted&&snapshot.checkpointUpdate)statements.push(checkpointStatement(env,slot.monitor_id,slot.revision,snapshot.checkpointUpdate));
  if(kind){
   const {incidentDeliveryStatements}=await import('./alert-route-delivery.server.ts');
   const trigger=kind===closeKind?await env.DB.prepare("SELECT event FROM outbox WHERE monitor_id=? AND kind=? AND json_extract(event,'$.incidentKey')=? AND status<>'imported-inactive' ORDER BY rowid DESC LIMIT 1").bind(m.id,openKind,state.incidentKey).first<{event:string}>():null;
   const slotObservations=finalAttempts(definition,slotEvidence);
   const event=followed?(await import('./dependency-notices.ts')).dependencyEvent({kind:kind as 'dependency'|'dependency_recovery',monitor:m,followed,slotId:slot.id,now,origin:env.UPTIME_ORIGIN,observations:slotObservations,previous:trigger?JSON.parse(trigger.event):null}):(await import('./notification-content.ts')).incidentEvent({id:`${slot.id}:${kind}`,kind,monitor:m,slotId:slot.id,now,state,observations:slotObservations,origin:env.UPTIME_ORIGIN,incidentKey:state.incidentKey,contextVersion:2,timeZone:(await (await import('./notification-preferences.server.ts')).notificationPreferences(env)).timeZone,trigger:trigger?JSON.parse(trigger.event):null});
   statements.push(env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,monitor_id,slot_id,kind,event) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)`).bind(event.id,m.id,slot.id,kind,JSON.stringify(event),m.id,m.revision));
   statements.push(...incidentDeliveryStatements(env,event,'1',[]));
  }
  if(current&&!state.maintenance&&(m.definition.slow||slow)){
   const {slowNotice}=await import('./slow-notices.server.ts');
   const event=await slowNotice(env,m,slot,fresh,now,slow);
   if(event){
    const {incidentDeliveryStatements}=await import('./alert-route-delivery.server.ts');
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,monitor_id,slot_id,kind,event) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)`).bind(event.id,m.id,slot.id,event.kind,JSON.stringify(event),m.id,m.revision));
    statements.push(...incidentDeliveryStatements(env,event,'1',[],definition.slow));
   }
  }
  // Staged expiry warnings and renewals (TLS-001, DOMAIN-001) follow the same current-revision and maintenance rules as incidents.
  if(current&&!state.maintenance&&['tls','domain'].includes(definition.type)){
   const {expiryNotices,openExpiryWarnings}=await import('./expiry-notices.server.ts');
   const notices=expiryNotices({monitor:m,slotId:slot.id,observations:finalAttempts(definition,slotEvidence),now,open:await openExpiryWarnings(env,m.id),origin:env.UPTIME_ORIGIN});
   for(const {kind:noticeKind,event} of notices){
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,monitor_id,slot_id,kind,event) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)`).bind(event.id,m.id,slot.id,noticeKind,JSON.stringify(event),m.id,m.revision));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at) SELECT ?||':'||id,?,id,name,kind,credential_id,?,? FROM notification_destinations WHERE enabled=1 AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM outbox WHERE id=? AND slot_id=?)`).bind(event.id,event.id,JSON.stringify(event),now,event.id,slot.id));
   }
  }
  const started=Math.max(...slotEvidence.filter(o=>o.attempt===0).map(o=>o.startedAt));
  const next=hosted?.cronNextDueAt==null&&Number.isSafeInteger(started)?started+definition.intervalMs:null;
  if(hosted){
   // Unlike a signed runner, the Worker has supplied all attempts at
   // once. Fold this result if no earlier mutable slot blocks the cursor.
   const folded=terminal&&classified[0]?.id===slot.id;
   const update=folded?{
    dueAt:slot.due_at,slotId:slot.id,checkpoint:foldAttempts(definition,[classified[0]],combined,snapshot.checkpoint),
   }:snapshot.checkpointUpdate;
   const checkpoint=update?JSON.stringify({...update,revision:slot.revision}):null;
   // Compare both native and hosted evidence under the D1 transaction. The
   // same monitor write publishes the new clock, state and settled checkpoint.
   const guard=`json_extract(m.hosted_claim,'$.leaseUntil')>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))
    AND m.hosted_generation=? AND EXISTS(SELECT 1 FROM evidence_generation g WHERE g.monitor_id=m.id AND g.generation=?)
    AND EXISTS(SELECT 1 FROM runners WHERE runner_id=? AND revoked_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM observations WHERE id IN(SELECT value FROM json_each(?)))`;
   const guardValues=[Date.now(),hostedGeneration,generation,runnerId,JSON.stringify(fresh.map((o:any)=>o.id))];
   // A quiet check (quiet-checks.ts) passed with nothing to report: one passing attempt at each location, no
   // other statement to write, a monitor that was Healthy with no incident open and stays so, and a checkpoint
   // that already covers it. It writes no slot row: its content joins its record on the monitor's tail.
   const quiet=folded&&current&&!followed&&!open&&!statements.length&&previous.state==='Healthy'&&state.state==='Healthy'&&
    !slotStored.length&&evidence.length===definition.probes.length&&
    evidence.every((o:any)=>o.attempt===0&&o.outcome==='pass'&&(!o.canary||o.canary.outcome==='pass'))&&
    utf8.encode(JSON.stringify(evidence)).length+claimBytes<=QUIET_CONTENT_BYTES?
    {attempts:JSON.stringify(evidence),receipts:JSON.stringify(Object.fromEntries(evidence.map((o:any)=>[o.probe,{0:now}])))}:undefined;
   statements.unshift(...(quiet?[
    // An edit between the read above and this write makes the check another revision's: the guard refuses, and the
    // retry below writes it as a slot row, since only the current revision's checkpoint covers a quiet check.
    mutationGuard(env,`EXISTS(SELECT 1 FROM monitors m WHERE m.id=? AND m.revision=? AND m.hosted_slot=? AND json_extract(m.hosted_claim,'$.id')=m.hosted_slot
     AND NOT EXISTS(SELECT 1 FROM slots WHERE id=m.hosted_slot) AND ${guard})`,[m.id,slot.revision,slot.id,...guardValues]),
   ]:[
    hostedResultStatement(env,slot,freshRows,definition,hosted.encodedDefinition,terminal,availability,guard,guardValues),
    mutationGuard(env,'changes()=1'),
   ]),hostedAvailabilityStatement(env.DB,slot.id,m.id,availability,quiet));
   statements.push(env.DB.prepare(`UPDATE monitors
    SET hosted_generation=hosted_generation+1,
        hosted_claim=CASE WHEN hosted_slot=?5 THEN NULL ELSE hosted_claim END,
        hosted_slot=CASE WHEN hosted_slot=?5 AND ?7 THEN NULL ELSE hosted_slot END,
        hosted_availability_tail=${hostedAvailabilityTail('?5','?8',quiet&&{attempts:'?9',receipts:'?10'})},
        state=CASE WHEN revision=?2 THEN ?3 ELSE state END,
        next_due=CASE WHEN revision=?2 AND ?4 IS NOT NULL THEN MAX(next_due,?4) ELSE next_due END,
        hosted_checkpoint=CASE WHEN revision=?2 THEN COALESCE(?6,hosted_checkpoint) ELSE hosted_checkpoint END
    WHERE id=?1`).bind(m.id,slot.revision,JSON.stringify(state),next,slot.id,checkpoint,Number(terminal),availability,
     ...(quiet?[quiet.attempts,quiet.receipts]:[])));
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
   const authorized=hosted?
    env.DB.prepare("SELECT 1 FROM monitors m JOIN runners ON runners.runner_id=? WHERE m.id=? AND m.hosted_slot=? AND json_extract(m.hosted_claim,'$.id')=m.hosted_slot AND json_extract(m.hosted_claim,'$.leaseUntil')>? AND runners.revoked_at IS NULL").bind(runnerId,slot.monitor_id,slot.id,Date.now()):
    env.DB.prepare("SELECT 1 FROM slots JOIN runners ON runners.runner_id=? WHERE slots.id=? AND slots.status IN ('running','complete') AND slots.lease_until>? AND runners.revoked_at IS NULL").bind(runnerId,slot.id,Date.now());
   if(!await authorized.first())throw Error('Acceptance authority expired');
   const latest=await env.DB.prepare(`SELECT generation,hosted_generation,m.revision FROM evidence_generation g JOIN monitors m ON m.id=g.monitor_id
    WHERE g.monitor_id=?`).bind(slot.monitor_id).first<{generation:number;hosted_generation:number;revision:number}>();
   if(latest?.generation===generation&&latest.hosted_generation===hostedGeneration&&latest.revision===m.revision)throw error;
   continue;
  }
  if(current&&definition.type==='heartbeat')await (await import('./heartbeat-jobs.server.ts')).scheduleHeartbeatEvaluation(env,m.id,false,Math.max(...attempts.map((o:any)=>o.heartbeatJob?.failure?.at??o.heartbeatJob?.receivedAt??o.heartbeatJob?.baselineAt??0)));
  if(!hosted)await env.DB.prepare('UPDATE runners SET last_contact_at=? WHERE runner_id=? AND revoked_at IS NULL').bind(now,runnerId).run();
  // Installation runner contact is an authenticated runner request; the Worker's own checks are not one.
  if(runnerId!==HOSTED_RUNNER_ID)await env.DB.prepare('INSERT INTO runner_contact(id,last_contact_at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET last_contact_at=excluded.last_contact_at').bind(now).run();
  return {accepted:true,state:current?state:null,...(hosted?{contactAt:now}:{})}
 }
}

type FollowedService={entry_id:string;catalog_version:number;scope:'component'|'whole'};

async function monitorContext(env:Bindings,id:string){
 // Only the newest incident (or dependency notice) and latency transition can
 // affect this result. Keep both lookups on the monitor-and-kind index.
 const row=await env.DB.prepare(`SELECT m.id,m.revision,m.definition,m.state,COALESCE(length(CAST(m.hosted_claim AS BLOB)),0) AS claim_bytes,
   f.entry_id,f.catalog_version,f.scope,
   (SELECT json_object('kind',kind,'event',event) FROM outbox
    WHERE monitor_id=m.id AND status<>'imported-inactive'
      AND kind IN (CASE WHEN f.monitor_id IS NULL THEN 'trigger' ELSE 'dependency' END,
                   CASE WHEN f.monitor_id IS NULL THEN 'recovery' ELSE 'dependency_recovery' END)
    ORDER BY rowid DESC LIMIT 1) AS latest,
   (SELECT event FROM outbox WHERE monitor_id=m.id AND kind='slow' AND status<>'imported-inactive'
     AND rowid>COALESCE((SELECT MAX(rowid) FROM outbox
       WHERE monitor_id=m.id AND kind='slow_recovery' AND status<>'imported-inactive'),0)
     ORDER BY rowid DESC LIMIT 1) AS slow
  FROM monitors m LEFT JOIN followed_services f ON f.monitor_id=m.id WHERE m.id=?`)
  .bind(id).first<{id:string;revision:number;definition:string;state:string;claim_bytes:number;latest:string|null;slow:string|null}
    & (FollowedService|{entry_id:null;catalog_version:null;scope:null})>();
 if(!row)return null;
 return {
  monitor:{id:row.id,revision:row.revision,definition:JSON.parse(row.definition)},
  // The state the monitor's last accepted result left.
  previous:JSON.parse(row.state) as {state?:string},
  // The size of the claim the monitor holds: a quiet check stores the claim's delivery envelope with its attempts.
  claimBytes:row.claim_bytes,
  followed:row.entry_id===null?null:{entry_id:row.entry_id,catalog_version:row.catalog_version,scope:row.scope},
  last:row.latest?JSON.parse(row.latest):null,
  slow:row.slow?JSON.parse(row.slow):null,
 };
}

function withoutSnapshot({failureSnapshot,...observation}:any){return observation}
