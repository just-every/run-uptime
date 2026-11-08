import type {Bindings} from './control.server.ts'
import {startDrill} from './alert-drills.server.ts'
import {mutationGuard} from './audit.server.ts'
import {readCredential} from './notification-credentials.server.ts'
import type {DrillPolicy} from './alert-drill-schedules.server.ts'
import type {SavedPrincipal} from '../agent-door/work.server.ts'
import {nativePerson,authority} from '../agent-door/authority.server.ts'
import {authorizedDatabase} from './access-database.server.ts'
export async function scheduledDrillRecord(env:Bindings,id:string,scheduleId:string){
 return env.DB.prepare(`SELECT s.*,c.destination_id,c.credential_id,c.issuer_id,c.owner_id,c.config,c.revoked_at FROM alert_drill_schedules s JOIN alert_drill_consents c ON c.id=s.consent_id WHERE s.id=? AND c.destination_id=?`).bind(scheduleId,id).first<any>()
}
function liveGuard(env:Bindings,row:any,now:number){
 return mutationGuard(env,`EXISTS(SELECT 1 FROM alert_drill_schedules s JOIN alert_drill_consents c ON c.id=s.consent_id JOIN oa_operators o ON o.id=c.issuer_id JOIN oa_operators r ON r.id=c.owner_id WHERE s.id=? AND c.revoked_at IS NULL AND s.state IN('active','complete') AND o.role='owner' AND o.status='active' AND r.status='active' AND json_extract(c.config,'$.windowEnd')>=?)`,[row.id,now])
}
async function currentRow(env:Bindings,id:string,scheduleId:string){
 const row=await scheduledDrillRecord(env,id,scheduleId)
 if(!row||row.revoked_at!==null||row.state==='cancelled')throw Error('Scheduled drill consent unavailable')
 return row
}
export async function executeScheduledDrill(env:Bindings,id:string,scheduleId:string,dueAt:number){
 const row=await currentRow(env,id,scheduleId),p:DrillPolicy=JSON.parse(row.config),now=Date.now()
 if(row.state!=='active'||row.next_due!==dueAt||now<dueAt||now<p.windowStart||now>p.windowEnd||row.drills>=p.maxDrills)throw Error('Drill not due inside consented window')
 const d=await env.DB.prepare('SELECT d.enabled,d.deleted_at,d.credential_id current_id,c.* FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=?').bind(id).first<any>()
 let code='drill_queued'
 if(!d||d.deleted_at!==null||!d.enabled)code='destination_disabled'
 else if(d.current_id!==row.credential_id)code='credential_rotated'
 else if(p.credentialExpiresAt!==null&&p.credentialExpiresAt<=now)code='credential_expired'
 else try{await readCredential(env,d,{repairUnavailable:false})}catch{code='credential_unavailable'}
 const runId=crypto.randomUUID(),next=now+p.intervalMs,complete=row.drills+1>=p.maxDrills||next>p.windowEnd
 const statements=(drillId:string|null)=>[liveGuard(env,row,now),mutationGuard(env,"EXISTS(SELECT 1 FROM alert_drill_schedules WHERE id=? AND state='active' AND next_due=? AND drills=?)",[row.id,dueAt,row.drills]),env.DB.prepare('INSERT INTO alert_drill_runs(id,schedule_id,due_at,drill_id,code,next_reminder) VALUES(?,?,?,?,?,?)').bind(runId,row.id,dueAt,drillId,code,now+p.confirmationWaitMs),env.DB.prepare('UPDATE alert_drill_schedules SET next_due=?,drills=drills+1,state=? WHERE id=?').bind(next,complete?'complete':'active',row.id)]
 if(code==='drill_queued'){
  const principal:SavedPrincipal={...JSON.parse(row.principal),drillConsentId:row.consent_id}
  const result=await startDrill(env,id,principal.person.id,principal,drillId=>[mutationGuard(env,'EXISTS(SELECT 1 FROM notification_destinations WHERE id=? AND credential_id=?)',[id,row.credential_id]),...statements(drillId)])
  return {runId,code,...result}
 }
 await env.DB.batch(statements(null));return {runId,code,queued:false}
}
export async function remindDrillOwner(env:Bindings,id:string,scheduleId:string,runId:string,number:number){
 const row=await currentRow(env,id,scheduleId),p:DrillPolicy=JSON.parse(row.config),now=Date.now()
 // Reminders can fall after the sending window, but never after consent revocation.
 const r=await env.DB.prepare(`SELECT r.* FROM alert_drill_runs r LEFT JOIN alert_drills a ON a.id=r.drill_id WHERE r.id=? AND r.schedule_id=? AND r.proposal='open' AND a.confirmed_at IS NULL`).bind(runId,scheduleId).first<any>()
 const person=await nativePerson(env,row.owner_id)
 if(!r||!person||!['owner','admin','editor','responder'].includes(person.role)||r.next_reminder>now||r.reminder_count+1!==number||number>p.maxReminders)throw Error('Owner reminder not due')
 await env.DB.batch([mutationGuard(env,"EXISTS(SELECT 1 FROM alert_drill_consents WHERE id=? AND revoked_at IS NULL)",[row.consent_id]),mutationGuard(env,"EXISTS(SELECT 1 FROM alert_drill_runs r LEFT JOIN alert_drills a ON a.id=r.drill_id WHERE r.id=? AND r.reminder_count=? AND r.proposal='open' AND a.confirmed_at IS NULL)",[r.id,number-1]),env.DB.prepare('INSERT INTO alert_drill_reminders(run_id,number,owner_id,at) VALUES(?,?,?,?)').bind(r.id,number,row.owner_id,now),env.DB.prepare('UPDATE alert_drill_runs SET reminder_count=?,next_reminder=? WHERE id=?').bind(number,now+p.reminderIntervalMs,r.id)])
 return {reminded:true,ownerId:row.owner_id,at:now,channel:'internal',phoneChargeUsd:0}
}
// Cron resumes the original admitted operation through Base for every occurrence and reminder.
export async function scheduledDrills(env:Bindings){
 const schedules=(await env.DB.prepare(`SELECT s.*,c.destination_id,c.config FROM alert_drill_schedules s JOIN alert_drill_consents c ON c.id=s.consent_id WHERE c.revoked_at IS NULL AND s.state IN('active','complete') ORDER BY s.next_due LIMIT 24`).all<any>()).results
 const door=(await import('../agent-door/index.server.ts')).uptimeAgentDoor(env)
 for(const s of schedules){
  const who:SavedPrincipal=JSON.parse(s.principal),person=await nativePerson(env,who.person.id)
  if(!person||!who.operationId||!who.idempotencyKey)continue
  try{
   const access=await authority(env,{...who,person},'secret_write',[],undefined,true),native={...env,DB:authorizedDatabase(env,access)},p:DrillPolicy=JSON.parse(s.config),now=Date.now()
   if(s.state==='active'&&now>p.windowEnd)await native.DB.prepare("UPDATE alert_drill_schedules SET state='complete' WHERE id=?").bind(s.id).run()
   else if(s.state==='active'&&s.next_due<=now)await door.invoke('uptime.destinations.runScheduledDrill',{id:s.destination_id,schedule_id:s.id,due_at:s.next_due,idempotency_key:who.idempotencyKey},who)
   const runs=(await env.DB.prepare(`SELECT r.id,r.reminder_count FROM alert_drill_runs r LEFT JOIN alert_drills a ON a.id=r.drill_id WHERE r.schedule_id=? AND r.proposal='open' AND a.confirmed_at IS NULL AND r.next_reminder<=? AND r.reminder_count<? ORDER BY r.next_reminder LIMIT 24`).bind(s.id,now,p.maxReminders).all<any>()).results
   for(const r of runs)await door.invoke('uptime.destinations.remindDrillOwner',{id:s.destination_id,schedule_id:s.id,run_id:r.id,number:r.reminder_count+1,idempotency_key:who.idempotencyKey},who)
  }catch{/* Missing current authority leaves the work unsent and the saved gap visible. */}
 }
}
// Recheck the company's current window, expiry and consent at the actual transport boundary.
export async function scheduledDrillAdmission(env:Bindings,deliveryId:string){
 const row=await env.DB.prepare(`SELECT c.*,s.state FROM alert_drills a JOIN alert_drill_runs r ON r.drill_id=a.id JOIN alert_drill_schedules s ON s.id=r.schedule_id JOIN alert_drill_consents c ON c.id=s.consent_id WHERE a.delivery_id=?`).bind(deliveryId).first<any>()
 if(!row){const source=await env.DB.prepare('SELECT principal FROM uptime_agent_notifications WHERE delivery_id=?').bind(deliveryId).first<{principal:string}>();return !source||!JSON.parse(source.principal).drillConsentId}
 const p:DrillPolicy=JSON.parse(row.config),now=Date.now(),issuer=await nativePerson(env,row.issuer_id)
 return row.revoked_at===null&&row.state!=='cancelled'&&issuer?.role==='owner'&&now>=p.windowStart&&now<=p.windowEnd&&(p.credentialExpiresAt===null||now<p.credentialExpiresAt)
}
