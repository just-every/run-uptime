import {contactReady,advanceContactSchedules} from './contact-scheduler.server.ts'
import {advanceFallbackChains,attemptPhase} from './notification-fallback.server.ts'
import {auditStatement,automated} from './audit.server.ts'
import {readCredential,retireObsoleteCredentials,notificationKeyPresent} from './notification-credentials.server.ts'
// @ts-expect-error Base mail is portable JavaScript verified by the donor suite.
import {MailValidationError} from '../base/modules/mail/index.mjs'
import {mailSender,mailConfigured} from './mail.server.ts'
import {notificationMail,markSubmitted,retireDrillTokens} from './alert-drills.server.ts'
import {storageOperation,classifyStorage} from './storage-error.ts'
import type {Bindings} from './control.server.ts'
import type {SubrequestBudget} from './worker-budget.ts'
import {recoveryAccepted,settleUnmatchedRecoveries} from './alert-route-delivery.server.ts'
// Every storage step is named (see storage-error.ts). A D1 fault is never turned into a rejection or an uncertain send: the claim
// goes back to queued when nothing was sent yet, and the typed fault surfaces to the caller, so the next poll retries naturally.
// A claim is `mail_claimed` until the one write that hands the job to the sender marks it `mail_sending`. A claim that expires
// before that write (its release failed too) goes back to the queue and is sent once; one that expires after it may have been
// sent, so it ends uncertain and is never sent again.
export const expireMailClaims=(env:Bindings,now:number)=>[
 env.DB.prepare("UPDATE notification_jobs SET state='queued',code='waiting_for_runner',claim=NULL,claim_until=NULL,attempts=attempts-1 WHERE kind='email' AND state='sending' AND code='mail_claimed' AND claim_until<=?").bind(now),
 // A handed-over message whose claim expired may have been sent: its attempt record ends uncertain with the job.
 env.DB.prepare("UPDATE notification_delivery_attempts SET finished_at=?,outcome_category='uncertain',code='claim_expired' WHERE finished_at IS NULL AND delivery_id IN(SELECT id FROM notification_jobs WHERE kind='email' AND state='sending' AND claim_until<=?)").bind(now,now),
 env.DB.prepare("UPDATE notification_jobs SET state='uncertain',code='claim_expired',claim=NULL,claim_until=NULL,finished_at=? WHERE kind='email' AND state='sending' AND claim_until<=?").bind(now,now),
]
// DELIVERY-002 audits every email attempt like a webhook attempt: one durable record per hand-over to the provider,
// with no address, body or provider credential. Email is never resent automatically (DELIVERY-001).
const mailAttemptStart=(env:Bindings,id:string,claim:string,scheduledAt:number,now:number)=>env.DB.prepare(`INSERT OR IGNORE INTO notification_delivery_attempts(delivery_id,destination_id,number,phase,scheduled_at,started_at,key_reference)
 SELECT j.id,j.destination_id,j.attempts,${attemptPhase()},?,?,j.event_id FROM notification_jobs j WHERE j.id=? AND j.claim=? AND j.code='mail_sending'`).bind(Math.min(scheduledAt,now),now,id,claim);
const mailAttemptFinish=(env:Bindings,id:string,claim:string,category:string,code:string,retryAfterSeconds:number|null,now:number)=>env.DB.prepare(`UPDATE notification_delivery_attempts SET finished_at=?,outcome_category=?,code=?,retry_after_seconds=?
 WHERE finished_at IS NULL AND (delivery_id,number) IN(SELECT id,attempts FROM notification_jobs WHERE id=? AND state='sending' AND claim=? AND claim_until>?)`).bind(now,category,code,retryAfterSeconds,id,claim,now);
export async function dispatchNotificationMail(env:Bindings,budget?:SubrequestBudget){
 const now=Date.now(),op=storageOperation;
 await advanceContactSchedules(env);await op('notifications.mail.fallbacks',()=>advanceFallbackChains(env));
 await op('notifications.mail.expireClaims',()=>env.DB.batch(expireMailClaims(env,now)));
 await op('notifications.mail.recoveryMatches',()=>settleUnmatchedRecoveries(env));
 const rows=await op('notifications.mail.selectQueued',()=>env.DB.prepare(`SELECT j.*,c.id AS credential_record_id,c.destination_id AS credential_destination_id,c.created_at AS credential_created_at,c.endpoint,c.signing_secret,c.ciphertext,c.retired_at,c.unavailable_at FROM notification_jobs j JOIN notification_credentials c ON c.id=j.credential_id WHERE j.kind='email' AND j.state='queued' AND ${recoveryAccepted()} AND ${contactReady()} AND (j.claim_until IS NULL OR j.claim_until<=?) ORDER BY j.created_at LIMIT 10`).bind(now).all<any>());
 for(const row of rows.results){
  let credential;
  try{credential=await readCredential(env,{...row,id:row.credential_record_id,destination_id:row.credential_destination_id,created_at:row.credential_created_at})}
  catch(error){if(classifyStorage(error))throw error;if(!notificationKeyPresent(env))continue;await op('notifications.mail.rejectCredential',()=>env.DB.prepare("UPDATE notification_jobs SET state='rejected',code='credential_unavailable',finished_at=? WHERE id=? AND state='queued'").bind(Date.now(),row.id).run());continue}
  // A provider request the run cannot afford waits, still queued, for the next run.
  if(budget&&!budget.reserve(1))break;
  const claim=crypto.randomUUID();
  const changes=await op('notifications.mail.claim',()=>env.DB.batch([env.DB.prepare(`UPDATE notification_jobs SET state='sending',code='mail_claimed',attempts=attempts+1,claim=?,claim_until=? WHERE id=? AND state='queued' AND ${recoveryAccepted('notification_jobs')} AND ${contactReady('notification_jobs')} AND (claim_until IS NULL OR claim_until<=?) AND EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_jobs.destination_id AND d.credential_id=notification_jobs.credential_id AND d.deleted_at IS NULL AND (d.enabled=1 OR json_extract(notification_jobs.event,'$.kind')='test'))`).bind(claim,Date.now()+60000,row.id,Date.now()),auditStatement(env,automated,'notification_send','notification',crypto.randomUUID(),'changes()=1 AND ?=1',[Number(mailConfigured(env))])]));
  // Another dispatcher (the cron or a second poll) claimed this job first: nothing for this one to do.
  if(!changes[0].meta.changes)continue;
  let retryAt:number|undefined,state='rejected',code='mail_not_configured',sender:ReturnType<typeof mailSender>|null=null,content:any;
  if(env.MAIL_FROM){
   try{
    sender=mailSender(env);
    if(sender){
     content=await op('notifications.mail.prepare',()=>notificationMail(env,row));
     // The transport boundary: this claim, still live, becomes mail_sending in the same write as the drill's submitted mark. A
     // dispatcher whose claim expired meanwhile changes nothing and sends nothing.
     const handedAt=Date.now(),handed=await op('notifications.mail.markSubmitted',()=>env.DB.batch([env.DB.prepare(`UPDATE notification_jobs SET code='mail_sending' WHERE id=? AND state='sending' AND code='mail_claimed' AND claim=? AND claim_until>? AND ${contactReady('notification_jobs')}`).bind(row.id,claim,handedAt),markSubmitted(env,row.id,handedAt,claim),mailAttemptStart(env,row.id,claim,row.claim_until??row.created_at,handedAt)]));
     if(!handed[0].meta.changes)continue
    }
   }catch(error){
    if(classifyStorage(error)){
     // Nothing was sent: the job goes back to the queue instead of ending uncertain. If this write fails too, the claim stays
     // mail_claimed and its expiry puts it back; the fault that surfaces is the first one.
     await op('notifications.mail.releaseClaim',()=>env.DB.prepare("UPDATE notification_jobs SET state='queued',code='waiting_for_runner',claim=NULL,claim_until=NULL,attempts=attempts-1 WHERE id=? AND state='sending' AND code='mail_claimed' AND claim=?").bind(row.id,claim).run()).catch(()=>{});
     throw error
    }
    state=error instanceof MailValidationError?'rejected':'uncertain';code=error instanceof MailValidationError?'mail_input_invalid':'mail_result_unknown';sender=null
   }
   if(sender){
    try{const result=await sender.send({deliveryId:row.id,from:env.MAIL_FROM,to:[credential.endpoint],...content});state=['accepted','development'].includes(result.status)?'accepted':result.status==='uncertain'?'uncertain':'rejected';code=result.status==='development'?'mail_development':result.code??`mail_${result.status}`;
     // A 429 confirms the relay did not accept the message. Keep it queued until Retry-After;
     // claim_until is the queued job's not-before time and becomes a lease when claimed.
     if(result.status==='rate_limited'&&result.retryAt!==undefined){state='queued';retryAt=result.retryAt}
    }
    catch(error){state=error instanceof MailValidationError?'rejected':'uncertain';code=error instanceof MailValidationError?'mail_input_invalid':'mail_result_unknown'}
   }
  }
  const finishedAt=Date.now();
  await op('notifications.mail.finish',()=>env.DB.batch([mailAttemptFinish(env,row.id,claim,state==='queued'?'retryable':state,code,retryAt===undefined?null:Math.max(0,(retryAt-finishedAt)/1000),finishedAt),env.DB.prepare("UPDATE notification_jobs SET state=?,code=?,claim=NULL,claim_until=?,finished_at=? WHERE id=? AND state='sending' AND claim=? AND claim_until>?").bind(state,code,retryAt??null,retryAt===undefined?finishedAt:null,row.id,claim,finishedAt)]));
 }
 await op('notifications.mail.retireCredentials',()=>retireObsoleteCredentials(env));await op('notifications.mail.retireDrillTokens',()=>retireDrillTokens(env));
}
