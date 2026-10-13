import branding from '../branding.json' with {type:'json'}
import {documentHeaders,escapeHtml,notFoundDocument,shellDocument} from './document-shell.server.ts'
import {drillForToken,confirmDrill} from './alert-drills.server.ts'
import type {Bindings} from './control.server.ts'
// The recipient's page for an alert drill link. No sign-in: the person who received the alert may not be an operator.
// Opening the link (GET) only shows the page, so mail scanners and link prefetchers cannot confirm; the Confirm button
// posts the token back. Unknown, used, expired and foreign tokens all get the ordinary 404 page. The page names only
// the destination kind and the drill time.
const style=`button{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin:0 0 28px;padding:0 24px;border:0;border-radius:999px;background:${branding.primaryColor};color:#fff;font:600 17px/1 var(--sans);cursor:pointer;box-shadow:0 1px 1px rgba(20,32,74,.12),0 10px 24px -12px rgba(20,32,74,.55)}
button:hover{background:var(--ink-hover)}
button:focus-visible{outline-offset:4px}`;
// same-origin, not no-referrer: under no-referrer browsers send `Origin: null` on the form POST, which the origin check refuses.
const headers={...documentHeaders,'referrer-policy':'same-origin','x-robots-tag':'noindex','x-content-type-options':'nosniff'};
const kindLabel=(kind:string)=>kind==='webhook'?'signed JSON webhook':kind==='slack'?'Slack':'email';
const when=(value:number)=>escapeHtml(new Date(value).toUTCString());
const page=(card:string,status=200)=>new Response(shellDocument({title:'Alert drill',style,card}),{status,headers});
export async function alertDrillDocument(env:Bindings,request:Request){
 if(!['GET','HEAD','POST'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD, POST','cache-control':'no-store'}});
 if(request.method==='POST'){
  if(request.headers.get('origin')!==env.UPTIME_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site')return new Response('Same origin required',{status:403,headers:{'cache-control':'no-store'}});
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/x-www-form-urlencoded'||Number(request.headers.get('content-length')??0)>1024)return notFoundDocument();
  const text=await request.text();if(text.length>1024)return notFoundDocument();
  const confirmed=await confirmDrill(env,new URLSearchParams(text).get('token'));if(!confirmed)return notFoundDocument();
  return page(`<h1>Thank you</h1><p>Your confirmation was recorded at ${when(confirmed.confirmedAt)}. The owner will see that the drill sent to this ${kindLabel(confirmed.kind)} destination was reported received by its recipient.</p><p>Nothing else changed. You can close this page.</p>`);
 }
 const token=new URL(request.url).searchParams.get('token'),drill=await drillForToken(env,token);
 if(!drill)return notFoundDocument();
 const response=page(`<h1>Alert drill</h1><p>This ${kindLabel(drill.kind)} destination was sent an alert drill from ${escapeHtml(branding.name)} at ${when(drill.started_at)}. It was a practice alert, not an incident.</p><p>If the drill reached you, press Confirm. That tells the owner a person received it. It does not change any monitor.</p><form method="post" action="/alert-drill"><input type="hidden" name="token" value="${escapeHtml(token!)}"><button type="submit">Confirm I received this drill</button></form><p>The link works once and expires 24 hours after the drill was sent.</p>`);
 return request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
}
