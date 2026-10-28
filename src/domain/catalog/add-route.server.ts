import type {Bindings} from '../control.server.ts'
import {auditStatement,mutationGuard,type AuditActor} from '../audit.server.ts'
import {namedAlertRoute,previewRecipients,snapshot,snapshotSql} from '../alert-routes.server.ts'
import {defaultPolicy} from '../alert-routes-policy.ts'
import {liveRecipientSql} from '../alert-team-policy.ts'
import {destinations} from '../notification-destinations.server.ts'
import {mailConfigured} from '../mail.server.ts'

const stale=()=>Object.assign(Error('Alert route or recipients changed; review the catalog again.'),{status:409})
const warning='Assignment creates, confirms and messages no recipient. Existing recipient consent and confirmation remain unchanged.'
export async function catalogAddRoute(env:Bindings,id:string|undefined){
 if(id===undefined)return null
 const before=await snapshot(env),route=await namedAlertRoute(env,id),contacts=await destinations(env,{readOnly:true})
 return {route,snapshot:before,contacts,mailConfigured:mailConfigured(env)}
}
export type AddRoute=Awaited<ReturnType<typeof catalogAddRoute>>
export function addRouteView(route:NonNullable<AddRoute>){return {...route.route,warning}}
export async function checkAddRoute(env:Bindings,route:AddRoute){if(route&&await snapshot(env)!==route.snapshot)throw stale()}
export async function addRouteRecipients(env:Bindings,route:NonNullable<AddRoute>,definition:any){
 // Evaluate scoped consent against the proposed monitor, without persisting a temporary monitor.
 const candidates=(await env.DB.prepare(`SELECT tm.team_id,tm.operator_id,rc.destination_id,team.enabled team_enabled,(${liveRecipientSql()}) live,(rc.credential_id=d.credential_id) credential_current
  FROM alert_team_members tm JOIN alert_teams team ON team.id=tm.team_id
  LEFT JOIN alert_recipient_consents rc ON rc.operator_id=tm.operator_id
  LEFT JOIN notification_destinations d ON d.id=rc.destination_id
  CROSS JOIN (SELECT ? definition) m`).bind(JSON.stringify(definition)).all<any>()).results
 const policy={...defaultPolicy('monitor',''),...route.route.policy,namedRouteId:route.route.id}
 return {...previewRecipients([policy],route.contacts,route.mailConfigured,candidates),
  excludedMembers:candidates.filter(c=>policy.teamIds.includes(c.team_id)&&(!c.destination_id||!c.live||!c.team_enabled||!c.credential_current)).map(c=>({teamId:c.team_id,operatorId:c.operator_id,reason:!c.destination_id?'no_consent':!c.team_enabled?'team_disabled':'consent_inactive_or_out_of_scope'}))}
}
export function addRouteGuards(env:Bindings,route:NonNullable<AddRoute>,actor:AuditActor){
 if(actor.kind!=='operator')throw Object.assign(Error('Owner required'),{status:403})
 return [mutationGuard(env,`(${snapshotSql})=?`,[route.snapshot]),
  mutationGuard(env,'EXISTS(SELECT 1 FROM alert_named_routes WHERE id=? AND name=? AND policy=?)',[route.route.id,route.route.name,JSON.stringify(route.route.policy)]),
  mutationGuard(env,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')",[actor.ref])]
}
export function addRouteStatements(env:Bindings,route:NonNullable<AddRoute>,monitorId:string,actor:AuditActor,now:number){
 const previous=defaultPolicy('monitor',monitorId),current={...previous,...route.route.policy,namedRouteId:route.route.id,revision:1,updatedAt:now},id=crypto.randomUUID()
 return [env.DB.prepare(`INSERT INTO alert_routes(scope_kind,scope_value,mode,destination_ids,contact_settings,fallback,team_ids,filters,quiet_hours,revision,updated_at,named_route_id) VALUES('monitor',?,?,?,?,?,?,?,?,1,?,?)`)
   .bind(monitorId,current.mode,JSON.stringify(current.destinationIds),JSON.stringify(current.contactSettings),JSON.stringify(current.fallback),JSON.stringify(current.teamIds),JSON.stringify(current.filters),current.quietHours?JSON.stringify(current.quietHours):null,now,route.route.id),
  env.DB.prepare('INSERT INTO alert_route_changes VALUES(?,?,?,?,?,?,?)').bind(id,'monitor',monitorId,JSON.stringify(previous),JSON.stringify(current),now,actor.ref),
  auditStatement(env,actor,'alert_route_change','alert_route',id,'1',[],now)]
}
