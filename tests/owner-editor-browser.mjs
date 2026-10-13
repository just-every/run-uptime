import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {admissionRuntime} from './admission-runtime.mjs';
import {managementEdge} from './editor-management-edge.mjs';
import {signInOwner,outboxSignIn,outboxLink,sessionCookie,testAuthBindings} from './auth-test-support.mjs';
const edge=await managementEdge();
let app,browser;
const evidence=process.env.UPTIME_ADMISSION_EVIDENCE??'data/wave-b-evidence';
try {
 app=await admissionRuntime({RER_MANAGEMENT_ORIGIN:edge.origin,RER_INSTALLATION_ID:'uptime-browser-admission'});
 edge.state.allowed=app.origin;
 assert.equal((await app.call('/api/editor/config')).status,403,'anonymous requests receive no editor configuration');
 let cookie=await signInOwner(app.origin,{finishFirstRun:true});
 const config=await app.call('/api/editor/config',undefined,{cookie});
 assert.equal(config.status,200);assert.match(config.headers.get('cache-control'),/no-store/);assert.match(config.headers.get('vary'),/Cookie/i);
 const grant=await config.json();assert.equal(grant.config.managementOrigin,edge.origin);
 assert.ok(!JSON.stringify(grant).includes(testAuthBindings.SESSION_SECRET));
 const primary=(await (await app.call('/auth/session',undefined,{cookie})).json()).operator.id;
 const invite=async(role,email)=>{assert.equal((await app.call('/auth/invite',{email,displayName:'Editor test operator',role},{cookie})).status,202);const link=await outboxLink(app.call,{email,kind:'invite'});return sessionCookie(await app.call('/auth/confirm',{token:link.searchParams.get('token')}))};
 const memberCookie=await invite('member','member@example.test');
 // Inviting an owner needs an email proof from the last ten minutes; the first-owner bootstrap session carries none.
 cookie=await outboxSignIn(app.origin);
 const secondOwner=await invite('owner','other-owner@example.test');
 assert.equal((await app.call('/api/editor/config',undefined,{cookie:memberCookie})).status,403,'a native member session has no editor authority');
 const document=await app.call('/app',undefined,{cookie});
 assert.match(document.headers.get('content-security-policy'),new RegExp(`frame-ancestors 'self' ${edge.origin.replaceAll('.','\\.')}`));
 await mkdir(evidence,{recursive:true});browser=await chromium.launch({headless:true,args:['--disable-gpu']});
 const results=[];
 for(const width of [1440,390]) {
  cookie=await outboxSignIn(app.origin);
  const context=await browser.newContext({viewport:{width,height:900}});
  try {
   const [name,value]=cookie.split('=');await context.addCookies([{name,value,url:app.origin,httpOnly:true,sameSite:'Lax'}]);
   const page=await context.newPage();await page.goto(app.origin+'/app');
   const host=page.locator('[data-rer-editor]');await host.waitFor();
   await page.waitForFunction(()=>document.querySelector('[data-rer-editor]')?.getAttribute('data-connection')==='connected');
   const launcher=host.getByRole('button',{name:'Open Run Edit Run'});await launcher.click();
   const frame=host.locator('iframe');await frame.waitFor({state:'visible'});
   const bounds=await frame.boundingBox();assert.equal(Math.round(bounds.width),width);assert.ok(bounds.x>=0&&bounds.y>=0);
   await page.screenshot({path:join(evidence,`editor-${width}.png`)});
   await page.goto(app.origin+'/app/monitor');await page.locator('[data-rer-editor]').waitFor();
   // Native role loss is checked through the product route, then focus revokes immediately.
   assert.equal((await app.call('/auth/operator/role',{operatorId:primary,role:'member'},{cookie:secondOwner})).status,200);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.waitForFunction(()=>!document.querySelector('[data-rer-editor]'));
   assert.equal((await app.call('/api/editor/config',undefined,{cookie})).status,403);
   assert.equal((await app.call('/auth/operator/role',{operatorId:primary,role:'owner'},{cookie:secondOwner})).status,200);
   // Version changes revoke the old native session, so use a real outbox sign-in.
   const fresh=await outboxSignIn(app.origin), [freshName,freshValue]=fresh.split('=');
   await context.addCookies([{name:freshName,value:freshValue,url:app.origin,httpOnly:true,sameSite:'Lax'}]);
   edge.state.denied=true;const violations=[];page.on('console',message=>{if(message.type()==='error'&&/frame-ancestors|framing/i.test(message.text()))violations.push(true)});
   await page.goto(app.origin+'/app');await page.locator('[data-rer-editor]').waitFor();
   await page.waitForFunction(()=>document.querySelector('[data-rer-editor]')?.getAttribute('data-connection')!=='connected');
   await new Promise(resolve=>setTimeout(resolve,1000));assert.ok(violations.length,'Chromium enforces management frame-ancestors refusal');
   edge.state.denied=false;
   results.push({width,nativeOwner:true,memberRefused:true,roleLossRevoked:true,cspRefusal:true});
  } finally {await context.close()}
 }
 await writeFile(join(evidence,'RESULTS.json'),JSON.stringify({results,externalNetwork:false,scope:'Real emitted Uptime and Base editor, local management network edge; hosted service acceptance remains with the owner.'},null,2));
 console.log('OWNER-EDITOR passed: native owner config, anonymous/member refusal, 1440/390 mount, route transition, role-loss revocation and browser CSP refusal.');
} finally {await browser?.close();await app?.close();await edge.close()}
