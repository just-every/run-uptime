import type {Bindings} from './control.server.ts'
import {destinations} from './notification-destinations.server.ts'
// A correction is a proposed concrete native edit, never an execution grant.
// The ordinary reviewed route door will compute its external effects afresh.
export async function drillCorrection(env:Bindings,destinationId:string,code:string){
 const contacts=await destinations(env,{readOnly:true}),current=contacts.find(d=>d.id===destinationId)
 const excluded=(await env.DB.prepare(`SELECT c.destination_id FROM alert_drill_consents c JOIN notification_destinations d ON d.id=c.destination_id AND d.credential_id=c.credential_id WHERE json_extract(c.config,'$.credentialExpiresAt')<=? UNION SELECT c.destination_id FROM alert_drill_runs r JOIN alert_drill_schedules s ON s.id=r.schedule_id JOIN alert_drill_consents c ON c.id=s.consent_id JOIN notification_destinations d ON d.id=c.destination_id AND d.credential_id=c.credential_id LEFT JOIN alert_drills a ON a.id=r.drill_id WHERE a.confirmed_at IS NULL AND (r.code<>'drill_queued' OR r.due_at+json_extract(c.config,'$.confirmationWaitMs')<=?)`).bind(Date.now(),Date.now()).all<{destination_id:string}>()).results.map(r=>r.destination_id)
 const replacement=contacts.find(d=>d.id!==destinationId&&d.enabled&&d.credentialsAvailable&&!excluded.includes(d.id))
 const routes=(await env.DB.prepare(`SELECT scope_kind,scope_value,revision FROM alert_routes WHERE mode='all' OR EXISTS(SELECT 1 FROM json_each(destination_ids) WHERE value=?) OR EXISTS(SELECT 1 FROM json_each(json_extract(fallback,'$.destinationIds')) WHERE value=?) ORDER BY scope_kind,scope_value`).bind(destinationId,destinationId).all<any>()).results
 const expired=['credential_expired','credential_rotated','credential_unavailable'].includes(code)
 const text=replacement?`Replace ${current?.name??'this destination'} with ${replacement.name} in the affected alert routes after recipient review and a fresh drill.`:`Repair ${current?.name??'this destination'} and review its credential and route with the internal owner before another consented drill.`
 return {text,action:replacement?'replace_destination':'repair_credential',destinationId,replacementDestinationId:replacement?.id??null,routes:routes.map(r=>({scope:r.scope_kind,value:r.scope_value,expectedRevision:r.revision})),requiresReview:true,classes:replacement?['external']:expired?['security']:['external'],credentialDiagnosis:code,phoneChargeUsd:0}
}
