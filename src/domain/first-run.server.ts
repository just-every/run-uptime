import {operatorSession,authFailure} from './operator-auth.server.ts'
import {setupDocument,type StartSite} from './setup-document.server.ts'
import {drillOverview} from './alert-drills.server.ts'
import {ensureDiscovery} from './discovery.server.ts'
import type {Bindings} from './control.server.ts'
// @ts-ignore Edition URL validation is JavaScript.
import {publicTarget} from './public-target.mjs'

export const setupRedirect = () => new Response(null,{status:303,headers:{location:'/setup','cache-control':'no-store'}})
export async function firstRunComplete(env:Pick<Bindings,'DB'>){
 return Boolean(await env.DB.prepare('SELECT completed_at FROM uptime_first_run WHERE id=1').first())
}
const FORM_LIMIT=16384
const BAD_SITE='Use a public website address, such as example.com or https://example.com/shop. An address with a password, or on a private network, cannot be checked.'
// The optional field of the native first-run form: empty when the request carries no form, null when the form is too large to be one.
async function typedSite(request:Request){
 if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/x-www-form-urlencoded'))return ''
 const text=await request.text();
 return text.length>FORM_LIMIT?null:(new URLSearchParams(text).get('start_url')??'').trim()
}
const withScheme=(value:string)=>value.includes('://')?value:`https://${value}`
const redirect=(location:string)=>new Response(null,{status:303,headers:{location,'cache-control':'no-store'}})
export async function firstRun(env:Bindings,request:Request){
 try{
  if(!['GET','HEAD','POST'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD, POST','cache-control':'no-store'}})
  if(request.method==='POST'&&(request.headers.get('origin')!==env.UPTIME_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site'))return new Response('Same origin required',{status:403,headers:{'cache-control':'no-store'}})
  const owner=await operatorSession(env,request)
  if(!owner)return new Response(null,{status:303,headers:{location:'/login?returnTo=%2Fsetup','cache-control':'no-store'}})
  if(await firstRunComplete(env))return redirect('/app')
  // A website set at installation is the owner's answer; otherwise the form may carry one. Either way one discovery job asks the owner's runner to look.
  const configured=env.UPTIME_START_URL
  let site:StartSite=configured?{checking:configured}:{},status=200
  if(request.method==='POST'){
   const typed=configured?'':await typedSite(request),address=configured??(typed?withScheme(typed):undefined)
   let valid=typed!==null;if(valid&&address)try{publicTarget(address)}catch{valid=false}
   if(valid){
    const job=address?await ensureDiscovery(env,address):undefined
    const completed=await env.DB.prepare('INSERT INTO uptime_first_run(id,completed_at) VALUES(1,?) ON CONFLICT(id) DO NOTHING').bind(Date.now()).run()
    return redirect(completed.meta.changes&&job?`/app/monitor?discovery=${job}`:'/app')
   }
   site={entered:typed??'',problem:BAD_SITE};status=400
  }else if(configured&&request.method==='GET')await ensureDiscovery(env,configured)
  const proof=await drillOverview(env),rows=await env.DB.prepare('SELECT id,name,kind FROM notification_destinations WHERE deleted_at IS NULL ORDER BY created_at,id').all<{id:string;name:string;kind:string}>()
  const response=setupDocument(owner.operator.displayName,rows.results.map(d=>({...d,...proof(d.id).proof})),site,status)
  return request.method==='HEAD'?new Response(null,{headers:response.headers}):response
 }catch(error){
  // A full job queue is the one plain refusal the owner can act on; everything else keeps the authentication failure shape.
  if((error as {status?:number})?.status===429)return new Response((error as Error).message,{status:429,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}})
  return authFailure(error)
 }
}
