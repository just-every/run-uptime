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
   assert.ok(await dialog.getByLabel('Name',{exact:true}).evaluate(element=>document.activeElement===element),'native dialog starts on its labelled name field');
   await page.keyboard.press('Shift+Tab');assert.ok(await dialog.evaluate(element=>element.contains(document.activeElement)),'reverse Tab remains inside modal');
   await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(element=>element.contains(document.activeElement)),'Tab remains inside modal');
   await audit(page,`destination-dialog-${width}`,{dialogName:'Add destination'});
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await focusReturns(page,'add-destination');
   async function create(kind,name,url){
    await page.getByRole('button',{name:'Add destination',exact:true}).click();const form=page.getByRole('dialog');
    await form.getByLabel('Name',{exact:true}).fill(name);await form.getByLabel('Type',{exact:true}).selectOption(kind);await form.getByLabel('Destination URL',{exact:true}).fill(url);
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
