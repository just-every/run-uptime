import {drillCorrection} from './alert-drill-proposals.server.ts'
import type {Bindings} from './control.server.ts'
import {auditStatement,mutationGuard} from './audit.server.ts'
import {destinations} from './notification-destinations.server.ts'
import type {SavedPrincipal} from '../agent-door/work.server.ts'
export type DrillPolicy={windowStart:number;windowEnd:number;intervalMs:number;maxDrills:number;credentialExpiresAt:number|null;confirmationWaitMs:number;reminderIntervalMs:number;maxReminders:number;phoneBudgetUsd:number;ownerId:string}
const invalid=()=>Object.assign(Error('Explicit consent, a bounded drill window, current credential and internal owner are required. Phone calls are not supported; set their budget to zero.'),{status:400})
export async function drillConsent(env:Bindings,id:string){
 return env.DB.prepare('SELECT * FROM alert_drill_consents WHERE destination_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(id).first<any>()
}
export async function eligibleDrillOwners(env:Bindings){
 return (await env.DB.prepare(`SELECT o.id,o.display_name name FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id WHERE o.status='active' AND o.version=r.base_version AND o.role=r.base_role AND r.role IN('owner','admin','editor','responder') ORDER BY o.display_name,o.id`).all<{id:string;name:string}>()).results
}
export async function saveDrillConsent(env:Bindings,id:string,input:any,issuerId:string){
 const integer=(key:string,min:number,max:number)=>Number.isSafeInteger(input?.[key])&&input[key]>=min&&input[key]<=max
 if(!input||input.consent!==true||Object.keys(input).some(k=>!['consent','windowStart','windowEnd','intervalMs','maxDrills','credentialExpiresAt','confirmationWaitMs','reminderIntervalMs','maxReminders','phoneBudgetUsd','ownerId'].includes(k))||!integer('windowStart',0,Number.MAX_SAFE_INTEGER)||!integer('windowEnd',input.windowStart+1,input.windowStart+31*86400000)||input.windowEnd<=Date.now()||!integer('intervalMs',60000,31*86400000)||!integer('maxDrills',1,24)||!integer('confirmationWaitMs',60000,7*86400000)||!integer('reminderIntervalMs',60000,7*86400000)||!integer('maxReminders',1,10)||input.phoneBudgetUsd!==0||!(input.credentialExpiresAt===null||Number.isSafeInteger(input.credentialExpiresAt)&&input.credentialExpiresAt>0))throw invalid()
 if(!(await eligibleDrillOwners(env)).some(o=>o.id===input.ownerId))throw invalid()
 const d=(await destinations(env,{readOnly:true})).find(d=>d.id===id)
 const current=await env.DB.prepare('SELECT credential_id,webhook_template FROM notification_destinations WHERE id=? AND deleted_at IS NULL').bind(id).first<any>()
 if(!d||!d.enabled||!d.credentialsAvailable||current.webhook_template!==null)throw invalid()
 const {consent,...config}=input,key=crypto.randomUUID(),now=Date.now()
 await env.DB.batch([mutationGuard(env,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')",[issuerId]),env.DB.prepare('UPDATE alert_drill_consents SET revoked_at=? WHERE destination_id=? AND revoked_at IS NULL').bind(now,id),env.DB.prepare("UPDATE alert_drill_schedules SET state='cancelled' WHERE consent_id IN(SELECT id FROM alert_drill_consents WHERE destination_id=?)").bind(id),env.DB.prepare('INSERT INTO alert_drill_consents(id,destination_id,credential_id,issuer_id,owner_id,config,created_at) VALUES(?,?,?,?,?,?,?)').bind(key,id,current.credential_id,issuerId,input.ownerId,JSON.stringify(config),now),auditStatement(env,{kind:'operator',ref:issuerId},'drill_consent','destination')])
 return {id:key,...await drillScheduleView(env,id,issuerId)}
}
export async function revokeDrillConsent(env:Bindings,id:string,issuerId:string){
 await env.DB.batch([env.DB.prepare('UPDATE alert_drill_consents SET revoked_at=? WHERE destination_id=? AND revoked_at IS NULL').bind(Date.now(),id),env.DB.prepare("UPDATE alert_drill_schedules SET state='cancelled' WHERE consent_id IN(SELECT id FROM alert_drill_consents WHERE destination_id=?)").bind(id),auditStatement(env,{kind:'operator',ref:issuerId},'drill_consent_revoke','destination')]);return {revoked:true}
}
export async function scheduleDrills(env:Bindings,id:string,consentId:string,principal:SavedPrincipal){
 const consent=await drillConsent(env,id)
 if(!consent||consent.id!==consentId||consent.revoked_at!==null)throw invalid()
 const config:DrillPolicy=JSON.parse(consent.config),key=crypto.randomUUID(),now=Date.now()
 if(config.windowEnd<=now)throw invalid()
 await env.DB.batch([mutationGuard(env,'EXISTS(SELECT 1 FROM alert_drill_consents c JOIN notification_destinations d ON d.id=c.destination_id AND d.credential_id=c.credential_id WHERE c.id=? AND c.revoked_at IS NULL AND d.enabled=1 AND d.deleted_at IS NULL)',[consentId]),env.DB.prepare('INSERT INTO alert_drill_schedules(id,consent_id,principal,next_due) VALUES(?,?,?,?)').bind(key,consentId,JSON.stringify(principal),Math.max(now,config.windowStart))])
 return {id:key,consentId,nextDue:Math.max(now,config.windowStart),maxDrills:config.maxDrills,phoneBudgetUsd:0}
}
export async function drillScheduleView(env:Bindings,id:string,currentOwnerId?:string){
 const c=await drillConsent(env,id),s=c?await env.DB.prepare('SELECT * FROM alert_drill_schedules WHERE consent_id=?').bind(c.id).first<any>():null
 const rows=c?(await env.DB.prepare(`SELECT r.*,a.confirmed_at,j.state job_state,j.code job_code,COALESCE(d.state,j.state) provider_state FROM alert_drill_runs r JOIN alert_drill_schedules s ON s.id=r.schedule_id JOIN alert_drill_consents c ON c.id=s.consent_id LEFT JOIN alert_drills a ON a.id=r.drill_id LEFT JOIN notification_jobs j ON j.id=a.delivery_id LEFT JOIN integration_deliveries d ON d.id=j.id AND d.namespace='uptime-notifications' WHERE c.destination_id=? ORDER BY r.due_at DESC LIMIT 100`).bind(id).all<any>()).results:[]
 const runs=[]
 for(const r of rows){const reminders=(await env.DB.prepare('SELECT owner_id ownerId,at FROM alert_drill_reminders WHERE run_id=? ORDER BY number').bind(r.id).all<any>()).results
  const failed=r.code!=='drill_queued'||['uncertain','rejected'].includes(r.job_state!=='queued'?r.job_state:r.provider_state)
  runs.push({id:r.id,drillId:r.drill_id,dueAt:r.due_at,code:r.code,providerState:r.job_state&&r.job_state!=='queued'?r.job_state:r.provider_state??'not_sent',confirmation:r.confirmed_at?'confirmed':'missing',proposal:r.proposal,proposedRoute:r.confirmed_at?null:await drillCorrection(env,id,failed?r.code:'recipient_confirmation_missing'),proposedOncall:r.confirmed_at?null:'Propose an Oncall escalation for the unresolved route gap; no page has been sent.',reminders})
 }
 return {consent:c?{id:c.id,...JSON.parse(c.config),revokedAt:c.revoked_at}:null,schedule:s?{id:s.id,state:s.state,nextDue:s.next_due,drills:s.drills}:null,runs,eligibleOwners:await eligibleDrillOwners(env),...(currentOwnerId?{currentOwnerId}:{})}
}
export async function declineDrillProposal(env:Bindings,id:string,runId:string,actorId:string){
 const result=await env.DB.batch([env.DB.prepare(`UPDATE alert_drill_runs SET proposal='declined' WHERE id=? AND proposal='open' AND schedule_id IN(SELECT s.id FROM alert_drill_schedules s JOIN alert_drill_consents c ON c.id=s.consent_id WHERE c.destination_id=?)`).bind(runId,id),auditStatement(env,{kind:'operator',ref:actorId},'drill_proposal_declined','destination')])
 if(!result[0].meta.changes)throw Object.assign(Error('Proposal not available'),{status:404})
 return {declined:true,recipientMessages:0,phoneChargeUsd:0}
}
