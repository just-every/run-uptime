import type {Bindings} from './control.server.ts'
import {auditStatement} from './audit.server.ts'
import {readInstallationRoute,previewInstallationRoute,applyInstallationRoute} from './alert-routes.server.ts'
import {startDrill} from './alert-drills.server.ts'
import type {Policy} from './route-accountability-policy.server.ts'
// AGENT-004. A proposal is a corrected installation default route for one destination with an unresolved gap: its entered
// credential expired, or its scheduled drill went unconfirmed and the owner was chased at least once. It names the exact
// change and the evidence. Nothing is applied and no recipient is messaged until a person approves it; declining changes
// nothing and the same gap is not proposed again. Approval applies the route through the ordinary reviewed route door and
// then drills the one newly added recipient, which is the only message the proposal can cause.
const fail=(message:string,status=400)=>Object.assign(Error(message),{status})
export async function proposeRouteChanges(env:Bindings,policy:Policy,now:number){
 const gaps=(await env.DB.prepare(`SELECT d.id,d.name,d.kind,s.credential_expires_at,a.id drill_id,a.started_at,a.expires_at,a.submitted_at,a.confirmed_at,
   (SELECT COUNT(*) FROM route_accountability_reminders r WHERE r.drill_id=a.id AND r.submitted_at IS NOT NULL) reminders,
   j.state,j.code,j.finished_at,(SELECT t.outcome FROM integration_attempts t WHERE t.delivery_id=j.id ORDER BY t.number DESC LIMIT 1) outcome
  FROM notification_destinations d LEFT JOIN route_accountability_destinations s ON s.destination_id=d.id
  LEFT JOIN alert_drills a ON a.destination_id=d.id AND a.started_at=(SELECT MAX(x.started_at) FROM alert_drills x WHERE x.destination_id=d.id) AND a.credential_id=d.credential_id
  LEFT JOIN notification_jobs j ON j.id=a.delivery_id
  WHERE d.deleted_at IS NULL AND d.enabled=1 ORDER BY d.created_at,d.id`).all<any>()).results
 const expired=gaps.filter(g=>g.credential_expires_at!==null&&g.credential_expires_at<=now)
 const unconfirmed=gaps.filter(g=>g.drill_id&&!g.confirmed_at&&g.expires_at<=now&&g.reminders>0&&!expired.includes(g))
 if(!expired.length&&!unconfirmed.length)return
 const route=await readInstallationRoute(env)
 for(const gap of [...expired,...unconfirmed]){
  const reason=expired.includes(gap)?'credential_expired':'drill_unconfirmed',gapKey=reason==='credential_expired'?`credential:${gap.id}:${gap.credential_expires_at}`:`drill:${gap.drill_id}`
  if(await env.DB.prepare("SELECT 1 x FROM route_accountability_proposals WHERE destination_id=? AND (state='pending' OR json_extract(evidence,'$.gapKey')=?)").bind(gap.id,gapKey).first())continue
  const inRoute=route.mode==='all'||route.destinationIds.includes(gap.id);if(!inRoute)continue
  const enabled=gaps.filter(g=>g.id!==gap.id&&!(g.credential_expires_at!==null&&g.credential_expires_at<=now))
  const candidate=route.mode==='all'?null:await env.DB.prepare(`SELECT d.id FROM notification_destinations d WHERE d.deleted_at IS NULL AND d.enabled=1 AND d.id<>? AND d.id NOT IN(SELECT value FROM json_each(?))
    AND d.id IN(SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM alert_drills p WHERE p.destination_id=d.id AND p.credential_id=d.credential_id AND p.confirmed_at IS NOT NULL)
    ORDER BY (SELECT MAX(p.confirmed_at) FROM alert_drills p WHERE p.destination_id=d.id AND p.credential_id=d.credential_id) DESC,d.id LIMIT 1`).bind(gap.id,JSON.stringify(route.destinationIds),JSON.stringify(enabled.map(g=>g.id))).first<{id:string}>()
  const base=route.mode==='all'?enabled.map(g=>g.id):route.destinationIds.filter((id:string)=>id!==gap.id),destinationIds=[...base,...(candidate?[candidate.id]:[])]
  if(!destinationIds.length)continue
  const change={scope:'installation',mode:'selected',destinationIds,contactSettings:route.contactSettings,fallback:{...route.fallback,destinationIds:route.fallback.destinationIds.filter((id:string)=>id!==gap.id)},teamIds:route.teamIds}
  try{await previewInstallationRoute(env,{...change,expectedRevision:route.revision})}catch{continue}
  const evidence={gapKey,reason,destination:{id:gap.id,name:gap.name,kind:gap.kind},credentialExpiresAt:gap.credential_expires_at,
   drill:gap.drill_id?{id:gap.drill_id,startedAt:gap.started_at,expiresAt:gap.expires_at,state:gap.state,code:gap.outcome?JSON.parse(gap.outcome).code:gap.code,finishedAt:gap.finished_at,confirmed:Boolean(gap.confirmed_at),remindersSent:gap.reminders}:null}
  await env.DB.prepare('INSERT OR IGNORE INTO route_accountability_proposals(id,destination_id,candidate_id,reason,evidence,change,route_revision,created_at) VALUES(?,?,?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),gap.id,candidate?.id??null,reason,JSON.stringify(evidence),JSON.stringify({...change,remove:gap.id,add:candidate?.id??null}),route.revision,now).run()
 }
}
export async function decideRouteProposal(env:Bindings,id:string,decision:unknown,actor:{kind:'operator';ref:string}){
 if(decision!=='approve'&&decision!=='decline')throw fail('Decide approve or decline')
 const now=Date.now(),claimed=await env.DB.prepare("UPDATE route_accountability_proposals SET state=?,decided_by=?,decided_at=? WHERE id=? AND state='pending' RETURNING *").bind(decision==='approve'?'approved':'declined',actor.ref,now,id).first<any>()
 if(!claimed){const exists=Boolean(await env.DB.prepare('SELECT 1 x FROM route_accountability_proposals WHERE id=?').bind(id).first());throw fail(exists?'This proposal was already decided':'Proposal not found',exists?409:404)}
 if(decision==='decline'){await auditStatement(env,actor,'route_accountability_decline','alert_route',id,'1',[],now).run();return {id,state:'declined'}}
 // Only a still-approved claim reopens; a superseded proposal stays superseded.
 const reopen=()=>env.DB.prepare("UPDATE route_accountability_proposals SET state='pending',decided_by=NULL,decided_at=NULL WHERE id=? AND state='approved'").bind(id).run()
 try{
  const change=JSON.parse(claimed.change),route=await readInstallationRoute(env)
  if(route.revision!==claimed.route_revision){await env.DB.prepare("UPDATE route_accountability_proposals SET state='superseded' WHERE id=?").bind(id).run();throw fail('The route changed after this proposal; the next pass proposes again',409)}
  if(change.add&&!await env.DB.prepare('SELECT 1 x FROM notification_destinations WHERE id=? AND enabled=1 AND deleted_at IS NULL').bind(change.add).first())throw fail('The proposed recipient is no longer available',409)
  const {remove,add,...body}=change,preview=await previewInstallationRoute(env,{...body,expectedRevision:route.revision})
  await applyInstallationRoute(env,{...body,expectedRevision:route.revision,digest:preview.digest},actor)
  await auditStatement(env,actor,'route_accountability_approve','alert_route',id,'1',[],now).run()
  let drill:{started:boolean;drillId?:string;error?:string}|null=null
  if(add)try{drill={started:true,drillId:(await startDrill(env,add,actor.ref)).drillId}}catch(error){drill={started:false,error:(error as Error).message}}
  return {id,state:'approved',drill}
 }catch(error){await reopen();throw error}
}
