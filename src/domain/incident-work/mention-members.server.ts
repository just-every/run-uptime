import type {Bindings} from '../control.server.ts'
import {IncidentWorkError} from './common.server.ts'
// The same live Base ceiling and intersecting service/team scope as permission().
// Recipient eligibility is independent of a browser session, never of membership.
export const eligibleRecipient=`o.status='active' AND r.base_version=o.version AND r.base_role=o.role
 AND o.role=CASE WHEN r.role IN('owner','admin') THEN r.role WHEN r.role IN('editor','responder','read-only') THEN 'member' ELSE '' END
 AND NOT EXISTS(SELECT 1 FROM uptime_member_scopes p WHERE p.operator_id=o.id GROUP BY p.kind
 HAVING MAX(CASE WHEN p.kind='service' AND p.value=json_extract(m.definition,'$.service') OR p.kind='team' AND p.value=json_extract(m.definition,'$.group') THEN 1 ELSE 0 END)=0)`
export type MentionMember={id:string;display_name:string;version:number;revision:number}
export async function mentionMembers(env:Bindings,monitorId:string,q=''){
 if(typeof q!=='string'||[...q].length>80)throw new IncidentWorkError('Member search is at most 80 characters')
 const rows=await env.DB.prepare(`SELECT o.id,o.display_name FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id JOIN monitors m ON m.id=? WHERE ${eligibleRecipient} AND instr(lower(o.display_name),lower(?))>0 ORDER BY o.display_name,o.id LIMIT 20`).bind(monitorId,q).all<{id:string;display_name:string}>()
 return rows.results.map(row=>({id:row.id,displayName:row.display_name}))
}
export async function mentionedMembers(env:Bindings,monitorId:string,input:unknown):Promise<MentionMember[]>{
 if(input===undefined)return []
 if(!Array.isArray(input)||input.length>10||input.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))||new Set(input).size!==input.length)throw new IncidentWorkError('Choose at most ten distinct member IDs')
 const rows=(await env.DB.prepare(`SELECT o.id,o.display_name,o.version,r.revision FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id JOIN monitors m ON m.id=? WHERE ${eligibleRecipient} AND o.id IN(SELECT value FROM json_each(?))`).bind(monitorId,JSON.stringify(input)).all<MentionMember>()).results
 if(rows.length!==input.length)throw new IncidentWorkError('A mentioned member cannot read this monitor',403)
 return rows
}
export function mentionStatements(env:Bindings,commentId:string,incidentId:string,monitorId:string,version:number,members:MentionMember[],now:number){
 return members.flatMap(member=>{const id=crypto.randomUUID();return [
  env.DB.prepare(`INSERT INTO incident_mentions(id,comment_id,incident_id,monitor_id,comment_version,recipient_id,created_at,outcome) VALUES(?,?,?,?,?,?,?,'pending')`).bind(id,commentId,incidentId,monitorId,version,member.id,now),
  env.DB.prepare('INSERT INTO incident_mention_authority(id,monitor_id,operator_version,role_revision) VALUES(?,?,?,?)').bind(id,monitorId,member.version,member.revision)
 ]})
}
