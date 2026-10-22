import {normalizeContactSettings,defaultContactSettings} from './contact-schedule.ts'
import {get,type Bindings} from './control.server.ts'
import {destinations} from './notification-destinations.server.ts'
import {mailConfigured} from './mail.server.ts'
import {auditStatement,mutationGuard,type AuditActor} from './audit.server.ts'
import {digest} from './archive-schema.ts'
import {routeScopes,scopeValue,defaultPolicy,routePolicy,effectivePolicy,normalizeFallback,type RouteScope,type RoutePolicy} from './alert-routes-policy.ts'
const gaps=['These routes apply to confirmed incident triggers and recoveries. Expiry and renewal notices still use installation-wide destinations.','Team, environment, severity, region, incident origin and business-hour routing filters are not available. Saved contact quiet hours hold that contact’s alerts until its daily window ends.','Contact delays and reminders start at confirmation. Fallback contacts are named only in a selected policy and receive incident triggers, not reminders, slow notices or tests.','Route settings and detailed change history stay in this installation; archives retain opaque audit entries.'];
// No secrets: only policy, monitor revisions and destination/custody identity.
// Fencing this snapshot makes the reviewed affected set and readiness atomic
// with a policy edit, even when another operator changes a broader scope.
const snapshotSql=`SELECT json_array(
 (SELECT json_group_array(json_array(scope_kind,scope_value,mode,destination_ids,contact_settings,fallback,revision,updated_at)) FROM (SELECT * FROM alert_routes ORDER BY scope_kind,scope_value)),
 (SELECT json_group_array(json_array(id,revision,definition)) FROM (SELECT id,revision,definition FROM monitors ORDER BY id)),
 (SELECT json_group_array(json_array(id,name,kind,enabled,credential_id,deleted_at,cid,retired_at,unavailable_at,has_ciphertext,has_endpoint)) FROM
  (SELECT d.*,c.id cid,c.retired_at,c.unavailable_at,c.ciphertext IS NOT NULL has_ciphertext,c.endpoint IS NOT NULL has_endpoint FROM notification_destinations d LEFT JOIN notification_credentials c ON c.id=d.credential_id ORDER BY d.id))
 ) snapshot`;
async function snapshot(env:Bindings){return (await env.DB.prepare(snapshotSql).first<{snapshot:string}>())!.snapshot}
type Input={scope:RouteScope;mode:RoutePolicy['mode'];destinationIds:string[];contactSettings?:Record<string,any>;fallback:RoutePolicy['fallback'];expectedRevision:number};
function validate(input:any):Input{
 if(!input||Object.keys(input).some(k=>!['scope','mode','destinationIds','contactSettings','fallback','expectedRevision'].includes(k))||!routeScopes.includes(input.scope))throw Error('Choose monitor, service, group or installation scope');
 if(!(input.scope==='installation'?['all','selected']:['inherit','selected']).includes(input.mode))throw Error('Choose an allowed inheritance or selected-destinations policy');
 if(!Array.isArray(input.destinationIds)||input.destinationIds.length>100||input.destinationIds.some((id:any)=>typeof id!=='string'||!id||id.length>512||/[\x00-\x1f\x7f]/.test(id))||new Set(input.destinationIds).size!==input.destinationIds.length)throw Error('Use at most 100 distinct destination IDs');
 if(input.mode!=='selected'&&input.destinationIds.length)throw Error('Only a selected-destinations policy takes destination IDs');
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw Error('A current route revision is required');
 const fallback=normalizeFallback(input.fallback,input.mode,input.destinationIds);
 return {...input,destinationIds:[...input.destinationIds].sort(),fallback,contactSettings:normalizeContactSettings(input.contactSettings??{},[...input.destinationIds,...fallback.destinationIds])};
}
async function context(env:Bindings,monitorId:string){
 const monitor=await get(env,monitorId);if(!monitor)throw Object.assign(Error('Monitor not found'),{status:404});
 const [rows,contacts]=await Promise.all([env.DB.prepare('SELECT * FROM alert_routes ORDER BY scope_kind,scope_value').all<any>(),destinations(env)]);
 const policies=routeScopes.map(scope=>{const value=scopeValue(scope,monitor);return rows.results.find(r=>r.scope_kind===scope&&r.scope_value===value)});
 return {monitor,rows:rows.results,policies:policies.map((row,i)=>row?routePolicy(row):defaultPolicy(routeScopes[i],scopeValue(routeScopes[i],monitor))),destinations:contacts};
}
function previewRecipients(policies:RoutePolicy[],contacts:any[],configured:boolean){
 const effective=effectivePolicy(policies),ids=effective.destinationIds;
 const recipients=contacts.map(d=>{
  const selected=effective.mode==='all'||ids.includes(d.id);
  const reason=!selected?(effective.fallback.destinationIds.includes(d.id)?'fallback_only':'not_selected'):!d.enabled?'disabled':!d.credentialsAvailable?'credentials_missing':d.kind==='email'&&!configured?'mail_not_configured':'ready';
  return {...d,selected,eligible:reason==='ready',reason,contactSettings:effective.contactSettings[d.id]??defaultContactSettings};
 });
 for(const id of ids)if(!contacts.some(d=>d.id===id))recipients.push({id,name:'Missing or erased destination',kind:null,enabled:false,credentialsAvailable:false,selected:true,eligible:false,reason:'destination_missing'});
 // Fallback contacts keep their own ROUTING-002 schedule and are messaged only after an earlier contact fails.
 const fallback=effective.fallback.destinationIds.map((id,index)=>{
  const d=contacts.find(c=>c.id===id);
  const reason=!d?'destination_missing':!d.enabled?'disabled':!d.credentialsAvailable?'credentials_missing':d.kind==='email'&&!configured?'mail_not_configured':'ready';
  return {id,name:d?.name??'Missing or erased destination',kind:d?.kind??null,order:index+1,eligible:reason==='ready',reason,contactSettings:effective.contactSettings[id]??defaultContactSettings};
 });
 return {effective,recipients,fallback,fallbackDeadlineSeconds:effective.fallback.deadlineSeconds,readyCount:recipients.filter(d=>d.eligible).length};
}
export async function readAlertRoute(env:Bindings,monitorId:string){
 const ctx=await context(env,monitorId);
 const changes=await env.DB.prepare(`SELECT * FROM alert_route_changes WHERE (scope_kind='monitor' AND scope_value=?) OR (scope_kind='service' AND scope_value=?) OR (scope_kind='group' AND scope_value=?) OR scope_kind='installation' ORDER BY changed_at DESC,rowid DESC LIMIT 30`).bind(monitorId,scopeValue('service',ctx.monitor),scopeValue('group',ctx.monitor)).all<any>();
 return {monitorId,policies:ctx.policies,...previewRecipients(ctx.policies,ctx.destinations,mailConfigured(env)),gaps,changes:changes.results.map(r=>({id:r.id,scope:r.scope_kind,value:r.scope_value,previous:JSON.parse(r.previous_policy),current:JSON.parse(r.current_policy),changedAt:r.changed_at,actorRef:r.actor_ref}))};
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
 const current={...previous,mode:input.mode,destinationIds:input.destinationIds,contactSettings:input.contactSettings!,fallback:input.fallback,revision:previous.revision+1};
 const policies=ctx.policies.map(p=>p.scope===input.scope?current:p),preview=previewRecipients(policies,ctx.destinations,mailConfigured(env));
 const monitors=await env.DB.prepare('SELECT id,revision,definition FROM monitors ORDER BY id').all<any>();
 const affected=monitors.results.filter(m=>input.scope==='installation'||(input.scope==='monitor'?m.id===monitorId:JSON.parse(m.definition)[input.scope]===value)).map(m=>{
  const monitor={id:m.id,definition:JSON.parse(m.definition)};
  const inherited=routeScopes.map(scope=>{
   const v=scopeValue(scope,monitor);if(scope===input.scope&&v===value)return current;
   const row=ctx.rows.find(r=>r.scope_kind===scope&&r.scope_value===v);return row?routePolicy(row):defaultPolicy(scope,v);
  });
  const p=previewRecipients(inherited,ctx.destinations,mailConfigured(env));
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
  env.DB.prepare(`INSERT INTO alert_routes(scope_kind,scope_value,mode,destination_ids,contact_settings,fallback,revision,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(scope_kind,scope_value) DO UPDATE SET mode=excluded.mode,destination_ids=excluded.destination_ids,contact_settings=excluded.contact_settings,fallback=excluded.fallback,revision=excluded.revision,updated_at=excluded.updated_at`).bind(input.scope,value,input.mode,JSON.stringify(current.destinationIds),JSON.stringify(current.contactSettings),JSON.stringify(current.fallback),current.revision,now),
  env.DB.prepare('INSERT INTO alert_route_changes VALUES(?,?,?,?,?,?,?)').bind(changeId,input.scope,value,JSON.stringify(previous),JSON.stringify({...current,updatedAt:now}),now,actor.ref),
  auditStatement(env,actor,'alert_route_change','alert_route',changeId,'1',[],now),
 ])}catch(error){if(String(error).includes('uptime_audit.id'))throw Object.assign(Error('Route or monitor changed; preview again'),{status:409});throw error}
 return {saved:true,changeId,revision:current.revision,...await readAlertRoute(env,monitorId)};
}
