import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';

const require=createRequire(import.meta.url);

// Inspect the same retry/fallback records the surviving recovery journey created.
export async function inspectDeliveryChains({origin,bindings,acceptedId,failedId,fallbackId,exhaustedId,chainMonitor}){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 try{
  const context=await browser.newContext(),page=await context.newPage();
  // Request routing disables Chromium's HTTP cache. Keep normal asset reuse
  // while checking that the journey only requests this installation.
  context.on('request',request=>assert.equal(new URL(request.url()).origin,origin,'delivery inspection stays on its installation'));
  await browserSignIn(page,origin,{bindings});
  const capture=async name=>{const directory=process.env.UPTIME_DELIVERY_CHAIN_EVIDENCE;if(directory){await mkdir(directory,{recursive:true});await page.screenshot({path:join(directory,name+'.png'),fullPage:true})}};
  const reflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'delivery chain page reflows');
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/app/notifications');await page.locator('html.signed-in').waitFor();
   const accepted=page.locator(`[data-key="delivery-${acceptedId}"]`),failed=page.locator(`[data-key="delivery-${failedId}"]`);
   await failed.getByText('HTTP 429',{exact:true}).waitFor();
   assert.equal(await accepted.locator('.delivery-state').textContent(),'Accepted');assert.equal(await failed.locator('.delivery-state').textContent(),'Failed');
   assert.match(await failed.locator('.delivery-reason').textContent(),/Retry window exhausted/);
   const viaEmail=page.locator(`[data-key="delivery-${fallbackId}"] .delivery-chain`),ended=page.locator(`[data-key="delivery-${exhaustedId}"] .delivery-chain`);
   await viaEmail.waitFor();assert.equal(await viaEmail.textContent(),'Fallback 1 after Dead Slack: Failed (slack_no_team). Fallback to Escalation webhook: Accepted.');
   assert.equal(await ended.textContent(),'Fallback 1 after Dead Slack: Uncertain (response_unknown). Chain ended: no contact accepted. Follow up manually.');
   const stopped=page.locator('.delivery-card').filter({has:page.getByText('HTTP 404',{exact:true})});assert.ok(await stopped.count()>0);
   for(const card of await stopped.all())assert.equal(await card.locator('.delivery-state').textContent(),'Failed');
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);await reflow();
   const session=await context.newCDPSession(page);let tree;try{tree=await session.send('Accessibility.getFullAXTree')}finally{await session.detach()}
   assert.ok(tree.nodes.some(node=>!node.ignored&&node.name?.value?.includes('Retry window exhausted')),'computed tree names the failure');
   await viaEmail.scrollIntoViewIfNeeded();await capture(`chain-outcomes-${width}`);
   const note=await viaEmail.elementHandle();
   await page.getByRole('button',{name:'Add destination',exact:true}).click();const dialog=page.getByRole('dialog'),identity=await dialog.elementHandle();
   await dialog.getByLabel('Name (optional)',{exact:true}).fill('Keep this draft');await page.waitForTimeout(6000);
   assert.ok(await identity.evaluate(element=>element.isConnected&&element.open),'polling preserves the open dialog');assert.equal(await dialog.getByLabel('Name (optional)',{exact:true}).inputValue(),'Keep this draft');
   assert.ok(await note.evaluate(element=>element.isConnected&&element.textContent.startsWith('Fallback 1 after Dead Slack')),'polling preserves the outcome note');
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.activeElement?.id),'add-destination');
   await note.dispose();await identity.dispose();
   await page.goto(origin+`/app/monitors/${chainMonitor.id}#alerts`);await page.locator('html.signed-in').waitFor();
   await page.locator('#alert-route-summary').getByText(`Fallback: On-call email → Escalation webhook; uncertain deadline ${width===1440?5:7} s.`,{exact:true}).waitFor();
   await page.getByRole('button',{name:'Edit alert route',exact:true}).click();const route=page.getByRole('dialog');await route.locator('#route-fallback-fields').waitFor();
   assert.deepEqual(await Promise.all([0,1,2].map(i=>route.locator(`#route-fallback-${i} option:checked`).textContent())),['On-call email','Escalation webhook','None']);
   assert.equal(await route.getByLabel('Uncertain deadline (seconds)',{exact:true}).inputValue(),String(width===1440?5:7));
   await route.getByRole('button',{name:'Preview route',exact:true}).click();await route.locator('#route-preview').waitFor({state:'visible'});
   assert.match(await route.locator('#route-preview').textContent(),/Fallback chainOn-call email email.*Fallback 1 · ReadyNow; no repeats; recovery on.*Escalation webhook webhook.*Fallback 2 · Ready/);
   assert.match(await route.locator('#route-preview .route-recipients > li').filter({hasText:'On-call email'}).first().textContent(),/Fallback contact/);
   await route.locator('#route-fallback-fields').scrollIntoViewIfNeeded();await capture(`chain-editor-${width}`);
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
   assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);
   assert.ok(await route.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'route editor reflows');await reflow();
   const deadline=String(width===1440?7:9),savedContact=await route.locator('#route-fallback-0').inputValue();
   await route.getByLabel('Uncertain deadline (seconds)',{exact:true}).fill(deadline);
   const quiet=route.locator('[data-route-fallback]').first().locator('[data-contact-quiet]');await quiet.locator('summary').click();
   await quiet.getByLabel('Hold alerts during quiet hours',{exact:true}).check();await quiet.getByLabel('Start',{exact:true}).fill('22:00');await quiet.getByLabel('End',{exact:true}).fill('07:00');await quiet.getByLabel('Time zone',{exact:true}).fill('Australia/Brisbane');
   assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);assert.ok(await route.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'quiet settings reflow');
   await route.getByRole('button',{name:'Preview route',exact:true}).click();await route.locator('#route-preview').getByText(/quiet 22:00–07:00 \(Australia\/Brisbane\)/).waitFor();
   assert.ok(await route.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'quiet preview reflows');
   await route.getByRole('button',{name:'Apply reviewed route',exact:true}).click();await route.waitFor({state:'detached'});await page.reload();await page.locator('html.signed-in').waitFor();
   await page.getByRole('button',{name:'Edit alert route',exact:true}).click();const reopened=page.getByRole('dialog');
   assert.equal(await reopened.getByLabel('Uncertain deadline (seconds)',{exact:true}).inputValue(),deadline);assert.equal(await reopened.locator('#route-fallback-0').inputValue(),savedContact);
   const savedQuiet=reopened.locator('[data-route-fallback]').first().locator('[data-contact-quiet]');await savedQuiet.locator('summary').click();
   assert.equal(await savedQuiet.getByLabel('Hold alerts during quiet hours',{exact:true}).isChecked(),true);assert.equal(await savedQuiet.getByLabel('Start',{exact:true}).inputValue(),'22:00');assert.equal(await savedQuiet.getByLabel('End',{exact:true}).inputValue(),'07:00');assert.equal(await savedQuiet.getByLabel('Time zone',{exact:true}).inputValue(),'Australia/Brisbane');
   await savedQuiet.scrollIntoViewIfNeeded();await capture(`chain-saved-${width}`);
   await reopened.getByRole('button',{name:'Close',exact:true}).click();await reopened.waitFor({state:'detached'});
  }
 }finally{await browser.close()}
}

export async function inspectQuietFallback({origin,bindings,quietId}){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  context.on('request',request=>assert.equal(new URL(request.url()).origin,origin,'quiet inspection stays on its installation'));
  await browserSignIn(page,origin,{bindings});await page.goto(origin+'/app/notifications');await page.locator('html.signed-in').waitFor();
  const card=page.locator(`[data-key="delivery-${quietId}"]`);await card.getByText(/Quiet hours: waiting until/).waitFor();assert.match(await card.textContent(),/Fallback 1 after Dead Slack: Failed/);
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'quiet hold reflows');
  const directory=process.env.UPTIME_DELIVERY_CHAIN_EVIDENCE;if(directory){await mkdir(directory,{recursive:true});await card.screenshot({path:join(directory,`chain-quiet-${width}.png`)})}
  await context.close();
 }}finally{await browser.close()}
}
