import {auditStatement,mutationGuard} from './audit.server.ts'
import {mailAuthority,mailAuthorityValues} from './operator-mail-authority.ts'
// @ts-expect-error Maintained Base mail validation and byte serialization.
import {validateMessage,encodeBase64} from '../base/modules/mail/src/core/validation.mjs'
type Capture={id:string;created_at:number;message:string};
function capture(row:Capture,detail:boolean){
 const message=JSON.parse(row.message);
 if(detail&&message.attachments)for(const attachment of message.attachments)attachment.content=Uint8Array.from(atob(attachment.content),character=>character.charCodeAt(0));
 if(!detail)delete message.attachments;
 return {id:row.id,createdAt:row.created_at,message};
}
/** Uptime captures remain until explicit operator erasure or installation reset.
 * Base owns mail validation and the guarded viewer; this edition owns retention. */
export function developmentOutbox(db:D1Database,purpose:'authentication'|'notification'='authentication'){
 const authentication=purpose==='authentication';
 const authority=authentication?mailAuthority:`(EXISTS(SELECT 1 FROM notification_jobs WHERE id=? AND state='sending' AND claim_until>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) OR EXISTS(SELECT 1 FROM monitoring_watch WHERE id=? AND outcome='sending'))`;
 return {
 async put(value:unknown){
  const message=structuredClone(value) as any;validateMessage(message,'development');
  if(message.unsubscribe!==undefined)throw Error('Development message must have its unsubscribe content assembled');
  if(message.attachments)for(const attachment of message.attachments)attachment.content=encodeBase64(attachment.content);
  const result=await db.batch([mutationGuard({DB:db},authority,mailAuthorityValues(message.deliveryId)),db.prepare('INSERT INTO rer_mail_development_outbox(id,created_at,message) VALUES(?,?,?)').bind(crypto.randomUUID(),Date.now(),JSON.stringify(message)),...(authentication?[auditStatement({DB:db},{kind:'feature',ref:'operator-auth-mail'},'notification_send','notification')]:[])]);
  if(result.some(row=>!row.success))throw Error('Development capture storage failed');
 },
 async list(){const result=await db.prepare('SELECT id,created_at,message FROM rer_mail_development_outbox ORDER BY created_at DESC,sequence DESC').all<Capture>();return result.results.map(row=>capture(row,false))},
 async get(id:string){
  if(typeof id!=='string'||!id||id.length>128)throw Error('Invalid development capture identifier');
  const row=await db.prepare('SELECT id,created_at,message FROM rer_mail_development_outbox WHERE id=?').bind(id).first<Capture>();return row?capture(row,true):null;
 },
}}
