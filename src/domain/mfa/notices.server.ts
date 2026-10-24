import {mailSender} from '../mail.server.ts'
import type {AuthBindings} from '../operator-auth.server.ts'
// Reserve once, with a durable honest outcome. No retry can repeat a notice
// whose provider result was lost; no factor material or provider body is stored.
export async function sendNotice(env:AuthBindings,id:string){
 const event=await env.DB.prepare(`UPDATE uptime_mfa_notices SET outcome='submitting' WHERE id=? AND outcome='pending' RETURNING operator_id,action`).bind(id).first<{operator_id:string;action:string}>()
 if(!event)return
 let submitted=false,outcome='unavailable'
 try{
  const recipient=await env.DB.prepare("SELECT email FROM oa_operators WHERE id=? AND status='active'").bind(event.operator_id).first<{email:string}>()
  if(!recipient){outcome='erased';return}
  const handoff=async()=>{const live=await env.DB.prepare("SELECT 1 FROM uptime_mfa_notices n JOIN oa_operators o ON o.id=n.operator_id WHERE n.id=? AND n.outcome='submitting' AND o.status='active' AND o.email=?").bind(id,recipient.email).first();if(!live)throw Error('Notice authority ended');submitted=true}
  const sender=mailSender(env,{fetch:async(url:RequestInfo|URL,init?:RequestInit)=>{await handoff();return fetch(url,init)}})
  if(!sender)return
  if(env.MAIL_PROVIDER==='development')await handoff()
  const result=await sender.send({deliveryId:id,from:env.MAIL_FROM!,to:[recipient.email],subject:'Uptime second-factor security change',text:`A second-factor security operation (${event.action.replaceAll('_',' ')}) occurred on your Uptime account. If you did not request it, contact your installation owner immediately. No sign-in credentials are included in this notice.`})
  outcome=submitted&&['accepted','development','rejected','rate_limited'].includes(result.status)?result.status:submitted?'uncertain':'unavailable'
 }catch{outcome=submitted?'uncertain':'unavailable'}
 finally{await env.DB.prepare('UPDATE uptime_mfa_notices SET outcome=? WHERE id=?').bind(outcome,id).run()}
}
