import type {Bindings} from '../domain/control.server.ts'
import type {ToolContext,Principal} from '../base/modules/agent-door/index.ts'
import {authority} from './authority.server.ts'
import {uptimeAgentDoor} from './index.server.ts'
export type SavedPrincipal={person:{id:string};agent:Principal['agent'];scopes:string[];clientId?:string;consent?:string;attribution?:ToolContext['actor'];approvers?:{id:string;name:string}[]}
export const delegation=(c:ToolContext):SavedPrincipal=>({person:{id:c.person.id},agent:c.agent,scopes:c.scopes,attribution:c.actor,approvers:c.approvers,...(c.clientId?{clientId:c.clientId}:{}),...(c.consent?{consent:c.consent}:{})})
// A claimed task is handed to its authenticated runner once, just like native
// runner_assignments.delivered_at. A lost response remains missing evidence;
// it cannot become permission to send the same network request twice.
export async function agentRunnerTask(env:Bindings,runnerId:string,monitorId:string|null){
 let pending=await env.DB.prepare('SELECT * FROM uptime_agent_handoffs WHERE runner_id=? AND delivered_at IS NULL AND (? IS NULL OR monitor_id=?) ORDER BY rowid LIMIT 1').bind(runnerId,monitorId,monitorId).first<any>()
 if(!pending){
  const manual=await env.DB.prepare(`SELECT m.id,m.revision,s.due_at next_due,a.principal,s.id slot_id FROM slots s JOIN uptime_agent_manual a ON a.slot_id=s.id JOIN monitors m ON m.id=s.monitor_id WHERE s.status='queued' AND s.manual=1 AND m.revision=s.revision AND (? IS NULL OR m.id=?) AND EXISTS(SELECT 1 FROM json_each(json_extract(s.definition,'$.assignments')) a WHERE json_extract(a.value,'$.runnerId')=?) ORDER BY s.due_at LIMIT 1`).bind(monitorId,monitorId,runnerId).first<any>()
  const row=manual??await env.DB.prepare(`SELECT m.id,m.revision,m.next_due,r.principal FROM monitors m JOIN uptime_agent_revisions r ON r.monitor_id=m.id AND r.revision=m.revision
   WHERE json_extract(m.definition,'$.enabled')=1 AND (m.next_due<=? OR EXISTS(SELECT 1 FROM slots s WHERE s.monitor_id=m.id AND s.manual=1 AND s.status='queued')) AND (? IS NULL OR m.id=?)
   AND EXISTS(SELECT 1 FROM json_each(json_extract(m.definition,'$.assignments')) a WHERE json_extract(a.value,'$.runnerId')=?) ORDER BY m.next_due,m.id LIMIT 1`).bind(Date.now(),monitorId,monitorId,runnerId).first<any>()
  if(!row)return null
  const state=await env.DB.prepare('SELECT envelope,local_revision,local_paused FROM agent_door_state WHERE id=1').first<any>();
  const policy=state?.envelope?JSON.parse(state.envelope).seq:state?.local_revision??0;
  const id=crypto.randomUUID(),key=`runner:${runnerId}:${row.slot_id??row.id}:${row.revision}:${row.next_due}:${policy}:${state?.local_paused??0}`,args={id:row.id,version:row.revision,runner_id:runnerId,idempotency_key:key}
  await env.DB.prepare('INSERT OR IGNORE INTO uptime_agent_handoffs(id,monitor_id,revision,runner_id,operation_key,args,principal) VALUES(?,?,?,?,?,?,?)').bind(id,row.id,row.revision,runnerId,key,JSON.stringify(args),row.principal).run()
  pending=await env.DB.prepare('SELECT * FROM uptime_agent_handoffs WHERE operation_key=? AND delivered_at IS NULL').bind(key).first<any>()
  if(!pending)return null
 }
 const who:SavedPrincipal=JSON.parse(pending.principal),person=await (await import('./authority.server.ts')).nativePerson(env,who.person.id)
 if(!person)return null
 try{
  // Re-read native admission even when the Base outcome is a completed replay.
  // Base separately checks current Pause, policy, scopes and consent at invoke.
  await authority(env,{...who,person},'respond',[pending.monitor_id])
  const outcome=await uptimeAgentDoor(env).invoke('uptime.checks.dispatch',JSON.parse(pending.args),who)
  if(outcome.outcome==='pending')return null
  const mark=await env.DB.prepare('UPDATE uptime_agent_handoffs SET delivered_at=? WHERE id=? AND delivered_at IS NULL RETURNING id').bind(Date.now(),pending.id).all()
  if(!mark.results.length||outcome.outcome!=='done')return null
  return (outcome.result as any)?.task??null
 }catch{return null}
}
export async function notificationAdmission(env:Bindings,id:string){
 const source=await env.DB.prepare('SELECT principal FROM uptime_agent_notifications WHERE delivery_id=?').bind(id).first<{principal:string}>()
 if(!source)return {allowed:true as const}
 const who:SavedPrincipal=JSON.parse(source.principal),person=await (await import('./authority.server.ts')).nativePerson(env,who.person.id)
 if(!person)return {allowed:false as const}
 try{
  const access=await authority(env,{...who,person},'secret_write',[],undefined,true)
  const row=await env.DB.prepare('SELECT destination_id,credential_id FROM notification_jobs WHERE id=?').bind(id).first<any>();if(!row)return {allowed:false as const}
  const answer=await uptimeAgentDoor(env).invoke('uptime.destinations.dispatch',{id:row.destination_id,delivery_id:id,credential_id:row.credential_id,idempotency_key:'dispatch:'+id+':'+row.credential_id},who)
  return answer.outcome==='done'?{allowed:true as const,access}:{allowed:false as const}
 }catch{return {allowed:false as const}}
}
export async function agentDiscoveryTask(env:Bindings,runnerId:string){
 const row=await env.DB.prepare(`SELECT d.id,d.principal FROM uptime_agent_discoveries d JOIN discovery_jobs j ON j.id=d.id WHERE d.delivered_at IS NULL AND j.status IN('queued','running') ORDER BY j.created_at LIMIT 1`).first<{id:string;principal:string}>()
 if(!row)return null
 const who:SavedPrincipal=JSON.parse(row.principal),person=await (await import('./authority.server.ts')).nativePerson(env,who.person.id)
 if(!person)return null
 try{await authority(env,{...who,person},'discovery_write',[],undefined,true)
  const answer=await uptimeAgentDoor(env).invoke('uptime.discovery.dispatch',{id:row.id,runner_id:runnerId,idempotency_key:'discovery:'+row.id+':'+runnerId},who)
  if(answer.outcome!=='done')return null
  const marked=await env.DB.prepare('UPDATE uptime_agent_discoveries SET delivered_at=? WHERE id=? AND delivered_at IS NULL RETURNING id').bind(Date.now(),row.id).all()
  return marked.results.length?(answer.result as any)?.job??null:null
 }catch{return null}
}
