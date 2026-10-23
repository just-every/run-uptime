// A monitor's pass/fail rules change in place on its page (U15). Through the built page at 1440 and 390: Responds within is
// changed and saved; the page shows the new rule and its new revision, and the next scheduled check is judged by it. A value
// the server refuses keeps what was typed, shows the server's reason in the rule's row and makes no revision.
import {browserSignIn} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';

const require=createRequire(import.meta.url),origin='http://127.0.0.1:15482';
const out=resolve(process.env.UPTIME_RULE_EDIT_EVIDENCE??'data/rule-edit-evidence'),checks=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--disable-gpu','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
const current=async(page,id)=>(await (await page.request.get(origin+'/api/overview')).json()).monitors.find(m=>m.id===id);
// What each location saw on the newest complete scheduled check of a revision, from the monitor's own history.
const judged=async(page,id,revision)=>(await (await page.request.get(origin+`/api/monitors/${id}/history`)).json()).find(slot=>!slot.manual&&slot.status==='complete'&&slot.revision===revision);
try{
 for(const width of [1440,390]){
  // Each cold browser starts in its own minute of the local installation's public asset bucket (as operator-browser.mjs).
  await new Promise(resolve=>setTimeout(resolve,60000-Date.now()%60000));
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort()});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await browserSignIn(page,origin,{bootstrap:false});
   const created=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:`Rules in place ${width}`,url:'http://127.0.0.1:15481/health',intervalMs:5000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1,freshnessMs:10000,assertions:{status:200,latencyMs:2000},enabled:true}});
   assert.equal(created.status(),201);const monitor=await created.json();
   await page.goto(origin+`/app/monitors/${monitor.id}`);await page.locator('html.signed-in').waitFor({timeout:15000});
   const row=page.locator('#rule-grid tr[data-key="rule-latencyMs"]');
   await row.locator('td .ui-result.passed').first().waitFor({timeout:30000});
   // Change Responds within from 2 s to 3 s in its row: the chip opens the field, Enter saves.
   await row.locator('#edit-latencyMs > summary').click();
   const seconds=row.locator('input[name=seconds]');assert.equal(await seconds.inputValue(),'2');
   await seconds.fill('3');await seconds.press('Enter');
   await page.locator('#action-notice').filter({hasText:`Saved as revision ${monitor.revision+1}`}).waitFor({timeout:15000});
   const saved=await current(page,monitor.id);
   assert.equal(saved.revision,monitor.revision+1,'one save is one new revision');
   assert.deepEqual(saved.definition.assertions,{status:200,latencyMs:3000},'only the changed rule changed');
   assert.equal(await row.locator('#edit-latencyMs').evaluate(details=>details.open),false,'Save closes the editor');
   assert.equal((await row.locator('.value-chip').textContent()).trim(),'3 s','the row shows the new rule');
   // The next scheduled check of the new revision is judged by the new rule, and the row shows what each location saw.
   await page.waitForFunction(()=>[...document.querySelectorAll('#rule-grid thead .col-age')].every(age=>/ago$/.test(age.textContent)),null,{timeout:30000});
   const slot=await judged(page,monitor.id,saved.revision);assert.ok(slot,'a scheduled check of the new revision completed');
   assert.equal(slot.definition.assertions.latencyMs,3000,'the check ran with the new rule');
   assert.ok(slot.observations.every(o=>o.checks.some(c=>c.assertion==='latency'&&c.pass)),'every location passed the new rule');
   assert.match(await row.locator('td .ui-result.passed').first().textContent(),/^\d+ ms$/,'the row shows the measured time');
   // A value the server refuses: its reason in the row, the typed value kept, no revision.
   const status=page.locator('#edit-status');await status.locator('summary').click();
   await status.locator('input[name=status]').fill('ok');await status.locator('input[name=status]').press('Enter');
   await page.locator('#edit-error-status').filter({hasText:/status/i}).waitFor({timeout:15000});
   assert.equal(await status.locator('input[name=status]').inputValue(),'ok','the typed value stays');
   assert.equal((await current(page,monitor.id)).revision,saved.revision,'a refused value makes no revision');
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
   const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
   assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],`rule editor accessibility at ${width}`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`no sideways scroll at ${width}`);
   await page.screenshot({path:resolve(out,`rule-refused-${width}.png`),fullPage:true});
   // Focus stays in the field after the refusal, so Esc pressed on the page cancels: the editor closes and the saved value
   // comes back.
   await page.keyboard.press('Escape');
   assert.equal(await status.evaluate(details=>details.open),false);assert.equal(await status.locator('input[name=status]').inputValue(),'200');
   await page.screenshot({path:resolve(out,`rule-saved-${width}.png`),fullPage:true});
   assert.deepEqual(errors,[],'browser exceptions');
   checks.push({width,revision:saved.revision,judgedBy:slot.definition.assertions.latencyMs,violations:0});
   assert.equal((await page.request.patch(origin+`/api/monitors/${monitor.id}`,{headers:{origin},data:{...saved.definition,enabled:false}})).status(),200);
  }finally{await context.close()}
 }
 await writeFile(resolve(out,'RESULTS.json'),JSON.stringify({checks,workflow:'A rule changed in place on the monitor page at 1440/390: one new revision, the next scheduled check judged by it, a refused value kept with the server reason and no revision, Esc cancels; axe and reflow',externalNetwork:false},null,2));
}finally{await browser.close()}
