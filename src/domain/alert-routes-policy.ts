import {normalizeContactSettings,type ContactSettings} from './contact-schedule.ts'
export type RouteScope='monitor'|'service'|'group'|'installation';
export type RouteMode='inherit'|'selected'|'all';
export type RoutePolicy={scope:RouteScope;value:string;mode:RouteMode;destinationIds:string[];contactSettings:Record<string,ContactSettings>;revision:number;updatedAt:number|null};
export const routeScopes:RouteScope[]=['monitor','service','group','installation'];
export function scopeValue(scope:RouteScope,monitor:any):string{return scope==='installation'?'':scope==='monitor'?monitor.id:monitor.definition[scope]??''}
export function defaultPolicy(scope:RouteScope,value:string):RoutePolicy{return {scope,value,mode:scope==='installation'?'all':'inherit',destinationIds:[],contactSettings:{},revision:0,updatedAt:null}}
export function routePolicy(row:any):RoutePolicy{return {scope:row.scope_kind,value:row.scope_value,mode:row.mode,destinationIds:JSON.parse(row.destination_ids),contactSettings:normalizeContactSettings(JSON.parse(row.contact_settings??'{}'),JSON.parse(row.destination_ids)),revision:row.revision,updatedAt:row.updated_at}}
export function effectivePolicy(policies:RoutePolicy[]){return policies.find(p=>p.mode!=='inherit')!}
// Evaluated in the same D1 transaction as the confirmed event, against current
// monitor labels and policies. Inherit skips that scope explicitly.
export const selectedRouteSql=`SELECT r.mode,r.destination_ids,r.contact_settings FROM alert_routes r JOIN monitors m ON m.id=?
 WHERE r.mode<>'inherit' AND ((r.scope_kind='monitor' AND r.scope_value=m.id)
 OR (r.scope_kind='service' AND r.scope_value=json_extract(m.definition,'$.service'))
 OR (r.scope_kind='group' AND r.scope_value=json_extract(m.definition,'$.group'))
 OR (r.scope_kind='installation' AND r.scope_value=''))
 ORDER BY CASE r.scope_kind WHEN 'monitor' THEN 0 WHEN 'service' THEN 1 WHEN 'group' THEN 2 ELSE 3 END LIMIT 1`;
