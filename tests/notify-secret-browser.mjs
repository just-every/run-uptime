import {testAuthBindings,browserSignIn} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
const require=createRequire(import.meta.url),out=resolve(process.env.UPTIME_SECRET_UI_EVIDENCE??'data/notify-secret-evidence'),checks=[];
let worker,browser;
async function audit(page,label,{secret,dialogName}={}){
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
 const violations=result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));
 const session=await page.context().newCDPSession(page);let tree;try{tree=await session.send('Accessibility.getFullAXTree')}finally{await session.detach()}
 const nodes=tree.nodes.filter(node=>!node.ignored);
 if(dialogName)assert.ok(nodes.some(node=>node.role?.value==='dialog'&&node.name?.value===dialogName),label+' exposes a named modal');
 const extent=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,dialogs:[...document.querySelectorAll('dialog[open]')].map(dialog=>({scroll:dialog.scrollWidth,width:dialog.clientWidth}))}));
 // Evidence never retains the one-time key, even inside an accessibility tree or axe node.
 const redact=value=>secret?JSON.stringify(value,null,2).replaceAll(secret,'[one-time secret redacted]'):JSON.stringify(value,null,2);
 await Promise.all([writeFile(join(out,label+'-axe.json'),redact({violations})),writeFile(join(out,label+'-accessibility.json'),redact(tree)),page.screenshot({path:join(out,label+'.png'),fullPage:true,mask:secret?[page.locator('.one-time-secret')]:[]})]);
 assert.deepEqual(violations,[],label+' axe');assert.ok(extent.scroll<=extent.width+1,label+' page reflows');
 assert.ok(extent.dialogs.every(dialog=>dialog.scroll<=dialog.width+1),label+' dialog reflows');
 checks.push({label,width:extent.width,violations:0,accessibilityNodes:nodes.length});
}
async function focusReturns(page,id){await page.waitForFunction(id=>document.activeElement?.id===id,id,{timeout:10000})}
try{
 await mkdir(out,{recursive:true});
 ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings:testAuthBindings}));
 browser=await chromium.launch({headless:true,args:['--disable-gpu','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write']});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await browserSignIn(page,origin);await page.goto(origin+'/app#notifications');await page.locator('html.signed-in').waitFor();
   await page.getByRole('button',{name:'Add destination',exact:true}).focus();await page.keyboard.press('Enter');
   let dialog=page.getByRole('dialog');await dialog.waitFor();
   assert.ok(await dialog.getByLabel('Name (optional)',{exact:true}).evaluate(element=>document.activeElement===element),'native dialog starts on its labelled name field');
   await page.keyboard.press('Shift+Tab');assert.ok(await dialog.evaluate(element=>element.contains(document.activeElement)),'reverse Tab remains inside modal');
   await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(element=>element.contains(document.activeElement)),'Tab remains inside modal');
   await audit(page,`destination-dialog-${width}`,{dialogName:'Add destination'});
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await focusReturns(page,'add-destination');
   async function create(kind,name,url){
    await page.getByRole('button',{name:'Add destination',exact:true}).click();const form=page.getByRole('dialog');
    await form.getByLabel('Name (optional)',{exact:true}).fill(name);await form.getByLabel('Type',{exact:true}).selectOption(kind);await form.getByLabel('Destination URL',{exact:true}).fill(url);
    let release;const gate=new Promise(resolve=>release=resolve),hold=async route=>{await gate;await route.continue()};
    await page.route(origin+'/api/overview',hold);
    try{
     const response=page.waitForResponse(r=>r.url()===origin+'/api/notifications/destinations'&&r.request().method()==='POST');
     await form.getByRole('button',{name:'Create destination',exact:true}).click();const saved=await response;assert.equal(saved.status(),201);
     // Close events run while reconciliation still excludes the opener. Focus
     // must return to its current replacement after the real read completes.
     await form.waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelector('dialog')===null);assert.equal(await page.locator('#add-destination').isDisabled(),true);
     release();return saved.json();
    }finally{release();await page.unrouteAll({behavior:'wait'})}
   }
   const slackName=`Private Slack ${width}`,slack=await create('slack',slackName,`https://hooks.slack.com/services/TONE/BONE/private-capability-${width}`);
   assert.equal('signingSecret' in slack,false);await page.locator('.destination-card').filter({hasText:slackName}).waitFor();await focusReturns(page,'add-destination');
   assert.equal(await page.locator('.one-time-secret').count(),0,'Slack has no signing dialog');
   assert.equal(await page.locator('.destination-card').filter({hasText:slackName}).getByRole('button',{name:'Rotate secret',exact:true}).count(),0,'Slack has no rotate control');
   assert.equal((await page.request.post(`${origin}/api/notifications/destinations/${slack.id}/rotate`,{data:{}})).status(),400);
   const webhookName=`Signed receiver ${width}`,webhook=await create('webhook',webhookName,`https://receiver.example.com/events-${width}`);
   for(const mode of ['button','escape','close']){
    const returnId=mode==='button'?'add-destination':`notification-rotate-${webhook.id}`;
    if(mode!=='button'){
     await page.locator(`[data-rotate-destination="${webhook.id}"]`).focus();await page.keyboard.press('Enter');
     const confirmation=page.getByRole('dialog');await confirmation.waitFor();
     assert.ok(await confirmation.getByRole('button',{name:'Cancel',exact:true}).evaluate(element=>document.activeElement===element),'rotation starts on its safe keyboard control');
     await audit(page,`rotation-${mode}-${width}`,{dialogName:`Rotate the secret for ${webhookName}?`});
     await confirmation.getByRole('button',{name:'Rotate signing secret',exact:true}).focus();await page.keyboard.press('Enter');
    }
    dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:`Save the signing secret for ${webhookName}`,exact:true})});await dialog.waitFor();
    const copyHandle=await dialog.getByRole('button',{name:'Copy signing secret',exact:true}).elementHandle();
    const code=await dialog.locator('.one-time-secret').elementHandle(),secret=await code.textContent();assert.ok(secret&&secret.length>=64,'one-time webhook secret exists');
    await dialog.getByRole('button',{name:'Copy signing secret',exact:true}).focus();await page.keyboard.press('Enter');
    await dialog.locator('.copy-feedback').filter({hasText:'Copied'}).waitFor();assert.ok(await page.evaluate(async value=>(await navigator.clipboard.readText())===value,secret),'native clipboard contains the exact secret');
    assert.ok(!(await dialog.textContent()).includes('Slack'),'dialog explains webhook custody accurately');
    await audit(page,`secret-${mode}-${width}`,{secret,dialogName:`Save the signing secret for ${webhookName}`});
    if(mode==='button'){await dialog.getByRole('button',{name:'I saved it — close'}).focus();await page.keyboard.press('Enter')}
    else if(mode==='escape')await page.keyboard.press('Escape');else await dialog.evaluate(element=>element.close());
    await page.waitForFunction(element=>!element.isConnected,code);assert.ok((await code.textContent())==='','even the detached secret node is cleared');await code.dispose();
    assert.ok(await copyHandle.evaluate(element=>element.onclick===null),'closing removes the secret-copy handler');await copyHandle.dispose();
    assert.equal(await page.locator('.one-time-secret').count(),0);assert.equal(await page.evaluate(value=>document.body.textContent.includes(value),secret),false,'dismissal clears rendered secret');
    await focusReturns(page,returnId);
   }
   await page.reload();await page.locator('html.signed-in').waitFor();assert.equal(await page.locator('.one-time-secret').count(),0);await audit(page,`notifications-reloaded-${width}`);assert.deepEqual(errors,[],'browser exceptions');
  }finally{await context.close()}
 }
 await writeFile(join(out,'RESULTS.json'),JSON.stringify({checks,externalNetwork:false,workflow:'1440/390 native destination/rotation/one-time-secret dialogs; keyboard modal navigation and close/focus return; exact native clipboard; clear on button Escape native close and reload; secret-redacted computed accessibility trees, axe and reflow'},null,2));
 console.log('INTERFACE-001 secret dialogs passed at 1440/390: keyboard/focus, axe/reflow/computed accessibility, native clipboard and one-time clearing.');
}finally{if(browser)await browser.close();if(worker)await worker.dispose();await cleanupDirectory(directory)}

// The second added DELIVERY-002 case uses actual owner/runner doors and only receiver-edge fakes.
const {test:retryOutcomeTest}=await import('node:test');
const {proveNotificationRetry}=await import('./notify-retry-fixture.mjs');
retryOutcomeTest('DELIVERY-002 retry and fallback-chain outcomes and the route chain editor reflow at 1440 and 390 without remounting an open dialog',{timeout:420000},async()=>{
 await proveNotificationRetry(async({origin:retryOrigin,bindings,acceptedId,failedId,fallbackId,exhaustedId,chainMonitor})=>{
  const evidence=join(out,'retry-outcomes');await mkdir(evidence,{recursive:true});let retryBrowser;
  try{
   retryBrowser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
   const context=await retryBrowser.newContext(),page=await context.newPage();
   await context.route('**/*',route=>new URL(route.request().url()).origin===retryOrigin?route.continue():route.abort());
   await browserSignIn(page,retryOrigin,{bindings});
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});await page.goto(retryOrigin+'/app#notifications');await page.locator('html.signed-in').waitFor();
    const accepted=page.locator(`[data-key=${JSON.stringify('delivery-'+acceptedId)}]`),failed=page.locator(`[data-key=${JSON.stringify('delivery-'+failedId)}]`);
    await page.waitForFunction(key=>[...document.querySelectorAll('.delivery-card')].some(card=>card.dataset.key===key&&card.textContent.includes('Retry window exhausted')),'delivery-'+failedId);
    assert.ok((await page.locator('.notification-help:visible').textContent()).includes('Signed webhooks retry within saved limits.'),'visible help describes deduplicated retry');assert.equal(await accepted.locator('.delivery-state').textContent(),'Accepted');assert.equal(await failed.locator('.delivery-state').textContent(),'Failed');
    assert.match(await failed.locator('.delivery-reason').textContent(),/Retry window exhausted/);await failed.getByText('HTTP 429',{exact:true}).waitFor();
    const viaEmail=page.locator(`[data-key=${JSON.stringify('delivery-'+fallbackId)}] .delivery-chain`),ended=page.locator(`[data-key=${JSON.stringify('delivery-'+exhaustedId)}] .delivery-chain`);
    await viaEmail.waitFor();assert.equal(await viaEmail.textContent(),'Fallback 1 after Dead Slack: Failed (slack_no_team). Fallback sent to Escalation webhook: Accepted.','both outcomes of the escalation are visible');
    assert.equal(await ended.textContent(),'Fallback 1 after Dead Slack: Uncertain (response_unknown). Chain ended: no contact accepted. Follow up manually.');
    const note=await viaEmail.elementHandle();
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    const violations=(await page.evaluate(()=>axe.run(document))).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));assert.deepEqual(violations,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'retry outcomes reflow');
    const session=await context.newCDPSession(page);let tree;try{tree=await session.send('Accessibility.getFullAXTree')}finally{await session.detach()}
    assert.ok(tree.nodes.some(node=>!node.ignored&&node.name?.value?.includes('Retry window exhausted')),'computed tree names the failure');
    await page.screenshot({path:join(evidence,`outcomes-${width}.png`),fullPage:true});await writeFile(join(evidence,`outcomes-${width}.json`),JSON.stringify({width,violations,tree},null,2));
    await page.getByRole('button',{name:'Add destination',exact:true}).click();const dialog=page.getByRole('dialog'),identity=await dialog.elementHandle();
    await dialog.getByLabel('Name (optional)',{exact:true}).fill('Keep this draft');await page.waitForTimeout(6000);
    assert.ok(await identity.evaluate(element=>element.isConnected&&element.open),'refresh preserves the same open dialog');assert.equal(await dialog.getByLabel('Name (optional)',{exact:true}).inputValue(),'Keep this draft');
    assert.ok(await note.evaluate(element=>element.isConnected&&element.textContent.startsWith('Fallback 1 after Dead Slack')),'refresh keeps the same outcome note');
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.activeElement?.id),'add-destination');
    // The owner's route editor names the ordered chain, its deadline and each fallback contact's schedule.
    await page.goto(retryOrigin+`/app/monitors/${chainMonitor.id}`);await page.locator('html.signed-in').waitFor();
    await page.locator('#alert-route-summary').getByText('Fallback: On-call email → Escalation webhook; uncertain deadline 5 s.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit alert route',exact:true}).click();const route=page.getByRole('dialog');await route.locator('#route-fallback-fields').waitFor();
    assert.deepEqual(await Promise.all([0,1,2].map(i=>route.locator(`#route-fallback-${i} option:checked`).textContent())),['On-call email','Escalation webhook','None']);
    assert.equal(await route.getByLabel('Uncertain deadline (seconds)',{exact:true}).inputValue(),'5');
    await route.getByRole('button',{name:'Preview route',exact:true}).click();await route.locator('#route-preview').waitFor({state:'visible'});
    assert.match(await route.locator('#route-preview').textContent(),/Fallback chainOn-call email email.*Fallback 1 · ReadyNow; no repeats; recovery on.*Escalation webhook webhook.*Fallback 2 · Ready/);
    assert.match(await route.locator('#route-preview .route-recipients > li').filter({hasText:'On-call email'}).first().textContent(),/Fallback contact/);
    await route.locator('#route-fallback-fields').scrollIntoViewIfNeeded();await route.screenshot({path:join(evidence,`route-chain-${width}.png`)});
    await route.locator('#route-preview h3').filter({hasText:'Fallback chain'}).scrollIntoViewIfNeeded();await route.screenshot({path:join(evidence,`route-chain-preview-${width}.png`)});
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);
    assert.ok(await route.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'route chain editor reflows');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'route page reflows');
    await route.getByRole('button',{name:'Close',exact:true}).click();await route.waitFor({state:'detached'});
   }
  }finally{await retryBrowser?.close()}
 });
});
