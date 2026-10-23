import {auditStatement,automated,type AuditActor} from './audit.server.ts'
import {erase} from './erasure.server.ts'
import {ensureNotificationCustody,sealCredential,readCredential,retireObsoleteStatements} from './notification-credentials.server.ts'
import {cancelDestinationStatements} from './notification-cancellation.server.ts'
import {validateDestination} from '../base/modules/integrations/core/destination.ts'
import {resolveSlackWebhook} from '../base/modules/integrations/slack/protocol.ts'
// @ts-expect-error Base mail validates the same mailbox shape used at send time.
import {parseAddress} from '../base/modules/mail/src/core/validation.mjs'
import type {Bindings} from './control.server.ts'
import type {NotificationCredential} from './notification-credentials.server.ts'
import {webhookInput,webhookMetadata,webhookConfigText} from './notification-webhook.ts'
const webhookFields=['webhookTemplate','webhookHeaders','webhookSigning'];
function webhookOnly(kind:string,input:any){if(kind!=='webhook'&&webhookFields.some(key=>Object.hasOwn(input,key)))throw Error('Webhook configuration requires a webhook destination')}
function name(value:unknown){if(typeof value!=='string'||!value.trim()||value.length>100||/[\x00-\x1f\x7f]/.test(value))throw Error('Destination name must be 1–100 printable characters');return value.trim()}
function secret(){return [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function endpointFor(kind:string,input:any){
 if(kind==='email'){try{const parsed=parseAddress(input.address);if(parsed.name||parsed.email!==input.address)throw Error();return parsed.email as string}catch{throw Error('Enter a single email address')}}
 try{const endpoint=validateDestination(input.url).href;return kind==='slack'?await resolveSlackWebhook(async()=>endpoint,'validation'):endpoint}catch{throw Error(kind==='slack'?'Enter a valid hooks.slack.com incoming webhook URL':'Enter a public HTTPS URL without credentials or fragments')}
}
export async function destinations(env:Bindings,{readOnly=false}:{readOnly?:boolean}={}){
 const validated=readOnly?undefined:await ensureNotificationCustody(env);
 const rows=await env.DB.prepare('SELECT d.id,d.name,d.kind,d.enabled,d.created_at,d.webhook_template,c.id credential_id,c.destination_id,c.created_at credential_created_at,c.endpoint,c.signing_secret,c.ciphertext,c.retired_at,c.unavailable_at FROM notification_destinations d LEFT JOIN notification_credentials c ON c.id=d.credential_id WHERE d.deleted_at IS NULL ORDER BY d.created_at,d.id').all<any>();
 return Promise.all(rows.results.map(async r=>{
  let credential;try{credential=await readCredential(env,{...r,id:r.credential_id,created_at:r.credential_created_at},{validated,repairUnavailable:!readOnly})}catch{}
  return {id:r.id,name:r.name,kind:r.kind,enabled:Boolean(r.enabled),created_at:r.created_at,credentialsAvailable:Boolean(credential),credentialError:credential?null:'credential_unavailable',address:r.kind==='email'&&credential?credential.endpoint:null,...(r.kind==='webhook'?webhookMetadata(credential,r.webhook_template):{})};
 }));
}
export async function createDestination(env:Bindings,input:any){
 await ensureNotificationCustody(env);
 if(!input||Object.keys(input).some(k=>!['name','kind','enabled','address','url',...webhookFields].includes(k)))throw Error('Invalid destination fields');
 const displayName=name(input.name),kind=input.kind;if(!['email','webhook','slack'].includes(kind))throw Error('Choose email, webhook or Slack');
 webhookOnly(kind,input);
 if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw Error('Enabled must be a boolean');
 const endpoint=await endpointFor(kind,input);
 const webhook=kind==='webhook'?webhookInput(input):undefined;
 const id=crypto.randomUUID(),credentialId=crypto.randomUUID(),now=Date.now(),signingSecret=kind==='webhook'&&(webhook?.signing??true)?secret():null;
 const credential={endpoint,signing_secret:signingSecret,...(webhook?{webhook}:{})},template=webhookConfigText(credential);
 const ciphertext=await sealCredential(env,{id:credentialId,destination_id:id,created_at:now},credential);
 await env.DB.batch([env.DB.prepare('INSERT INTO notification_credentials(id,destination_id,created_at,ciphertext) VALUES(?,?,?,?)').bind(credentialId,id,now,ciphertext),env.DB.prepare('INSERT INTO notification_destinations(id,name,kind,enabled,credential_id,created_at,deleted_at,webhook_template) VALUES(?,?,?,?,?,?,NULL,?)').bind(id,displayName,kind,input.enabled===false?0:1,credentialId,now,template)]);
 return {id,name:displayName,kind,enabled:input.enabled!==false,created_at:now,...(kind==='webhook'?webhookMetadata(credential,template):{}),...(signingSecret?{signingSecret}:{})}
}
export async function updateDestination(env:Bindings,id:string,input:any,actor:AuditActor=automated){
 if(!input||Object.keys(input).some(k=>!['name','enabled','address','url',...webhookFields].includes(k))||typeof input.enabled!=='boolean')throw Error('Name and enabled are required');
 const displayName=name(input.name);
 const row=await env.DB.prepare('SELECT d.kind,d.webhook_template,c.* FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=? AND d.deleted_at IS NULL').bind(id).first<any>();
 if(!row)throw Error('Destination not found');
 webhookOnly(row.kind,input);
 if((row.kind==='email'&&input.url!==undefined)||(row.kind!=='email'&&input.address!==undefined))throw Error('Invalid destination fields');
 let replacement:NotificationCredential|undefined,current:NotificationCredential|undefined;
 if(input.address!==undefined||input.url!==undefined||webhookFields.some(key=>Object.hasOwn(input,key)))try{current=await readCredential(env,row)}catch{}
 if(input.address!==undefined||input.url!==undefined){
  const endpoint=await endpointFor(row.kind,input);
  if(!current||current.endpoint!==endpoint)replacement={endpoint,signing_secret:row.kind==='webhook'?secret():null};
 }
 if(row.kind==='webhook'&&(replacement||webhookFields.some(key=>Object.hasOwn(input,key)))){
  if(!current&&!replacement)throw Error('Re-enter the webhook endpoint to restore credential custody');
  // A restored portable template must not silently revert to legacy JSON.
  const proposed={...input};if(!Object.hasOwn(proposed,'webhookTemplate')&&!current&&row.webhook_template!==null)proposed.webhookTemplate=JSON.parse(row.webhook_template);
  const webhook=webhookInput(proposed,current),endpoint=replacement?.endpoint??current!.endpoint;
  if(replacement||JSON.stringify(webhook)!==JSON.stringify(current?.webhook))replacement={endpoint,signing_secret:(webhook?.signing??true)?secret():null,...(webhook?{webhook}:{})};
 }
 if(replacement)return replaceCredential(env,row,replacement,{name:displayName,enabled:input.enabled},actor);
 const result=await env.DB.batch([env.DB.prepare('UPDATE notification_destinations SET name=?,enabled=? WHERE id=? AND credential_id=? AND deleted_at IS NULL').bind(displayName,input.enabled?1:0,id,row.id),...(input.enabled?[]:cancelDestinationStatements(env,id))]);
 if(!result[0].meta.changes)throw Error('Destination changed; refresh and retry');return {updated:true,...(row.kind==='webhook'?webhookMetadata(current,row.webhook_template):{})};
}
export async function deleteDestination(env:Bindings,id:string,actor:AuditActor=automated){return erase(env,'destination',id,actor)}
export async function rotateDestination(env:Bindings,id:string,actor:AuditActor=automated){
 await ensureNotificationCustody(env);
 const row=await env.DB.prepare("SELECT c.* FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=? AND d.kind='webhook' AND d.deleted_at IS NULL").bind(id).first<any>();if(!row)throw Error('Signed webhook destination not found');
 const credential=await readCredential(env,row);
 if(credential.webhook&&!credential.webhook.signing)throw Error('Enable signing before rotating a webhook signing key');
 return replaceCredential(env,row,{...credential,signing_secret:secret()},undefined,actor);
}
async function replaceCredential(env:Bindings,row:any,credential:NotificationCredential,metadata?:{name:string;enabled:boolean},actor:AuditActor=automated){
 const id=row.destination_id,credentialId=crypto.randomUUID(),now=Date.now();
 const ciphertext=await sealCredential(env,{id:credentialId,destination_id:id,created_at:now},credential);
 const result=await env.DB.batch([
  env.DB.prepare(`INSERT INTO notification_credentials(id,destination_id,created_at,ciphertext)
   SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM notification_destinations WHERE id=? AND credential_id=? AND deleted_at IS NULL)`).bind(credentialId,id,now,ciphertext,id,row.id),
  env.DB.prepare('UPDATE notification_destinations SET credential_id=?,name=COALESCE(?,name),enabled=COALESCE(?,enabled),webhook_template=? WHERE id=? AND credential_id=? AND deleted_at IS NULL').bind(credentialId,metadata?.name??null,metadata?Number(metadata.enabled):null,webhookConfigText(credential),id,row.id),
  auditStatement(env,actor,'credential_rotate','credential',crypto.randomUUID(),'EXISTS(SELECT 1 FROM notification_destinations WHERE id=? AND credential_id=?)',[id,credentialId],now),
  ...retireObsoleteStatements(env,now),
  ...(metadata?.enabled===false?cancelDestinationStatements(env,id):[]),
 ]);
 if(!result[1].meta.changes)throw Error('Destination changed during rotation; retry to rotate its current secret');
 return {updated:true,id,...(row.kind==='webhook'||credential.webhook?webhookMetadata(credential,webhookConfigText(credential)):{}),...(credential.signing_secret?{signingSecret:credential.signing_secret}:{})};
}
