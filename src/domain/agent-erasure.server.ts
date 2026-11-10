import type {Bindings} from './control.server.ts'
import {mutationGuard} from './audit.server.ts'
import {agentErasureStatements} from '../base/modules/agent-door/index.ts'
import {uptimeAgentArtifacts} from '../agent-door/erasure.server.ts'
import {LEGACY_AGENT_REF} from './agent-actor.ts'

// Agent-door custody that names an erased operator.
//
// Two kinds of record carry the person. Uptime's own saved principals (who an
// agent edited, queued or dispatched for) keep their place in the table because a
// native runner may not claim an agent-prepared revision (attempts.server.ts):
// they are rewritten, not deleted. Base's agent_door_* tables are redacted by Base's
// own tombstone rules. Counts are per table and carry no personal data.
const principalTables=[
 {table:'uptime_agent_revisions'},{table:'uptime_agent_handoffs'},{table:'uptime_agent_manual'},
 {table:'uptime_agent_discoveries'},{table:'uptime_agent_notifications'},
] as const
const former='Former member'
type Json=null|boolean|number|string|Json[]|{[key:string]:Json}
// Any object that identifies the erased person by id keeps its shape but loses the person: a fresh opaque id
// (never resolves to a native person, so no authority survives) and the same "Former member" other erased people show.
function anonymise(value:Json,id:string,opaque:string):Json{
 if(Array.isArray(value))return value.map(item=>anonymise(item,id,opaque))
 if(value&&typeof value==='object'){
  const out=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,anonymise(item,id,opaque)]))
  if(value.id===id){out.id=opaque;if('name' in out)out.name=former}
  return out
 }
 return value
}
export function redactedPrincipal(saved:string,id:string,opaque:string){
 const principal=anonymise(JSON.parse(saved),id,opaque) as any
 if(principal.person?.id===id)principal.person.id=opaque
 const attribution=principal.attribution
 // Base shows "<agent> for <person>"; the agent is not personal data, the person is.
 if(attribution?.for?.id===opaque&&attribution.agent)attribution.label=`${attribution.agent.name} for ${former.toLowerCase()}`
 return JSON.stringify(principal)
}
// An agent's incident work (an acknowledgement, an assignment) stores who prepared it beside the timeline entry.
export function redactedAttribution(saved:string,id:string,opaque:string){
 const data=anonymise(JSON.parse(saved),id,opaque) as any
 if(data.preparedBy?.for?.id===opaque&&data.preparedBy.agent)data.preparedBy.label=`${data.preparedBy.agent.name} for ${former.toLowerCase()}`
 return JSON.stringify(data)
}
// Work an agent did before its audit actor was non-personal (agent-actor.ts) carries the "<agent> for <person>" label as the actor
// reference of the portable audit, the route history and the timeline's feature. The label names its sponsor: rewrite it to the stand-in,
// keeping every row, count and time. Idempotent; the migration does this once for existing installations.
export const legacyLabelStatements=(env:Bindings)=>[
 env.DB.prepare("UPDATE uptime_audit SET actor_ref=? WHERE actor_kind='feature' AND instr(actor_ref,' for ')>0").bind(LEGACY_AGENT_REF),
 env.DB.prepare("UPDATE alert_route_changes SET actor_ref=? WHERE instr(actor_ref,' for ')>0").bind(LEGACY_AGENT_REF),
 env.DB.prepare("UPDATE incident_timeline SET data=json_set(data,'$.feature',?) WHERE kind IN('pause_applied','maintenance_applied') AND instr(json_extract(data,'$.feature'),' for ')>0").bind(LEGACY_AGENT_REF),
]
// Base's redaction checkpoint refuses older archives that could resurrect redacted rows. Every agent table is installation-local
// (archive-inventory.ts): no archive or transfer carries one, so there is nothing for a checkpoint to fence and it would only
// make earlier archives of unrelated records fail with a different reason.
const noArchiveCheckpoint=async():Promise<D1PreparedStatement[]>=>[]
// deletedDeliveries are the notification deliveries the caller deletes outright; their saved principals go with them, so they are counted there.
export async function agentCustodyErasure(env:Bindings,operator:{id:string;email:string},receipt:{id:string;completedAt:number},deletedDeliveries:string[]=[]){
 const counts:Record<string,number>={},statements:D1PreparedStatement[]=[],opaque=crypto.randomUUID(),deleted=JSON.stringify(deletedDeliveries)
 for(const {table} of principalTables){
  const where=table==='uptime_agent_notifications'?'instr(principal,?)>0 AND delivery_id NOT IN(SELECT value FROM json_each(?))':'instr(principal,?)>0',args=table==='uptime_agent_notifications'?[operator.id,deleted]:[operator.id]
  const rows=(await env.DB.prepare(`SELECT rowid AS _rowid_,principal FROM ${table} WHERE ${where}`).bind(...args).all<{_rowid_:number;principal:string}>()).results
  counts[table]=rows.length
  statements.push(mutationGuard(env,`(SELECT COUNT(*) FROM ${table} WHERE ${where})=?`,[...args,rows.length]))
  for(const row of rows){
   const next=redactedPrincipal(row.principal,operator.id,opaque)
   statements.push(mutationGuard(env,`EXISTS(SELECT 1 FROM ${table} WHERE rowid=? AND principal=?)`,[row._rowid_,row.principal]),env.DB.prepare(`UPDATE ${table} SET principal=? WHERE rowid=? AND principal=?`).bind(next,row._rowid_,row.principal))
  }
 }
 const attributed=(await env.DB.prepare("SELECT rowid AS _rowid_,data FROM incident_timeline WHERE json_extract(data,'$.preparedBy') IS NOT NULL AND instr(data,?)>0").bind(operator.id).all<{_rowid_:number;data:string}>()).results
 counts.incident_timeline=attributed.length
 statements.push(mutationGuard(env,"(SELECT COUNT(*) FROM incident_timeline WHERE json_extract(data,'$.preparedBy') IS NOT NULL AND instr(data,?)>0)=?",[operator.id,attributed.length]))
 for(const row of attributed)statements.push(mutationGuard(env,'EXISTS(SELECT 1 FROM incident_timeline WHERE rowid=? AND data=?)',[row._rowid_,row.data]),env.DB.prepare('UPDATE incident_timeline SET data=? WHERE rowid=? AND data=?').bind(redactedAttribution(row.data,operator.id,opaque),row._rowid_,row.data))
 statements.push(...legacyLabelStatements(env))
 // Base's door tables name the sponsor by id, exact email and display name. Select by the exact id and email only.
 const subject={values:JSON.stringify([operator.id,operator.email])}
 for(const item of uptimeAgentArtifacts.artifacts)if(item.match)counts[item.table]=Number((await env.DB.prepare(`SELECT COUNT(*) n FROM "${item.table}" WHERE ${item.match.sql}`).bind(subject.values).first<{n:number}>())?.n??0)
 statements.push(...await agentErasureStatements({db:env.DB,map:uptimeAgentArtifacts,subject,secret:env.SESSION_SECRET!,tombstone:{erasure_id:receipt.id,at:new Date(receipt.completedAt).toISOString()},checkpoint:noArchiveCheckpoint}))
 return {counts,statements}
}
