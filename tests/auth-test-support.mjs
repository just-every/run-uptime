import {request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';

// Explicit test-only installation settings; production launchers never import these.
export const testAuthBindings=Object.freeze({
 SESSION_SECRET:'test-only-session-secret-uptime-local-0001',
 SETUP_TOKEN:'test-only-setup-secret-uptime-local-000001',
 OWNER_EMAIL:'operator@example.test',MAIL_PROVIDER:'development',MAIL_FROM:'Uptime <auth@example.test>',
});
export function authRequest(origin,fetcher=fetch){
 return (path,body,headers={})=>fetcher(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{host:new URL(origin).host,origin,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
export function sessionCookie(response){
 assert.equal(response.status,303,'Base issues a session only after successful owner admission');
 const cookie=response.headers.get('set-cookie');assert.ok(cookie,'Base session cookie required');assert.ok(/HttpOnly/.test(cookie),'Base session is HttpOnly');return cookie.split(';')[0];
}
export async function outboxLink(call){
 const listing=await call('/__dev/outbox');assert.equal(listing.status,200,'development outbox available');
 const match=(await listing.text()).match(/href="([^\"]+\?message=[^\"]+)"/);assert.ok(match,'captured message exists');
 const detail=await call(match[1].replaceAll('&amp;','&'));assert.equal(detail.status,200);
 const link=(await detail.text()).match(/class="open" href="([^\"]+)"/);assert.ok(link,'captured message contains sign-in link');
 return new URL(link[1].replaceAll('&amp;','&'));
}
export async function finishSetup(origin,cookie,fetcher=fetch){
 const response=await fetcher(origin+'/setup',{method:'POST',redirect:'manual',headers:{host:new URL(origin).host,origin,cookie}});
 assert.equal(response.status,303,'owner completes the native first-run form');
 assert.equal(response.headers.get('location'),'/app');
}
export async function outboxSignIn(origin,{bindings=testAuthBindings,fetcher=fetch}={}){
 const call=authRequest(origin,fetcher);
 assert.equal((await call('/auth/magic-link',{email:bindings.OWNER_EMAIL,returnTo:'/app'})).status,202,'Base accepted link request');
 const link=await outboxLink(call);
 assert.equal((await call(link.pathname+link.search)).status,200,'link preview does not consume');
 return sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
}
export async function signInOwner(origin,{bindings=testAuthBindings,fetcher=fetch,finishFirstRun=false}={}){
 const response=await authRequest(origin,fetcher)('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Test owner',returnTo:'/app'});
 const cookie=response.status===409?await outboxSignIn(origin,{bindings,fetcher}):sessionCookie(response);
 if(finishFirstRun)await finishSetup(origin,cookie,fetcher);return cookie;
}
export async function browserSignIn(page,origin,{bindings=testAuthBindings,bootstrap=true}={}){
 if(bootstrap){
  // Bootstrap through Base, importing the returned cookie into this browser context.
  const response=await page.request.post(origin+'/auth/bootstrap',{headers:{origin},data:{token:bindings.SETUP_TOKEN,displayName:'Test owner',returnTo:'/app'},maxRedirects:0});
  assert.ok([303,409].includes(response.status()),'native bootstrap or already initialized');
  if(response.status()===303){await page.goto(origin+'/app');if(new URL(page.url()).pathname==='/setup')await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.waitForURL(origin+'/app');return}
 }
 await page.goto(origin+'/login');
 await page.getByLabel('Email address').fill(bindings.OWNER_EMAIL);
 await page.getByRole('button',{name:'Send sign-in link'}).click();
 await page.getByRole('link',{name:'Open development outbox'}).click();
 await page.getByRole('link',{name:'Read message'}).first().click();
 await page.getByRole('link',{name:'Open this link'}).click();
 await page.getByRole('button',{name:/confirm|sign in/i}).click();
 await page.waitForURL(url=>['/app','/setup'].includes(url.pathname));
 if(new URL(page.url()).pathname==='/setup')await page.getByRole('button',{name:'Finish setup',exact:true}).click();
 await page.waitForURL(origin+'/app');
}

// Node fetch owns Host; raw HTTP is necessary to exercise the incoming Host boundary.
export async function hostRequest(origin,path,host){
 return new Promise((resolve,reject)=>{
  const request=httpRequest(origin+path,{headers:{host}},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve(new Response(body,{status:response.statusCode,headers:response.headers})));response.on('error',reject)});
  request.on('error',reject);request.end();
 });
}
