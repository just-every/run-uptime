import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
let browser, page;
export async function closeQualificationBrowser(){await browser?.close();browser=null;page=null}
export async function qualificationBrowser({origin,monitors,directory}){
 const out=resolve(process.env.UPTIME_SCREENSHOTS??join(directory,'screens'));await mkdir(out,{recursive:true});
 if(!browser){browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext();page=await context.newPage();await browserSignIn(page,origin)}
 {
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});
   for(const monitor of monitors){const response=await page.goto(origin+'/app/monitors/'+monitor.id);assert.equal(response.status(),200,'monitor document is available');await page.evaluate(()=>{location.hash='flow'});await page.locator('.flow').waitFor();await page.evaluate(()=>{location.hash='all-checks'});
    const details=page.locator('#raw-history details[data-slot]').first();await details.waitFor();if(!await details.evaluate(node=>node.open))await details.locator('summary').click();
    assert.ok((await page.locator('main').ariaSnapshot()).includes('Browser flow'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);
    await page.locator('#raw-history').screenshot({path:join(out,monitor.label+'-'+width+'.png')});
   }
   if(monitors.some(m=>m.label==='browser-unavailable')){
    await page.goto(origin+'/docs/browser-flows');await page.getByRole('heading',{name:'Login, signup and sandbox checkout',exact:true}).scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);
    await page.screenshot({path:join(out,'journey-guide-'+width+'.png')});await page.getByRole('heading',{name:'Read a failed journey',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'failure-guide-'+width+'.png')});
   }
  }
 }
}
