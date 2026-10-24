import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {finishSetup} from './auth-test-support.mjs';

// Invoked unconditionally by the existing browser-enabled contact-schedules journey.
export async function proveOwnIncidentCorrelationConsole({f,monitors}){
 await finishSetup(f.origin,f.cookie);
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
  const context=await browser.newContext();
  const [name,...value]=f.cookie.split('=');await context.addCookies([{name,value:value.join('='),url:f.origin}]);
  const page=await context.newPage();
  await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort());
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(f.origin+`/app/monitors/${monitors[0].id}`);await page.locator('html.signed-in').waitFor();
   await page.getByRole('button',{name:'Notes and follow-up',exact:true}).click();
   const dialog=page.locator('#incident-work-dialog');await dialog.locator('[data-correlation-group]').waitFor();
   assert.match(await dialog.locator('[data-correlation-group]').textContent(),/synthetic-uptime-2/);await dialog.getByText(/^Notification · /).waitFor();
   assert.ok(!(await dialog.locator('[data-correlation-group]').textContent()).includes('synthetic-uptime-3'));
   await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});
   assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.UPTIME_SCREENSHOTS){await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});await dialog.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`correlation-${width}.png`)})}
   await dialog.getByRole('button',{name:'Close incident notes',exact:true}).click();await dialog.waitFor({state:'detached'});
  }
 }finally{await browser?.close()}
 console.log('FOLLOWUP-001 console PASS correlation group and next-due notification at 1440/390, axe and reflow.');
}
