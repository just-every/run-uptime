import {readCredential,retireObsoleteCredentials,notificationKeyPresent} from './notification-credentials.server.ts'
// @ts-expect-error Base mail is portable JavaScript verified by the donor suite.
import {createMailSender,MailValidationError} from '../base/modules/mail/index.mjs'
import {mailContent} from './notification-content.ts'
import type {Bindings} from './control.server.ts'
export async function dispatchNotificationMail(env:Bindings){
 const now=Date.now();
 await env.DB.prepare("UPDATE notification_jobs SET state='uncertain',code='claim_expired',claim=NULL,claim_until=NULL,finished_at=? WHERE kind='email' AND state='sending' AND claim_until<=?").bind(now,now).run();
 const rows=await env.DB.prepare("SELECT j.*,c.id AS credential_record_id,c.destination_id AS credential_destination_id,c.created_at AS credential_created_at,c.endpoint,c.signing_secret,c.ciphertext,c.retired_at,c.unavailable_at FROM notification_jobs j JOIN notification_credentials c ON c.id=j.credential_id WHERE j.kind='email' AND j.state='queued' ORDER BY j.created_at LIMIT 10").all<any>();
 for(const row of rows.results){let credential;try{credential=await readCredential(env,{...row,id:row.credential_record_id,destination_id:row.credential_destination_id,created_at:row.credential_created_at})}catch{if(!notificationKeyPresent(env))continue;await env.DB.prepare("UPDATE notification_jobs SET state='rejected',code='credential_unavailable',finished_at=? WHERE id=? AND state='queued'").bind(Date.now(),row.id).run();continue}const claim=crypto.randomUUID();const change=await env.DB.prepare("UPDATE notification_jobs SET state='sending',code='mail_sending',attempts=attempts+1,claim=?,claim_until=? WHERE id=? AND state='queued'").bind(claim,Date.now()+60000,row.id).run();if(!change.meta.changes)continue;
  let state='rejected',code='mail_not_configured';
  if(env.MAIL_FROM&&env.SENDGRID_API_KEY){try{const sender=createMailSender({provider:'sendgrid',mode:'production',apiKey:env.SENDGRID_API_KEY});const result=await sender.send({deliveryId:row.id,from:env.MAIL_FROM,to:[credential.endpoint],...mailContent(JSON.parse(row.event))});state=result.status==='accepted'?'accepted':result.status==='uncertain'?'uncertain':'rejected';code=result.code??`mail_${result.status}`}catch(error){state=error instanceof MailValidationError?'rejected':'uncertain';code=error instanceof MailValidationError?'mail_input_invalid':'mail_result_unknown'}}
  await env.DB.prepare("UPDATE notification_jobs SET state=?,code=?,claim=NULL,claim_until=NULL,finished_at=? WHERE id=? AND state='sending' AND claim=? AND claim_until>?").bind(state,code,Date.now(),row.id,claim,Date.now()).run();
 }
 await retireObsoleteCredentials(env);
}
