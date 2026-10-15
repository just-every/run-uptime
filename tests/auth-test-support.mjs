import {allDeliveredMessages} from './mail-provider-fixture.mjs';
import {randomBytes} from 'node:crypto';
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
 const all=allDeliveredMessages();
 const entry=all.findLast(({message})=>message.personalizations.some(p=>p.to.some(to=>to.email===email)) && (kind==='invite'?message.subject.startsWith("You're invited"):message.subject.startsWith('Your sign-in link')));
 assert.ok(entry,'provider received the requested authentication message');
 return new URL(entry.text.match(/https?:\/\/[^\s]+/)[0]);
}
export async function finishSetup(origin,cookie,fetcher=fetch){
 const response=await fetcher(origin+'/setup',{method:'POST',redirect:'manual',headers:{host:new URL(origin).host,origin,cookie}});
 assert.equal(response.status,303,'owner completes the native first-run form');
 assert.equal(response.headers.get('location'),'/app');
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
  if(response.status()===303){await page.goto(origin+'/app');if(new URL(page.url()).pathname==='/setup')await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.waitForURL(origin+'/app');return}
 }
 const call=authRequest(origin);
 assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL,returnTo:'/app'})).status,202);
 const link=await deliveredLink(call,{email:bindings.OWNER_EMAIL});
 await page.goto(link.href);
 await page.getByRole('button',{name:/confirm|sign in/i}).click();
 await page.waitForURL(url=>['/app','/setup'].includes(url.pathname));
 if(new URL(page.url()).pathname==='/setup')await page.getByRole('button',{name:'Finish setup',exact:true}).click();
 await page.waitForURL(origin+'/app');
}

// Node fetch owns Host; raw HTTP is necessary to exercise the incoming Host boundary.
export async function hostRequest(origin,path,host,extra={}){
 return new Promise((resolve,reject)=>{
  const request=httpRequest(origin+path,{headers:{host,...extra}},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve(new Response(body,{status:response.statusCode,headers:response.headers})));response.on('error',reject)});
  request.on('error',reject);request.end();
 });
}
