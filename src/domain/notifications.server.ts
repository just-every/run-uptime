import {handoffFacts} from './incident-work/handoff.server.ts'
import {contactReady,contactQuietReady,refreshContactQuiet} from './contact-scheduler.server.ts'
import {notificationPreferences} from './notification-preferences.server.ts'
import {mailConfigured} from './mail.server.ts'
import {ensureNotificationCustody,readCredential} from './notification-credentials.server.ts'
import {destinations} from './notification-destinations.server.ts'
import {webhookSampleSend} from './notification-webhook.ts'
import {testEvent,type NotificationEvent} from './notification-content.ts'
import {readContact} from './runner-contact.server.ts'
import {hostedInstallation} from './hosted-runner.ts'
import {cronStarted} from './cron-run.server.ts'
import {drillOverview} from './alert-drills.server.ts'
import type {Bindings} from './control.server.ts'
import {recoveryAccepted} from './alert-route-delivery.server.ts'
import {fallbackOverview} from './notification-fallback.server.ts'
export const NOTIFICATION_NAMESPACE='uptime-notifications';
// Existing open incidents can predate notification delivery. Derive their stable
// identity from the original trigger without rewriting or replaying that event.
export async function openIncidentKey(env:Bindings,monitorId:string,state:any){
 if(state.incidentKey)return state.incidentKey;
 if(!state.notificationOpen)return null;
 const trigger=await env.DB.prepare("SELECT slot_id,event FROM outbox WHERE monitor_id=? AND kind='trigger' AND status<>'imported-inactive' ORDER BY rowid DESC LIMIT 1").bind(monitorId).first<{slot_id:string;event:string}>();
 return trigger?(JSON.parse(trigger.event).incidentKey??`incident:${trigger.slot_id}`):null;
}
// Test sends and alert drills share this path: one queued test-kind event for one destination's current credential.
// `extra` runs in the same transaction, after the job insert, so a drill row exists exactly when its job does.
export async function queueTestEvent(env:Bindings,id:string,event:NotificationEvent,extra:(deliveryId:string,credentialId:string)=>Promise<D1PreparedStatement[]>=async()=>[],expectedCredentialId?:string){
 await ensureNotificationCustody(env);
 const credential=await env.DB.prepare('SELECT c.* FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=? AND d.deleted_at IS NULL').bind(id).first<any>();
 if(!credential)throw Error('Destination not found');
 if(expectedCredentialId!==undefined&&expectedCredentialId!==credential.id)throw Error('Destination changed; preview again');
 await readCredential(env,credential);
 const deliveryId=`${event.id}:${id}`;
 const [result]=await env.DB.batch([env.DB.prepare(`INSERT ${expectedCredentialId===undefined?'':'OR IGNORE '}INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at)
 SELECT ?,?,id,name,kind,credential_id,?,? FROM notification_destinations WHERE id=? AND credential_id=? AND deleted_at IS NULL`).bind(deliveryId,event.id,JSON.stringify(event),event.observedAt,id,credential.id),...await extra(deliveryId,credential.id)]);
 if(!result.meta.changes){
  const existing=expectedCredentialId===undefined?null:await env.DB.prepare('SELECT event,credential_id FROM notification_jobs WHERE id=? AND destination_id=?').bind(deliveryId,id).first<any>();
  if(!existing||existing.credential_id!==credential.id||existing.event!==JSON.stringify(event))throw Error('Destination changed; preview again');
 }
 return {deliveryId,credentialId:credential.id as string}}
export async function testDestination(env:Bindings,id:string,input:any={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='sample'))throw Error('Invalid test send fields');
 const sample=Object.hasOwn(input,'sample')?await webhookSampleSend(env,id,input.sample):undefined;
 const event=sample?.event??testEvent(env.UPTIME_ORIGIN??''),{deliveryId}=await queueTestEvent(env,id,event,undefined,sample?.credentialId);
 return {queued:true,eventId:event.id,deliveryId};
}
export async function notificationOverview(env:Bindings){
 await refreshContactQuiet(env);
 const rows=await env.DB.prepare(`SELECT j.id,j.event_id,j.destination_id,j.destination_name,j.kind,j.created_at,j.event,
 CASE WHEN j.state<>'queued' THEN j.state ELSE COALESCE(d.state,j.state) END state,
 CASE WHEN j.state='queued' AND NOT ${recoveryAccepted()} THEN 'waiting_for_trigger_acceptance' WHEN j.state='queued' AND NOT ${contactQuietReady()} THEN 'waiting_for_contact_quiet' WHEN j.state='queued' AND NOT ${contactReady()} THEN 'waiting_for_contact_delay' WHEN j.code='waiting_for_contact_quiet' THEN 'waiting_for_runner' ELSE j.code END code,COALESCE(d.attempts,j.attempts) attempts,
 (SELECT MAX(s.quiet_until) FROM alert_contact_schedules s JOIN notification_jobs t ON t.id=s.trigger_job_id WHERE t.destination_id=j.destination_id AND s.monitor_id=json_extract(j.event,'$.monitorId') AND s.incident_key=json_extract(j.event,'$.incidentKey') AND s.quiet_until>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) quiet_until,
 COALESCE((SELECT json_object('kind',a.outcome_category,'code',a.code,'status',a.status,'responseExcerpt',(SELECT json_extract(x.outcome,'$.responseExcerpt') FROM integration_attempts x WHERE x.namespace='uptime-notifications' AND x.delivery_id=a.delivery_id AND x.number=a.number)) FROM notification_delivery_attempts a WHERE a.delivery_id=j.id AND a.finished_at IS NOT NULL ORDER BY a.number DESC LIMIT 1),(SELECT a.outcome FROM integration_attempts a WHERE a.namespace=? AND a.delivery_id=j.id ORDER BY a.number DESC LIMIT 1)) outcome
 FROM notification_jobs j LEFT JOIN integration_deliveries d ON d.namespace=? AND d.id=j.id ORDER BY j.created_at DESC,j.id DESC LIMIT 200`).bind(NOTIFICATION_NAMESPACE,NOTIFICATION_NAMESPACE).all<any>();
 const history=(await env.DB.prepare('SELECT * FROM notification_delivery_attempts WHERE delivery_id IN(SELECT id FROM notification_jobs ORDER BY created_at DESC,id DESC LIMIT 200) ORDER BY number').all<any>()).results;
 const attempts=new Map<string,any[]>();for(const a of history)attempts.set(a.delivery_id,[...(attempts.get(a.delivery_id)??[]),a]);
 const handoffs=await handoffFacts(env,rows.results.map(r=>r.id));
 const drills=await drillOverview(env),chain=await fallbackOverview(env,rows.results);
 return {ownerEmail:env.OWNER_EMAIL,mailSuppressed:env.MAIL_PROVIDER==='development',preferences:await notificationPreferences(env),destinations:(await destinations(env)).map(d=>({...d,...drills(d.id)})),mailConfigured:mailConfigured(env),workerSends:hostedInstallation(env),demo:env.RER_DEMO==='1',cronStarted:await cronStarted(env),runnerContact:await readContact(env.DB),deliveries:rows.results.map(r=>({id:r.id,...(handoffs.has(r.id)?{handoff:handoffs.get(r.id)}:{}),eventId:r.event_id,destinationId:r.destination_id,destinationName:r.destination_name,kind:r.kind,createdAt:r.created_at,event:JSON.parse(r.event),state:r.state,code:r.state==='queued'&&r.code==='waiting_for_contact_quiet'?r.code:r.outcome?JSON.parse(r.outcome).code:r.state==='sending'?'delivery_sending':r.code,...(r.quiet_until!==null&&r.state==='queued'?{quietUntil:r.quiet_until}:{}),attempts:r.attempts,attemptHistory:attempts.get(r.id)??[],...((view=>view?{chain:view}:{})(chain(r))),...(r.outcome&&JSON.parse(r.outcome).status!=null?{status:JSON.parse(r.outcome).status}:{}),...(r.outcome&&JSON.parse(r.outcome).responseExcerpt!=null?{responseExcerpt:JSON.parse(r.outcome).responseExcerpt}:{})}))}
}
