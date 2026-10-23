import {normalizeRouteFilters,normalizeRouteQuiet,routeIds,type RouteFilters} from './alert-route-filters.ts'
import type {ContactQuietHours} from './contact-quiet.ts'
import {normalizeContactSettings,type ContactSettings} from './contact-schedule.ts'
export type RouteScope='monitor'|'service'|'group'|'installation';
export type RouteMode='inherit'|'selected'|'all';
export type FallbackChain={destinationIds:string[];deadlineSeconds:number};
export type RoutePolicy={scope:RouteScope;value:string;mode:RouteMode;destinationIds:string[];teamIds:string[];filters:RouteFilters;quietHours:ContactQuietHours|null;contactSettings:Record<string,ContactSettings>;fallback:FallbackChain;revision:number;updatedAt:number|null};
export const defaultFallback:FallbackChain={destinationIds:[],deadlineSeconds:120};
export const routeScopes:RouteScope[]=['monitor','service','group','installation'];
export function scopeValue(scope:RouteScope,monitor:any):string{return scope==='installation'?'':scope==='monitor'?monitor.id:monitor.definition[scope]??''}
export function defaultPolicy(scope:RouteScope,value:string):RoutePolicy{return {scope,value,mode:scope==='installation'?'all':'inherit',destinationIds:[],teamIds:[],filters:{},quietHours:null,contactSettings:{},fallback:defaultFallback,revision:0,updatedAt:null}}
/** DELIVERY-002: an ordered chain of named contacts after the selected ones, and how long an uncertain send waits. */
export function normalizeFallback(raw:any,mode:RouteMode,selected:string[]):FallbackChain{
 if(raw===undefined)return defaultFallback;
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['destinationIds','deadlineSeconds'].includes(k)))throw Error('A fallback chain names destinationIds and deadlineSeconds');
 const ids=raw.destinationIds??[],deadlineSeconds=raw.deadlineSeconds??defaultFallback.deadlineSeconds;
 if(!Array.isArray(ids)||ids.length>3||ids.some((id:any)=>typeof id!=='string'||!id||id.length>512||/[\x00-\x1f\x7f]/.test(id))||new Set(ids).size!==ids.length)throw Error('Use at most 3 distinct fallback destinations');
 if(ids.length&&mode!=='selected')throw Error('Only a selected-destinations policy takes fallback contacts');
 if(ids.some((id:string)=>selected.includes(id)))throw Error('A fallback contact cannot also be a selected contact');
 if(!Number.isInteger(deadlineSeconds)||deadlineSeconds<5||deadlineSeconds>3600)throw Error('The uncertain deadline must be 5 to 3600 seconds');
 return {destinationIds:[...ids],deadlineSeconds};
}
export function routePolicy(row:any):RoutePolicy{const ids=JSON.parse(row.destination_ids),fallback=normalizeFallback(JSON.parse(row.fallback??'{}'),row.mode,ids);return {scope:row.scope_kind,value:row.scope_value,mode:row.mode,destinationIds:ids,teamIds:routeIds(JSON.parse(row.team_ids??'[]'),'team IDs'),filters:normalizeRouteFilters(JSON.parse(row.filters??'{}')),quietHours:normalizeRouteQuiet(JSON.parse(row.quiet_hours??'null')),contactSettings:normalizeContactSettings(JSON.parse(row.contact_settings??'{}'),[...ids,...fallback.destinationIds]),fallback,revision:row.revision,updatedAt:row.updated_at}}
export function effectivePolicy(policies:RoutePolicy[]){return policies.find(p=>p.mode!=='inherit')!}
// Evaluated in the same D1 transaction as the confirmed event, against current
// monitor labels and policies. Inherit skips that scope explicitly.
export const selectedRouteSql=`SELECT r.mode,r.destination_ids,r.contact_settings,r.fallback,r.team_ids,r.filters,r.quiet_hours FROM alert_routes r JOIN monitors m ON m.id=?
 WHERE r.mode<>'inherit' AND ((r.scope_kind='monitor' AND r.scope_value=m.id)
 OR (r.scope_kind='service' AND r.scope_value=json_extract(m.definition,'$.service'))
 OR (r.scope_kind='group' AND r.scope_value=json_extract(m.definition,'$.group'))
 OR (r.scope_kind='installation' AND r.scope_value=''))
 ORDER BY CASE r.scope_kind WHEN 'monitor' THEN 0 WHEN 'service' THEN 1 WHEN 'group' THEN 2 ELSE 3 END LIMIT 1`;
