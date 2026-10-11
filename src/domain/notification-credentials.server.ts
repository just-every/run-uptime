import {auditStatement} from './audit.server.ts'
// @ts-expect-error Maintained Base AES-GCM primitive; product purpose and record AAD below.
import {keyedHash,seal,unseal,decode} from '../base/modules/operator-auth/identity/oidc/crypto.mjs'
import {sha256} from '../base/modules/integrations/core/crypto.ts'
import type {Bindings} from './control.server.ts'
type Identity={id:string;destination_id:string;created_at:number};
export type CredentialRow=Identity&{endpoint:string|null;signing_secret:string|null;ciphertext:string|null;retired_at:number|null;unavailable_at?:number|null};
type Credential={endpoint:string;signing_secret:string|null};
const unavailable=()=>Error('Notification credential custody unavailable');
/** A missing or short key is a transient deployment fault, not evidence about any stored credential. */
export const notificationKeyPresent=(env:Bindings)=>typeof env.SESSION_SECRET==='string'&&env.SESSION_SECRET.length>=32;
async function key(env:Bindings){
 if(!notificationKeyPresent(env))throw unavailable();
 return keyedHash(env.SESSION_SECRET,'uptime-notification-credentials','aes-gcm-v1');
}
const identity=(row:Identity)=>JSON.stringify(['uptime-notification-credential-v1',row.id,row.destination_id,row.created_at]);
export async function sealCredential(env:Bindings,row:Identity,value:Credential){return seal(await key(env),identity(row),value)}
/** A row marked unavailable is retried: the marker records only that the key
 * in use at the time could not open it. A successful decrypt under the current
 * key clears it, so restoring the right key recovers the destination without
 * re-entering anything. Rows with no ciphertext can never recover. */
export async function readCredential(env:Bindings,row:CredentialRow):Promise<Credential>{
 let value;
 try{
  if(row.retired_at!==null||row.endpoint!==null||row.signing_secret!==null||!row.ciphertext)throw unavailable();
  value=await unseal(await key(env),identity(row),row.ciphertext);
  if(!value||typeof value.endpoint!=='string'||!(value.signing_secret===null||typeof value.signing_secret==='string'))throw unavailable();
 }catch{throw unavailable()}
 if(row.unavailable_at!=null)await env.DB.prepare(`UPDATE notification_credentials SET unavailable_at=NULL
  WHERE id=? AND destination_id=? AND created_at=? AND ciphertext=? AND retired_at IS NULL AND unavailable_at IS NOT NULL`).bind(row.id,row.destination_id,row.created_at,row.ciphertext).run();
 return value;
}
/** HMAC of the normalized endpoint digest permits upgrading historical hashes
 * without decrypting an endpoint or changing the immutable envelope identity. */
export async function notificationDestinationHash(env:Bindings,endpoint:string){return protectDigest(env,await sha256(endpoint))}
async function protectDigest(env:Bindings,digest:string){return 'hmac-v1:'+Array.from(decode(await keyedHash(await key(env),'uptime-notification-destination',digest)),(b:any)=>b.toString(16).padStart(2,'0')).join('')}
export function retireObsoleteStatements(env:Bindings,now=Date.now()){
 return [
  env.DB.prepare(`UPDATE notification_jobs SET state='rejected',code='credential_rotated',finished_at=? WHERE state='queued'
   AND NOT EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_jobs.destination_id AND d.credential_id=notification_jobs.credential_id AND d.deleted_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=notification_jobs.id AND d.state<>'queued')`).bind(now),
  env.DB.prepare(`UPDATE integration_deliveries SET state='rejected',next_at=? WHERE namespace='uptime-notifications' AND state='queued'
   AND id IN(SELECT id FROM notification_jobs WHERE state='rejected' AND code='credential_rotated')`).bind(now),
  auditStatement(env,{kind:'feature',ref:'credential-maintenance'},'credential_retire','credential',crypto.randomUUID(),`EXISTS(SELECT 1 FROM notification_credentials c WHERE c.retired_at IS NULL AND NOT EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=c.destination_id AND d.credential_id=c.id AND d.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM notification_jobs j WHERE j.credential_id=c.id AND ((j.state='sending' AND j.claim IS NOT NULL AND j.claim_until>?) OR EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=j.id AND d.state='sending' AND d.claim IS NOT NULL AND d.claim_until>?))))`,[now,now],now),
  env.DB.prepare(`UPDATE notification_credentials SET endpoint=NULL,signing_secret=NULL,ciphertext=NULL,retired_at=? WHERE retired_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM notification_destinations d WHERE d.id=notification_credentials.destination_id AND d.credential_id=notification_credentials.id AND d.deleted_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM notification_jobs j WHERE j.credential_id=notification_credentials.id AND
    ((j.state='sending' AND j.claim IS NOT NULL AND j.claim_until>?) OR EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace='uptime-notifications' AND d.id=j.id AND d.state='sending' AND d.claim IS NOT NULL AND d.claim_until>?)))` ).bind(now,now,now),
 ];
}
export async function retireObsoleteCredentials(env:Bindings){await env.DB.batch(retireObsoleteStatements(env))}
/** Restart-safe key-bearing migration. A bad row is isolated so owner recovery,
 * monitoring and unrelated notification destinations remain available. Nothing
 * is persisted as unavailable while the key itself is missing or short.
 * `validate:false` only seals plaintext (no decryption), for health and cron. */
export async function ensureNotificationCustody(env:Bindings,{validate=true}:{validate?:boolean}={}){
 await retireObsoleteCredentials(env);
 const rows=await env.DB.prepare('SELECT * FROM notification_credentials WHERE retired_at IS NULL').all<CredentialRow>();
 for(const row of rows.results){
  if(row.ciphertext&&!validate)continue;
  if(row.unavailable_at!=null&&!row.ciphertext)continue;
  try{
   if(row.ciphertext){await readCredential(env,row);continue}
   if(!row.endpoint)throw unavailable();
   const destination=await env.DB.prepare('SELECT kind FROM notification_destinations WHERE id=?').bind(row.destination_id).first<{kind:string}>();
   const ciphertext=await sealCredential(env,row,{endpoint:row.endpoint,signing_secret:destination?.kind==='webhook'?row.signing_secret:null});
   await env.DB.prepare(`UPDATE notification_credentials SET ciphertext=?,endpoint=NULL,signing_secret=NULL
    WHERE id=? AND retired_at IS NULL AND ciphertext IS NULL AND endpoint=?`).bind(ciphertext,row.id,row.endpoint).run();
  }catch{
   if(!notificationKeyPresent(env))continue;
   await env.DB.prepare(`UPDATE notification_credentials SET unavailable_at=?,endpoint=NULL,signing_secret=NULL
    WHERE id=? AND retired_at IS NULL AND unavailable_at IS NULL AND ciphertext IS ?`).bind(Date.now(),row.id,row.ciphertext).run();
  }
 }
 const hashes=await env.DB.prepare("SELECT id,destination_hash,envelope,max_attempts,retry_delays FROM integration_deliveries WHERE namespace='uptime-notifications' AND destination_hash NOT LIKE 'hmac-v1:%' AND destination_hash NOT LIKE 'unavailable:%'").all<any>();
 for(const row of hashes.results){
  // Without the key the historical digest stays until the key returns; replacing it would permanently fail the send.
  if(!notificationKeyPresent(env))break;
  const hash=await protectDigest(env,row.destination_hash);
  const fingerprint=await sha256(JSON.stringify({envelope:JSON.parse(row.envelope),destinationHash:hash,maxAttempts:row.max_attempts,retryDelaysMs:JSON.parse(row.retry_delays)}));
  await env.DB.prepare("UPDATE integration_deliveries SET destination_hash=?,fingerprint=? WHERE namespace='uptime-notifications' AND id=? AND destination_hash=?").bind(hash,fingerprint,row.id,row.destination_hash).run();
 }
}
/** Schema readiness remains distinct from individual destination availability. */
export async function notificationReadiness(env:Bindings){
 const table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('notification_credentials','notification_credentials_legacy') ORDER BY name DESC LIMIT 1").first<{name:string}>();
 if(table?.name==='notification_credentials_legacy')throw unavailable();
 if(table){const columns=await env.DB.prepare('PRAGMA table_info(notification_credentials)').all<{name:string}>();if(!['ciphertext','retired_at','unavailable_at'].every(name=>columns.results.some(column=>column.name===name)))throw unavailable();if(!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notification_claim_custody'").first())throw unavailable()}
}
