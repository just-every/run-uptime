import {normalizeContactQuietHours,contactQuietUntil,type ContactQuietHours} from './contact-quiet.ts'
export type RouteFilters={environments?:string[];severities?:string[];regions?:string[];origins?:string[]}
export type RouteSample={kind:'trigger'|'slow'|'dependency';regions:string[];at:number}
export function routeIds(raw:any,label:string,limit=100):string[]{
 if(!Array.isArray(raw)||raw.length>limit||raw.some((id:any)=>typeof id!=='string'||!id.trim()||id!==id.trim()||id.length>100||/[\x00-\x1f\x7f]/.test(id))||new Set(raw).size!==raw.length)throw Error(`Use distinct ${label}, at most ${limit}`)
 return [...raw].sort()
}
export function normalizeRouteFilters(raw:any={}):RouteFilters{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['environments','severities','regions','origins'].includes(k)))throw Error('Choose environment, severity, region or origin filters')
 const result:RouteFilters={}
 for(const key of Object.keys(raw) as (keyof RouteFilters)[]){const values=routeIds(raw[key],key,30);if(key==='severities'&&values.some(v=>!['critical','warning','info'].includes(v))||key==='origins'&&values.some(v=>!['monitor','slow','dependency'].includes(v)))throw Error('Unknown alert severity or origin');result[key]=values}
 return result
}
export function normalizeRouteQuiet(raw:any):ContactQuietHours|null{return raw==null?null:normalizeContactQuietHours(raw)}
export function normalizeRouteSample(raw:any):RouteSample{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['kind','regions','at'].includes(k))||!['trigger','slow','dependency'].includes(raw.kind)||!Number.isSafeInteger(raw.at)||raw.at<0||raw.at>8640000000000000)throw Error('A sample needs trigger, slow or dependency kind, regions and a timestamp')
 return {kind:raw.kind,regions:routeIds(raw.regions??[],'sample region identifiers',3),at:raw.at}
}
export function filterReasons(filters:RouteFilters,environment:string|undefined,sample:RouteSample){
 const severity=sample.kind==='trigger'?'critical':sample.kind==='slow'?'warning':'info',origin=sample.kind==='trigger'?'monitor':sample.kind
 return Object.entries({environments:environment??'',severities:severity,origins:origin}).filter(([k,v])=>filters[k as keyof RouteFilters]&&!filters[k as keyof RouteFilters]!.includes(v)).map(([k])=>`filter_${k}`).concat(filters.regions&&!filters.regions.some(r=>sample.regions.includes(r))?['filter_regions']:[])
}
export function quietPreview(route:ContactQuietHours|null,contact:ContactQuietHours|undefined,at:number){const holds=[route,contact].filter(Boolean).map(p=>contactQuietUntil(p!,at)).filter((v):v is number=>v!==null);return holds.length?Math.max(...holds):null}
/** Fixed SQL identifiers only. Values come from bound event JSON / live monitor. */
export function routeFilterSql(filters:string,event:string,definition:string,failedProbesOnly=true){
 const member=(key:string,value:string)=>`(json_type(${filters},'$.${key}') IS NULL OR ${value} IN(SELECT value FROM json_each(json_extract(${filters},'$.${key}'))))`
 return `${member('environments',`COALESCE(json_extract(${definition},'$.environment'),'')`)} AND ${member('severities',`CASE json_extract(${event},'$.kind') WHEN 'trigger' THEN 'critical' WHEN 'slow' THEN 'warning' WHEN 'expiry' THEN 'warning' ELSE 'info' END`)} AND ${member('origins',`CASE json_extract(${event},'$.kind') WHEN 'trigger' THEN 'monitor' WHEN 'expiry' THEN 'monitor' WHEN 'renewal' THEN 'monitor' ELSE json_extract(${event},'$.kind') END`)} AND (json_type(${filters},'$.regions') IS NULL OR EXISTS(SELECT 1 FROM json_each(json_extract(${filters},'$.regions')) f JOIN json_each(json_extract(${event},'$.probes')) p ON f.value=json_extract(p.value,'$.name') ${failedProbesOnly?"WHERE json_extract(p.value,'$.outcome')<>'pass'":''}))`
}
