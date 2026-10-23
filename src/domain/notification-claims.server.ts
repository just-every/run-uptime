import {contactReady,contactQuietReady,refreshContactQuiet} from './contact-scheduler.server.ts'
import {auditStatement,automated} from './audit.server.ts'
import {sha256} from '../base/modules/integrations/core/crypto.ts'
import {readCredential,notificationKeyPresent,type CredentialRow} from './notification-credentials.server.ts'
import type {Bindings} from './control.server.ts'
import {recoveryAccepted} from './alert-route-delivery.server.ts'
const namespace='uptime-notifications';
// Both admission and release run this policy in their own atomic transaction.
// Optional proof keeps unsuccessful releases from mutating unrelated queued work.
function queuedPolicyStatements(env:Bindings,id:string,now:number,proof?:{claim:string;reservationHash:string}){
 const guard=proof?' AND EXISTS(SELECT 1 FROM notification_claim_custody WHERE claim=? AND delivery_id=? AND released_at=? AND reservation_hash=? AND started_at IS NULL)':'';
 const values=proof?[proof.claim,id,now,proof.reservationHash]:[];
 return [
  env.DB.prepare(`UPDATE notification_jobs SET state='rejected',finished_at=?,code=CASE
   WHEN EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_jobs.destination_id AND d.deleted_at IS NOT NULL) THEN 'destination_deleted'
   WHEN NOT EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_jobs.destination_id AND d.credential_id=notification_jobs.credential_id) THEN 'credential_rotated'
   WHEN json_extract(event,'$.kind')<>'test' AND EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_jobs.destination_id AND d.enabled=0) THEN 'destination_disabled'
   ELSE 'credential_unavailable' END
   WHERE id=? AND state='queued'
   AND NOT EXISTS(SELECT 1 FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id AND c.destination_id=d.id
    WHERE d.id=notification_jobs.destination_id AND d.credential_id=notification_jobs.credential_id AND d.deleted_at IS NULL
    AND (d.enabled=1 OR json_extract(notification_jobs.event,'$.kind')='test')
    AND c.retired_at IS NULL AND c.unavailable_at IS NULL AND c.ciphertext IS NOT NULL AND c.endpoint IS NULL AND c.signing_secret IS NULL)
   AND EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace=? AND d.id=notification_jobs.id AND d.state='queued')${guard}` ).bind(now,id,namespace,...values),
  env.DB.prepare(`UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace=? AND id=? AND state='queued'
   AND EXISTS(SELECT 1 FROM notification_jobs WHERE id=? AND state='rejected')${guard}` ).bind(now,namespace,id,id,...values),
 ];
}
/** Edition admission adds current destination/custody policy to Base's claim
 * and attempt transaction. A cached poll is never fresh sending authority. */
export async function claimNotification(env:Bindings,id:string,now:number,leaseMs:number){
 await refreshContactQuiet(env,id);
 // Decryption is scoped to this queued delivery under the current Worker key.
 // Neither a previous poll nor an unavailable_at marker establishes custody.
 const credential=await env.DB.prepare(`SELECT c.* FROM notification_jobs j
  JOIN notification_credentials c ON c.id=j.credential_id AND c.destination_id=j.destination_id
  JOIN integration_deliveries d ON d.namespace=? AND d.id=j.id
  WHERE j.id=? AND j.state='queued' AND d.state='queued' AND d.next_at<=? AND d.attempts<d.max_attempts`).bind(namespace,id,now).first<CredentialRow>();
 let verified:CredentialRow|null=null;
 const invalid=[];
 if(credential){
  try{await readCredential(env,credential);verified=credential}
  catch{
   // A missing or short key says nothing about this row: leave it queued.
   // Do not mark a replacement row using an earlier failed observation.
   if(notificationKeyPresent(env))invalid.push(env.DB.prepare(`UPDATE notification_credentials SET unavailable_at=?,endpoint=NULL,signing_secret=NULL
    WHERE id=? AND destination_id=? AND created_at=? AND ciphertext IS ? AND endpoint IS ? AND signing_secret IS ?
    AND retired_at IS NULL AND unavailable_at IS NULL`).bind(now,credential.id,credential.destination_id,credential.created_at,credential.ciphertext,credential.endpoint,credential.signing_secret));
  }
 }
 // A restart after the absolute window cannot start an overdue stored retry.
 // A first reservation released unsent for quiet is still entitled to its first send.
 await env.DB.batch([
  env.DB.prepare(`UPDATE notification_delivery_attempts SET finished_at=?,outcome_category='rejected',code='retry_window_exhausted'
   WHERE delivery_id=? AND started_at IS NULL AND finished_at IS NULL AND EXISTS(SELECT 1 FROM integration_deliveries d JOIN notification_retry_policy p ON p.delivery_id=d.id WHERE d.namespace=? AND d.id=? AND d.state='queued' AND d.created_at+p.window_ms<=? AND (d.attempts>0 OR NOT EXISTS(SELECT 1 FROM notification_jobs j WHERE j.id=d.id AND j.code='waiting_for_contact_quiet')))` ).bind(now,id,namespace,id,now),
  env.DB.prepare(`UPDATE integration_deliveries SET state='rejected' WHERE namespace=? AND id=? AND state='queued' AND EXISTS(SELECT 1 FROM notification_retry_policy p WHERE p.delivery_id=integration_deliveries.id AND integration_deliveries.created_at+p.window_ms<=? AND (integration_deliveries.attempts>0 OR NOT EXISTS(SELECT 1 FROM notification_jobs j WHERE j.id=integration_deliveries.id AND j.code='waiting_for_contact_quiet')))` ).bind(namespace,id,now),
 ]);
 const claim=crypto.randomUUID();
 const result=await env.DB.batch([
  ...invalid,
  ...queuedPolicyStatements(env,id,now),
  env.DB.prepare(`UPDATE integration_deliveries SET state='sending',attempts=attempts+1,claim=?,claim_until=?
   WHERE namespace=? AND id=? AND state='queued' AND next_at<=? AND attempts<max_attempts
   AND EXISTS(SELECT 1 FROM notification_jobs j JOIN notification_credentials c ON c.id=j.credential_id AND c.destination_id=j.destination_id
    WHERE j.id=? AND j.state='queued' AND c.id=? AND c.destination_id=? AND c.created_at=? AND c.ciphertext=?
    AND c.retired_at IS NULL AND c.unavailable_at IS NULL AND c.endpoint IS NULL AND c.signing_secret IS NULL AND ${recoveryAccepted()} AND ${contactReady()})`)
    // Bind the exact authenticated version and AAD identity in the transaction:
    // any mutation while decryption yielded requires a fresh validation.
    .bind(claim,now+leaseMs,namespace,id,now,id,verified?.id??null,verified?.destination_id??null,verified?.created_at??null,verified?.ciphertext??null),
  env.DB.prepare(`INSERT INTO integration_attempts(namespace,id,delivery_id,number,started_at)
   SELECT namespace,claim,id,attempts,? FROM integration_deliveries WHERE namespace=? AND id=? AND claim=?`).bind(now,namespace,id,claim),
 ]);
 return result[result.length-2].meta.changes?claim:null;
}
/** Releasing requires a reservation secret delivered only by the claiming
 * runner, never exposed by get/log. Legacy claims cannot return to the queue. */
export async function registerClaim(env:Bindings,id:string,claim:string,reservation:string,now:number){
 await env.DB.prepare(`INSERT INTO notification_claim_custody(claim,delivery_id,created_at,reservation_hash)
  SELECT claim,id,?,? FROM integration_deliveries WHERE namespace=? AND id=? AND claim=? AND state='sending' AND claim_until>?`).bind(now,await sha256(reservation),namespace,id,claim,now).run();
}
export async function startClaim(env:Bindings,id:string,claim:unknown,reservation:unknown,now:number){
 if(typeof claim!=='string'||typeof reservation!=='string'||reservation.length>128)return false;
 await refreshContactQuiet(env,id);
 const reservationHash=await sha256(reservation);
 now=Date.now();
 const result=await env.DB.batch([env.DB.prepare(`UPDATE notification_claim_custody SET started_at=? WHERE delivery_id=? AND claim=? AND reservation_hash=? AND started_at IS NULL AND released_at IS NULL
  AND EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace=? AND d.id=? AND d.claim=? AND d.state='sending' AND d.claim_until>? AND EXISTS(SELECT 1 FROM notification_jobs j WHERE j.id=d.id AND ${contactReady()}))`).bind(now,id,claim,reservationHash,namespace,id,claim,now),auditStatement(env,automated,'notification_send','notification',crypto.randomUUID(),'changes()=1',[],now),
  // A drill's Submitted time is the transport boundary of its one attempt, recorded only with a started claim.
  env.DB.prepare(`UPDATE notification_delivery_attempts SET started_at=? WHERE delivery_id=? AND number=(SELECT attempts FROM integration_deliveries WHERE namespace=? AND id=? AND claim=?) AND EXISTS(SELECT 1 FROM notification_claim_custody WHERE delivery_id=? AND claim=? AND started_at=?)`).bind(now,id,namespace,id,claim,id,claim,now),
  env.DB.prepare('UPDATE alert_drills SET submitted_at=? WHERE delivery_id=? AND submitted_at IS NULL AND EXISTS(SELECT 1 FROM notification_claim_custody WHERE delivery_id=? AND claim=? AND started_at=?)').bind(now,id,id,claim,now)]);
 if(!result[0].meta.changes&&await env.DB.prepare(`SELECT 1 FROM notification_jobs j WHERE j.id=? AND NOT ${contactQuietReady()}`).bind(id).first()){
  // A valid reservation which reached the boundary inside quiet hours never
  // handed anything to a transport. Release its custody and attempt together.
  await releaseUnstartedClaim(env,id,claim,reservation,Date.now(),'waiting_for_contact_quiet');
 }
 return Boolean(result[0].meta.changes);
}
export async function releaseUnstartedClaim(env:Bindings,id:string,claim:unknown,reservation:unknown,now:number,reason='runner_clock_ahead'){
 if(typeof claim!=='string'||typeof reservation!=='string'||reservation.length>128)return false;
 return releaseReservation(env,id,claim,await sha256(reservation),now,reason);
}
async function releaseReservation(env:Bindings,id:string,claim:string,reservationHash:string,now:number,reason:string){
 const live=reason==='waiting_for_contact_quiet'?'1=1':'d.claim_until>?',liveValues=reason==='waiting_for_contact_quiet'?[]:[now];
 const result=await env.DB.batch([
  env.DB.prepare(`UPDATE notification_claim_custody SET released_at=? WHERE delivery_id=? AND claim=? AND reservation_hash=? AND started_at IS NULL AND released_at IS NULL
   AND EXISTS(SELECT 1 FROM integration_deliveries d JOIN integration_attempts a ON a.namespace=d.namespace AND a.id=d.claim
    WHERE d.namespace=? AND d.id=? AND d.claim=? AND d.state='sending' AND ${live} AND a.finished_at IS NULL)` ).bind(now,id,claim,reservationHash,namespace,id,claim,...liveValues),
  // Preserve the reservation identity above; only a proven unsent reservation
  // relinquishes its Base attempt number. No committed transport is replayable.
  env.DB.prepare(`DELETE FROM integration_attempts WHERE namespace=? AND delivery_id=? AND id=? AND finished_at IS NULL
   AND EXISTS(SELECT 1 FROM notification_claim_custody WHERE claim=? AND delivery_id=? AND released_at=? AND reservation_hash=? AND started_at IS NULL)` ).bind(namespace,id,claim,claim,id,now,reservationHash),
  env.DB.prepare(`UPDATE integration_deliveries SET state='queued',attempts=attempts-1,claim=NULL,claim_until=NULL WHERE namespace=? AND id=? AND claim=? AND state='sending'
   AND EXISTS(SELECT 1 FROM notification_claim_custody WHERE claim=? AND delivery_id=? AND released_at=? AND reservation_hash=? AND started_at IS NULL)` ).bind(namespace,id,claim,claim,id,now,reservationHash),
  // A reservation protected this work from queued cancellation. Returning it
  // must apply the current destination policy before another runner can claim
  // it, including runners that already polled the old credentials.
  ...queuedPolicyStatements(env,id,now,{claim,reservationHash}),
  env.DB.prepare(`UPDATE notification_jobs SET code=? WHERE id=? AND state='queued'
   AND EXISTS(SELECT 1 FROM notification_claim_custody WHERE claim=? AND delivery_id=? AND released_at=? AND reservation_hash=? AND started_at IS NULL)` ).bind(reason,id,claim,id,now,reservationHash),
 ]);
 return Boolean(result[2].meta.changes);
}

/** A restart can land between the quiet evaluation and a runner's start RPC.
 * Registered, never-started custody proves no transport was handed the work;
 * reclaim those quiet-policy reservations before Base expires them uncertain. */
export async function releaseQuietClaims(env:Bindings,now:number){
 await refreshContactQuiet(env);
 const rows=(await env.DB.prepare(`SELECT c.delivery_id,c.claim,c.reservation_hash FROM notification_claim_custody c
  JOIN integration_deliveries d ON d.namespace=? AND d.id=c.delivery_id AND d.claim=c.claim
  JOIN notification_jobs j ON j.id=d.id
  WHERE d.state='sending' AND c.started_at IS NULL AND c.released_at IS NULL AND c.reservation_hash IS NOT NULL
  AND (d.claim_until<=? OR NOT ${contactQuietReady()})
  AND EXISTS(SELECT 1 FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id
   WHERE t.destination_id=j.destination_id AND s.monitor_id=json_extract(j.event,'$.monitorId') AND s.incident_key=json_extract(j.event,'$.incidentKey') AND (s.quiet_rules IS NOT NULL OR s.route_quiet_rules IS NOT NULL))`)
  .bind(namespace,now).all<{delivery_id:string;claim:string;reservation_hash:string}>()).results;
 for(const row of rows)await releaseReservation(env,row.delivery_id,row.claim,row.reservation_hash,now,'waiting_for_contact_quiet');
}
