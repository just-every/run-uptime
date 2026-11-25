import type {AuthBindings} from './operator-auth.server.ts'
// An email alert to the installation owner's own sign-in address gives nobody access they did not already have, so
// creating one, or pointing an email destination back at it, needs no fresh second factor; every other address or URL
// still does. Changing that sign-in address itself needs a fresh proof (Base email change), so a stale session cannot
// point it somewhere else first. The compare is exact: Base stores the sign-in address normalised.
export async function ownersOwnAlert(env:AuthBindings,request:Request,input:any){
 if(!input||typeof input!=='object'||typeof input.address!=='string')return false
 const path=new URL(request.url).pathname
 const create=request.method==='POST'&&path==='/api/notifications/destinations'&&input.kind==='email'
 const repoint=request.method==='PATCH'&&/^\/api\/notifications\/destinations\/[^/]+$/.test(path)&&!Object.hasOwn(input,'url')
 if(!create&&!repoint)return false
 return Boolean(await env.DB.prepare("SELECT 1 FROM oa_operators WHERE role='owner' AND status='active' AND email=?").bind(input.address).first())
}
