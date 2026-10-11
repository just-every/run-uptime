import {createOwnerClaimHandler, OwnerClaimError} from '../base/modules/owner-claim/index.mjs'
import {type AuthBindings, authFailure} from './operator-auth.server.ts'

/** Deployment bindings are the authority; the request supplies only the signature. */
export async function ownerClaim(env:AuthBindings, request:Request) {
 try {
  return await createOwnerClaimHandler({
   db:env.DB,
   authConfig:{origin:env.UPTIME_ORIGIN!,local:env.UPTIME_LOCAL_REVIEW==='true',OWNER_EMAIL:env.OWNER_EMAIL!,SESSION_SECRET:env.SESSION_SECRET!,SETUP_TOKEN:env.SETUP_TOKEN!},
   clientIp:request=>env.UPTIME_LOCAL_REVIEW==='true'?'loopback':request.headers.get('CF-Connecting-IP')??'',
   issuer:env.RER_OWNER_CLAIM_ISSUER!,installationId:env.RER_OWNER_CLAIM_INSTALLATION_ID!,
   appOrigin:env.RER_OWNER_CLAIM_APP_ORIGIN!,expectedEmail:env.OWNER_EMAIL!,
   publicKeys:JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS??'null'),
  })(request)
 } catch(error) {
  if(error instanceof OwnerClaimError)return Response.json({error:error.code},{status:error.status,headers:{'cache-control':'no-store'}})
  return authFailure(error)
 }
}
