import type {AuthBindings} from './operator-auth.server.ts'
// An email alert to the installation owner's own sign-in address gives nobody access they did not already have, so
// creating it needs no fresh second factor; every other address or URL still does. Changing that sign-in address
// itself needs a fresh proof (Base email change), so a stale session cannot point it somewhere else first.
export async function ownersOwnAlert(env:AuthBindings,request:Request,input:any){
 if(request.method!=='POST'||new URL(request.url).pathname!=='/api/notifications/destinations')return false
 if(input?.kind!=='email'||typeof input.address!=='string')return false
 return Boolean(await env.DB.prepare("SELECT 1 FROM oa_operators WHERE role='owner' AND status='active' AND email=?").bind(input.address.toLowerCase()).first())
}
