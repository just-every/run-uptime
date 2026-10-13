import {auditStatement,automated} from './audit.server.ts'
import {readCredential,retireObsoleteCredentials,notificationKeyPresent} from './notification-credentials.server.ts'
// @ts-expect-error Base mail is portable JavaScript verified by the donor suite.
import {MailValidationError} from '../base/modules/mail/index.mjs'
import {mailSender,mailConfigured} from './mail.server.ts'
import {notificationMail,markSubmitted,retireDrillTokens} from './alert-drills.server.ts'
import {storageOperation,classifyStorage} from './storage-error.ts'
import type {Bindings} from './control.server.ts'
// Every storage step is named (see storage-error.ts). A D1 fault is never turned into a rejection or an uncertain send: the claim
// goes back to queued when nothing was sent yet, and the typed fault surfaces to the caller, so the next poll retries naturally.
// A claim is `mail_claimed` until the one write that hands the job to the sender marks it `mail_sending`. A claim that expires
// before that write (its release failed too) goes back to the queue and is sent once; one that expires after it may have been
// sent, so it ends uncertain and is never sent again.
export const expireMailClaims=(env:Bindings,now:number)=>[
 env.DB.prepare("UPDATE notification_jobs SET state='queued',code='waiting_for_runner',claim=NULL,claim_until=NULL,attempts=attempts-1 WHERE kind='email' AND state='sending' AND code='mail_claimed' AND claim_until<=?").bind(now),
 env.DB.prepare("UPDATE notification_jobs SET state='uncertain',code='claim_expired',claim=NULL,claim_until=NULL,finished_at=? WHERE kind='email' AND state='sending' AND claim_until<=?").bind(now,now),
]
export async function dispatchNotificationMail(env:Bindings){
 const now=Date.now(),op=storageOperation;
 await op('notifications.mail.expireClaims',()=>env.DB.batch(expireMailClaims(env,now)));
 const rows=await op('notifications.mail.selectQueued',()=>env.DB.prepare("SELECT j.*,c.id AS credential_record_id,c.destination_id AS credential_destination_id,c.created_at AS credential_created_at,c.endpoint,c.signing_secret,c.ciphertext,c.retired_at,c.unavailable_at FROM notification_jobs j JOIN notification_credentials c ON c.id=j.credential_id WHERE j.kind='email' AND j.state='queued' ORDER BY j.created_at LIMIT 10").all<any>());
 for(const row of rows.results){
  let credential;
  try{credential=await readCredential(env,{...row,id:row.credential_record_id,destination_id:row.credential_destination_id,created_at:row.credential_created_at})}
  catch(error){if(classifyStorage(error))throw error;if(!notificationKeyPresent(env))continue;await op('notifications.mail.rejectCredential',()=>env.DB.prepare("UPDATE notification_jobs SET state='rejected',code='credential_unavailable',finished_at=? WHERE id=? AND state='queued'").bind(Date.now(),row.id).run());continue}
  const claim=crypto.randomUUID();
  const changes=await op('notifications.mail.claim',()=>env.DB.batch([env.DB.prepare("UPDATE notification_jobs SET state='sending',code='mail_claimed',attempts=attempts+1,claim=?,claim_until=? WHERE id=? AND state='queued' AND EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_jobs.destination_id AND d.credential_id=notification_jobs.credential_id AND d.deleted_at IS NULL)").bind(claim,Date.now()+60000,row.id),auditStatement(env,automated,'notification_send','notification',crypto.randomUUID(),'changes()=1 AND ?=1',[Number(mailConfigured(env))])]));
  // Another dispatcher (the cron or a second poll) claimed this job first: nothing for this one to do.
  if(!changes[0].meta.changes)continue;
  let state='rejected',code='mail_not_configured',sender:ReturnType<typeof mailSender>|null=null,content:any;
  if(env.MAIL_FROM){
   try{
    sender=mailSender(env);
    if(sender){
     content=await op('notifications.mail.prepare',()=>notificationMail(env,row));
     // The transport boundary: this claim, still live, becomes mail_sending in the same write as the drill's submitted mark. A
     // dispatcher whose claim expired meanwhile changes nothing and sends nothing.
     const handed=await op('notifications.mail.markSubmitted',()=>env.DB.batch([env.DB.prepare("UPDATE notification_jobs SET code='mail_sending' WHERE id=? AND state='sending' AND code='mail_claimed' AND claim=? AND claim_until>?").bind(row.id,claim,Date.now()),markSubmitted(env,row.id,Date.now(),claim)]));
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
    try{const result=await sender.send({deliveryId:row.id,from:env.MAIL_FROM,to:[credential.endpoint],...content});state=['accepted','development'].includes(result.status)?'accepted':result.status==='uncertain'?'uncertain':'rejected';code=result.status==='development'?'mail_development':result.code??`mail_${result.status}`}
    catch(error){state=error instanceof MailValidationError?'rejected':'uncertain';code=error instanceof MailValidationError?'mail_input_invalid':'mail_result_unknown'}
   }
  }
  await op('notifications.mail.finish',()=>env.DB.prepare("UPDATE notification_jobs SET state=?,code=?,claim=NULL,claim_until=NULL,finished_at=? WHERE id=? AND state='sending' AND claim=? AND claim_until>?").bind(state,code,Date.now(),row.id,claim,Date.now()).run());
 }
 await op('notifications.mail.retireCredentials',()=>retireObsoleteCredentials(env));await op('notifications.mail.retireDrillTokens',()=>retireDrillTokens(env));
}
