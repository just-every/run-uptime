import type {AgentArtifactMap} from '../base/modules/agent-door/index.ts'

// Bind values to exact native monitor/destination/operator ids, linked child
// ids and an operator's exact email, never a common display name or caller SQL.
// This inventory describes custody. Uptime's native erasure transaction remains
// authoritative for product deletion and its deliberate audit/history retention;
// declaring a match does not authorize deleting retained decision evidence.
const mentions=(table:string,columns:string[])=>`EXISTS(SELECT 1 FROM json_each(?1) subject WHERE subject.type='text' AND length(subject.value)>0 AND (${columns.map(column=>`instr(CAST(${table}.${column} AS TEXT),subject.value)>0`).join(' OR ')}))`
const calls=mentions('agent_door_calls',['key','outcome']),approvals=mentions('agent_door_approvals',['saved','approvals','result']),reviews=mentions('agent_door_reviews',['saved','marked_by']),audits=mentions('agent_door_audit',['row','evidence'])
const decisions=`SELECT decision_id FROM agent_door_calls WHERE ${calls} UNION SELECT json_extract(saved,'$.decision_id') FROM agent_door_approvals WHERE ${approvals} UNION SELECT json_extract(saved,'$.decision_id') FROM agent_door_reviews WHERE ${reviews} UNION SELECT id FROM agent_door_audit WHERE ${audits}`
const match=(sql:string)=>({sql,params:['values']})
export const uptimeAgentArtifacts:AgentArtifactMap={artifacts:[
 {table:'agent_door_relay',columns:['sequence','decision_id','business'],unrelated:'Value-free decision ids and installation Business id only; current projections come from the erasure-aware audit.'},
 {table:'agent_door_state',columns:['id','envelope','local_document','local_revision','local_paused','decision_lock','decision_until'],unrelated:'Signed installation policy and admission leases. Native entity deletion does not rewrite policy authority; current native people checks remain required.'},
 {table:'agent_door_agents',columns:['id','name','specialist','sponsor','sponsor_name','revoked','window','requests','tombstone'],match:match(mentions('agent_door_agents',['sponsor']))},
 {table:'agent_door_calls',columns:['agent','key','digest','decision_id','created_at','state','outcome','expires_at'],match:match(`decision_id IN (${decisions})`)},
 {table:'agent_door_audit',columns:['sequence','id','at','agent','classes','row','evidence'],match:match(`id IN (${decisions}) OR json_extract(row,'$.decision_id') IN (${decisions}) OR json_extract(row,'$.replay_of') IN (${decisions})`)},
 {table:'agent_door_approvals',columns:['id','state','saved','approvals','result','version'],match:match(`json_extract(saved,'$.decision_id') IN (${decisions}) OR ${approvals}`)},
 {table:'agent_door_reviews',columns:['id','state','saved','marked_by','marked_at'],match:match(`json_extract(saved,'$.decision_id') IN (${decisions}) OR ${reviews}`)},
 {table:'agent_door_events',columns:['sequence','id','uri','event'],match:match(`${mentions('agent_door_events',['uri','event'])} OR json_extract(event,'$.decision_id') IN (${decisions})`)},
 {table:'agent_door_usage',columns:['decision_id','at','seed','specialist','agent','classes'],match:match(`decision_id IN (${decisions}) OR ${mentions('agent_door_usage',['classes'])}`)},
 {table:'agent_door_retired_refs',columns:['digest','marker'],unrelated:'Value-free suppression digests and erasure markers preserve retirement across restore.'},
 {table:'agent_door_replay_aliases',columns:['agent','alias','call_id','tombstone'],unrelated:'Installation-private value-free replay aliases; fixed call expiry, excluded from export and restore.'},
]}
// This is an external custody declaration, not a provider or outbound sender.
// The relay stays pull-only and dark without the existing owner-claim trust.
export const businessDecisionCustody={
 store:'Business-held decision projections',
 contents:'Bounded public decision fields only; no native arguments, personal summaries or replay aliases.',
 purge:'Tombstone pulls redact projections; stop, unpairing, authority loss, unsupported route, cursor rewind or 30 days without a successful pull purges the installation copy.',
} as const
