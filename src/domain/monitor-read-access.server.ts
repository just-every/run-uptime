import {authenticatedSession,type AuthBindings} from './operator-auth.server.ts'
// @ts-ignore Edition permission vocabulary is JavaScript.
import {permitted} from './role-permissions.mjs'

// Re-read Base authority for every request: role/status/version, session expiry
// and revocation are never cached in the edition or taken from client claims.
export async function monitorReadSession(env:AuthBindings,request:Request){
 const session=await authenticatedSession(env,request)
 return Boolean(session&&permitted(session.operator.role,'monitor:summary:read'))
}
