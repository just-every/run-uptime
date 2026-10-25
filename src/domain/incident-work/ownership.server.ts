import type {Bindings} from '../control.server.ts'
import {eligibleRecipient} from './mention-members.server.ts'
import {IncidentWorkError} from './common.server.ts'
// Assignment uses the same live Base ceiling and monitor scope as incident reads,
// with the additional responder-or-higher requirement. Rechecked in the transaction.
export const eligibleAssignee=`${eligibleRecipient} AND r.role IN ('owner','admin','editor','responder')`
export async function assignmentMembers(env:Bindings,monitorId:string){
 const rows=await env.DB.prepare(`SELECT o.id,o.display_name FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id JOIN monitors m ON m.id=? WHERE ${eligibleAssignee} ORDER BY o.display_name,o.id`).bind(monitorId).all<{id:string;display_name:string}>()
 return rows.results.map(row=>({id:row.id,displayName:row.display_name}))
}
export async function assignee(env:Bindings,monitorId:string,id:string){
 const person=(await assignmentMembers(env,monitorId)).find(person=>person.id===id)
 if(!person)throw new IncidentWorkError('Choose an active responder who can read this monitor')
 return person
}
