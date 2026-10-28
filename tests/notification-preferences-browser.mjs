// NOTICE-001: the owner's one installation time zone, chosen in Settings › General through the real console.
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
 const saved=async()=>(await (await page.request.get(origin+'/api/notifications')).json()).preferences.timeZone;
 await page.goto(origin+'/app/settings/general');await page.locator('html.signed-in').waitFor();assert.equal(await saved(),browserZone,'a fresh installation takes the browser zone');
 assert.equal((await page.request.patch(origin+'/api/notifications/preferences',{headers:{origin},data:{timeZone:'Invalid/Zone'}})).status(),400,'a zone that is not an IANA zone is refused');
 await mkdir(screens,{recursive:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/settings/general');await page.locator('html.signed-in').waitFor();
  const zone=width===1440?'America/New_York':'America/Los_Angeles',select=page.getByRole('combobox',{name:'Time zone',exact:true});
  assert.equal(await select.inputValue(),width===1440?browserZone:'America/New_York','the picker shows the installation zone');
  const answer=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/notifications/preferences'&&response.request().method()==='PATCH');
  await select.focus();await select.selectOption(zone);assert.equal((await answer).status(),200,'choosing a zone saves it at once');
  await page.locator('#time-zone-saved').filter({hasText:'Saved'}).waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'installation-time-zone','focus stays on the picker');
  await page.screenshot({path:join(screens,`zone-saved-${width}.png`),fullPage:true});
  await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});
  assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
  await page.reload();await page.locator('html.signed-in').waitFor();
  assert.equal(await select.inputValue(),zone,'the saved zone shows after a reload');assert.equal(await saved(),zone);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'General reflows');
 }
 console.log(`NOTICE-001 console 1440/390 passed; screenshots: ${screens}`);

}finally{await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
