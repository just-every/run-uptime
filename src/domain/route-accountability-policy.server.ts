import type {Bindings} from './control.server.ts'
import {auditStatement,mutationGuard} from './audit.server.ts'
// AGENT-004. The company's consent for scheduled alert-route accountability is one owner-saved policy: the drill window
// (UTC days and hours), how often and how many drills may run, and how the internal route owner is chased. Consent is
// the enabled flag and the person who saved it; withdrawing it, or erasing that person, stops every scheduled step.
// A destination's credential expiry and route owner are owner-entered local facts, never read from the credential.
export interface Policy{consentedBy:string;consentedAt:number;enabled:boolean;windowDays:number[];windowStartHour:number;windowEndHour:number;intervalDays:number;maxDrillsPerDay:number;reminder:{afterHours:number;repeatHours:number;max:number};revision:number}
const fail=(message:string,status=400)=>Object.assign(Error(message),{status})
const integer=(value:unknown,low:number,high:number,label:string)=>{if(!Number.isSafeInteger(value)||(value as number)<low||(value as number)>high)throw fail(`${label} must be a whole number from ${low} to ${high}`);return value as number}
export async function readPolicy(env:Pick<Bindings,'DB'>):Promise<Policy|null>{
 const r=await env.DB.prepare('SELECT * FROM route_accountability_policy WHERE id=1').first<any>()
 return r?{consentedBy:r.consented_by,consentedAt:r.consented_at,enabled:Boolean(r.enabled),windowDays:JSON.parse(r.window_days),windowStartHour:r.window_start_hour,windowEndHour:r.window_end_hour,intervalDays:r.interval_days,maxDrillsPerDay:r.max_drills_per_day,reminder:{afterHours:r.reminder_after_hours,repeatHours:r.reminder_repeat_hours,max:r.reminder_max},revision:r.revision}:null
}
export const inWindow=(policy:Policy,now:number)=>{const at=new Date(now);return policy.windowDays.includes(at.getUTCDay())&&at.getUTCHours()>=policy.windowStartHour&&at.getUTCHours()<policy.windowEndHour}
export async function savePolicy(env:Bindings,input:any,actor:{kind:'operator';ref:string}){
 const keys=['enabled','windowDays','windowStartHour','windowEndHour','intervalDays','maxDrillsPerDay','reminder','expectedRevision']
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!keys.includes(k)))throw fail('Use only the documented accountability fields')
 if(typeof input.enabled!=='boolean')throw fail('Enabled must be a boolean')
 const days=input.windowDays;if(!Array.isArray(days)||!days.length||days.length>7||new Set(days).size!==days.length)throw fail('Choose the weekdays, 0 for Sunday to 6 for Saturday, that drills may run')
 for(const day of days)integer(day,0,6,'Each weekday')
 const start=integer(input.windowStartHour,0,23,'Window start hour'),end=integer(input.windowEndHour,1,24,'Window end hour');if(end<=start)throw fail('The window must end after it starts')
 const interval=integer(input.intervalDays,1,365,'Drill interval days'),perDay=integer(input.maxDrillsPerDay,1,20,'Drills per day')
 const r=input.reminder;if(!r||typeof r!=='object'||Object.keys(r).some(k=>!['afterHours','repeatHours','max'].includes(k)))throw fail('Set the reminder policy: afterHours, repeatHours and max')
 const after=integer(r.afterHours,0,720,'Reminder after hours'),repeat=integer(r.repeatHours,1,720,'Reminder repeat hours'),max=integer(r.max,1,10,'Reminder maximum')
 const expected=integer(input.expectedRevision,0,1_000_000,'Expected revision'),current=await readPolicy(env),now=Date.now()
 if((current?.revision??0)!==expected)throw fail('Accountability policy changed; refresh before saving',409)
 await env.DB.batch([
  mutationGuard(env,current?'EXISTS(SELECT 1 FROM route_accountability_policy WHERE id=1 AND revision=?)':'NOT EXISTS(SELECT 1 FROM route_accountability_policy WHERE id=1)',current?[expected]:[]),
  env.DB.prepare(`INSERT INTO route_accountability_policy(id,consented_by,consented_at,enabled,window_days,window_start_hour,window_end_hour,interval_days,max_drills_per_day,reminder_after_hours,reminder_repeat_hours,reminder_max,revision)
   VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET consented_by=excluded.consented_by,consented_at=excluded.consented_at,enabled=excluded.enabled,window_days=excluded.window_days,window_start_hour=excluded.window_start_hour,
   window_end_hour=excluded.window_end_hour,interval_days=excluded.interval_days,max_drills_per_day=excluded.max_drills_per_day,reminder_after_hours=excluded.reminder_after_hours,reminder_repeat_hours=excluded.reminder_repeat_hours,reminder_max=excluded.reminder_max,revision=excluded.revision`)
   .bind(actor.ref,now,input.enabled?1:0,JSON.stringify([...days].sort()),start,end,interval,perDay,after,repeat,max,expected+1),
  auditStatement(env,actor,input.enabled?'route_accountability_consent':'route_accountability_withdraw','alert_route',crypto.randomUUID(),'1',[],now)
 ])
 return readPolicy(env)
}
export async function saveDestinationSettings(env:Bindings,destinationId:string,input:any,actor:{kind:'operator';ref:string}){
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['credentialExpiresAt','ownerId'].includes(k)))throw fail('Use credentialExpiresAt and ownerId only')
 const {credentialExpiresAt:expires,ownerId:owner}=input
 if(!(expires===null||Number.isSafeInteger(expires)&&expires>0&&expires<8.64e15))throw fail('credentialExpiresAt is a time in milliseconds, or null for none')
 if(!(owner===null||typeof owner==='string'&&owner.length>0&&owner.length<=512))throw fail('ownerId names a member, or null for the consenting person')
 const destination=await env.DB.prepare('SELECT 1 x FROM notification_destinations WHERE id=? AND deleted_at IS NULL').bind(destinationId).first()
 if(!destination)throw fail('Destination not found',404)
 if(owner&&!await env.DB.prepare("SELECT 1 x FROM oa_operators WHERE id=? AND status='active' AND email IS NOT NULL").bind(owner).first())throw fail('The route owner must be an active member with an address')
 const now=Date.now()
 await env.DB.batch([
  mutationGuard(env,'EXISTS(SELECT 1 FROM notification_destinations WHERE id=? AND deleted_at IS NULL)',[destinationId]),
  env.DB.prepare('INSERT INTO route_accountability_destinations(destination_id,credential_expires_at,owner_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(destination_id) DO UPDATE SET credential_expires_at=excluded.credential_expires_at,owner_id=excluded.owner_id,updated_at=excluded.updated_at').bind(destinationId,expires,owner,now),
  auditStatement(env,actor,'route_accountability_destination','destination',crypto.randomUUID(),'1',[],now)
 ])
 return {destinationId,credentialExpiresAt:expires,ownerId:owner}
}
/** The internal person chased for a destination: the one named for it, else the member who consented to receive on it, else the consenting person. Only an active member with an address qualifies. */
export async function routeOwner(env:Pick<Bindings,'DB'>,destinationId:string,policy:Policy){
 const rows=await env.DB.prepare(`SELECT o.id,o.display_name,o.email,0 pos FROM route_accountability_destinations s JOIN oa_operators o ON o.id=s.owner_id WHERE s.destination_id=? AND o.status='active' AND o.email IS NOT NULL
  UNION ALL SELECT o.id,o.display_name,o.email,1 pos FROM alert_recipient_consents c JOIN oa_operators o ON o.id=c.operator_id WHERE c.destination_id=? AND c.enabled=1 AND o.status='active' AND o.email IS NOT NULL
  UNION ALL SELECT o.id,o.display_name,o.email,2 pos FROM oa_operators o WHERE o.id=? AND o.status='active' AND o.email IS NOT NULL ORDER BY pos LIMIT 1`).bind(destinationId,destinationId,policy.consentedBy).first<{id:string;display_name:string;email:string}>()
 return rows?{id:rows.id,name:rows.display_name,email:rows.email}:null
}
