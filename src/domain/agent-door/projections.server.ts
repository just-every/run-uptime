import type {Principal} from '../../base/modules/agent-door/index.ts'
import {get,history,revisions,type Bindings} from '../control.server.ts'
import {monitoringMonitor} from '../read-api/monitors.server.ts'
import {incidentDetail} from '../incident-work/read.server.ts'
import {readSnapshots} from '../failure-snapshots.server.ts'
import {monitorReport,monitorLatency} from '../reports/index.server.ts'
import {readAlertRoute} from '../alert-routes.server.ts'
import {destinations} from '../notification-destinations.server.ts'
import {agentAccess,evidenceAccess,denied,visibleIds} from './authority.server.ts'
const pick=(v:any,keys:string[])=>Object.fromEntries(keys.filter(k=>v?.[k]!==undefined).map(k=>[k,v[k]]))
export function definition(d:any){return pick(d,['name','type','enabled','intervalMs','timeoutMs','retries','probes','service','group','tags','assertions','maintenanceUntil','maintenanceWindows','slow'])}
export async function monitor(env:Bindings,ctx:Principal,id:string){await agentAccess(env,ctx,'read',[id]);const r=await get(env,id);if(!r)throw denied();return {...await monitoringMonitor(env,id),definition:definition(r.definition)}}
export async function monitorHistory(env:Bindings,ctx:Principal,id:string){
 await agentAccess(env,ctx,'read',[id])
 return {items:(await history(env,id)).map((row:any)=>({...pick(row,['id','monitor_id','revision','due_at','status','manual','missed_count']),definition:definition(row.definition),observations:row.observations.map((o:any)=>pick(o,['id','probe','attempt','observedAt','startedAt','finishedAt','latencyMs','status','ok','error','category','assertions']))}))}
}
export async function incident(env:Bindings,ctx:Principal,id:string){
 const row=await env.DB.prepare("SELECT monitor_id FROM outbox WHERE id=? AND kind='trigger'").bind(id).first<{monitor_id:string}>();if(!row)throw denied()
 const access=await agentAccess(env,ctx,'read',[row.monitor_id]),result=await incidentDetail(env,id,access)
 // Protected evidence is a separate native grant even for a broad read key.
 result.failureSnapshots=[];result.trigger={...result.trigger};return result
}
export async function projection(env:Bindings,ctx:Principal,area:string,id:string,suffix='') :Promise<any> {
 if(area==='monitors'){
  if(suffix==='history')return monitorHistory(env,ctx,id)
  if(suffix==='failure-snapshots'){await evidenceAccess(env,ctx,id);return readSnapshots(env,id)}
  await agentAccess(env,ctx,'read',[id]);const m=await get(env,id);if(!m)throw denied()
  if(suffix==='revisions')return {items:(await revisions(env,id)).map(r=>({...r,definition:definition(r.definition)}))}
  if(suffix==='uptime')return monitorReport(env,id,new URLSearchParams())
  if(suffix==='response-times')return monitorLatency(env,id,new URLSearchParams())
  return monitor(env,ctx,id)
 }
 if(area==='incidents')return incident(env,ctx,id)
 if(area==='routes'){await agentAccess(env,ctx,'settings_write',[id],undefined,true);return readAlertRoute(env,id,{readOnly:true})}
 if(area==='destinations'){await agentAccess(env,ctx,'secret_write',[],undefined,true);const d=(await destinations(env,{readOnly:true})).find(d=>d.id===id);if(!d)throw denied();return pick(d,['id','name','kind','enabled','created_at','credentialsAvailable','credentialError'])}
 throw denied()
}
export async function witness(env:Bindings,ctx:Principal){
 const ids=await visibleIds(env,ctx)
 const tables=['monitors','revisions','incident_work','incident_comments','incident_timeline','alert_routes','notification_destinations','effect_grants','failure_evidence_grants']
 const result:Record<string,unknown>={}
 for(const table of tables){
  // A bounded digest witnesses actual native bytes, without exposing credentials.
  const rows=(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all<any>()).results
  const visible=rows.filter(row=>table==='monitors'?ids.includes(row.id):'monitor_id' in row?ids.includes(row.monitor_id):ctx.person.role==='owner')
  const bytes=new TextEncoder().encode(JSON.stringify(visible));result[table]={count:visible.length,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')}
 }
 return result
}
