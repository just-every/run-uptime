import type {Bindings} from '../control.server.ts'
import {auditStatement,mutationGuard,type AuditActor} from '../audit.server.ts'
import {digest} from '../archive-schema.ts'
import {namedAlertRoute,prepareNamedAlertRouteAssignment,prepareAlertRouteAssignment,alertRouteAssignmentStatements,readAlertRoute} from '../alert-routes.server.ts'
import {fields,fail} from './input.ts'
const stale=()=>Object.assign(Error('Alert routes or monitors changed; review the batch again'),{status:409})
const warning='This batch creates, confirms and messages no recipient. No confirmed recipient is established by assignment; existing consent and recipient proof are unchanged.'
const policy=(p:any)=>({mode:p.mode,destinationIds:p.destinationIds,contactSettings:p.contactSettings,fallback:p.fallback,teamIds:p.teamIds,filters:p.filters,quietHours:p.quietHours})
const owner=(actor:AuditActor)=>{if(actor.kind!=='operator')throw Object.assign(Error('Owner required'),{status:403})}
async function plan(env:Bindings,raw:any){
 fields(raw,['routeId','monitorIds'],'alert route batch');
 if(typeof raw.routeId!=='string'||!raw.routeId||raw.routeId.length>512||!Array.isArray(raw.monitorIds)||!raw.monitorIds.length||raw.monitorIds.length>100||raw.monitorIds.some((id:any)=>typeof id!=='string'||!id||id.length>512||/[\x00-\x1f\x7f]/.test(id))||new Set(raw.monitorIds).size!==raw.monitorIds.length)fail('Choose one existing named route and up to 100 distinct monitor IDs.');
 const route=await namedAlertRoute(env,raw.routeId),entries:any[]=[];
 for(const monitorId of [...raw.monitorIds].sort()){
  try{
   const prepared=await prepareNamedAlertRouteAssignment(env,monitorId,route),unchanged=JSON.stringify(policy(prepared.previous))===JSON.stringify(policy(prepared.current));
   entries.push({monitorId,name:prepared.monitor.definition.name,action:unchanged?'unchanged':'change',before:prepared.previous,after:prepared.current,readyCount:prepared.readyCount,prepared});
  }catch(error){entries.push({monitorId,action:'refused',reason:error instanceof Error?error.message:'The route cannot be assigned'})}
 }
 const view={route:{id:route.id,name:route.name},counts:{change:entries.filter(e=>e.action==='change').length,unchanged:entries.filter(e=>e.action==='unchanged').length,refused:entries.filter(e=>e.action==='refused').length},entries:entries.map(({prepared,...entry})=>entry),warning};
 return {view,digest:await digest(JSON.stringify({route,view})),entries,route};
}
export async function previewCatalogRoutes(env:Bindings,raw:any){const prepared=await plan(env,raw);return {...prepared.view,digest:prepared.digest}}
export async function applyCatalogRoutes(env:Bindings,raw:any,approved:unknown,actor:AuditActor){
 owner(actor);const prepared=await plan(env,raw);
 if(typeof approved!=='string'||approved!==prepared.digest)throw stale();
 if(prepared.view.counts.refused)fail('A refused monitor makes the whole route batch unavailable. Review a valid selection.');
 const entries=prepared.entries.filter(e=>e.action==='change');if(!entries.length)fail('This batch has no route changes.');
 const batchId=crypto.randomUUID(),now=Date.now(),parts=entries.map(e=>alertRouteAssignmentStatements(env,e.prepared,actor));
 const guards=parts.flatMap(p=>p.guards),writes=parts.flatMap(p=>p.writes);
 guards.push(mutationGuard(env,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')",[actor.ref]),mutationGuard(env,'EXISTS(SELECT 1 FROM alert_named_routes WHERE id=? AND name=? AND policy=?)',[prepared.route.id,prepared.route.name,JSON.stringify(prepared.route.policy)]));
 writes.push(env.DB.prepare('INSERT INTO catalog_route_batches(id,route_id,created_at,actor_kind,actor_ref,counts) VALUES(?,?,?,?,?,?)').bind(batchId,prepared.route.id,now,actor.kind,actor.ref,JSON.stringify(prepared.view.counts)));
 for(const entry of entries)writes.push(env.DB.prepare('INSERT INTO catalog_route_batch_entries(batch_id,monitor_id,monitor_revision,previous_policy,applied_policy,applied_revision) VALUES(?,?,?,?,?,?)').bind(batchId,entry.monitorId,entry.prepared.monitor.revision,JSON.stringify(entry.before),JSON.stringify(policy(entry.after)),entry.after.revision));
 try{await env.DB.batch([...guards,...writes,auditStatement(env,actor,'catalog_route_apply','alert_route_batch',batchId,'1',[],now)])}catch(error){if(String(error).includes('uptime_audit.id'))throw stale();throw error}
 return {batchId,changed:entries.map(e=>e.monitorId),preview:{...prepared.view,digest:prepared.digest}};
}
export async function undoCatalogRoutes(env:Bindings,raw:any,actor:AuditActor){
 owner(actor);fields(raw,['batchId'],'route undo');if(typeof raw.batchId!=='string'||!raw.batchId||raw.batchId.length>512)fail('Choose an alert route batch.');
 const batch=await env.DB.prepare('SELECT * FROM catalog_route_batches WHERE id=?').bind(raw.batchId).first<any>();if(!batch)throw Object.assign(Error('Route batch not found'),{status:404});if(batch.undone_at!==null)throw stale();
 const entries=(await env.DB.prepare('SELECT * FROM catalog_route_batch_entries WHERE batch_id=? ORDER BY monitor_id').bind(raw.batchId).all<any>()).results;if(entries.length!==JSON.parse(batch.counts).change)throw stale();
 const parts=[];
 for(const entry of entries){
  const read=await readAlertRoute(env,entry.monitor_id,{readOnly:true}),current=read.policies.find(p=>p.scope==='monitor')!;
  if(current.revision!==entry.applied_revision||JSON.stringify(policy(current))!==entry.applied_policy)throw stale();
  const previous=JSON.parse(entry.previous_policy),prepared=await prepareAlertRouteAssignment(env,entry.monitor_id,{scope:'monitor',expectedRevision:current.revision,...policy(previous)});
  if(prepared.monitor.revision!==entry.monitor_revision)throw stale();
  parts.push(alertRouteAssignmentStatements(env,prepared,actor,previous.revision===0));
 }
 const now=Date.now(),guards=parts.flatMap(p=>p.guards),writes=parts.flatMap(p=>p.writes);
 guards.push(mutationGuard(env,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')",[actor.ref]),mutationGuard(env,'EXISTS(SELECT 1 FROM catalog_route_batches WHERE id=? AND undone_at IS NULL)',[raw.batchId]),mutationGuard(env,'(SELECT COUNT(*) FROM catalog_route_batch_entries WHERE batch_id=?)=?',[raw.batchId,entries.length]));
 writes.push(env.DB.prepare('UPDATE catalog_route_batches SET undone_at=? WHERE id=?').bind(now,raw.batchId),auditStatement(env,actor,'catalog_route_undo','alert_route_batch'));
 try{await env.DB.batch([...guards,...writes])}catch(error){if(String(error).includes('uptime_audit.id'))throw stale();throw error}
 return {batchId:raw.batchId,undoneAt:now,restored:entries.map(e=>e.monitor_id)};
}
