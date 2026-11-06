import type {Bindings} from '../control.server.ts'
import {mailSender} from '../mail.server.ts'
import {auditStatement} from '../audit.server.ts'
import {eligibleRecipient} from './mention-members.server.ts'
import type {Allowance,SubrequestBudget} from '../worker-budget.ts'
// One reservation, one submission. No cron/retry path can acquire a reserved row.
// If the Worker stops after reservation, reads show uncertainty; restore disables it.
const live=`SELECT 1 FROM incident_mentions n JOIN incident_mention_authority a ON a.id=n.id
 JOIN incident_comments c ON c.id=n.comment_id AND c.version=n.comment_version AND c.deleted_at IS NULL
 JOIN oa_operators o ON o.id=n.recipient_id JOIN uptime_member_roles r ON r.operator_id=o.id
 JOIN monitors m ON m.id=n.monitor_id JOIN outbox e ON e.id=n.incident_id AND e.monitor_id=m.id AND e.kind='trigger' AND e.status<>'imported-inactive'
 WHERE n.id=? AND ${eligibleRecipient} AND o.version=a.operator_version AND r.revision=a.role_revision`
async function deliver(env:Bindings,id:string,allowance?:Allowance){
 const reserved=await env.DB.prepare("UPDATE incident_mentions SET outcome='submitting' WHERE id=? AND outcome='pending' AND submitted_at IS NULL AND finished_at IS NULL RETURNING *").bind(id).first<any>()
 if(!reserved)return
 let submitted=false,outcome='unavailable'
 try{
  const row=await env.DB.prepare(`SELECT o.email,c.text,m.definition FROM incident_mentions n JOIN incident_comments c ON c.id=n.comment_id JOIN oa_operators o ON o.id=n.recipient_id JOIN monitors m ON m.id=n.monitor_id WHERE n.id=? AND EXISTS(${live})`).bind(id,id).first<{email:string;text:string;definition:string}>()
  if(!row){outcome='cancelled';return}
  const handoff=async()=>{
   const result=await env.DB.batch([
    env.DB.prepare(`UPDATE incident_mentions SET submitted_at=? WHERE id=? AND outcome='submitting' AND submitted_at IS NULL AND EXISTS(${live}) AND EXISTS(SELECT 1 FROM oa_operators o WHERE o.id=incident_mentions.recipient_id AND o.email=?) RETURNING id`).bind(Date.now(),id,id,row.email),
    auditStatement(env,{kind:'feature',ref:'incident-mention'},'incident_mention_send','incident',id,'changes()>0')
   ])
   if(!result[0].results.length)throw Error('Mention authority ended')
   submitted=true
  }
  const sender=mailSender(env,{fetch:async(url:RequestInfo|URL,init?:RequestInit)=>{await handoff();allowance?.spend();return fetch(url,init)}})
  if(!sender)return
  if(env.MAIL_PROVIDER==='development')await handoff()
  const excerpt=[...row.text].slice(0,500).join(''),name=[...String(JSON.parse(row.definition).name)].slice(0,160).join('')
  const link=new URL(`/api/incidents/${encodeURIComponent(reserved.incident_id)}`,env.UPTIME_ORIGIN).href
  const result=await sender.send({deliveryId:id,from:env.MAIL_FROM!,to:[row.email],subject:'Uptime incident mention',text:`You were mentioned on the incident for ${name}.\n\n${excerpt}\n\nSign in to read the incident: ${link}`})
  outcome=submitted&&['accepted','development','rejected','rate_limited'].includes(result.status)?result.status:submitted?'uncertain':'unavailable'
 }catch{outcome=submitted?'uncertain':'cancelled'}
 finally{await env.DB.prepare("UPDATE incident_mentions SET outcome=?,finished_at=? WHERE id=? AND outcome='submitting'").bind(outcome,Date.now(),id).run()}
}
export async function deliverCommentMentions(env:Bindings,commentId:string,version:number){
 const rows=(await env.DB.prepare("SELECT id FROM incident_mentions WHERE comment_id=? AND comment_version=? AND outcome='pending' ORDER BY id LIMIT 10").bind(commentId,version).all<{id:string}>()).results
 await Promise.all(rows.map(row=>deliver(env,row.id)))
}
/** Recover only committed work that never acquired a reservation. Older attempts
 * and inactive source history remain terminal, even when their outcome is unknown. */
export async function dispatchPendingMentions(env:Bindings,budget:SubrequestBudget){
 if(budget.remaining<1)return
 const rows=(await env.DB.prepare("SELECT id FROM incident_mentions WHERE outcome='pending' AND submitted_at IS NULL AND finished_at IS NULL ORDER BY created_at,id LIMIT 10").all<{id:string}>()).results
 for(const row of rows){
  const allowance=budget.reserve(1);if(!allowance)break
  try{await deliver(env,row.id,allowance)}finally{allowance.release()}
 }
}
