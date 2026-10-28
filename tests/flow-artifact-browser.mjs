import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
export async function artifactBrowser(f,monitor,{failedStorage=false,erased=false}={}){
 const output=resolve(process.env.UPTIME_SCREENSHOTS??'data/flow-artifact-evidence');await mkdir(output,{recursive:true});
 const browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();await browserSignIn(page,f.origin);
  for(const width of [1440]){
   await page.setViewportSize({width,height:1000});await page.goto(f.origin+`/app/monitors/${monitor.id}`);
   if(erased){await page.getByRole('heading',{name:'Monitor not found',exact:true}).waitFor();await page.screenshot({path:join(output,`erased-${width}.png`)});continue}
   await page.evaluate(()=>{location.hash='incidents'});const incident=page.locator('#monitor-incidents');await incident.getByText('Incident evidence',{exact:true}).click();await incident.getByRole('button',{name:'Load incident failure snapshots'}).click();
   const detail=incident.locator('.failure-snapshot').filter({hasText:failedStorage?'Trace unavailable: capture_failed':'Download sanitized trace ZIP'}).first();await detail.locator('summary').click();
   await detail.getByText('Immutable reference:',{exact:false}).waitFor();assert.ok(await detail.getByRole('table',{name:'Step duration from the signed observation'}).count());
   if(failedStorage){await detail.getByText('Video unavailable: capture_failed',{exact:false}).waitFor();assert.match(await detail.innerText(),/failed check/)}else{
    assert.equal(await detail.locator('img').evaluate(img=>img.naturalWidth),1000);
    const video=detail.locator('video');await video.evaluate(video=>video.play());await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(video=>video.videoWidth>0&&video.currentTime>0));await video.evaluate(video=>video.pause());
    const pending=page.waitForEvent('download');await detail.getByRole('link',{name:'Download sanitized trace ZIP'}).click();const download=await pending;assert.equal((await readFile(await download.path())).subarray(0,4).toString('hex'),'504b0304');
    assert.ok(await detail.getByRole('table',{name:'Bounded requests · query strings and fragments removed'}).count());
   }
   await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual(await incident.evaluate(async node=>(await axe.run(node)).violations.map(v=>v.id)),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await writeFile(join(output,`${failedStorage?'capture-denied':'artifacts'}-${width}.aria.txt`),await detail.ariaSnapshot());
   await detail.screenshot({path:join(output,`${failedStorage?'capture-denied':'artifacts'}-${width}.png`)});
   if(!failedStorage){await page.goto(f.origin+'/docs/browser-flows');await page.getByRole('heading',{name:'Retained browser failure artifacts',exact:true}).scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(output,`artifact-guide-${width}.png`)});}
  }
 }finally{await browser.close()}
}
