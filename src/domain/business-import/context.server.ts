import type {Bindings} from '../control.server.ts'
import {operatorSession} from '../operator-auth.server.ts'
import {configureClaim} from '../../base/modules/owner-claim/verify.mjs'
import type {D1Sql,D1ImportContext} from '../../base/modules/import-kit/src/d1/types.ts'
import {businessTargets} from './targets.server.ts'

export const BUSINESS_DESTINATION='uptime-monitors'
/** The permanent door key for settings, lineage, history and imported monitor ids.
 * It never follows the RER claim id, which an installation may receive later. */
export const DOOR_KEY='uptime-monitor'
/** Undo reverses every monitor still as its import left it and reports the rest: one edited or enabled since is kept. */
export const REVERSAL_POLICY='preserve-conflicts' as const
export function businessClaim(env:Bindings){
 return configureClaim({issuer:env.RER_OWNER_CLAIM_ISSUER??'',installationId:env.RER_OWNER_CLAIM_INSTALLATION_ID??'',
  appOrigin:env.RER_OWNER_CLAIM_APP_ORIGIN??'',expectedEmail:env.OWNER_EMAIL??'',publicKeys:JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS??'null')})
}
export async function businessOwner(env:Bindings){
 const owner=await env.DB.prepare("SELECT id FROM oa_operators WHERE email=? AND role='owner' AND status='active'").bind(env.OWNER_EMAIL??'').first<{id:string}>()
 if(!owner)throw Object.assign(Error('The installation owner is unavailable'),{status:403})
 return owner.id
}
/** The current owner session as a same-database predicate, or null for anyone else. */
export async function ownerSessionPredicate(env:Bindings,request:Request):Promise<D1Sql|null>{
 const principal=await operatorSession(env,request)
 if(!principal||principal.operator.role!=='owner')return null
 return {sql:`EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
  WHERE s.id=? AND s.operator_id=? AND s.operator_version=o.version AND o.role='owner' AND o.status='active'
  AND s.revoked_at IS NULL AND s.expires_at>unixepoch()*1000)`,params:[principal.id,principal.operator.id]}
}
// A native browser session remains live throughout each owner mutation batch.
export async function businessOwnerAuthority(env:Bindings,request:Request):Promise<D1Sql>{
 const predicate=await ownerSessionPredicate(env,request)
 if(!predicate)throw Object.assign(Error('Owner session required'),{status:401})
 return predicate
}
export async function ownerImportContext(env:Bindings,request:Request,namespace:string,mappingVersion:string):Promise<D1ImportContext>{
 const predicate=await businessOwnerAuthority(env,request),owner=await businessOwner(env)
 return {destination:BUSINESS_DESTINATION,namespace,mappingVersion,batchSize:20,maxBatches:1,reversalPolicy:REVERSAL_POLICY,
  storage:{database:env.DB,targets:businessTargets(env,owner)},
  authorization:{principalId:owner,predicate:()=>predicate}}
}
