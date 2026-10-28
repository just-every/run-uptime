import type {Bindings} from '../control.server.ts'
// @ts-ignore Shared bounded native receipt parser.
import {oncallReceipt} from '../webhook-template.mjs'
const unknown=(reason:string)=>({state:'unknown',source:null,at:null,reason})
export async function handoffFacts(env:Bindings,deliveryIds:string[]){
 if(!deliveryIds.length)return new Map<string,any>()
 const rows=(await env.DB.prepare(`SELECT j.id,j.destination_id,j.credential_id,j.event,j.webhook_template,a.id attempt_id,a.finished_at,a.outcome
  FROM notification_jobs j LEFT JOIN integration_attempts a ON a.namespace='uptime-notifications' AND a.delivery_id=j.id
  WHERE json_extract(j.webhook_template,'$.mode')='oncall' AND EXISTS(
   SELECT 1 FROM notification_jobs target WHERE target.id IN(SELECT value FROM json_each(?))
   AND target.destination_id=j.destination_id AND target.credential_id=j.credential_id
   AND json_extract(target.event,'$.incidentKey')=json_extract(j.event,'$.incidentKey'))
  ORDER BY a.finished_at,a.id`).bind(JSON.stringify(deliveryIds)).all<any>()).results
 const acknowledgments=new Map<string,any>(),key=(r:any)=>JSON.stringify([r.destination_id,r.credential_id,JSON.parse(r.event).incidentKey])
 for(const r of rows){
  const o=r.outcome?JSON.parse(r.outcome):null,receipt=o?.responseExcerpt?oncallReceipt(o.responseExcerpt):null
  if(o?.kind==='accepted'&&o.code==='oncall_receipt_accepted'&&o.status>=200&&o.status<300&&receipt&&!acknowledgments.has(key(r)))
   acknowledgments.set(key(r),{state:'acknowledged',source:'oncall_native_intake',at:r.finished_at,receiverAcceptedAt:receipt.acceptedAt,receiptId:receipt.id,deliveryId:r.id,attemptId:r.attempt_id})
 }
 const result=new Map<string,any>()
 for(const r of rows)result.set(r.id,{product:'Oncall',acknowledged:acknowledgments.get(key(r))??unknown('No validated native transport receipt'),
  received:unknown('No scoped native alert receipt read door'),responded:unknown('No scoped human responder evidence door')})
 return result
}
