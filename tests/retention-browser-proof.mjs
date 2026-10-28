// Optional local operator journey for RETENTION-001, using this test's real state.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
export async function retentionBrowser(origin,bindings,monitor){
 const output=process.env.UPTIME_RETENTION_BROWSER;if(!output)return;
 await mkdir(output,{recursive:true});
 const browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try{for(const width of [1440]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();
  await browserSignIn(page,origin,{bindings,bootstrap:false});
  await page.goto(`${origin}/app/monitors/${monitor.id}#all-checks`);await page.locator('.signed-in').waitFor();
  await page.locator('#monitor-state.badge').filter({hasText:'Failing'}).waitFor();
  assert.ok((await page.locator('#raw-history details').count())>0,'retained check history remains visible');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:join(output,`retention-history-${width}.png`),fullPage:true});
  await page.getByRole('link',{name:'Notifications',exact:true}).click();
  await page.getByRole('heading',{name:'Destinations · all monitors',exact:true}).waitFor();
  assert.ok(await page.getByText('Retention webhook',{exact:true}).count());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:join(output,`retention-notifications-${width}.png`),fullPage:true});
  await context.close();
 }}finally{await browser.close()}
}
