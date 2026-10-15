import {runnerRuntime} from './private-runner.ts'
import {ensureFirstRunner,listRunners} from './runner-registration.server.ts'
import {authenticatedSession,authFailure} from './operator-auth.server.ts'
import {accessDeniedDocument} from './access-document.server.ts'
import {setupDocument,type StartSite} from './setup-document.server.ts'
import {drillOverview} from './alert-drills.server.ts'
import {externalCheckUrl,saveExternalCheck} from './external-check.server.ts'
import {sameSite} from './runner-registration.server.ts'
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
 if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/x-www-form-urlencoded'))return {site:'',external:null}
 const text=await request.text(),form=new URLSearchParams(text);
 return text.length>FORM_LIMIT?null:{site:(form.get('start_url')??'').trim(),external:form.get('external_check_url')}
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
  await ensureFirstRunner(env);
  const runtime=runnerRuntime(env,await listRunners(env)),canDiscover=!runtime.hosted||runtime.privateRunnerReady;
  const configured=env.UPTIME_START_URL,savedExternal=await externalCheckUrl(env);
  // First-run's visible default is independent of the suggested example.com target.
  let external=savedExternal&&savedExternal!=='https://example.com/'?savedExternal:'https://example.org/'
  let site:StartSite=configured&&canDiscover?{checking:configured}:{},status=200
  if(request.method==='POST'){
   const form=await typedSite(request),typed=form?.site??'',address=(canDiscover?configured:undefined)??(typed?withScheme(typed):undefined);
   if(form?.external!==null&&form?.external!==undefined)external=form.external.trim();
   let valid=form!==null,problem=BAD_SITE;
   if(address&&!canDiscover){valid=false;problem='Website discovery needs a connected private runner. Start the command below, or leave the website empty and add a public monitor in the console.'}if(valid&&address)try{publicTarget(address)}catch{valid=false}
   if(valid&&form?.external!==null)try{publicTarget(external);if(address&&sameSite(external,address))throw Error('same-site')}catch{valid=false;problem='Choose an External check URL on a different public website from the one you monitor, using the field below.'}
   if(valid){
    if(form?.external!==null)await saveExternalCheck(env,JSON.stringify({url:external}));
    const job=address?await ensureDiscovery(env,address):undefined
    const completed=await env.DB.prepare('INSERT INTO uptime_first_run(id,completed_at) VALUES(1,?) ON CONFLICT(id) DO NOTHING').bind(Date.now()).run()
    return redirect(completed.meta.changes&&job?`/app/monitor?discovery=${job}`:'/app')
   }
   site={entered:typed,problem};status=400
  }else if(configured&&canDiscover&&request.method==='GET')await ensureDiscovery(env,configured)
  const proof=await drillOverview(env),rows=await env.DB.prepare('SELECT id,name,kind FROM notification_destinations WHERE deleted_at IS NULL ORDER BY created_at,id').all<{id:string;name:string;kind:string}>()
  const response=setupDocument(owner.operator.displayName,rows.results.map(d=>({...d,...proof(d.id).proof})),site,status,external,runtime)
  return request.method==='HEAD'?new Response(null,{headers:response.headers}):response
 }catch(error){
  // A full job queue is the one plain refusal the owner can act on; everything else keeps the authentication failure shape.
  if((error as {status?:number})?.status===429)return new Response((error as Error).message,{status:429,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}})
  return authFailure(error)
 }
}
