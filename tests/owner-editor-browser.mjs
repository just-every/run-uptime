import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {admissionRuntime} from './admission-runtime.mjs';
import {managementEdge} from './editor-management-edge.mjs';
import {signInOwner,emailSignIn,deliveredLink,sessionCookie,testAuthBindings} from './auth-test-support.mjs';
const edge=await managementEdge();
let app,browser;
const evidence=process.env.UPTIME_ADMISSION_EVIDENCE??'data/wave-b-evidence';
try {
 const editorBindings={RER_MANAGEMENT_ORIGIN:edge.origin,RER_INSTALLATION_ID:'uptime-browser-admission'};
 app=await admissionRuntime(editorBindings);
 edge.state.allowed=app.origin;
 assert.equal((await app.call('/api/editor/config')).status,403,'anonymous requests receive no editor configuration');
 let cookie=await signInOwner(app.origin,{finishFirstRun:true});
 const config=await app.call('/api/editor/config',undefined,{cookie});
 assert.equal(config.status,200);assert.match(config.headers.get('cache-control'),/no-store/);assert.match(config.headers.get('vary'),/Cookie/i);
 const grant=await config.json();assert.equal(grant.config.managementOrigin,edge.origin);
 assert.ok(!JSON.stringify(grant).includes(testAuthBindings.SESSION_SECRET));
 const primary=(await (await app.call('/auth/session',undefined,{cookie})).json()).operator.id;
 const invite=async(role,email)=>{assert.equal((await app.call('/auth/invite',{email,displayName:'Editor test operator',role},{cookie})).status,202);const link=await deliveredLink(app.call,{email,kind:'invite'});return sessionCookie(await app.call('/auth/confirm',{token:link.searchParams.get('token')}))};
 const memberCookie=await invite('member','member@example.test');
 // Inviting an owner needs an email proof from the last ten minutes; the first-owner bootstrap session carries none.
 cookie=await emailSignIn(app.origin);
 const secondOwner=await invite('owner','other-owner@example.test');
 assert.equal((await app.call('/api/editor/config',undefined,{cookie:memberCookie})).status,403,'a native member session has no editor authority');
 const enabledBindings={...editorBindings};
 for(const name of Object.keys(editorBindings))delete editorBindings[name];
 await app.restart();
 assert.equal((await app.call('/api/editor/config')).status,403,'disabled editor never bypasses anonymous denial');
 assert.equal((await app.call('/api/editor/config',undefined,{cookie:memberCookie})).status,403,'disabled editor never bypasses member denial');
 const disabled=await app.call('/api/editor/config',undefined,{cookie});
 assert.equal(disabled.status,204,'wholly absent optional editor configuration is disabled');
 assert.match(disabled.headers.get('cache-control'),/no-store, private/);assert.match(disabled.headers.get('vary'),/Cookie/i);
 assert.equal(await disabled.text(),'','disabled editor issues no grant');
 assert.equal((await app.call('/api/editor/config',{},{cookie})).status,405,'disabled editor preserves the owner method guard');
 for(const bindings of [{RER_MANAGEMENT_ORIGIN:edge.origin},{RER_INSTALLATION_ID:enabledBindings.RER_INSTALLATION_ID},{...enabledBindings,RER_MANAGEMENT_ORIGIN:'invalid'}]) {
  await assert.rejects(()=>admissionRuntime(bindings),/Invalid or missing configuration: RER_MANAGEMENT_ORIGIN|Invalid or missing configuration: RER_INSTALLATION_ID/,'partial/malformed settings still refuse runtime startup');
 }
 Object.assign(editorBindings,enabledBindings,{RER_INSTALLATION_ID:'invalid/id'});await app.restart();
 assert.equal((await app.call('/api/editor/config')).status,403,'invalid grant configuration still requires authorization');
 assert.equal((await app.call('/api/editor/config',undefined,{cookie:memberCookie})).status,403);
 assert.equal((await app.call('/api/editor/config',undefined,{cookie})).status,503,'malformed grant configuration cannot issue an owner grant');
 Object.assign(editorBindings,enabledBindings);await app.restart();
 const document=await app.call('/app',undefined,{cookie});
 assert.match(document.headers.get('content-security-policy'),new RegExp(`frame-ancestors 'self' ${edge.origin.replaceAll('.','\\.')}`));
 await mkdir(evidence,{recursive:true});browser=await chromium.launch({headless:true,args:['--disable-gpu']});
 const results=[];
 for(const width of [1440,390]) {
  cookie=await emailSignIn(app.origin);
  const context=await browser.newContext({viewport:{width,height:900}});
  try {
   const [name,value]=cookie.split('=');await context.addCookies([{name,value,url:app.origin,httpOnly:true,sameSite:'Lax'}]);
   const page=await context.newPage(),renewals=[],nativeChecks=[];
   page.on('response',async response=>{
    if(response.url()===app.origin+'/api/editor/config'&&response.status()===200)renewals.push({at:Date.now(),...(await response.json())});
    if(response.url()===app.origin+'/auth/session'&&response.status()===200)nativeChecks.push(Date.now());
   });
   await page.goto(app.origin+'/app');
   const host=page.locator('[data-rer-editor]');await host.waitFor();
   await page.waitForFunction(()=>document.querySelector('[data-rer-editor]')?.getAttribute('data-connection')==='connected');
   const launcher=host.getByRole('button',{name:'Open Run Edit Run'});await launcher.click();
   const frame=host.locator('iframe');await frame.waitFor({state:'visible'});
   const bounds=await frame.boundingBox();assert.equal(Math.round(bounds.width),width);assert.ok(bounds.x>=0&&bounds.y>=0);
   // Observe real 20-second revalidation twice, including past the original
   // 30-second grant. Do not drive focus events or shorten production leases.
   const initial=renewals.at(-1);assert.ok(initial,'initial owner grant observed');
   const originalFrame=await frame.elementHandle(),editorFrame=await originalFrame.contentFrame();
   const marker=`private-draft-${width}`;
   await editorFrame.evaluate(value=>{
    window.renewalDocument=document;
    const draft=document.createElement('textarea');draft.id='renewal-private-draft';draft.value=value;document.body.append(draft);
   },marker);
   const openedAt=Date.now(),beforeChecks=nativeChecks.length,beforeGrants=renewals.length;
   await page.waitForTimeout(42_000);
   assert.ok(Date.now()>initial.expiresAt,'initial grant expiry crossed');
   const refreshed=renewals.slice(beforeGrants);
   assert.ok(refreshed.length>=2,'two ordinary timer grant renewals observed');
   assert.ok(nativeChecks.length-beforeChecks>=2,'each renewal rechecks the native session');
   assert.ok(refreshed.every(grant=>grant.expiresAt>initial.expiresAt&&JSON.stringify(grant.config)===JSON.stringify(initial.config)),'fresh expiry preserves identical authority/config');
   assert.ok(await originalFrame.evaluate(node=>node.isConnected&&node===document.querySelector('[data-rer-editor]')?.shadowRoot?.querySelector('iframe')),'original iframe remains mounted');
   assert.ok(await frame.isVisible(),'already-open editor stays open');
   assert.deepEqual(await editorFrame.evaluate(()=>({sameDocument:window.renewalDocument===document,draft:document.getElementById('renewal-private-draft')?.value})),{sameDocument:true,draft:marker},'editor document identity and private draft survive renewal');
   await page.screenshot({path:join(evidence,`editor-${width}.png`)});
   await page.goto(app.origin+'/app/monitor');await page.locator('[data-rer-editor]').waitFor();
   // Native role loss is checked through the product route, then focus revokes immediately.
   assert.equal((await app.call('/auth/operator/role',{operatorId:primary,role:'member'},{cookie:secondOwner})).status,200);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.waitForFunction(()=>!document.querySelector('[data-rer-editor]'));
   assert.equal((await app.call('/api/editor/config',undefined,{cookie})).status,403);
   assert.equal((await app.call('/auth/operator/role',{operatorId:primary,role:'owner'},{cookie:secondOwner})).status,200);
   // Version changes revoke the old native session, so use a real outbox sign-in.
   const fresh=await emailSignIn(app.origin), [freshName,freshValue]=fresh.split('=');
   await context.addCookies([{name:freshName,value:freshValue,url:app.origin,httpOnly:true,sameSite:'Lax'}]);
   edge.state.denied=true;const violations=[];page.on('console',message=>{if(message.type()==='error'&&/frame-ancestors|framing/i.test(message.text()))violations.push(true)});
   await page.goto(app.origin+'/app');await page.locator('[data-rer-editor]').waitFor();
   await page.waitForFunction(()=>document.querySelector('[data-rer-editor]')?.getAttribute('data-connection')!=='connected');
   await new Promise(resolve=>setTimeout(resolve,1000));assert.ok(violations.length,'Chromium enforces management frame-ancestors refusal');
   edge.state.denied=false;
   results.push({width,nativeOwner:true,memberRefused:true,roleLossRevoked:true,cspRefusal:true,renewal:{elapsedMs:Date.now()-openedAt,originalExpiry:initial.expiresAt,renewedExpiries:refreshed.map(grant=>grant.expiresAt),ordinaryTimerRenewals:refreshed.length,iframeAndDocumentPreserved:true,privateDraftRetained:true}});
  } finally {await context.close()}
 }
 await writeFile(join(evidence,'RESULTS.json'),JSON.stringify({results,externalNetwork:false,scope:'Real emitted Uptime and Base editor, local management network edge; hosted service acceptance remains with the owner.'},null,2));
 console.log('OWNER-EDITOR passed: owner-only disabled 204, partial/malformed configuration refusal, native owner config, anonymous/member refusal, 1440/390 mount, two ordinary renewals beyond initial expiry preserving iframe/document/private draft, route transition, role-loss revocation and browser CSP refusal.');
} finally {await browser?.close();await app?.close();await edge.close()}
