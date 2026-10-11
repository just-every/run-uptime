import {auditStatement,automated} from './audit.server.ts'
import {readCredential,retireObsoleteCredentials,notificationKeyPresent} from './notification-credentials.server.ts'
// @ts-expect-error Base mail is portable JavaScript verified by the donor suite.
import {MailValidationError} from '../base/modules/mail/index.mjs'
import {mailSender,mailConfigured} from './mail.server.ts'
import {mailContent} from './notification-content.ts'
import type {Bindings} from './control.server.ts'
export async function dispatchNotificationMail(env:Bindings){
 const now=Date.now();
 await env.DB.prepare("UPDATE notification_jobs SET state='uncertain',code='claim_expired',claim=NULL,claim_until=NULL,finished_at=? WHERE kind='email' AND state='sending' AND claim_until<=?").bind(now,now).run();
 const rows=await env.DB.prepare("SELECT j.*,c.id AS credential_record_id,c.destination_id AS credential_destination_id,c.created_at AS credential_created_at,c.endpoint,c.signing_secret,c.ciphertext,c.retired_at,c.unavailable_at FROM notification_jobs j JOIN notification_credentials c ON c.id=j.credential_id WHERE j.kind='email' AND j.state='queued' ORDER BY j.created_at LIMIT 10").all<any>();
 for(const row of rows.results){let credential;try{credential=await readCredential(env,{...row,id:row.credential_record_id,destination_id:row.credential_destination_id,created_at:row.credential_created_at})}catch{if(!notificationKeyPresent(env))continue;await env.DB.prepare("UPDATE notification_jobs SET state='rejected',code='credential_unavailable',finished_at=? WHERE id=? AND state='queued'").bind(Date.now(),row.id).run();continue}const claim=crypto.randomUUID();const changes=await env.DB.batch([env.DB.prepare("UPDATE notification_jobs SET state='sending',code='mail_sending',attempts=attempts+1,claim=?,claim_until=? WHERE id=? AND state='queued' AND EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_jobs.destination_id AND d.credential_id=notification_jobs.credential_id AND d.deleted_at IS NULL)").bind(claim,Date.now()+60000,row.id),auditStatement(env,automated,'notification_send','notification',crypto.randomUUID(),'changes()=1 AND ?=1',[Number(mailConfigured(env))])]);if(!changes[0].meta.changes)continue;
  let state='rejected',code='mail_not_configured';
  if(env.MAIL_FROM){try{const sender=mailSender(env);if(sender){const result=await sender.send({deliveryId:row.id,from:env.MAIL_FROM,to:[credential.endpoint],...mailContent(JSON.parse(row.event))});state=['accepted','development'].includes(result.status)?'accepted':result.status==='uncertain'?'uncertain':'rejected';code=result.status==='development'?'mail_development':result.code??`mail_${result.status}`}}catch(error){state=error instanceof MailValidationError?'rejected':'uncertain';code=error instanceof MailValidationError?'mail_input_invalid':'mail_result_unknown'}}
  await env.DB.prepare("UPDATE notification_jobs SET state=?,code=?,claim=NULL,claim_until=NULL,finished_at=? WHERE id=? AND state='sending' AND claim=? AND claim_until>?").bind(state,code,Date.now(),row.id,claim,Date.now()).run();
 }
 await retireObsoleteCredentials(env);
}
