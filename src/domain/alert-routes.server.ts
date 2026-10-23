import {normalizeRouteFilters,normalizeRouteQuiet,routeIds,normalizeRouteSample,filterReasons,quietPreview,type RouteSample} from './alert-route-filters.ts'
import {liveRecipientSql} from './alert-team-policy.ts'
import {normalizeContactSettings,defaultContactSettings} from './contact-schedule.ts'
import {get,type Bindings} from './control.server.ts'
import {destinations} from './notification-destinations.server.ts'
import {mailConfigured} from './mail.server.ts'
import {auditStatement,mutationGuard,type AuditActor} from './audit.server.ts'
import {digest} from './archive-schema.ts'
import {routeScopes,scopeValue,defaultPolicy,routePolicy,effectivePolicy,normalizeFallback,type RouteScope,type RoutePolicy} from './alert-routes-policy.ts'
const gaps=['These routes apply to confirmed incident triggers and recoveries. Expiry and renewal notices still use installation-wide destinations.','Teams and filters have API/CLI doors; their console UI and business-hour calendar remain unavailable. Region filters match exact configured probe IDs, not geographic regions; severity is critical for outages, warning for Slow, info for dependency notices.','Contact delays and reminders start at confirmation. Fallback contacts are named only in a selected policy and receive incident triggers, not reminders, slow notices or tests.','Route settings and detailed change history stay in this installation; archives retain opaque audit entries.'];
// No secrets: only policy, monitor revisions and destination/custody identity.
// Fencing this snapshot makes the reviewed affected set and readiness atomic
// with a policy edit, even when another operator changes a broader scope.
const snapshotSql=`SELECT json_array(
 (SELECT json_group_array(json_array(scope_kind,scope_value,mode,destination_ids,contact_settings,fallback,team_ids,filters,quiet_hours,revision,updated_at)) FROM (SELECT * FROM alert_routes ORDER BY scope_kind,scope_value)),
 (SELECT json_group_array(json_array(id,revision,definition)) FROM (SELECT id,revision,definition FROM monitors ORDER BY id)),
 (SELECT json_group_array(json_array(id,name,kind,enabled,credential_id,deleted_at,cid,retired_at,unavailable_at,has_ciphertext,has_endpoint)) FROM
  (SELECT d.*,c.id cid,c.retired_at,c.unavailable_at,c.ciphertext IS NOT NULL has_ciphertext,c.endpoint IS NOT NULL has_endpoint FROM notification_destinations d LEFT JOIN notification_credentials c ON c.id=d.credential_id ORDER BY d.id))
 ,(SELECT json_group_array(json_array(id,name,enabled,revision)) FROM (SELECT * FROM alert_teams ORDER BY id))
 ,(SELECT json_group_array(json_array(team_id,operator_id)) FROM (SELECT * FROM alert_team_members ORDER BY team_id,operator_id))
 ,(SELECT json_group_array(json_array(destination_id,operator_id,credential_id,base_version,role_revision,enabled,updated_at)) FROM (SELECT * FROM alert_recipient_consents ORDER BY destination_id))
 ,(SELECT json_group_array(json_array(id,status,role,version)) FROM (SELECT * FROM oa_operators ORDER BY id))
 ,(SELECT json_group_array(json_array(operator_id,role,base_role,base_version,revision)) FROM (SELECT * FROM uptime_member_roles ORDER BY operator_id))
 ,(SELECT json_group_array(json_array(operator_id,kind,value)) FROM (SELECT * FROM uptime_member_scopes ORDER BY operator_id,kind,value))
 ) snapshot`;
async function snapshot(env:Bindings){return (await env.DB.prepare(snapshotSql).first<{snapshot:string}>())!.snapshot}
type Input={scope:RouteScope;mode:RoutePolicy['mode'];destinationIds:string[];contactSettings?:Record<string,any>;fallback:RoutePolicy['fallback'];teamIds?:string[];filters?:RoutePolicy['filters'];quietHours?:RoutePolicy['quietHours'];expectedRevision:number};
function validate(input:any):Input{
 if(!input||Object.keys(input).some(k=>!['scope','mode','destinationIds','contactSettings','fallback','teamIds','filters','quietHours','expectedRevision'].includes(k))||!routeScopes.includes(input.scope))throw Error('Choose monitor, service, group or installation scope');
 if(!(input.scope==='installation'?['all','selected']:['inherit','selected']).includes(input.mode))throw Error('Choose an allowed inheritance or selected-destinations policy');
 if(!Array.isArray(input.destinationIds)||input.destinationIds.length>100||input.destinationIds.some((id:any)=>typeof id!=='string'||!id||id.length>512||/[\x00-\x1f\x7f]/.test(id))||new Set(input.destinationIds).size!==input.destinationIds.length)throw Error('Use at most 100 distinct destination IDs');
 if(input.mode!=='selected'&&input.destinationIds.length)throw Error('Only a selected-destinations policy takes destination IDs');
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw Error('A current route revision is required');
 const fallback=normalizeFallback(input.fallback,input.mode,input.destinationIds);
 const teamIds=input.teamIds===undefined?undefined:routeIds(input.teamIds,'team IDs',30);if(input.mode!=='selected'&&teamIds?.length)throw Error('Only a selected policy takes teams');
 const filters=input.filters===undefined?undefined:normalizeRouteFilters(input.filters),quietHours=input.quietHours===undefined?undefined:normalizeRouteQuiet(input.quietHours);
 return {...input,teamIds,filters,quietHours,destinationIds:[...input.destinationIds].sort(),fallback,contactSettings:normalizeContactSettings(input.contactSettings??{},[...input.destinationIds,...fallback.destinationIds])};
}
async function context(env:Bindings,monitorId:string){
 const monitor=await get(env,monitorId);if(!monitor)throw Object.assign(Error('Monitor not found'),{status:404});
 const [rows,contacts]=await Promise.all([env.DB.prepare('SELECT * FROM alert_routes ORDER BY scope_kind,scope_value').all<any>(),destinations(env)]);
 const policies=routeScopes.map(scope=>{const value=scopeValue(scope,monitor);return rows.results.find(r=>r.scope_kind===scope&&r.scope_value===value)});
 return {monitor,rows:rows.results,policies:policies.map((row,i)=>row?routePolicy(row):defaultPolicy(routeScopes[i],scopeValue(routeScopes[i],monitor))),destinations:contacts};
}
function previewRecipients(policies:RoutePolicy[],contacts:any[],configured:boolean,candidates:any[]=[],sample?:RouteSample,environment?:string){
 const effective=effectivePolicy(policies),ids=effective.destinationIds;
 const recipients=contacts.map(d=>{
  const team=candidates.filter(c=>c.destination_id===d.id&&effective.teamIds.includes(c.team_id)),direct=effective.mode==='all'||ids.includes(d.id),selected=direct||team.length>0;
  const blocked=sample?filterReasons(effective.filters,environment,sample):[],recipientAllowed=direct||team.some(c=>c.live&&c.team_enabled&&c.credential_current);
  const until=sample?quietPreview(effective.quietHours,effective.contactSettings[d.id]?.quietHours,sample.at):null;
  const reason=!selected?(effective.fallback.destinationIds.includes(d.id)?'fallback_only':'not_selected'):!recipientAllowed?'team_recipient_ineligible':blocked.length?blocked[0]:!d.enabled?'disabled':!d.credentialsAvailable?'credentials_missing':d.kind==='email'&&!configured?'mail_not_configured':'ready';
  return {...d,selected,eligible:reason==='ready',reason,...(sample?{quietUntil:until,outcome:reason!=='ready'?'excluded':until?'held_quiet':'ready'}:{}),teamIds:team.map(c=>c.team_id),contactSettings:effective.contactSettings[d.id]??defaultContactSettings};
 });
 for(const id of ids)if(!contacts.some(d=>d.id===id))recipients.push({id,name:'Missing or erased destination',kind:null,enabled:false,credentialsAvailable:false,selected:true,eligible:false,reason:'destination_missing'});
 // Fallback contacts keep their own ROUTING-002 schedule and are messaged only after an earlier contact fails.
 const fallback=effective.fallback.destinationIds.map((id,index)=>{
  const d=contacts.find(c=>c.id===id),blocked=sample?filterReasons(effective.filters,environment,sample):[],until=sample?quietPreview(effective.quietHours,effective.contactSettings[id]?.quietHours,sample.at):null;
  const reason=blocked.length?blocked[0]:!d?'destination_missing':!d.enabled?'disabled':!d.credentialsAvailable?'credentials_missing':d.kind==='email'&&!configured?'mail_not_configured':'ready';
  return {id,name:d?.name??'Missing or erased destination',kind:d?.kind??null,order:index+1,eligible:reason==='ready',reason,...(sample?{quietUntil:until,outcome:reason!=='ready'?'excluded':until?'held_quiet':'fallback_only'}:{}),contactSettings:effective.contactSettings[id]??defaultContactSettings};
 });
 return {effective,recipients,fallback,quietHours:effective.quietHours,fallbackDeadlineSeconds:effective.fallback.deadlineSeconds,readyCount:recipients.filter(d=>d.eligible).length};
}
export async function readAlertRoute(env:Bindings,monitorId:string){
 const ctx=await context(env,monitorId);
 const changes=await env.DB.prepare(`SELECT * FROM alert_route_changes WHERE (scope_kind='monitor' AND scope_value=?) OR (scope_kind='service' AND scope_value=?) OR (scope_kind='group' AND scope_value=?) OR scope_kind='installation' ORDER BY changed_at DESC,rowid DESC LIMIT 30`).bind(monitorId,scopeValue('service',ctx.monitor),scopeValue('group',ctx.monitor)).all<any>();
 return {monitorId,policies:ctx.policies,...previewRecipients(ctx.policies,ctx.destinations,mailConfigured(env),await teamCandidates(env,monitorId)),gaps,changes:changes.results.map(r=>({id:r.id,scope:r.scope_kind,value:r.scope_value,previous:JSON.parse(r.previous_policy),current:JSON.parse(r.current_policy),changedAt:r.changed_at,actorRef:r.actor_ref}))};
}
async function plan(env:Bindings,monitorId:string,raw:any){
 const input=validate(raw);
 // Custody validation may clear a prior unavailable marker before we snapshot.
 await destinations(env);
 const before=await snapshot(env),ctx=await context(env,monitorId),value=scopeValue(input.scope,ctx.monitor);
 if(input.scope!=='installation'&&!value)throw Error(`Set this monitor's ${input.scope} before choosing that route scope`);
 const previous=ctx.policies.find(p=>p.scope===input.scope)!;
 if(previous.revision!==input.expectedRevision)throw Object.assign(Error('Route changed; refresh and preview again'),{status:409});
 if(input.destinationIds.some(id=>!ctx.destinations.some(d=>d.id===id)&&!previous.destinationIds.includes(id)))throw Error('A selected destination does not exist');
 if(input.fallback.destinationIds.some(id=>!ctx.destinations.some(d=>d.id===id)&&!previous.fallback.destinationIds.includes(id)))throw Error('A fallback destination does not exist');
 const teamIds=input.teamIds??[];
 const knownTeams=(await env.DB.prepare('SELECT id FROM alert_teams').all<{id:string}>()).results;
 if(teamIds.some(id=>!knownTeams.some(t=>t.id===id)))throw Error('A selected team does not exist');
 const current={...previous,teamIds,filters:input.filters??previous.filters,quietHours:input.quietHours===undefined?previous.quietHours:input.quietHours,mode:input.mode,destinationIds:input.destinationIds,contactSettings:input.contactSettings!,fallback:input.fallback,revision:previous.revision+1};
 const policies=ctx.policies.map(p=>p.scope===input.scope?current:p),preview=previewRecipients(policies,ctx.destinations,mailConfigured(env),await teamCandidates(env,monitorId));
 const monitors=await env.DB.prepare('SELECT id,revision,definition FROM monitors ORDER BY id').all<any>();
 const candidates=await teamCandidates(env);
 const affected=monitors.results.filter(m=>input.scope==='installation'||(input.scope==='monitor'?m.id===monitorId:JSON.parse(m.definition)[input.scope]===value)).map(m=>{
  const monitor={id:m.id,definition:JSON.parse(m.definition)};
  const inherited=routeScopes.map(scope=>{
   const v=scopeValue(scope,monitor);if(scope===input.scope&&v===value)return current;
   const row=ctx.rows.find(r=>r.scope_kind===scope&&r.scope_value===v);return row?routePolicy(row):defaultPolicy(scope,v);
  });
  const p=previewRecipients(inherited,ctx.destinations,mailConfigured(env),candidates.filter(c=>c.monitor_id===m.id));
  return {id:m.id,name:monitor.definition.name,revision:m.revision,effective:p.effective,readyCount:p.readyCount,selectedIds:p.recipients.filter(d=>d.selected).map(d=>d.id),blocked:p.recipients.filter(d=>d.selected&&!d.eligible).map(d=>({id:d.id,reason:d.reason}))};
 });
 if(await snapshot(env)!==before)throw Object.assign(Error('Routing inputs changed; preview again'),{status:409});
 const result={input,value,previous,current,policies,...preview,affected,gaps};
 return {...result,digest:await digest(JSON.stringify({...result,monitorRevision:ctx.monitor.revision})),monitor:ctx.monitor,snapshot:before};
}
export async function previewAlertRoute(env:Bindings,monitorId:string,input:any){const {monitor,snapshot,...result}=await plan(env,monitorId,input);return result}
export async function applyAlertRoute(env:Bindings,monitorId:string,raw:any,actor:AuditActor){
 const {digest:approved,...input}=raw,prepared=await plan(env,monitorId,input);
 if(typeof approved!=='string'||approved!==prepared.digest)throw Object.assign(Error('Preview changed; review recipients again'),{status:409});
 const {previous,current,value,monitor}=prepared,now=Date.now(),changeId=crypto.randomUUID();
 const guard=previous.revision?'EXISTS(SELECT 1 FROM alert_routes WHERE scope_kind=? AND scope_value=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM alert_routes WHERE scope_kind=? AND scope_value=?)';
 try{await env.DB.batch([
  mutationGuard(env,`(${snapshotSql})=?`,[prepared.snapshot]),
  mutationGuard(env,guard,[input.scope,value,...(previous.revision?[previous.revision]:[])]),
  mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[monitorId,monitor.revision]),
  env.DB.prepare(`INSERT INTO alert_routes(scope_kind,scope_value,mode,destination_ids,contact_settings,fallback,team_ids,filters,quiet_hours,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scope_kind,scope_value) DO UPDATE SET mode=excluded.mode,destination_ids=excluded.destination_ids,contact_settings=excluded.contact_settings,fallback=excluded.fallback,team_ids=excluded.team_ids,filters=excluded.filters,quiet_hours=excluded.quiet_hours,revision=excluded.revision,updated_at=excluded.updated_at`).bind(input.scope,value,input.mode,JSON.stringify(current.destinationIds),JSON.stringify(current.contactSettings),JSON.stringify(current.fallback),JSON.stringify(current.teamIds),JSON.stringify(current.filters),current.quietHours?JSON.stringify(current.quietHours):null,current.revision,now),
  env.DB.prepare('INSERT INTO alert_route_changes VALUES(?,?,?,?,?,?,?)').bind(changeId,input.scope,value,JSON.stringify(previous),JSON.stringify({...current,updatedAt:now}),now,actor.ref),
  auditStatement(env,actor,'alert_route_change','alert_route',changeId,'1',[],now),
 ])}catch(error){if(String(error).includes('uptime_audit.id'))throw Object.assign(Error('Route or monitor changed; preview again'),{status:409});throw error}
 return {saved:true,changeId,revision:current.revision,...await readAlertRoute(env,monitorId)};
}

async function teamCandidates(env:Bindings,monitorId?:string){
 return (await env.DB.prepare(`SELECT m.id monitor_id,tm.team_id,tm.operator_id,rc.destination_id,team.enabled team_enabled,(${liveRecipientSql()}) live,(rc.credential_id=d.credential_id) credential_current FROM alert_team_members tm JOIN alert_teams team ON team.id=tm.team_id LEFT JOIN alert_recipient_consents rc ON rc.operator_id=tm.operator_id LEFT JOIN notification_destinations d ON d.id=rc.destination_id JOIN monitors m ${monitorId?'ON m.id=?':''}`).bind(...(monitorId?[monitorId]:[])).all<any>()).results
}
/** A non-sending sample uses the saved route and exactly the admission filter
 * semantics. Real confirmation / transport outcomes remain delivery history. */
export async function sampleAlertRoute(env:Bindings,monitorId:string,raw:any){
 const sample=normalizeRouteSample(raw),ctx=await context(env,monitorId),candidates=await teamCandidates(env,monitorId)
 const override=sample.kind==='slow'&&Array.isArray(ctx.monitor.definition.slow?.destinationIds)?{...effectivePolicy(ctx.policies),destinationIds:ctx.monitor.definition.slow.destinationIds,teamIds:[],contactSettings:ctx.monitor.definition.slow.contactSettings??{},mode:'selected' as const,fallback:{destinationIds:[],deadlineSeconds:120}}:null
 const result=previewRecipients(override?[override]:ctx.policies,ctx.destinations,mailConfigured(env),candidates,sample,ctx.monitor.definition.environment)
 return {...result,sample,excludedMembers:candidates.filter(c=>result.effective.teamIds.includes(c.team_id)&&(!c.destination_id||!c.live||!c.team_enabled||!c.credential_current)).map(c=>({teamId:c.team_id,operatorId:c.operator_id,reason:!c.destination_id?'no_consent':!c.team_enabled?'team_disabled':'consent_inactive_or_out_of_scope'})),gaps}
}
