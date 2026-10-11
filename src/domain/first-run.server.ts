import {operatorSession,authFailure,type AuthBindings} from './operator-auth.server.ts'
import {setupDocument} from './setup-document.server.ts'

export const setupRedirect = () => new Response(null,{status:303,headers:{location:'/setup','cache-control':'no-store'}})
export async function firstRunComplete(env:AuthBindings){
 return Boolean(await env.DB.prepare('SELECT completed_at FROM uptime_first_run WHERE id=1').first())
}
export async function firstRun(env:AuthBindings,request:Request){
 try{
  if(!['GET','HEAD','POST'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD, POST','cache-control':'no-store'}})
  if(request.method==='POST'&&(request.headers.get('origin')!==env.UPTIME_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site'))return new Response('Same origin required',{status:403,headers:{'cache-control':'no-store'}})
  const owner=await operatorSession(env,request)
  if(!owner)return new Response(null,{status:303,headers:{location:'/login?returnTo=%2Fsetup','cache-control':'no-store'}})
  if(request.method==='POST')await env.DB.prepare('INSERT INTO uptime_first_run(id,completed_at) VALUES(1,?) ON CONFLICT(id) DO NOTHING').bind(Date.now()).run()
  if(await firstRunComplete(env))return new Response(null,{status:303,headers:{location:'/app','cache-control':'no-store'}})
  const response=setupDocument(owner.operator.displayName)
  return request.method==='HEAD'?new Response(null,{headers:response.headers}):response
 }catch(error){return authFailure(error)}
}
