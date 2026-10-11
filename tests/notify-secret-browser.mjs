import {testAuthBindings,browserSignIn} from './auth-test-support.mjs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
let worker,browser;
try{
 ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings:testAuthBindings}));
 browser=await chromium.launch({headless:true,args:['--disable-gpu'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();
 await browserSignIn(page,origin);
 await page.goto(origin+'/app');await page.locator('html.signed-in').waitFor();await page.locator('[data-view=notifications]').click();
 async function create(kind,name,url){
  await page.getByRole('button',{name:'Add destination',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Name',{exact:true}).fill(name);await dialog.getByLabel('Type',{exact:true}).selectOption(kind);await dialog.getByLabel('Destination URL',{exact:true}).fill(url);
  const response=page.waitForResponse(r=>r.url()===origin+'/api/notifications/destinations'&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Create destination',exact:true}).click();const saved=await response;assert.equal(saved.status(),201);return saved.json();
 }
 const slack=await create('slack','Private Slack','https://hooks.slack.com/services/TONE/BONE/private-capability');
 assert.equal('signingSecret' in slack,false);await page.locator('.destination-card').filter({hasText:'Private Slack'}).waitFor();
 assert.equal(await page.locator('.one-time-secret').count(),0,'Slack has no signing dialog');
 assert.equal(await page.getByRole('button',{name:'Rotate secret',exact:true}).count(),0,'Slack has no rotate control');
 assert.equal((await page.request.post(`${origin}/api/notifications/destinations/${slack.id}/rotate`,{data:{}})).status(),400);
 const webhook=await create('webhook','Signed receiver','https://receiver.example.com/events');
 for(const mode of ['button','escape','close']){
  if(mode!=='button'){await page.locator(`[data-rotate-destination="${webhook.id}"]`).click();await page.getByRole('dialog').getByRole('button',{name:'Rotate signing secret',exact:true}).click();}
  const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:/Save the signing secret for Signed receiver/})});await dialog.waitFor();
  const copyHandle=await dialog.getByRole('button',{name:'Copy signing secret',exact:true}).elementHandle();
  const code=await dialog.locator('.one-time-secret').elementHandle(),secret=await code.textContent();assert.ok(secret&&secret.length>=64,'one-time webhook secret exists');
  await dialog.getByRole('button',{name:'Copy signing secret',exact:true}).click();await dialog.locator('.copy-feedback').filter({hasText:'Copied'}).waitFor();assert.ok(await page.evaluate(async value=>(await navigator.clipboard.readText())===value,secret),'native clipboard contains the exact secret');
  assert.ok(!(await dialog.textContent()).includes('Slack'),'dialog explains webhook custody accurately');
  if(mode==='button')await dialog.getByRole('button',{name:'I saved it — close'}).click();
  else if(mode==='escape')await page.keyboard.press('Escape');else await dialog.evaluate(element=>element.close());
  await page.waitForFunction(element=>!element.isConnected,code);assert.ok((await code.textContent())==='','even the detached secret node is cleared');await code.dispose();assert.ok(await copyHandle.evaluate(element=>element.onclick===null),'closing removes the secret-copy handler');await copyHandle.dispose();
  assert.equal(await page.locator('.one-time-secret').count(),0);assert.equal(await page.evaluate(value=>document.body.textContent.includes(value),secret),false,'dismissal clears rendered secret');
 }
 await page.reload();await page.locator('html.signed-in').waitFor();assert.equal(await page.locator('.one-time-secret').count(),0);
 console.log('PASS real Worker/browser Slack has no signing key/dialog/rotation; webhook one-time secret clears on button Escape close and reload');
}finally{if(browser)await browser.close();if(worker)await worker.dispose();await cleanupDirectory(directory)}
