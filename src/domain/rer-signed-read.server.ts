import type {Bindings} from './control.server.ts'
import {verifyRerGrant,DoorError} from '../base/modules/import-kit/src/door/index.ts'
import {OwnerClaimError} from '../base/modules/owner-claim/verify.mjs'
import {businessClaim,DOOR_KEY} from './business-import/context.server.ts'
import {finishRequest} from './business-import/door.server.ts'

const headers={'cache-control':'no-store'}

/**
 * Run Edit Run's signed reads outside the import door (`POST /api/rer/<action>`). Only POST is answered (405). Without
 * Run Edit Run's owner-claim trust (self-host) there is no signer, so the route does not exist (404). The grant is an
 * RER-signed grant of exactly this action for this installation under its owner-claim key ring (401 unsigned, 403
 * otherwise); a key the owner revoked in Business imports is refused (403). `answer` runs only for a verified grant.
 */
export async function rerSignedRead(env:Bindings,request:Request,action:string,answer:()=>Promise<Response>){
 if(request.method!=='POST')return finishRequest(request,Response.json({error:'method_not_allowed'},{status:405,headers:{...headers,allow:'POST'}}))
 let claim:ReturnType<typeof businessClaim>
 try{claim=businessClaim(env)}catch(error){
  if(error instanceof OwnerClaimError)return finishRequest(request,Response.json({error:'not_found'},{status:404,headers}))
  throw error
 }
 try{
  const {kid}=await verifyRerGrant(request,claim,action)
  if(await env.DB.prepare('SELECT 1 FROM ik_door_revoked_keys WHERE installation_id=? AND kid=?').bind(DOOR_KEY,kid).first())
   return finishRequest(request,Response.json({error:'invalid_grant'},{status:403,headers}))
  return finishRequest(request,await answer())
 }catch(error){
  if(error instanceof DoorError)return finishRequest(request,Response.json({error:error.code},{status:error.status,headers}))
  throw error
 }
}
export const signedReadAnswer=(body:unknown,status=200)=>Response.json(body,{status,headers})
