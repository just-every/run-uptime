// BASE-INPUT-001: the schema of every /api route's path parameters, query and body, checked once the body is read and the
// caller's authority is known, before any service or store read for the request runs. A request that matches no declared route
// is not found; an invalid one is a 400 in the standard {error} format whose message names the part that failed and never
// repeats the submitted value.
// Record identities keep the archive identity rule (restored records keep their source ids), so an id that rule accepts is
// a well-formed id here; whether it names a record stays the service's answer.
import {SOURCES} from './definitions/importers/index.ts'
type Body='none'|'empty'|'object'|'text'
interface Route{method:string;path:string;params?:Record<string,(value:string)=>boolean>;query?:Record<string,(value:string)=>boolean>;body:Body}
const identity=(value:string)=>value.length>0&&value.length<=512&&!/[\x00-\x1f\x7f]/.test(value)
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const id={id:identity},source=(value:string)=>SOURCES.includes(value)
const reportQuery={...Object.fromEntries(['period','from','to','timeZone','zone','sla','slaTarget','bucket','location','rootCause'].map(name=>[name,(value:string)=>identity(value)&&value.length<=150])),format:(value:string)=>['csv','json','pdf'].includes(value)}
const incidentQuery=Object.fromEntries(['monitor','tag','from','to','state','rootCause','cursor','limit'].map(name=>[name,identity]))
export const apiRoutes:readonly Route[]=[
 {method:'GET',path:'/api/access/self',body:'none'},
 {method:'GET',path:'/api/access/members',body:'none'},
 {method:'POST',path:'/api/access/invitations',body:'object'},
 {method:'POST',path:'/api/access/members/:id',params:id,body:'object'},
 {method:'DELETE',path:'/api/access/members/:id',params:id,body:'none'},
 {method:'GET',path:'/api/business-import-settings',body:'none'},
 {method:'POST',path:'/api/business-import-settings',body:'object'},
 {method:'GET',path:'/api/v1/monitors',query:{limit:identity,cursor:identity,tag:identity},body:'none'},
 {method:'GET',path:'/api/v1/monitors/:id',params:id,body:'none'},
 {method:'GET',path:'/api/v1/uptime',query:{...Object.fromEntries(['period','from','to','timeZone','zone','sla','slaTarget','rootCause','tag'].map(name=>[name,identity])),monitor:value=>value.length>0&&value.length<=256500&&!/[\x00-\x1f\x7f]/.test(value),format:value=>['json','csv'].includes(value)},body:'none'},
 {method:'GET',path:'/api/evidence/monitors/:id',params:id,query:{before:identity},body:'none'},
 {method:'GET',path:'/api/monitors/:id/cleanup-debt',params:id,body:'none'},
 {method:'POST',path:'/api/monitors/:id/cleanup-debt/:debtId/resolve',params:{...id,debtId:identity},body:'object'},
 {method:'GET',path:'/api/monitors/:id/effect-grants',params:id,body:'none'},
 {method:'GET',path:'/api/monitors/:id/pagespeed',params:id,body:'none'},
 {method:'GET',path:'/api/rum/sites',body:'none'},
 {method:'POST',path:'/api/rum/sites',body:'object'},
 {method:'PATCH',path:'/api/rum/sites/:id',params:{id:uuid},body:'object'},
 {method:'GET',path:'/api/rum/sites/:id/report',params:{id:uuid},query:{hours:(value:string)=>/^[1-9][0-9]{0,2}$/.test(value)},body:'none'},
 ...['effect-grants','effect-grants/revoke'].map(suffix=>({method:'POST',path:`/api/monitors/:id/${suffix}`,params:id,body:'object' as const})),
 {method:'GET',path:'/api/monitors/:id/evidence-access',params:id,body:'none'},
 {method:'POST',path:'/api/monitors/:id/evidence-access',params:id,body:'object'},
 {method:'GET',path:'/api/incidents/:id/failure-report',params:id,body:'none'},
 {method:'GET',path:'/api/incidents/:id/failure-snapshots',params:id,body:'none'},
 {method:'GET',path:'/api/monitors/:id/failure-snapshots',params:id,query:{before:identity},body:'none'},
 {method:'PATCH',path:'/api/monitors/:id/failure-snapshots',params:id,body:'object'},
 {method:'DELETE',path:'/api/monitors/:id/failure-snapshots',params:id,body:'none'},
 {method:'GET',path:'/api/metrics/keys',body:'none'},
 {method:'POST',path:'/api/metrics/keys',body:'object'},
 {method:'DELETE',path:'/api/metrics/keys/:id',params:id,body:'none'},
 {method:'GET',path:'/api/v1/metrics',query:{...Object.fromEntries(['period','from','to','timeZone','zone','sla','slaTarget'].map(name=>[name,(value:string)=>identity(value)&&value.length<=150])),monitor:(value:string)=>value.length>0&&value.length<=52000&&!/[\x00-\x1f\x7f]/.test(value),format:value=>['prometheus','json'].includes(value)},body:'none'},
 {method:'GET',path:'/api/incident-settings',body:'none'},
 {method:'PATCH',path:'/api/incident-settings',body:'object'},
 {method:'GET',path:'/api/incidents/:id',params:id,body:'none'},
 {method:'GET',path:'/api/v1/incidents',query:{...incidentQuery,format:value=>['csv','json'].includes(value)},body:'none'},
 {method:'GET',path:'/api/v1/incidents/:id',params:id,body:'none'},
 {method:'POST',path:'/api/incidents/:id/comments',params:id,body:'object'},
 {method:'PATCH',path:'/api/incidents/:id/comments/:commentId',params:{...id,commentId:identity},body:'object'},
 {method:'DELETE',path:'/api/incidents/:id/comments/:commentId',params:{...id,commentId:identity},query:{version:value=>/^[1-9][0-9]*$/.test(value)},body:'none'},
 {method:'PATCH',path:'/api/incidents/:id/root-cause',params:id,body:'object'},
 {method:'POST',path:'/api/incidents/:id/actions',params:id,body:'object'},
 {method:'GET',path:'/api/monitors/:id/slow-policy',params:id,body:'none'},
 ...['slow-policy','slow-policy/import-preview','slow-ack'].map(suffix=>({method:'POST',path:`/api/monitors/:id/${suffix}`,params:id,body:'object' as const})),
 {method:'GET',path:'/api/monitors/:id/alert-route',params:id,body:'none'},
 ...['preview','apply','import-preview'].map(action=>({method:'POST',path:`/api/monitors/:id/alert-route/${action}`,params:id,body:'object' as const})),
 ...['catalog/preview','catalog/apply','catalog/add/preview','catalog/add/apply','maintenance/preview','maintenance/apply','maintenance/cancel'].map(path=>({method:'POST',path:'/api/'+path,body:'object' as const})),
 {method:'GET',path:'/api/v1/openapi.json',body:'none'},
 ...['GET','POST'].flatMap(method=>['/api/heartbeats/:id','/api/heartbeats/:id/url/:token'].flatMap(base=>['','/start','/success','/fail','/fail/:exitCode'].map(suffix=>({method,path:base+suffix,params:{...id,...(base.includes(':token')?{token:(value:string)=>/^[0-9a-f-]{72}$/.test(value)}:{}),...(suffix.includes(':exitCode')?{exitCode:(value:string)=>/^(0|[1-9][0-9]{0,2})$/.test(value)&&Number(value)<=255}:{})},body:(method==='GET'?'none':'text') as Body})))),
 {method:'POST',path:'/api/monitors/:id/heartbeat-settings',params:id,body:'object'},
 {method:'GET',path:'/api/monitors/:id/heartbeat-runs',params:id,query:{before:uuid,previewFrom:value=>/^\d{1,13}$/.test(value)&&Number(value)<=8640000000000000},body:'none'},
 {method:'POST',path:'/api/auth/sign-out',body:'empty'},
 {method:'GET',path:'/api/overview',query:{monitor:identity},body:'none'},
 {method:'GET',path:'/api/monitor-editor',query:{monitor:identity},body:'none'},
 {method:'POST',path:'/api/monitors',body:'object'},
 {method:'PATCH',path:'/api/monitors/:id',params:id,body:'object'},
 {method:'POST',path:'/api/monitors/:id/heartbeat-key',params:id,body:'empty'},
 {method:'GET',path:'/api/monitors/:id/history',params:id,body:'none'},
 {method:'GET',path:'/api/monitors/:id/incidents',params:id,body:'none'},
 {method:'GET',path:'/api/monitors/:id/revisions',params:id,body:'none'},
 ...['uptime','report','response-times'].map(suffix=>({method:'GET',path:`/api/v1/monitors/:id/${suffix}`,params:id,query:reportQuery,body:'none' as const})),
 {method:'POST',path:'/api/monitors/:id/run',params:id,body:'empty'},
 {method:'POST',path:'/api/monitors/:id/erase',params:id,body:'object'},
 {method:'GET',path:'/api/runners',body:'none'},
 {method:'POST',path:'/api/runners',body:'object'},
 {method:'PATCH',path:'/api/runners/:id',params:id,body:'object'},
 {method:'DELETE',path:'/api/runners/:id',params:id,body:'none'},
 {method:'POST',path:'/api/runners/:id/check-all',params:id,body:'empty'},
 {method:'GET',path:'/api/external-check',body:'none'},
 {method:'POST',path:'/api/external-check',body:'object'},
 {method:'POST',path:'/api/runner/join',body:'object'},
 {method:'POST',path:'/api/runner/enroll',body:'object'},
 {method:'POST',path:'/api/runner/claim',body:'empty'},
 {method:'POST',path:'/api/runner/results',body:'object'},
 {method:'POST',path:'/api/runner/effect-spend',body:'object'},
 {method:'POST',path:'/api/runner/notifications',body:'object'},
 {method:'POST',path:'/api/discoveries',body:'object'},
 {method:'GET',path:'/api/service-catalog',query:{q:value=>value.length<=100&&!/[\x00-\x1f\x7f]/.test(value)},body:'none'},
 {method:'POST',path:'/api/service-catalog/checks',body:'object'},
 {method:'POST',path:'/api/service-follows',body:'object'},
 {method:'POST',path:'/api/followed-services/:id/review',params:id,body:'object'},
 {method:'POST',path:'/api/followed-services/:id/links',params:id,body:'object'},
 {method:'POST',path:'/api/dependency-notices/:id/acknowledge',params:id,body:'empty'},
 {method:'GET',path:'/api/discovery-sources',body:'none'},
 {method:'POST',path:'/api/discovery-sources',body:'object'},
 {method:'GET',path:'/api/discovery-sources/:id',params:{id:uuid},body:'none'},
 {method:'DELETE',path:'/api/discovery-sources/:id',params:{id:uuid},body:'none'},
 {method:'POST',path:'/api/discovery-sources/:id/authorize',params:{id:uuid},body:'empty'},
 {method:'POST',path:'/api/discovery-sources/:id/runs',params:{id:uuid},body:'empty'},
 {method:'POST',path:'/api/discovery-sources/:id/decisions',params:{id:uuid},body:'object'},
 {method:'GET',path:'/api/discoveries/:id',params:{id:uuid},body:'none'},
 {method:'POST',path:'/api/runner/discoveries/claim',body:'empty'},
 {method:'POST',path:'/api/runner/discoveries/:id/result',params:{id:uuid},body:'object'},
 {method:'GET',path:'/api/archive',body:'none'},
 {method:'GET',path:'/api/archive/restore-status',body:'none'},
 {method:'POST',path:'/api/restore',body:'object'},
 // A definitions file is JSON, NDJSON or CSV text; its importer reads it, refusing anything it cannot read.
 {method:'POST',path:'/api/definitions/recognise',query:{source},body:'text'},
 {method:'GET',path:'/api/definitions/plans/:id',params:id,body:'none'},
 {method:'GET',path:'/api/definitions/export',body:'none'},
 {method:'GET',path:'/api/definitions/batches',body:'none'},
 {method:'POST',path:'/api/definitions/batches/:id/undo',params:id,body:'empty'},
 {method:'GET',path:'/api/erasure-journal',body:'none'},
 {method:'POST',path:'/api/operators/:id/erase',params:id,body:'empty'},
 {method:'PATCH',path:'/api/notifications/preferences',body:'object'},
 {method:'POST',path:'/api/notifications/webhook-preview',body:'object'},
 {method:'POST',path:'/api/notifications/webhook-import-preview',body:'object'},
 {method:'POST',path:'/api/notifications/destinations/:id/preview',params:id,body:'object'},
 {method:'GET',path:'/api/notifications',body:'none'},
 {method:'GET',path:'/api/notifications/destinations',body:'none'},
 {method:'POST',path:'/api/notifications/destinations',body:'object'},
 {method:'PATCH',path:'/api/notifications/destinations/:id',params:id,body:'object'},
 {method:'DELETE',path:'/api/notifications/destinations/:id',params:id,body:'none'},
 {method:'POST',path:'/api/notifications/destinations/:id/rotate',params:id,body:'empty'},
 {method:'POST',path:'/api/notifications/destinations/:id/test',params:id,body:'empty'},
 {method:'POST',path:'/api/notifications/destinations/:id/drill',params:id,body:'empty'},
]
export class InputError extends Error{status=400}
const refuse=(message:string)=>{throw new InputError(message)}
function match(route:Route,method:string,segments:string[]){
 const pattern=route.path.split('/');
 if(route.method!==method||pattern.length!==segments.length)return null;
 const params:Record<string,string>={};
 for(const [i,part] of pattern.entries()){
  if(!part.startsWith(':')){if(part!==segments[i])return null;continue}
  params[part.slice(1)]=segments[i];
 }
 return params;
}
/** The parsed body of an accepted request (undefined for a route that takes text or nothing), or an InputError; null when no route matches. */
export function checkInput(method:string,url:URL,text:string,hasBody:boolean):{body:unknown}|null{
 const segments=url.pathname.split('/');
 for(const route of apiRoutes){
  const params=match(route,method,segments);if(!params)continue;
  for(const [name,valid] of Object.entries(route.params??{})){
   let value;try{value=decodeURIComponent(params[name])}catch{refuse(`Invalid ${name} in the path`)}
   if(!valid(value!))refuse(`Invalid ${name} in the path`);
  }
  const allowed=route.query??{},seen=new Set<string>();
  for(const [key,value] of url.searchParams){
   if(!Object.hasOwn(allowed,key)||seen.has(key))refuse(`Unexpected query parameter${Object.keys(allowed).length?`; this route takes only ${Object.keys(allowed).join(' and ')}`:''}`);
   seen.add(key);if(!allowed[key](value))refuse(key==='source'?`Invalid source in the query. Use one of: ${SOURCES.join(', ')}`:`Invalid ${key} in the query`);
  }
  if(route.body==='none'){if(hasBody)refuse('This request takes no body');return {body:undefined}}
  if(route.body==='text')return {body:undefined};
  if(route.body==='empty'){if(text!==''&&text.trim()!=='{}')refuse('This action takes no request fields');return {body:{}}}
  let body;try{body=JSON.parse(text)}catch{refuse('Invalid JSON body')}
  if(!body||typeof body!=='object'||Array.isArray(body))refuse('The request body must be a JSON object');
  return {body};
 }
 return null;
}
