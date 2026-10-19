import type {Bindings} from './control.server.ts'
import {verifyRerGrant,DoorError} from '../base/modules/import-kit/src/door/index.ts'
import {OwnerClaimError} from '../base/modules/owner-claim/verify.mjs'
import {businessClaim,DOOR_KEY} from './business-import/context.server.ts'
import {finishRequest} from './business-import/door.server.ts'
import {readContact} from './runner-contact.server.ts'

const headers={'cache-control':'no-store'}
// The console's contact states, as RER reads them: a contact time that cannot be verified reads stale, never fresh.
const state=(label:string)=>label==='Fresh contact'?'fresh':label==='Never seen'?'never':'stale'

/**
 * POST /api/rer/runner-status: Run Edit Run's signed read of this installation's private runner. It answers
 * `{state, lastContactAt}` from runner_contact, which only an authenticated private runner's request writes (hosted
 * Worker checks never do). `fresh` is the console's own runner-contact window (CONTACT_FRESHNESS_MS, 2 minutes). The
 * grant is an RER-signed `runner-status` grant for this installation under its owner-claim key ring; a key the owner
 * revoked in Business imports is refused. Nothing else is read or returned: never the runner key or runner ids.
 */
export async function rerRunnerStatus(env:Bindings,request:Request){
 if(request.method!=='POST')return finishRequest(request,Response.json({error:'method_not_allowed'},{status:405,headers:{...headers,allow:'POST'}}))
 // Without Run Edit Run's owner-claim trust (self-host) there is no signer to answer: the route does not exist.
 let claim:ReturnType<typeof businessClaim>
 try{claim=businessClaim(env)}catch(error){
  if(error instanceof OwnerClaimError)return finishRequest(request,Response.json({error:'not_found'},{status:404,headers}))
  throw error
 }
 try{
  const {kid}=await verifyRerGrant(request,claim,'runner-status')
  if(await env.DB.prepare('SELECT 1 FROM ik_door_revoked_keys WHERE installation_id=? AND kid=?').bind(DOOR_KEY,kid).first())
   return finishRequest(request,Response.json({error:'invalid_grant'},{status:403,headers}))
  const contact=await readContact(env.DB)
  return finishRequest(request,Response.json({state:state(contact.state),lastContactAt:contact.lastContactAt===null?null:new Date(contact.lastContactAt).toISOString()},{headers}))
 }catch(error){
  if(error instanceof DoorError)return finishRequest(request,Response.json({error:error.code},{status:error.status,headers}))
  throw error
 }
}
