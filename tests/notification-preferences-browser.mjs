// NOTICE-001: owner-selected incident time zone through the real console.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {testAuthBindings,browserSignIn} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
const directory=await runtimeDirectory(),screens=process.env.UPTIME_SCREENSHOTS??join(directory,'screens'),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
let worker,browser;
try{
 ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings:testAuthBindings}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const browserZone='Australia/Brisbane',context=await browser.newContext({timezoneId:browserZone}),page=await context.newPage();
 assert.equal((await page.request.patch(origin+'/api/notifications/preferences',{headers:{origin},data:{timeZone:'America/New_York'}})).status(),401);
 await browserSignIn(page,origin);
 for(const [name,kind,address] of [['Checkout operations','email','operations@example.test'],['Payments Slack','slack','https://hooks.slack.com/services/TTEST/BTEST/local-test']]){
  assert.equal((await page.request.post(origin+'/api/notifications/destinations',{headers:{origin},data:{name,kind,...(kind==='email'?{address}:{url:address})}})).status(),201);
 }
 await page.goto(origin+'/app#notifications');await page.locator('html.signed-in').waitFor();assert.equal((await (await page.request.get(origin+'/api/notifications')).json()).preferences.timeZone,browserZone,'fresh alert preferences use the browser zone');
 await mkdir(screens,{recursive:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/app#notifications');await page.locator('html.signed-in').waitFor();
  await page.getByRole('button',{name:'Change alert time zone'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('IANA time zone').fill('Invalid/Zone');await dialog.getByRole('button',{name:'Save time zone'}).click();await dialog.locator('[role=alert]').filter({hasText:/valid IANA/}).waitFor();
  await page.screenshot({path:join(screens,`zone-error-${width}.png`),fullPage:true});
  await dialog.getByLabel('IANA time zone').fill(width===1440?'America/New_York':'America/Los_Angeles');
  await page.screenshot({path:join(screens,`zone-dialog-${width}.png`),fullPage:true});
  assert.match(await dialog.ariaSnapshot(),/Alert time zone/);
  await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});
  assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
  await dialog.getByRole('button',{name:'Save time zone'}).click();await dialog.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Change alert time zone'}).waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'notification-time-zone');
  await page.reload();await page.locator('html.signed-in').waitFor();await page.locator('[data-view=notifications]').click();
  assert.ok((await page.locator('.notification-intro').textContent()).includes(width===1440?'America/New_York':'America/Los_Angeles'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'notification screen reflows');
  await page.screenshot({path:join(screens,`notifications-${width}.png`),fullPage:true});
  await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});
  const results=await page.evaluate(()=>axe.run(document));assert.deepEqual(results.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
 }
 console.log(`NOTICE-001 console 1440/390 passed; screenshots: ${screens}`);

}finally{await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
