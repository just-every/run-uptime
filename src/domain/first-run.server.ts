import {runnerRuntime} from './private-runner.ts'
import {ensureFirstRunner,listRunners} from './runner-registration.server.ts'
import {authenticatedSession,authFailure} from './operator-auth.server.ts'
import {accessDeniedDocument} from './access-document.server.ts'
import {setupDocument,type StartSite} from './setup-document.server.ts'
import {externalCheckUrl,saveExternalCheck} from './external-check.server.ts'
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
// The external check URL is not asked here; it is set in Settings. An installation that has none takes this one, so a
// monitor on one location can still confirm an outage.
const DEFAULT_EXTERNAL='https://example.org/'
// The optional field of the native first-run form: empty when the request carries no form or the owner chose Skip, null
// when the form is too large to be one.
async function typedSite(request:Request){
 if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/x-www-form-urlencoded'))return ''
 const text=await request.text(),form=new URLSearchParams(text);
 return text.length>FORM_LIMIT?null:form.get('skip')?'':(form.get('start_url')??'').trim()
}
const withScheme=(value:string)=>value.includes('://')?value:`https://${value}`
const redirect=(location:string)=>new Response(null,{status:303,headers:{location,'cache-control':'no-store'}})
export async function firstRun(env:Bindings,request:Request){
 try{
  if(!['GET','HEAD','POST'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD, POST','cache-control':'no-store'}})
  if(request.method==='POST'&&(request.headers.get('origin')!==env.UPTIME_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site'))return new Response('Same origin required',{status:403,headers:{'cache-control':'no-store'}})
  const owner=await authenticatedSession(env,request)
  if(!owner)return new Response(null,{status:303,headers:{location:'/login?returnTo=%2Fsetup','cache-control':'no-store'}})
  if(owner.operator.role!=='owner')return accessDeniedDocument(owner.operator.displayName,request.method==='HEAD')
  if(await firstRunComplete(env))return redirect('/app')
  // A website set at installation is the owner's answer; otherwise the form may carry one. Either way one discovery job asks the owner's runner to look.
  const first=await ensureFirstRunner(env);
  const runtime=runnerRuntime(env,await listRunners(env)),canDiscover=!runtime.hosted||runtime.privateRunnerReady;
  // The first location's name shows once its runner has reached Uptime: the place it runs from, or its generated name.
  const place=first.last_contact_at!==null?first.network_label:null;
  const configured=env.UPTIME_START_URL;
  let site:StartSite=configured&&canDiscover?{checking:configured}:{},status=200
  if(request.method==='POST'){
   const typed=await typedSite(request),address=canDiscover?configured??(typed?withScheme(typed):undefined):undefined;
   let valid=typed!==null;
   if(valid&&address)try{publicTarget(address)}catch{valid=false}
   if(valid){
    const saved=await externalCheckUrl(env);
    if(!saved||saved==='https://example.com/')await saveExternalCheck(env,JSON.stringify({url:DEFAULT_EXTERNAL}));
    const job=address?await ensureDiscovery(env,address):undefined
    const completed=await env.DB.prepare('INSERT INTO uptime_first_run(id,completed_at) VALUES(1,?) ON CONFLICT(id) DO NOTHING').bind(Date.now()).run()
    // With no monitors yet, setup lands on the new-monitor form ("Add your first monitor") rather than an empty list.
    const empty=!(await env.DB.prepare('SELECT 1 FROM monitors LIMIT 1').first())
    return redirect(completed.meta.changes&&job?`/app/monitor?discovery=${job}`:empty?'/app/monitor?first=1':'/app')
   }
   site={entered:typed??'',problem:BAD_SITE};status=400
  }else if(configured&&canDiscover&&request.method==='GET')await ensureDiscovery(env,configured)
  const response=setupDocument(owner.operator.displayName,site,status,{place,askSite:canDiscover})
  return request.method==='HEAD'?new Response(null,{headers:response.headers}):response
 }catch(error){
  // A full job queue is the one plain refusal the owner can act on; everything else keeps the authentication failure shape.
  if((error as {status?:number})?.status===429)return new Response((error as Error).message,{status:429,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}})
  return authFailure(error)
 }
}
