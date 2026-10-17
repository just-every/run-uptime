import {mailConfigured} from './mail.server.ts'
import {ensureNotificationCustody,readCredential} from './notification-credentials.server.ts'
import {destinations} from './notification-destinations.server.ts'
import {testEvent,type NotificationEvent} from './notification-content.ts'
import {readContact} from './runner-contact.server.ts'
import {hostedInstallation} from './hosted-runner.ts'
import {cronStarted} from './cron-run.server.ts'
import {drillOverview} from './alert-drills.server.ts'
import type {Bindings} from './control.server.ts'
import {recoveryAccepted} from './alert-route-delivery.server.ts'
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
export async function queueTestEvent(env:Bindings,id:string,event:NotificationEvent,extra:(deliveryId:string,credentialId:string)=>Promise<D1PreparedStatement[]>=async()=>[]){
 await ensureNotificationCustody(env);
 const credential=await env.DB.prepare('SELECT c.* FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=? AND d.deleted_at IS NULL').bind(id).first<any>();
 if(!credential)throw Error('Destination not found');await readCredential(env,credential);
 const deliveryId=`${event.id}:${id}`;
 const [result]=await env.DB.batch([env.DB.prepare(`INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at)
 SELECT ?,?,id,name,kind,credential_id,?,? FROM notification_destinations WHERE id=? AND credential_id=? AND deleted_at IS NULL`).bind(deliveryId,event.id,JSON.stringify(event),event.observedAt,id,credential.id),...await extra(deliveryId,credential.id)]);
 if(!result.meta.changes)throw Error('Destination not found');return {deliveryId,credentialId:credential.id as string}}
export async function testDestination(env:Bindings,id:string){const event=testEvent(env.UPTIME_ORIGIN??''),{deliveryId}=await queueTestEvent(env,id,event);return {queued:true,eventId:event.id,deliveryId}}
export async function notificationOverview(env:Bindings){
 const rows=await env.DB.prepare(`SELECT j.id,j.event_id,j.destination_id,j.destination_name,j.kind,j.created_at,j.event,
 CASE WHEN j.state<>'queued' THEN j.state ELSE COALESCE(d.state,j.state) END state,
 CASE WHEN j.state='queued' AND NOT ${recoveryAccepted()} THEN 'waiting_for_trigger_acceptance' ELSE j.code END code,COALESCE(d.attempts,j.attempts) attempts,
 (SELECT a.outcome FROM integration_attempts a WHERE a.namespace=? AND a.delivery_id=j.id ORDER BY a.number DESC LIMIT 1) outcome
 FROM notification_jobs j LEFT JOIN integration_deliveries d ON d.namespace=? AND d.id=j.id ORDER BY j.created_at DESC,j.id DESC LIMIT 200`).bind(NOTIFICATION_NAMESPACE,NOTIFICATION_NAMESPACE).all<any>();
 const drills=await drillOverview(env);
 return {destinations:(await destinations(env)).map(d=>({...d,...drills(d.id)})),mailConfigured:mailConfigured(env),workerSends:hostedInstallation(env),demo:env.RER_DEMO==='1',cronStarted:await cronStarted(env),runnerContact:await readContact(env.DB),deliveries:rows.results.map(r=>({id:r.id,eventId:r.event_id,destinationId:r.destination_id,destinationName:r.destination_name,kind:r.kind,createdAt:r.created_at,event:JSON.parse(r.event),state:r.state,code:r.outcome?JSON.parse(r.outcome).code:r.state==='sending'?'delivery_sending':r.code,attempts:r.attempts}))}
}
