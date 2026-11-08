import type {Bindings} from './control.server.ts'
import {destinations} from './notification-destinations.server.ts'
// A correction is a proposed concrete native edit, never an execution grant.
// The ordinary reviewed route door will compute its external effects afresh.
export async function drillCorrection(env:Bindings,destinationId:string,code:string){
 const contacts=await destinations(env,{readOnly:true}),current=contacts.find(d=>d.id===destinationId)
 const replacement=contacts.find(d=>d.id!==destinationId&&d.enabled&&d.credentialsAvailable)
 const routes=(await env.DB.prepare(`SELECT scope_kind,scope_value,revision FROM alert_routes WHERE mode='all' OR EXISTS(SELECT 1 FROM json_each(destination_ids) WHERE value=?) OR EXISTS(SELECT 1 FROM json_each(json_extract(fallback,'$.destinationIds')) WHERE value=?) ORDER BY scope_kind,scope_value`).bind(destinationId,destinationId).all<any>()).results
 const expired=['credential_expired','credential_rotated','credential_unavailable'].includes(code)
 const text=replacement?`Replace ${current?.name??'this destination'} with ${replacement.name} in the affected alert routes after recipient review and a fresh drill.`:`Repair ${current?.name??'this destination'} and review its credential and route with the internal owner before another consented drill.`
 return {text,action:replacement?'replace_destination':'repair_credential',destinationId,replacementDestinationId:replacement?.id??null,routes:routes.map(r=>({scope:r.scope_kind,value:r.scope_value,expectedRevision:r.revision})),requiresReview:true,classes:replacement?['external']:expired?['security']:['external'],credentialDiagnosis:code,phoneChargeUsd:0}
}
