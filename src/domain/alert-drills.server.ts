// @ts-expect-error Maintained Base AES-GCM primitive; product purpose and record AAD below.
import {keyedHash,seal,unseal,random} from '../base/modules/operator-auth/identity/oidc/crypto.mjs'
import {sha256} from '../base/modules/integrations/core/crypto.ts'
import {notificationKeyPresent} from './notification-credentials.server.ts'
import {queueTestEvent,NOTIFICATION_NAMESPACE} from './notifications.server.ts'
import {drillEvent,drillMailContent,drillWebhookBody,drillSlackBody,type DrillDetails} from './alert-drill-content.ts'
import {mailContent} from './notification-content.ts'
import type {Bindings} from './control.server.ts'
import {mutationGuard} from './audit.server.ts'
// An alert drill is a labelled test send whose message carries a one-time confirmation link. The capability is random;
// only its bound SHA-256 is kept for comparison, and a sealed copy lives only until the single send finishes.
const DAY=86_400_000,PROOF_WINDOW=30*DAY;
type DrillRow={id:string;destination_id:string;credential_id:string;delivery_id:string};
async function key(env:Bindings){if(!notificationKeyPresent(env))throw Error('Drill custody unavailable');return keyedHash(env.SESSION_SECRET,'uptime-alert-drill','aes-gcm-v1')}
const identity=(row:DrillRow)=>JSON.stringify(['uptime-alert-drill-v1',row.id,row.destination_id,row.credential_id,row.delivery_id]);
// The hash binds the capability to one drill, one destination and that destination's credential at the time.
const bound=(row:Omit<DrillRow,'delivery_id'>,secret:string)=>sha256(`uptime-alert-drill-v1\0${row.id}\0${row.destination_id}\0${row.credential_id}\0${secret}`);
function equal(a:string,b:string){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0}

export async function startDrill(env:Bindings,destinationId:string,operatorId:string){
 const destination=await env.DB.prepare('SELECT webhook_template FROM notification_destinations WHERE id=? AND deleted_at IS NULL').bind(destinationId).first<{webhook_template:string|null}>();
 if(destination?.webhook_template!==null&&destination?.webhook_template!==undefined)throw Error('This custom webhook template has no acknowledgement-link field. Use its exact Test send, or choose default signed JSON for a recipient-acknowledged alert drill.');
 const event=drillEvent(env.UPTIME_ORIGIN??''),id=crypto.randomUUID(),secret=random() as string,now=event.observedAt;
 const {deliveryId}=await queueTestEvent(env,destinationId,event,async(deliveryId,credentialId)=>{
  const row={id,destination_id:destinationId,credential_id:credentialId,delivery_id:deliveryId};
  return [mutationGuard(env,'EXISTS(SELECT 1 FROM notification_destinations WHERE id=? AND credential_id=? AND deleted_at IS NULL AND webhook_template IS NULL)',[destinationId,credentialId]),env.DB.prepare(`INSERT INTO alert_drills(id,destination_id,credential_id,delivery_id,started_by,started_at,expires_at,token_hash,token_ciphertext)
   SELECT ?,destination_id,credential_id,id,?,?,?,?,? FROM notification_jobs WHERE id=? AND destination_id=? AND credential_id=?`).bind(id,operatorId,now,now+DAY,await bound(row,secret),await seal(await key(env),identity(row),{secret}),deliveryId,destinationId,credentialId)];
 });
 return {queued:true,drillId:id,eventId:event.id,deliveryId};
}
// Send-time details for a drill delivery that may still be confirmed; null sends the stored drill text without a link.
async function details(env:Bindings,deliveryId:string):Promise<DrillDetails|null>{
 const row=await env.DB.prepare(`SELECT a.*,o.display_name FROM alert_drills a LEFT JOIN oa_operators o ON o.id=a.started_by
  WHERE a.delivery_id=? AND a.token_ciphertext IS NOT NULL AND a.confirmed_at IS NULL AND a.expires_at>?`).bind(deliveryId,Date.now()).first<any>();
 if(!row)return null;
 let secret;try{({secret}=await unseal(await key(env),identity(row),row.token_ciphertext))}catch{return null}
 return {startedBy:row.display_name??'An owner of this Uptime installation',startedAt:row.started_at,expiresAt:row.expires_at,confirmUrl:`${env.UPTIME_ORIGIN}/alert-drill?token=${row.id}.${secret}`};
}
export async function notificationMail(env:Bindings,job:{id:string;event:string}){
 const event=JSON.parse(job.event),drill=await details(env,job.id);
 return drill?drillMailContent(event,drill):mailContent(event);
}
// The runner reads a claimed delivery through `get`. Only while it holds the claim does a drill body carry its link;
// the stored envelope keeps the stored event, so archives and erasure see the same bytes as any test.
export async function withDrillBody<T extends {id:string;state:string;body:string}>(env:Bindings,delivery:T|null):Promise<T|null>{
 if(!delivery||delivery.state!=='sending')return delivery;
 const job=await env.DB.prepare('SELECT kind,event FROM notification_jobs WHERE id=?').bind(delivery.id).first<{kind:string;event:string}>();
 const drill=job&&await details(env,delivery.id);if(!job||!drill)return delivery;
 const event=JSON.parse(job.event);
 return {...delivery,body:job.kind==='slack'?drillSlackBody(event,drill):drillWebhookBody(event,drill)};
}
export const markSubmitted=(env:Bindings,deliveryId:string,now:number,claim:string)=>env.DB.prepare("UPDATE alert_drills SET submitted_at=? WHERE delivery_id=? AND submitted_at IS NULL AND EXISTS(SELECT 1 FROM notification_jobs WHERE id=? AND claim=? AND code='mail_sending')").bind(now,deliveryId,deliveryId,claim);
// The sealed copy goes once its one send is over, the drill is confirmed or it expires; nothing is ever re-sent.
export async function retireDrillTokens(env:Bindings,now=Date.now()){
 await env.DB.prepare(`UPDATE alert_drills SET token_ciphertext=NULL,token_hash=CASE WHEN expires_at<=? THEN NULL ELSE token_hash END
  WHERE (token_ciphertext IS NOT NULL OR (token_hash IS NOT NULL AND expires_at<=?)) AND (expires_at<=? OR confirmed_at IS NOT NULL OR NOT EXISTS(
   SELECT 1 FROM notification_jobs j LEFT JOIN integration_deliveries d ON d.namespace=? AND d.id=j.id
   WHERE j.id=alert_drills.delivery_id AND (CASE WHEN j.state<>'queued' THEN j.state ELSE COALESCE(d.state,j.state) END) IN ('queued','sending')))`).bind(now,now,now,NOTIFICATION_NAMESPACE).run();
}
// Unknown, used, expired and foreign tokens are indistinguishable to the caller: each returns null.
export async function drillForToken(env:Bindings,token:unknown){
 const match=typeof token==='string'?/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(token):null;
 const row=match?await env.DB.prepare(`SELECT a.id,a.destination_id,a.credential_id,a.started_at,a.token_hash,d.kind FROM alert_drills a JOIN notification_destinations d ON d.id=a.destination_id AND d.deleted_at IS NULL
  WHERE a.id=? AND a.confirmed_at IS NULL AND a.token_hash IS NOT NULL AND a.expires_at>?`).bind(match[1],Date.now()).first<any>():null;
 const actual=await bound(row??{id:'',destination_id:'',credential_id:''},match?.[2]??'');
 return row&&equal(actual,row.token_hash)?row as {id:string;destination_id:string;started_at:number;token_hash:string;kind:string}:null;
}
export async function confirmDrill(env:Bindings,token:unknown){
 const row=await drillForToken(env,token),now=Date.now();if(!row)return null;
 const result=await env.DB.prepare('UPDATE alert_drills SET confirmed_at=?,token_hash=NULL,token_ciphertext=NULL WHERE id=? AND token_hash=? AND confirmed_at IS NULL AND expires_at>?').bind(now,row.id,row.token_hash,now).run();
 return result.meta.changes?{kind:row.kind,startedAt:row.started_at,confirmedAt:now}:null;
}
// Proof is a recipient's report for the destination's current credential: rotation or a new address starts over.
export async function drillOverview(env:{DB:D1Database},now=Date.now()){
const rows=await env.DB.prepare(`SELECT a.id,a.destination_id,a.credential_id,a.started_at,a.expires_at,a.submitted_at,a.confirmed_at,o.display_name started_by,
  CASE WHEN j.state<>'queued' THEN j.state ELSE COALESCE(d.state,j.state) END state,j.code,
  COALESCE((SELECT t.finished_at FROM integration_attempts t WHERE t.namespace=? AND t.delivery_id=j.id ORDER BY t.number DESC LIMIT 1),j.finished_at) finished_at,
  (SELECT t.outcome FROM integration_attempts t WHERE t.namespace=? AND t.delivery_id=j.id ORDER BY t.number DESC LIMIT 1) outcome,
  a.credential_id=(SELECT n.credential_id FROM notification_destinations n WHERE n.id=a.destination_id) current_credential,
  (SELECT MAX(p.confirmed_at) FROM alert_drills p JOIN notification_destinations n ON n.id=p.destination_id AND n.credential_id=p.credential_id WHERE p.destination_id=a.destination_id) proven_at
  FROM alert_drills a JOIN notification_jobs j ON j.id=a.delivery_id LEFT JOIN integration_deliveries d ON d.namespace=? AND d.id=j.id LEFT JOIN oa_operators o ON o.id=a.started_by
  WHERE a.started_at=(SELECT MAX(x.started_at) FROM alert_drills x WHERE x.destination_id=a.destination_id)`).bind(NOTIFICATION_NAMESPACE,NOTIFICATION_NAMESPACE,NOTIFICATION_NAMESPACE).all<any>();
 const byDestination=new Map<string,any>();
 for(const r of rows.results)byDestination.set(r.destination_id,{
  latest:{id:r.id,startedAt:r.started_at,startedBy:r.started_by,expiresAt:r.expires_at,submittedAt:r.submitted_at,state:r.state,code:r.outcome?JSON.parse(r.outcome).code:r.state==='sending'?'delivery_sending':r.code,finishedAt:r.state==='queued'||r.state==='sending'?null:r.finished_at,confirmedAt:r.confirmed_at,confirmation:r.confirmed_at?'confirmed':r.expires_at<=now?'expired':'pending',currentCredential:Boolean(r.current_credential)},
  provenAt:r.proven_at});
 return (id:string)=>{const entry=byDestination.get(id),provenAt=entry?.provenAt??null;return {proof:{state:provenAt===null?'never':now-provenAt>PROOF_WINDOW?'stale':'proven',lastProvenAt:provenAt},latestDrill:entry?.latest??null}};
}
