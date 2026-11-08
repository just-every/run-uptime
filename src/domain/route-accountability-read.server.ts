import type {Bindings} from './control.server.ts'
import {readPolicy,routeOwner} from './route-accountability-policy.server.ts'
import {destinations} from './notification-destinations.server.ts'
import {drillOverview} from './alert-drills.server.ts'
// AGENT-004. What the owner inspects: per destination the drill, the entered credential expiry, the provider's
// acknowledgment kept apart from the recipient's own confirmation, the chased route owner's reminders, and the
// proposed route changes. Provider acknowledgment means the channel accepted the message; only the recipient's use of
// the one-time link is confirmation.
const acknowledgment=(state:string|undefined)=>!state?'none':state==='accepted'?'accepted':state==='queued'||state==='sending'?'pending':state
export async function routeAccountability(env:Bindings,now=Date.now()){
 const policy=await readPolicy(env)
 const [list,overview,settings,reminders,proposals,scheduled]=await Promise.all([destinations(env,{readOnly:true}),drillOverview(env,now),
  env.DB.prepare('SELECT destination_id,credential_expires_at,owner_id FROM route_accountability_destinations').all<any>(),
  env.DB.prepare('SELECT drill_id,destination_id,number,due_at,outcome,submitted_at,finished_at FROM route_accountability_reminders ORDER BY drill_id,number').all<any>(),
  env.DB.prepare('SELECT * FROM route_accountability_proposals ORDER BY created_at DESC,id').all<any>(),
  env.DB.prepare('SELECT drill_id FROM route_accountability_drills').all<{drill_id:string}>()])
 const scheduledIds=new Set(scheduled.results.map(r=>r.drill_id))
 const rows=await Promise.all(list.map(async d=>{
  const drill=overview(d.id),latest=drill.latestDrill,local=settings.results.find(s=>s.destination_id===d.id),expires=local?.credential_expires_at??null
  const owner=policy?await routeOwner(env,d.id,policy):null
  return {id:d.id,name:d.name,kind:d.kind,enabled:d.enabled,
   credential:{expiresAt:expires,state:expires===null?'none':expires<=now?'expired':'valid'},
   owner:owner?{id:owner.id,name:owner.name}:null,ownerId:local?.owner_id??null,
   proof:drill.proof,
   latestDrill:latest&&{id:latest.id,scheduled:scheduledIds.has(latest.id),startedAt:latest.startedAt,expiresAt:latest.expiresAt,
    providerAcknowledgment:acknowledgment(latest.state),providerCode:latest.code,recipientConfirmation:latest.confirmation,confirmedAt:latest.confirmedAt,currentCredential:latest.currentCredential},
   reminders:reminders.results.filter(r=>latest&&r.drill_id===latest.id).map(r=>({number:r.number,dueAt:r.due_at,outcome:r.outcome,submittedAt:r.submitted_at,finishedAt:r.finished_at}))}
 }))
 return {policy,phone:{available:false,reason:'No phone channel ships yet; agents place no calls and no phone charge is possible.'},destinations:rows,
  proposals:proposals.results.map(p=>({id:p.id,destinationId:p.destination_id,candidateId:p.candidate_id,reason:p.reason,evidence:JSON.parse(p.evidence),change:JSON.parse(p.change),state:p.state,createdAt:p.created_at,decidedAt:p.decided_at}))}
}
