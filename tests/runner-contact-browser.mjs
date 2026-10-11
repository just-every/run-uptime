import {browserSignIn} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';

const require=createRequire(import.meta.url),origin='http://127.0.0.1:15482',out=resolve(process.env.UPTIME_CONTACT_UI_EVIDENCE??'data/contact-evidence');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})}),checks=[];
try{
 for(const width of [1440,768,390,320]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin?route.continue():route.abort()});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await browserSignIn(page,origin,{bootstrap:false});await page.locator('.signed-in').waitFor();
  await page.getByRole('link',{name:'Runner / archive',exact:true}).click();
  const runnerPanel=page.locator('section').filter({has:page.locator('#runner-contact-heading')}).last();
  assert.match(await runnerPanel.textContent(),/Contact confirms a request using the configured runner credential/);
  assert.equal(await page.locator('.runner-contact dd').first().textContent(),'Fresh contact');
  assert.ok(await page.locator('.runner-contact time').getAttribute('datetime'));
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
  await writeFile(resolve(out,`contact-${width}-axe.json`),JSON.stringify(audit,null,2));assert.deepEqual(audit.violations.map(v=>v.id),[]);
  await page.screenshot({path:resolve(out,`contact-${width}.png`),fullPage:true});
  const extent=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(extent.scroll<=extent.width+1,'contact panel reflow');
  // Controlled overview projections test presentation only. CONTACT-001 separately
  // verifies actual D1 authority and state; this intercept never changes real data.
  const baseline=await (await page.request.get(origin+'/api/overview')).json();
  let presentation='stale';
  await page.route(origin+'/api/overview',route=>{
   if(presentation==='unavailable')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic contact presentation unavailable'})});
   const value=structuredClone(baseline);value.now=Date.now();value.runner.contact={state:presentation==='never'?'Never seen':'Stale contact',lastContactAt:presentation==='never'?null:Date.now()-180000,freshnessMs:120000,reason:presentation==='never'?'This installation has not recorded an authenticated runner request.':'No authenticated runner request received within the last 2 minutes.'};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  await page.locator('.runner-contact dd').first().filter({hasText:'Stale contact'}).waitFor({timeout:10000});assert.match(await page.locator('#notice').textContent(),/Runner contact: Stale contact/);
  presentation='never';await page.locator('.runner-contact dd').first().filter({hasText:'Never seen'}).waitFor({timeout:10000});assert.equal(await page.locator('.runner-contact time').count(),0);
  presentation='unavailable';await page.locator('.runner-contact dd').first().filter({hasText:'Contact status unavailable'}).waitFor({timeout:10000});assert.match(await page.locator('.runner-contact dt').nth(1).textContent(),/Last recorded contact/);
  await page.unroute(origin+'/api/overview');await page.locator('.runner-contact dd').first().filter({hasText:'Fresh contact'}).waitFor({timeout:10000});assert.deepEqual(errors,[]);
  checks.push({width,axeViolations:0,overflow:false,presentationTransitions:['Fresh contact','Stale contact','Never seen','Contact status unavailable','Fresh contact']});
  await context.close();
 }
 await writeFile(resolve(out,'RESULTS.json'),JSON.stringify({checks,externalNetwork:false,scope:'Actual native login/contact plus explicitly controlled UI projections; backend authority is CONTACT-001.'},null,2));
 console.log('CONTACT-UI-001 passed: four widths, axe/reflow, textual timestamps and state transitions/failed-read recovery without external requests.');
}finally{await browser.close()}
