import {testAuthBindings,browserSignIn} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {auditNotificationView} from './notify-browser-audit.mjs';
const evidence=resolve(process.env.UPTIME_UI_EVIDENCE??'../evidence/review-round-two/ui/current'),directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`,runnerKey=randomBytes(32).toString('hex');
await mkdir(evidence,{recursive:true});let worker,browser,DB;const checks=[],pageErrors=[];
async function check(label,fn){try{await fn();checks.push({label,pass:true})}catch(error){checks.push({label,pass:false,error:error instanceof assert.AssertionError?'Assertion failed':error.name});console.error('FAIL '+label)}}
try{
 ({worker,DB}=await migratedWorker({port,persist:join(directory,'worker'),bindings:{...testAuthBindings,UPTIME_RUNNER_KEY:runnerKey}}));
 browser=await chromium.launch({headless:true,args:['--disable-gpu'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();page.on('pageerror',()=>pageErrors.push('pageerror'));
 await browserSignIn(page,origin);await page.goto(origin+'/app');await page.locator('html.signed-in').waitFor();await page.locator('[data-view=notifications]').click();
 page.setDefaultTimeout(2500);
 const card=name=>page.locator('.destination-card').filter({has:page.getByRole('heading',{name,exact:true})});
 const list=async()=>{const response=await page.request.get(origin+'/api/notifications',{maxRetries:3});assert.equal(response.status(),200);return response.json()};
 const destinations=[];
 for(const kind of ['email','webhook','slack']){
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Add destination',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Type',{exact:true}).selectOption(kind);
   await check(`add-${kind}-${width}`,()=>auditNotificationView({page,label:`add-${kind}`,width,evidence,pageErrors}));
   if(kind==='email')await check(`email-privacy-${width}`,async()=>assert.ok(!/URLs and signing secrets/.test(await dialog.innerText())));
   else await check(`public-https-hint-${kind}-${width}`,async()=>assert.match(await dialog.getByLabel('Destination URL',{exact:true}).getAttribute('placeholder'),/^https:\/\/hooks\./));
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  const name='Review '+kind,payload={name,kind,...(kind==='email'?{address:'initial-review@example.org'}:{url:kind==='slack'?'https://hooks.slack.com/services/TREVIEW/BREVIEW/private-review':'https://review-receiver.example.org/private-review'})};
  const response=await page.request.post(origin+'/api/notifications/destinations',{data:payload,maxRetries:3});assert.equal(response.status(),201);destinations.push({...await response.json(),name,kind});
 }
 await page.reload();await page.locator('html.signed-in').waitFor();await page.locator('[data-view=notifications]').click();
 await check('notification-subtitle',async()=>assert.match(await page.locator('.subtitle').innerText(),/Installation-wide destinations/));
 for(const d of destinations){
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:900});await card(d.name).getByRole('button',{name:'Edit',exact:true}).click();const dialog=page.getByRole('dialog');
   await check(`edit-${d.kind}-${width}`,()=>auditNotificationView({page,label:`edit-${d.kind}`,width,evidence,pageErrors}));
   if(d.kind==='email')await check(`saved-email-${width}`,async()=>assert.ok((await dialog.getByLabel('Email address',{exact:true}).inputValue())==='initial-review@example.org'));
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  }
 }
 const email=destinations.find(d=>d.kind==='email'),webhook=destinations.find(d=>d.kind==='webhook'),slack=destinations.find(d=>d.kind==='slack');
 await check('unconfigured-email-card-and-save',async()=>{assert.match(await card(email.name).innerText(),/Email is not set up, so this will not send/);await card(email.name).getByRole('button',{name:'Edit',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Email address',{exact:true}).fill('updated-review@example.org');await dialog.getByRole('button',{name:'Save destination',exact:true}).click();await card(email.name).getByText('updated-review@example.org',{exact:true}).waitFor();assert.ok((await list()).destinations.find(d=>d.id===email.id).address==='updated-review@example.org');assert.match(await page.locator('#action-notice').innerText(),/Email is not set up/)});
 if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
 await check('plain-email-setup-action',async()=>{await card(email.name).getByRole('button',{name:'Set up email',exact:true}).click();assert.match(await page.locator('.email-setup:visible').innerText(),/person running Uptime.*SendGrid sender email and API key/)});
 await check('unconfigured-test-plain-not-sent',async()=>{await card(email.name).getByRole('button',{name:'Send test',exact:true}).click();await page.locator('#action-notice').filter({hasText:'Test queued.'}).waitFor();const response=await page.request.post(origin+'/api/runner/notifications',{headers:{'x-runner-key':runnerKey},data:{operation:'poll'},maxRetries:3});assert.equal(response.status(),200);await page.reload();await page.locator('html.signed-in').waitFor();await page.locator('[data-view=notifications]').click();const delivery=page.locator('.delivery-card').filter({hasText:email.name}).first();assert.equal(await delivery.locator('.delivery-state').innerText(),'Not sent');assert.match(await delivery.innerText(),/Code: mail_not_configured/);assert.equal(await delivery.locator('.delivery-heading strong').innerText(),'Test notification');assert.equal(await delivery.getByRole('button',{name:'Set up email',exact:true}).count(),1)});
 await check('mobile-help-before-history',async()=>{await page.setViewportSize({width:390,height:900});const help=page.locator('.notification-help-mobile .notification-help'),history=page.locator('.notification-history');assert.ok(await help.isVisible());assert.ok((await help.boundingBox()).y<(await history.boundingBox()).y);assert.equal(await help.locator('.verification-help').getAttribute('open'),null)});
 let mutations=0;page.on('request',request=>{if(request.method()!=='GET'&&new URL(request.url()).pathname.startsWith('/api/notifications/destinations'))mutations++});
 await check('rotate-cancel-no-mutation',async()=>{const before=mutations;await card(webhook.name).getByRole('button',{name:'Rotate secret',exact:true}).click();const dialog=page.getByRole('dialog');assert.match(await dialog.innerText(),/old secret stops working.*update your receiver/is);assert.match(await dialog.locator('h2').innerText(),/Review webhook/);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(mutations,before)});
 if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
 await check('secret-copy-and-clear',async()=>{
  await card(webhook.name).getByRole('button',{name:'Rotate secret',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Rotate signing secret',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('.one-time-secret').waitFor();assert.match(await dialog.locator('h2').innerText(),/Review webhook/);assert.match(await dialog.innerText(),/UTF-8/);const handle=await dialog.locator('.one-time-secret').elementHandle(),secret=await handle.textContent();
  await dialog.getByRole('button',{name:'Copy signing secret',exact:true}).click();await dialog.locator('.copy-feedback').filter({hasText:'Copied'}).waitFor();assert.ok(await page.evaluate(async value=>(await navigator.clipboard.readText())===value,secret),'exact secret copied without emitting it');
  for(const width of [1440,390,320])await auditNotificationView({page,label:'secret-dialog',width,evidence,pageErrors});
  await dialog.getByRole('button',{name:'I saved it — close',exact:true}).click();assert.ok((await handle.textContent())==='');assert.ok(await page.evaluate(value=>!document.body.textContent.includes(value),secret));await handle.dispose();
 });
 if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
 await check('delete-cancel-no-mutation',async()=>{const before=mutations;await card(slack.name).getByRole('button',{name:'Delete',exact:true}).click();const dialog=page.getByRole('dialog');assert.match(await dialog.locator('h2').innerText(),/Review slack/);assert.match(await dialog.innerText(),/Queued sends are cancelled.*cannot be recovered/is);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(mutations,before);assert.ok((await list()).destinations.some(d=>d.id===slack.id))});
 if(await page.getByRole('dialog').count())await page.keyboard.press('Escape');
 await check('delete-accept-real-mutation',async()=>{await card(slack.name).getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete destination',exact:true}).click();await card(slack.name).waitFor({state:'detached'});assert.ok(!(await list()).destinations.some(d=>d.id===slack.id))});
 await page.goto(origin+'/app/monitor');await page.locator('html.editor-ready').waitFor();
 for(const width of [1440,390,320])await check(`new-monitor-${width}`,()=>auditNotificationView({page,label:'new-monitor',width,evidence,pageErrors,navigation:false}));
 await check('editor-single-controls-and-friendly-labels',async()=>{assert.equal(await page.locator('input[name=url]').count(),1);assert.equal(await page.getByRole('link',{name:/Notifications/}).count(),1);assert.equal(await page.getByRole('link',{name:/Sign out/}).count(),1);assert.equal(await page.getByLabel('Check every (minutes)',{exact:true}).count(),1);assert.equal(await page.getByLabel('Alert after this many failed checks',{exact:true}).count(),1);assert.doesNotMatch(await page.locator('body').innerText(),/LOCAL SYNTHETIC ENVIRONMENT|native API|Quorum/)});

 await check('credential-unavailable-and-real-reentry',async()=>{
  await page.goto(origin+'/app');await page.locator('html.signed-in').waitFor();await page.locator('[data-view=notifications]').click();
  const queued=await page.request.post(origin+'/api/notifications/destinations/'+webhook.id+'/test',{data:{},maxRetries:3});assert.equal(queued.status(),202);const queuedId=(await queued.json()).deliveryId;
  await DB.prepare('UPDATE notification_credentials SET ciphertext=? WHERE id=(SELECT credential_id FROM notification_destinations WHERE id=?)').bind('invalid',webhook.id).run();
  await page.reload();await page.locator('html.signed-in').waitFor();await page.locator('[data-view=notifications]').click();assert.match(await card(webhook.name).innerText(),/Credentials unavailable/);assert.ok(await card(webhook.name).getByRole('button',{name:'Send test',exact:true}).isDisabled());
  await card(webhook.name).getByRole('button',{name:'Edit',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Re-enter destination URL',{exact:true}).fill('https://replacement-review.example.org/private-review');await dialog.getByRole('button',{name:'Save destination',exact:true}).click();await page.getByRole('dialog').locator('.one-time-secret').waitFor();await page.getByRole('dialog').getByRole('button',{name:'I saved it — close',exact:true}).click();
  const state=await list();assert.ok(state.destinations.find(d=>d.id===webhook.id).credentialsAvailable);assert.ok(!('url' in state.destinations.find(d=>d.id===webhook.id)));assert.ok(state.deliveries.some(d=>d.id===queuedId&&d.code==='credential_rotated'));assert.ok(!(await card(webhook.name).innerText()).includes('replacement-review.example.org'));
 });
 await context.close();
}finally{if(browser)await browser.close();if(worker)await worker.dispose();await cleanupDirectory(directory);await writeFile(join(evidence,'review-results.json'),JSON.stringify({checks,pageErrors},null,2),{mode:0o600})}
assert.ok(checks.every(check=>check.pass),'all review behavior and accessibility checks pass');assert.deepEqual(pageErrors,[]);console.log(`PASS review browser ${checks.length} checks with real authenticated Worker and native clipboard`);
