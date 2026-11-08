import type {Bindings} from './control.server.ts'
import {mailSender} from './mail.server.ts'
import {startDrill} from './alert-drills.server.ts'
import {readPolicy,inWindow,routeOwner,type Policy} from './route-accountability-policy.server.ts'
import {proposeRouteChanges} from './route-accountability-proposals.server.ts'
import type {SubrequestBudget} from './worker-budget.ts'
// AGENT-004. One scheduled pass, only while the company's consent is on and the person who gave it is still active.
// It starts at most the allowed number of drills inside the drill window, never to a destination whose entered credential
// expiry has passed, chases the internal route owner of a destination whose drill went unconfirmed, and records proposals
// for the owner to decide. It sends to recipients only through the drill and the owner reminder; it never edits a route,
// rotates a secret or adds a recipient by itself.
const HOUR=3_600_000,DAY=86_400_000,REMINDER_BATCH=5
export async function runRouteAccountability(env:Bindings,budget:SubrequestBudget,now=Date.now()){
 const policy=await readPolicy(env)
 if(!policy?.enabled||!await env.DB.prepare("SELECT 1 x FROM oa_operators WHERE id=? AND status='active'").bind(policy.consentedBy).first())return
 if(inWindow(policy,now))await scheduleDrills(env,policy,now)
 await planReminders(env,policy,now)
 await sendReminders(env,budget,now)
 await proposeRouteChanges(env,policy,now)
}
async function scheduleDrills(env:Bindings,policy:Policy,now:number){
 const used=(await env.DB.prepare('SELECT COUNT(*) n FROM route_accountability_drills WHERE scheduled_at>?').bind(now-DAY).first<{n:number}>())!.n,room=policy.maxDrillsPerDay-used
 if(room<=0)return
 // A destination is due when no drill for its current credential started within the interval, so a rotated or re-entered destination is drilled at the next window.
 const due=(await env.DB.prepare(`SELECT d.id FROM notification_destinations d LEFT JOIN route_accountability_destinations s ON s.destination_id=d.id
  WHERE d.deleted_at IS NULL AND d.enabled=1 AND d.webhook_template IS NULL AND (s.credential_expires_at IS NULL OR s.credential_expires_at>?)
  AND NOT EXISTS(SELECT 1 FROM alert_drills a WHERE a.destination_id=d.id AND a.credential_id=d.credential_id AND a.started_at>?)
  ORDER BY d.created_at,d.id LIMIT ?`).bind(now,now-policy.intervalDays*DAY,room).all<{id:string}>()).results
 for(const {id} of due){
  try{
   const started=await startDrill(env,id,policy.consentedBy)
   await env.DB.prepare('INSERT INTO route_accountability_drills(drill_id,destination_id,scheduled_at) VALUES(?,?,?)').bind(started.drillId,id,now).run()
  }catch(error){console.error(`Route accountability drill not started: ${(error as Error).message}`)}
 }
}
// A drill the schedule started whose one-time link was never used by its expiry, for a destination still in use with the same credential.
const missed=`SELECT a.id drill_id,a.destination_id,a.expires_at FROM route_accountability_drills t JOIN alert_drills a ON a.id=t.drill_id
 JOIN notification_destinations d ON d.id=a.destination_id AND d.deleted_at IS NULL AND d.enabled=1 AND d.credential_id=a.credential_id
 WHERE a.confirmed_at IS NULL AND a.expires_at<=? AND a.started_at=(SELECT MAX(x.started_at) FROM alert_drills x WHERE x.destination_id=a.destination_id)`
async function planReminders(env:Bindings,policy:Policy,now:number){
 for(const row of (await env.DB.prepare(missed).bind(now).all<{drill_id:string;destination_id:string;expires_at:number}>()).results){
  const sent=(await env.DB.prepare('SELECT COUNT(*) n FROM route_accountability_reminders WHERE drill_id=?').bind(row.drill_id).first<{n:number}>())!.n,number=sent+1
  if(number>policy.reminder.max)continue
  const dueAt=row.expires_at+policy.reminder.afterHours*HOUR+(number-1)*policy.reminder.repeatHours*HOUR
  if(dueAt>now)continue
  // The previous reminder must be finished: a reminder is never queued behind one still waiting or sending.
  if(number>1&&(await env.DB.prepare("SELECT 1 x FROM route_accountability_reminders WHERE drill_id=? AND outcome IN('pending','submitting')").bind(row.drill_id).first()))continue
  const owner=await routeOwner(env,row.destination_id,policy);if(!owner)continue
  await env.DB.prepare('INSERT OR IGNORE INTO route_accountability_reminders(id,drill_id,destination_id,owner_id,number,due_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),row.drill_id,row.destination_id,owner.id,number,dueAt).run()
 }
}
async function sendReminders(env:Bindings,budget:SubrequestBudget,now:number){
 const sender=mailSender(env);if(!sender)return
 const pending=(await env.DB.prepare("SELECT * FROM route_accountability_reminders WHERE outcome='pending' AND due_at<=? ORDER BY due_at,id LIMIT ?").bind(now,REMINDER_BATCH).all<any>()).results
 for(const reminder of pending){
  const live=await env.DB.prepare(`SELECT o.email,d.name,d.kind,a.expires_at FROM alert_drills a JOIN notification_destinations d ON d.id=a.destination_id AND d.deleted_at IS NULL AND d.enabled=1 AND d.credential_id=a.credential_id
   JOIN oa_operators o ON o.id=? AND o.status='active' WHERE a.id=? AND a.confirmed_at IS NULL AND a.started_at=(SELECT MAX(x.started_at) FROM alert_drills x WHERE x.destination_id=a.destination_id)`).bind(reminder.owner_id,reminder.drill_id).first<any>()
  if(!live){await env.DB.prepare("UPDATE route_accountability_reminders SET outcome='cancelled',finished_at=? WHERE id=? AND outcome='pending'").bind(now,reminder.id).run();continue}
  const allowance=budget.reserve(1);if(!allowance)break
  try{
   // One reservation, one submission: a reminder that stops after this point reads as uncertain and is never sent again.
   const reserved=await env.DB.prepare("UPDATE route_accountability_reminders SET outcome='submitting',submitted_at=? WHERE id=? AND outcome='pending' RETURNING id").bind(now,reminder.id).first()
   if(!reserved)continue
   let outcome='uncertain'
   try{
    allowance.spend()
    const max=(await readPolicy(env))?.reminder.max??reminder.number
    const result=await sender.send({deliveryId:reminder.id,from:env.MAIL_FROM!,to:[live.email],subject:'Uptime alert route needs attention',
     text:`The ${live.kind} alert destination "${live.name}" did not confirm its scheduled alert drill. This is reminder ${reminder.number} of at most ${max}.\n\nSign in to review the evidence and the proposed route change: ${new URL('/app',env.UPTIME_ORIGIN).href}`})
    outcome=['accepted','development','rejected','rate_limited'].includes(result.status)?result.status:'uncertain'
   }catch{outcome='uncertain'}
   await env.DB.prepare("UPDATE route_accountability_reminders SET outcome=?,finished_at=? WHERE id=? AND outcome='submitting'").bind(outcome,Date.now(),reminder.id).run()
  }finally{allowance.release()}
 }
}
