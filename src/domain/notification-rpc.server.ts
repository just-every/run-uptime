import {deduplicatedNotification,notificationRetryTime} from './notification-retry.ts'
import {contactReady,advanceContactSchedules} from './contact-scheduler.server.ts'
import {ensureNotificationCustody,readCredential,retireObsoleteCredentials,notificationDestinationHash,notificationKeyPresent} from './notification-credentials.server.ts'
import {claimNotification,releaseUnstartedClaim,startClaim,registerClaim} from './notification-claims.server.ts'
import {D1SqlDatabase} from '../base/modules/integrations/core/database.ts'
import {pickEnvelope,IntegrationsRepository} from '../base/modules/integrations/core/repository.ts'
import type {Delivery} from '../base/modules/integrations/core/types.ts'
import {DeliveryService} from '../base/modules/integrations/core/delivery.ts'
import {SLACK_WEBHOOK_PROTOCOL} from '../base/modules/integrations/slack/protocol.ts'
import {notificationProtocols} from './notification-protocols.ts'
import {slackContent} from './notification-content.ts'
import {NOTIFICATION_NAMESPACE} from './notifications.server.ts'
import {dispatchNotificationMail,expireMailClaims} from './notification-mail.server.ts'
import {recordContact} from './runner-contact.server.ts'
import {withDrillBody,retireDrillTokens} from './alert-drills.server.ts'
import {storageOperation,classifyStorage} from './storage-error.ts'
import type {Bindings} from './control.server.ts'
import type {SubrequestBudget} from './worker-budget.ts'
import {recoveryAccepted,settleUnmatchedRecoveries} from './alert-route-delivery.server.ts'
import {notificationEnvelopeBody,checkedNotificationEndpoint,webhookConfigText,notificationResponseExcerpt} from './notification-webhook.ts'
export function notificationRepository(env:Bindings){return new NotificationRepository(env)}
export class NotificationRepository extends IntegrationsRepository {
 protected env:Bindings;
 private templates=new Map<string,string|null>();
 private excerpts=new Map<string,string>();
 constructor(env:Bindings,private random:()=>number=Math.random){super(new D1SqlDatabase(env.DB),NOTIFICATION_NAMESPACE);this.env=env}
 setTemplateSnapshot(id:string,value:string|null){this.templates.set(id,value)}
 responseExcerpt(id:string,value:string){this.excerpts.set(id,value)}
 async insert(delivery:Delivery){
  const template=this.templates.get(delivery.id)??null;
  await this.env.DB.batch([
   this.env.DB.prepare(`UPDATE notification_jobs SET webhook_template=? WHERE id=? AND credential_id=? AND state='queued'
    AND NOT EXISTS(SELECT 1 FROM integration_deliveries WHERE namespace=? AND id=?)
    AND EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_jobs.destination_id AND d.credential_id=notification_jobs.credential_id AND d.deleted_at IS NULL)`)
    .bind(template,delivery.id,delivery.destinationId,NOTIFICATION_NAMESPACE,delivery.id),
   this.env.DB.prepare(`INSERT INTO integration_deliveries(namespace,id,fingerprint,destination_hash,envelope,state,created_at,next_at,max_attempts,retry_delays)
   SELECT ?,?,?,?,?,'queued',?,?,?,? WHERE EXISTS(SELECT 1 FROM notification_jobs j JOIN notification_destinations d ON d.id=j.destination_id WHERE j.id=? AND j.credential_id=? AND d.credential_id=j.credential_id AND d.deleted_at IS NULL) ON CONFLICT(namespace,id) DO NOTHING`)
   .bind(NOTIFICATION_NAMESPACE,delivery.id,delivery.fingerprint,delivery.destinationHash,JSON.stringify(pickEnvelope(delivery)),delivery.createdAt,delivery.nextAt,delivery.maxAttempts,JSON.stringify(delivery.retryDelaysMs),delivery.id,delivery.destinationId),
   this.env.DB.prepare(`INSERT OR IGNORE INTO notification_retry_policy(delivery_id,window_ms)
    SELECT ?,window_ms FROM notification_retry_settings WHERE singleton=1 AND ?>1 AND EXISTS(SELECT 1 FROM integration_deliveries WHERE namespace=? AND id=?)`).bind(delivery.id,delivery.maxAttempts,NOTIFICATION_NAMESPACE,delivery.id),
   this.env.DB.prepare(`INSERT OR IGNORE INTO notification_delivery_attempts(delivery_id,destination_id,number,phase,scheduled_at,key_reference)
    SELECT id,destination_id,1,'retry',?,event_id FROM notification_jobs WHERE id=? AND EXISTS(SELECT 1 FROM integration_deliveries WHERE namespace=? AND id=?)`).bind(delivery.nextAt,delivery.id,NOTIFICATION_NAMESPACE,delivery.id),
  ]);
  const current=await this.get(delivery.id);if(!current||current.fingerprint!==delivery.fingerprint)throw Error('Notification erased or changed');return current;
 }
 async finish(id:string,claim:string,outcome:any,now:number,nextAt:number|null){
  const excerpt=outcome.responseExcerpt??this.excerpts.get(id);this.excerpts.delete(id);
  if(excerpt!==undefined){
   const row=await this.env.DB.prepare('SELECT c.* FROM notification_jobs j JOIN notification_credentials c ON c.id=j.credential_id WHERE j.id=?').bind(id).first<any>();
   if(!row)throw Error('Notification erased or changed');const credential=await readCredential(this.env,row);
   const raw=String(excerpt).replace(/&(?:amp|lt|gt|quot|#39);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[entity]!));
   outcome={...outcome,responseExcerpt:notificationResponseExcerpt(raw,credential)};
  }
  const row=await this.env.DB.prepare(`SELECT d.*,p.window_ms FROM integration_deliveries d JOIN notification_retry_policy p ON p.delivery_id=d.id WHERE d.namespace=? AND d.id=?`).bind(NOTIFICATION_NAMESPACE,id).first<any>();
  // The policy was snapshotted when the immutable delivery was first prepared.
  // Both runner and hosted sends use this authoritative Worker decision.
  if(row){
   const decision=notificationRetryTime(row,outcome,now,this.random);nextAt=decision.nextAt;
   if(decision.exhausted)outcome={...outcome,kind:'rejected',code:'retry_window_exhausted'};
   else if(nextAt!==null)outcome={...outcome,kind:'retryable'};
   else if(outcome.kind==='retryable'||outcome.kind==='uncertain')outcome={...outcome,kind:'rejected',code:'retry_attempts_exhausted'};
  }else if(outcome.kind==='retryable')outcome={...outcome,kind:'uncertain'};
  const state=outcome.kind==='retryable'?(nextAt===null?'rejected':'queued'):outcome.kind;
  const result=await this.env.DB.batch([
   this.env.DB.prepare(`UPDATE integration_attempts SET finished_at=?,outcome=? WHERE namespace=? AND id=? AND finished_at IS NULL AND EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace=? AND d.id=? AND d.state='sending' AND d.claim=? AND d.claim_until>?)`).bind(now,JSON.stringify(outcome),NOTIFICATION_NAMESPACE,claim,NOTIFICATION_NAMESPACE,id,claim,now),
   this.env.DB.prepare(`INSERT OR IGNORE INTO notification_delivery_attempts(delivery_id,destination_id,number,phase,scheduled_at,key_reference)
    SELECT j.id,j.destination_id,d.attempts+1,'retry',?,j.event_id FROM notification_jobs j JOIN integration_deliveries d ON d.id=j.id AND d.namespace=?
    WHERE j.id=? AND d.state='sending' AND d.claim=? AND d.claim_until>? AND ? IS NOT NULL AND EXISTS(SELECT 1 FROM integration_attempts a WHERE a.namespace=d.namespace AND a.id=d.claim AND a.finished_at=?)`).bind(nextAt,NOTIFICATION_NAMESPACE,id,claim,now,nextAt,now),
   this.env.DB.prepare(`UPDATE integration_deliveries SET state=?,claim=NULL,claim_until=NULL,next_at=? WHERE namespace=? AND id=? AND state='sending' AND claim=? AND claim_until>?`).bind(state,nextAt??now,NOTIFICATION_NAMESPACE,id,claim,now),
  ]);
  return Boolean(result[2].meta.changes);
 }
 async claim(id:string,now:number,leaseMs:number){return claimNotification(this.env,id,now,leaseMs)}
 async recoverExpired(now:number){const recovered=await super.recoverExpired(now);await this.env.DB.batch(expireMailClaims(this.env,now));await retireObsoleteCredentials(this.env);return recovered}
}
/** Sends queued email, then prepares queued webhook and Slack jobs for whichever dispatcher claims them first: the
 * hosted Worker's cron or a private runner's poll. Both use one Base delivery row, so a job is sent at most once. */
export async function pollNotificationJobs(env:Bindings,budget?:SubrequestBudget){
 const repository=notificationRepository(env),now=Date.now(),op=storageOperation;
 await advanceContactSchedules(env);
 await op('notifications.poll.recoverExpired',()=>repository.recoverExpired(now));await op('notifications.poll.custody',()=>ensureNotificationCustody(env));await op('notifications.poll.recoveryMatches',()=>settleUnmatchedRecoveries(env));await dispatchNotificationMail(env,budget);
 const rows=await op('notifications.poll.selectQueued',()=>env.DB.prepare(`SELECT j.*,c.id AS credential_record_id,c.destination_id AS credential_destination_id,c.created_at AS credential_created_at,c.endpoint,c.signing_secret,c.ciphertext,c.retired_at,c.unavailable_at FROM notification_jobs j JOIN notification_credentials c ON c.id=j.credential_id
  WHERE j.kind IN ('webhook','slack') AND j.state='queued' AND ${recoveryAccepted()} AND ${contactReady()} AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace=? AND d.id=j.id AND d.state<>'queued') ORDER BY j.created_at LIMIT 20`).bind(NOTIFICATION_NAMESPACE).all<any>());
 const jobs=[];
 // A job is rejected only for its own fault (an unreadable credential, an envelope that cannot be prepared). A storage fault is
 // never recorded as a rejection: it surfaces typed and the next poll finds the job still queued.
 for(const row of rows.results){let credential;try{credential=await readCredential(env,{...row,id:row.credential_record_id,destination_id:row.credential_destination_id,created_at:row.credential_created_at})}catch(error){if(classifyStorage(error))throw error;if(!notificationKeyPresent(env))continue;await op('notifications.poll.rejectCredential',()=>env.DB.batch([env.DB.prepare("UPDATE notification_jobs SET state='rejected',code='credential_unavailable',finished_at=? WHERE id=? AND state='queued' AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace=? AND d.id=notification_jobs.id AND d.state<>'queued')").bind(now,row.id,NOTIFICATION_NAMESPACE),env.DB.prepare("UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace=? AND id=? AND state='queued'").bind(now,NOTIFICATION_NAMESPACE,row.id)]));continue}const event=JSON.parse(row.event);
  repository.setTemplateSnapshot(row.id,row.kind==='webhook'?webhookConfigText(credential):null);
  const service=new DeliveryService({repository,hashDestination:url=>notificationDestinationHash(env,checkedNotificationEndpoint(credential,event,url)),protocols:notificationProtocols(credential,row.credential_id,event),transport:{async send(){throw Error('Preparing a job never sends it')}}});
  const existing=await repository.get(row.id);
  const settings=await env.DB.prepare('SELECT max_attempts FROM notification_retry_settings WHERE singleton=1').first<{max_attempts:number}>();
  const maxAttempts=deduplicatedNotification(credential,event)?settings?.max_attempts??6:1;
  try{if(!existing)await op('notifications.poll.enqueue',()=>service.enqueue({id:row.id,tenant:NOTIFICATION_NAMESPACE,destinationId:row.credential_id,event:event.eventType,protocol:row.kind==='slack'?SLACK_WEBHOOK_PROTOCOL:'webhook',body:row.kind==='slack'?slackContent(event):notificationEnvelopeBody(credential,event)},{maxAttempts,retryDelaysMs:Array.from({length:maxAttempts-1},(_,i)=>1000*2**i)}))}
  catch(error){if(classifyStorage(error))throw error;await op('notifications.poll.rejectPreparation',()=>env.DB.prepare("UPDATE notification_jobs SET state='rejected',code='preparation_failed',finished_at=? WHERE id=? AND state='queued'").bind(Date.now(),row.id).run());continue}
  jobs.push({id:row.id,credentialId:row.credential_id,credential,event,destinationHash:await notificationDestinationHash(env,credential.endpoint)});
 }
 return jobs;
}
/** Scoped runner operations. The caller cannot supply SQL, tenant, endpoint, envelope or retry policy. */
export async function notificationRpc(env:Bindings,input:any){
 const repository=notificationRepository(env),now=Date.now(),op=storageOperation;
 if(input?.operation==='poll'){
  const jobs=await pollNotificationJobs(env);
  await op('notifications.poll.recordContact',()=>recordContact(env.DB));return {jobs,serverNow:Date.now()};
 }
 if(input?.operation==='recoverExpired')return op('notifications.recoverExpired',()=>repository.recoverExpired(now));
 if(typeof input?.id!=='string'||input.id.length>512)throw Error('Invalid notification identity');
 const job=await op('notifications.findJob',()=>env.DB.prepare("SELECT id FROM notification_jobs WHERE id=? AND kind IN ('webhook','slack')").bind(input.id).first<{id:string}>());if(!job)throw Error('Notification not found');
 switch(input.operation){
  case 'get':
   // Worker time remains authoritative even when a runner clock is behind.
   return op('notifications.get',async()=>{await repository.recoverExpired(now);return withDrillBody(env,await repository.get(input.id))});
  case 'log':return op('notifications.log',()=>repository.log(input.id));
  case 'claim':{
   if(input.runnerNow!==undefined&&(!Number.isFinite(input.runnerNow)||input.runnerNow-now>=60000))return null;
   return op('notifications.claim',async()=>{const claim=await repository.claim(input.id,now,60000);
   if(claim&&typeof input.reservation==='string'&&/^[a-f0-9-]{36}$/.test(input.reservation))await registerClaim(env,input.id,claim,input.reservation,now);return claim});
  }
  case 'releaseUnstarted':return op('notifications.releaseUnstarted',()=>releaseUnstartedClaim(env,input.id,input.claim,input.reservation,now));
  case 'start':return op('notifications.start',()=>startClaim(env,input.id,input.claim,input.reservation,now));
  case 'finish':{
   const o=input.outcome;
   if(typeof input.claim!=='string'||!o||!['accepted','rejected','retryable','uncertain'].includes(o.kind)||typeof o.code!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(o.code)||Object.keys(o).some(k=>!['kind','code','status','retryAfterMs','responseExcerpt'].includes(k))||(o.status!==undefined&&(!Number.isInteger(o.status)||o.status<100||o.status>599))||(o.retryAfterMs!==undefined&&(!Number.isFinite(o.retryAfterMs)||o.retryAfterMs<0))||(o.responseExcerpt!==undefined&&(typeof o.responseExcerpt!=='string'||o.responseExcerpt.length>512)))throw Error('Invalid notification outcome');
   return op('notifications.finish',async()=>{const finished=await repository.finish(input.id,input.claim,o,now,null);await retireObsoleteCredentials(env);await retireDrillTokens(env);return finished});
  }
  default:throw Error('Unknown notification operation');
 }
}
