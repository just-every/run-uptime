import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';

// A fresh synthetic-owner context visits the emitted application. Requests,
// calendar rendering and preview all use the real application routes.
export async function captureMaintenance({origin,cookie,id,clock,label,windowId,preview=false}) {
 assert.ok(Number.isSafeInteger(clock));
 assert.match(label,/^[A-Za-z0-9_-]+$/);
 const separator=cookie.indexOf('=');
 assert.ok(separator>0);
 const output=resolve('data/maintenance-evidence'),files=[];
 await mkdir(output,{recursive:true});
 const browser=await chromium.launch({headless:true,
  ...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),
  args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:true,timezoneId:'America/New_York',locale:'en-US'});
  await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:origin,httpOnly:true,sameSite:'Lax'}]);
  await context.addInitScript(value=>{Date.now=()=>value},clock);
  for(const [width,height] of [[1440,1000],[390,844]]) {
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.setViewportSize({width,height});
   const response=await page.goto(`${origin}/app/monitors/${encodeURIComponent(id)}#maintenance`);
   assert.equal(response.status(),200);
   const panel=page.locator('#maintenance .maintenance-panel');
   await panel.waitFor({state:'visible'});
   if(windowId!==null&&windowId!==undefined) {
    // Identify the saved record by its stable application data, then check
    // its actual recurring calendar rather than pinning interface wording.
    const entry=panel.locator('li').filter({has:page.locator(`[data-cancel-maintenance=${JSON.stringify(windowId)}]`)});
    await entry.waitFor({state:'visible'});
    const overview=await context.request.get(`${origin}/api/overview?monitor=${encodeURIComponent(id)}`);
    assert.equal(overview.status(),200);
    const monitor=(await overview.json()).monitors.find(item=>item.id===id);
    const window=monitor.definition.maintenanceWindows.find(item=>item.id===windowId);
    assert.ok(window?.weekly,'the saved window retains a weekly calendar');
    const text=await entry.innerText();
    for(const value of [window.name,window.timeZone,window.weekly.localTime,window.weekly.fromDate,window.weekly.untilDate])assert.ok(text.includes(value),`saved calendar renders ${value}`);
   }
   // Open the public history disclosure: an earlier failed result must remain
   // available even after the latest check has recovered.
   await page.locator('#all-checks > summary').click();
   const failed=page.locator('#raw-history details[data-kind="failed"]').first();
   await failed.waitFor({state:'visible'});
   await failed.locator(':scope > summary').click();
   await failed.locator('.attempt-line .ui-mono').filter({hasText:'503'}).first().waitFor({state:'visible'});
   await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'monitor page reflows within the viewport');
   await panel.scrollIntoViewIfNeeded();
   const path=join(output,`${label}-${width}.png`);
   await page.screenshot({path,fullPage:true});files.push(path);
   if(preview) {
    await panel.locator('#plan-maintenance').click();
    const dialog=page.locator('dialog.maintenance-dialog');
    await dialog.waitFor({state:'visible'});
    await dialog.locator('#maintenance-name').fill('New York Sunday DST review');
    await dialog.locator('#maintenance-schedule').selectOption('weekly');
    await dialog.locator('#maintenance-zone').fill('America/New_York');
    await dialog.locator('[name="weekday"][value="0"]').check();
    await dialog.locator('#maintenance-local-time').fill('01:30');
    await dialog.locator('#maintenance-duration').fill('120');
    await dialog.locator('#maintenance-from-date').fill('2030-10-27');
    await dialog.locator('#maintenance-until-date').fill('2030-11-10');
    const received=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/maintenance/preview'&&response.request().method()==='POST');
    await dialog.locator('#maintenance-preview-button').click();
    const result=await received;assert.equal(result.status(),200);
    const review=await result.json(),repeat=review.occurrences.find(item=>item.status==='first-repeat');
    assert.ok(repeat,'the server preview exposes the repeated New York hour');
    assert.equal(repeat.repeatedStartsAt-repeat.startsAt,3600000);
    assert.equal(repeat.endsAt-repeat.startsAt,120*60000);
    const occurrences=dialog.locator('.maintenance-occurrences');
    await occurrences.waitFor({state:'visible'});
    const repeatedRow=occurrences.locator('li').filter({hasText:new Date(repeat.startsAt).toISOString()});
    assert.equal(await repeatedRow.count(),1);
    assert.ok(await repeatedRow.locator('strong').isVisible(),'repeated occurrence has a visible distinction');
    const presentation=await repeatedRow.innerText();
    for(const at of [repeat.startsAt,repeat.repeatedStartsAt]) {
     const local=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'long'}).format(at);
     assert.ok(presentation.includes(local),'both repeated instants are presented in New York time');
    }
    await repeatedRow.scrollIntoViewIfNeeded();
    assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth),'preview dialog reflows');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'preview page reflows');
    const previewPath=join(output,`${label}-preview-${width}.png`);
    await page.screenshot({path:previewPath});files.push(previewPath);
    await dialog.locator('#maintenance-close').click();
    await dialog.waitFor({state:'detached'});
   }
   assert.deepEqual(errors,[],'maintenance page has no uncaught browser errors');
   await page.close();
  }
  await context.close();
 } finally {await browser.close()}
 return files;
}
