import {readDeliveredMessages} from './mail-provider-fixture.mjs';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

// The local key gate: the development outbox answers only a request that holds the runtime's RER_DEV_KEY.
// Runtimes that a test starts itself get this key; installations that rer setup made have their own key file.
export const testDevKey='uptime-test-dev-key-abcdefghijklmnopqrstuvwxyz0123456789';
export const keyHeader=(key=testDevKey)=>({'x-rer-dev-key':key});
// Trade the key for the gate cookie in a browser context, as the RER_OPEN page does (works without JavaScript).
export async function openGate(context,origin,key=testDevKey){
 const response=await context.request.post(origin+'/__dev/key',{data:{key}});
 assert.equal(response.status(),204,'the key opens the outbox gate');
}
export async function readCheckoutKey(root){return /^RER_DEV_KEY=(\S+)$/m.exec(await readFile(join(root,'.rer/local/dev-key.env'),'utf8'))[1]}
// Explicit test-only installation settings; production launchers never import these.
export const testAuthBindings=Object.freeze({RER_DEV_KEY:testDevKey,
 SESSION_SECRET:randomBytes(32).toString('base64url'),
 SETUP_TOKEN:randomBytes(32).toString('base64url'),
 UPTIME_RUNNER_KEY:randomBytes(32).toString('base64url'),UPTIME_LOCAL_REVIEW:'true',
 OWNER_EMAIL:'operator@example.test',MAIL_PROVIDER:'development',MAIL_FROM:'Uptime <auth@example.test>',
});
export function authRequest(origin,fetcher=fetch){
 return (path,body,headers={})=>fetcher(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{host:new URL(origin).host,origin,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
export function sessionCookie(response){
 assert.equal(response.status,303,'Base issues a session only after successful owner admission');
 const cookie=response.headers.get('set-cookie');assert.ok(cookie,'Base session cookie required');assert.ok(/HttpOnly/.test(cookie),'Base session is HttpOnly');return cookie.split(';')[0];
}
export async function deliveredLink(call,{email,kind='magic'}){
 const all=await readDeliveredMessages();
 const entry=all.findLast(({message})=>message.personalizations.some(p=>p.to.some(to=>to.email===email)) && (kind==='invite'?message.subject.startsWith("You're invited"):message.subject.startsWith('Your sign-in link')));
 assert.ok(entry,'provider received the requested authentication message');
 return new URL(entry.text.match(/https?:\/\/[^\s]+/)[0]);
}
export async function finishSetup(origin,cookie,fetcher=fetch){
 const response=await fetcher(origin+'/setup',{method:'POST',redirect:'manual',headers:{host:new URL(origin).host,origin,cookie}});
 assert.equal(response.status,303,'owner completes the native first-run form');
 // An installation with no monitors lands on the first monitor's form; one with monitors on the list.
 assert.ok(['/app/monitors','/app/monitors/new'].includes(response.headers.get('location')),response.headers.get('location'));
}
export async function emailSignIn(origin,{bindings=testAuthBindings,fetcher=fetch}={}){
 const call=authRequest(origin,fetcher);
 assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL,returnTo:'/app'})).status,202,'Base accepted link request');
 const link=await deliveredLink(call,{email:bindings.OWNER_EMAIL,key:bindings.RER_DEV_KEY});
 assert.equal((await call(link.pathname+link.search)).status,200,'link preview does not consume');
 return sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
}
export async function signInOwner(origin,{bindings=testAuthBindings,fetcher=fetch,finishFirstRun=false}={}){
 const response=await authRequest(origin,fetcher)('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Test owner',returnTo:'/app'});
 const cookie=response.status===409?await emailSignIn(origin,{bindings,fetcher}):sessionCookie(response);
 if(finishFirstRun)await finishSetup(origin,cookie,fetcher);return cookie;
}
export async function browserSignIn(page,origin,{bindings=testAuthBindings,bootstrap=true}={}){
 if(bootstrap){
  // Bootstrap through Base, importing the returned cookie into this browser context.
  const response=await page.request.post(origin+'/auth/bootstrap',{headers:{origin},data:{token:bindings.SETUP_TOKEN,displayName:'Test owner',returnTo:'/app'},maxRedirects:0});
  assert.ok([303,409].includes(response.status()),'native bootstrap or already initialized');
  if(response.status()===303){await page.goto(origin+'/app');if(new URL(page.url()).pathname==='/setup')await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(url=>url.pathname.startsWith('/app'));return}
 }
 const call=authRequest(origin);
 assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL,returnTo:'/app'})).status,202);
 const link=await deliveredLink(call,{email:bindings.OWNER_EMAIL});
 await page.goto(link.href);
 await page.getByRole('button',{name:/confirm|sign in/i}).click();
 await page.waitForURL(url=>['/app/monitors','/app/monitors/new','/setup'].includes(url.pathname));
 if(new URL(page.url()).pathname==='/setup')await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.waitForURL(url=>url.pathname.startsWith('/app'));
}

// Node fetch owns Host; raw HTTP is necessary to exercise the incoming Host boundary.
export async function hostRequest(origin,path,host,extra={}){
 return new Promise((resolve,reject)=>{
  const request=httpRequest(origin+path,{headers:{host,...extra}},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve(new Response(body,{status:response.statusCode,headers:response.headers})));response.on('error',reject)});
  request.on('error',reject);request.end();
 });
}

// The Definitions view's transport, for HTTP journeys: the server names the file's source and returns its text with request
// secrets withheld, that text goes to the owner's import door (one NDJSON line, in checked chunks), the door plans and the
// view reads that plan, and a plan with nothing to apply is cancelled at once; apply posts the reviewed fingerprint until
// the job completes and reconciles; undo runs through the door.
export function definitionDoor({origin,cookie,fetcher=fetch}){
 const call=async(path,{body,headers={}}={})=>{const response=await fetcher(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie,...(body===undefined?{}:{'content-type':'application/json'}),...headers},body});return {status:response.status,body:await response.json().catch(()=>null)}};
 const door=(namespace,step,body)=>call('/api/operator/import/'+step,{body:JSON.stringify(body),headers:{'x-import-source':namespace}});
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 async function preview(file,source='auto'){
  const raw=typeof file==='string'||file instanceof Uint8Array?file:JSON.stringify(file);
  const recognised=await call('/api/definitions/recognise?source='+encodeURIComponent(source),{body:raw,headers:{'content-type':/^\s*[[{]/.test(Buffer.from(raw).toString('utf8'))?'application/json':'text/csv'}});
  if(recognised.status!==200)return recognised;
  const namespace=recognised.body.source==='uptime.monitors'?`uptime.monitors:${randomUUID()}`:recognised.body.source;
  const bytes=Buffer.from(JSON.stringify(recognised.body.text)+'\n'),totalChunks=Math.ceil(bytes.length/65536);let uploadId;
  for(let index=0;index<totalChunks;index++){const chunk=bytes.subarray(index*65536,(index+1)*65536),uploaded=await door(namespace,'uploads',{...(uploadId?{uploadId}:{}),name:'definitions.ndjson',bundleSha256:hash(bytes),totalBytes:bytes.length,totalChunks,index,chunkSha256:hash(chunk),base64:chunk.toString('base64')});if(uploaded.status!==200)return uploaded;uploadId=uploaded.body.uploadId}
  let plan=await door(namespace,'plan',{uploadId});
  if(plan.status===409&&plan.body?.error==='catchup_required')plan=await door(namespace,'plan',{uploadId,catchup:true});
  if(plan.status!==200)return plan;
  const view=await call('/api/definitions/plans/'+encodeURIComponent(plan.body.planId));
  if(view.status===200&&!view.body.applied&&(view.body.kind==='history'||!(view.body.counts.create+view.body.counts.change))){const cancelled=await door(namespace,'undo',{planId:plan.body.planId});if(cancelled.status!==200)return cancelled}
  return view;
 }
 async function until(namespace,step,body,state){
  for(let n=0;n<100;n++){const result=await door(namespace,step,body);if(result.status!==200||result.body.job?.state===state||!['queued','applying','undoing'].includes(result.body.job?.state))return result}
  throw Error(`${step} did not finish`);
 }
 async function apply(view,fingerprint=view.digest){
  const applied=await until(view.namespace,'apply',{planId:view.planId,reviewedFingerprint:fingerprint},'completed');
  if(applied.status!==200||applied.body.job.state!=='completed')return applied;
  const report=await door(view.namespace,'reconcile',{planId:view.planId});
  return {status:applied.status,body:{batchId:'business:'+view.planId,namespace:view.namespace,job:applied.body.job,report:report.body,
   created:view.entries.filter(e=>e.action==='create').map(e=>e.monitorId),changed:view.entries.filter(e=>e.action==='change').map(e=>e.monitorId)}};
 }
 const undo=batch=>until(batch.namespace,'undo',{planId:batch.batchId.slice('business:'.length)},'undone');
 return {call,door,preview,apply,undo};
}
