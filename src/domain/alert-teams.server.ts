import type {Bindings} from './control.server.ts'
import {AccessError,type Access} from './access.server.ts'
import {mutationGuard,auditStatement} from './audit.server.ts'
import {destinations} from './notification-destinations.server.ts'
import {readCredential,type CredentialRow} from './notification-credentials.server.ts'
import {routeIds} from './alert-route-filters.ts'
const fail=(message:string,status=400)=>status===403?new AccessError():Object.assign(Error(message),{status})
export async function readTeams(env:Bindings){
 const [teams,members]=await Promise.all([env.DB.prepare('SELECT * FROM alert_teams ORDER BY name,id').all<any>(),env.DB.prepare('SELECT tm.team_id,tm.operator_id,o.status,r.role FROM alert_team_members tm LEFT JOIN oa_operators o ON o.id=tm.operator_id LEFT JOIN uptime_member_roles r ON r.operator_id=o.id ORDER BY tm.team_id,tm.operator_id').all<any>()])
 return {teams:teams.results.map(t=>({id:t.id,name:t.name,enabled:!!t.enabled,revision:t.revision,members:members.results.filter(m=>m.team_id===t.id).map(m=>({operatorId:m.operator_id,status:m.status,role:m.role}))}))}
}
export async function saveTeam(env:Bindings,input:any,access:Access){
 if(!input||Object.keys(input).some(k=>!['id','name','enabled','memberIds','expectedRevision'].includes(k))||typeof input.name!=='string'||!input.name.trim()||input.name.length>100||/[\x00-\x1f\x7f]/.test(input.name)||typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw fail('A team needs name, enabled, memberIds and expectedRevision')
 const ids=routeIds(input.memberIds,'member IDs'),id=input.id??crypto.randomUUID()
 if(typeof id!=='string'||!id||id.length>100||/[\x00-\x1f\x7f]/.test(id)||!input.id&&input.expectedRevision!==0)throw fail('Use an existing team ID and current revision, or omit ID to create')
 const current=await env.DB.prepare('SELECT revision FROM alert_teams WHERE id=?').bind(id).first<{revision:number}>()
 if((current?.revision??0)!==input.expectedRevision)throw fail('Team changed; refresh before saving',409)
 const now=Date.now(),revision=input.expectedRevision+1
 const exists=current?'EXISTS(SELECT 1 FROM alert_teams WHERE id=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM alert_teams WHERE id=?)'
 await env.DB.batch([
  mutationGuard(env,exists,[id,...(current?[input.expectedRevision]:[])]),
  mutationGuard(env,`NOT EXISTS(SELECT 1 FROM json_each(?) chosen LEFT JOIN oa_operators o ON o.id=chosen.value LEFT JOIN uptime_member_roles r ON r.operator_id=o.id WHERE o.id IS NULL OR o.status<>'active' OR r.operator_id IS NULL OR r.base_role<>o.role OR r.base_version<>o.version)`,[JSON.stringify(ids)]),
  env.DB.prepare('INSERT INTO alert_teams(id,name,enabled,revision,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,enabled=excluded.enabled,revision=excluded.revision,updated_at=excluded.updated_at').bind(id,input.name.trim(),Number(input.enabled),revision,now),
  env.DB.prepare('DELETE FROM alert_team_members WHERE team_id=?').bind(id),
  env.DB.prepare('INSERT INTO alert_team_members(team_id,operator_id) SELECT ?,value FROM json_each(?)').bind(id,JSON.stringify(ids)),
  auditStatement(env,{kind:'operator',ref:access.session.operator.id},'alert_team_change','alert_route',crypto.randomUUID(),'1',[],now),
 ])
 return {id,revision,saved:true}
}
export async function readRecipient(env:Bindings,access:Access){
 const id=access.session.operator.id,contacts=await destinations(env)
 const consents=(await env.DB.prepare('SELECT destination_id,credential_id,enabled,base_version,role_revision FROM alert_recipient_consents WHERE operator_id=?').bind(id).all<any>()).results
 const teams=(await env.DB.prepare('SELECT t.id,t.name,t.enabled FROM alert_teams t JOIN alert_team_members m ON m.team_id=t.id WHERE m.operator_id=? ORDER BY t.name,t.id').bind(id).all<any>()).results
 const versions=(await env.DB.prepare("SELECT id,credential_id FROM notification_destinations WHERE kind='email' AND deleted_at IS NULL").all<any>()).results
 return {teams:teams.map(t=>({...t,enabled:!!t.enabled})),destinations:contacts.filter(d=>d.kind==='email'&&d.address?.toLowerCase()===access.session.operator.email.toLowerCase()).map(d=>{const consent=consents.find(c=>c.destination_id===d.id),current=!!consent&&consent.base_version===access.session.operator.version&&consent.role_revision===access.revision&&consent.credential_id===versions.find(v=>v.id===d.id)?.credential_id;return {id:d.id,name:d.name,enabled:d.enabled,credentialsAvailable:d.credentialsAvailable,optedIn:!!consent?.enabled&&current,consentCurrent:current}})}
}
export async function consentRecipient(env:Bindings,input:any,access:Access){
 if(!input||Object.keys(input).some(k=>!['destinationId','enabled'].includes(k))||typeof input.destinationId!=='string'||typeof input.enabled!=='boolean')throw fail('Choose your email destination and enabled preference')
 const id=access.session.operator.id
 const row=await env.DB.prepare("SELECT c.* FROM notification_destinations d JOIN notification_credentials c ON c.id=d.credential_id WHERE d.id=? AND d.kind='email' AND d.deleted_at IS NULL").bind(input.destinationId).first<CredentialRow>()
 if(!row)throw fail('Choose a destination for your verified account email',403)
 const credential=await readCredential(env,row)
 // Native Base admission proves this account email. Bind the same encrypted
 // credential version we inspected, never a later replacement read after it.
 if(credential.endpoint.toLowerCase()!==access.session.operator.email.toLowerCase())throw fail('Choose a destination for your verified account email',403)
 const contact={id:input.destinationId}
 const now=Date.now()
 await env.DB.batch([
  mutationGuard(env,'EXISTS(SELECT 1 FROM notification_destinations WHERE id=? AND credential_id=? AND deleted_at IS NULL)',[contact.id,row.id]),
  mutationGuard(env,'NOT EXISTS(SELECT 1 FROM alert_recipient_consents WHERE destination_id=? AND operator_id<>?)',[contact.id,id]),
  env.DB.prepare('INSERT INTO alert_recipient_consents(destination_id,operator_id,credential_id,base_version,role_revision,enabled,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(destination_id) DO UPDATE SET credential_id=excluded.credential_id,base_version=excluded.base_version,role_revision=excluded.role_revision,enabled=excluded.enabled,updated_at=excluded.updated_at').bind(contact.id,id,row.id,access.session.operator.version,access.revision,Number(input.enabled),now),
  auditStatement(env,{kind:'operator',ref:id},'alert_recipient_consent','notification',crypto.randomUUID(),'1',[],now),
 ])
 return {saved:true,...await readRecipient(env,access)}
}
