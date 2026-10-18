import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';

const directory=await runtimeDirectory(),output=resolve(process.env.UPTIME_SCREENSHOTS??join(directory,'screens'));
await mkdir(output,{recursive:true});
let worker,browser;
try{
 const [port]=await availablePorts(1),origin='http://127.0.0.1:'+port;
 ({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
 await browserSignIn(page,origin);
 const enter=async()=>{
  await page.goto(origin+'/app#runners');await page.locator('html.signed-in').waitFor();
  await page.locator('[data-view="runners"]').click();await page.locator('#metrics-key-form').waitFor();
 };
 const checkPanel=async(width,stage='panel')=>{
  const panel=page.locator('#metrics-tools');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'metrics panel fits the viewport');
  await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
  const violations=await panel.evaluate(async node=>(await axe.run(node)).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
  assert.deepEqual(violations,[],'changed metrics panel has no axe violations');
  const tree=await panel.ariaSnapshot();assert.ok(tree.includes('Metrics export')&&tree.includes('Days to expiry'),'metrics controls appear in the accessibility tree');
  await writeFile(join(output,'metrics-'+stage+'-'+width+'.aria.txt'),tree);
  await panel.screenshot({path:join(output,'metrics-'+stage+'-'+width+'.png')});
 };
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await enter();
  const name='Prometheus '+width,panel=page.locator('#metrics-tools'),create=page.getByRole('button',{name:'Create metrics key',exact:true});
  await panel.getByLabel('Key name',{exact:true}).fill(name);
  await panel.getByLabel('Days to expiry',{exact:true}).fill('0');
  await create.click();
  assert.equal(await panel.getByLabel('Days to expiry',{exact:true}).evaluate(node=>node.validity.valid),false,'invalid expiry is refused by the form');
  assert.equal(await page.locator('dialog:has(#metrics-secret-heading)').count(),0);await checkPanel(width,'invalid-expiry');
  await panel.getByLabel('Days to expiry',{exact:true}).fill('30');
  const response=page.waitForResponse(r=>r.url()===origin+'/api/metrics/keys'&&r.request().method()==='POST');
  await create.click();assert.equal((await response).status(),201,'owner creates a metrics key');
  const dialog=page.getByRole('dialog',{name:'Save your metrics key'});await dialog.waitFor();
  const code=await dialog.locator('code.token').elementHandle(),copy=await dialog.getByRole('button',{name:'Copy metrics key',exact:true}).elementHandle();
  let token=await code.textContent();assert.ok(Boolean(token),'one-time metrics credential exists');
  await copy.click();await dialog.locator('.copy-feedback').filter({hasText:'Copied'}).waitFor();
  assert.ok(await page.evaluate(async value=>(await navigator.clipboard.readText())===value,token),'native clipboard contains the metrics key');
  await dialog.screenshot({path:join(output,'metrics-key-once-'+width+'.png'),mask:[dialog.locator('code.token')]});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'key dialog fits the viewport');
  await page.keyboard.press('Escape');
  await page.waitForFunction(node=>!node.isConnected,code);
  assert.ok((await code.textContent())==='','dismissal clears the detached credential node');
  assert.ok(await copy.evaluate(node=>node.onclick===null),'dismissal clears the copy handler');
  assert.ok(await page.evaluate(()=>document.activeElement?.id==='create-metrics-key'),'focus returns to Create metrics key');
  await code.dispose();await copy.dispose();
  assert.ok(await page.evaluate(value=>!document.body.textContent.includes(value),token),'dismissal removes the rendered credential');
  // Raw requests have no owner cookies, so only the issued key supplies authority.
  const headers={authorization:'Bearer '+token};
  const exported=await fetch(origin+'/api/v1/metrics',{headers});assert.equal(exported.status,200,'key grants metrics reads');
  assert.ok((exported.headers.get('content-type')??'').includes('text/plain'),'default metrics response is Prometheus text');
  const snapshot=await fetch(origin+'/api/v1/metrics?format=json',{headers});assert.equal(snapshot.status,200);assert.ok(await snapshot.json(),'JSON metrics snapshot is available');
  const forbidden=await fetch(origin+'/api/monitors',{method:'POST',headers:{...headers,origin,'content-type':'application/json'},body:JSON.stringify({name:'Must not exist',type:'http',url:'https://example.com/'})});
  assert.equal(forbidden.status,403,'metrics key cannot mutate monitors');
  await page.reload();await page.locator('html.signed-in').waitFor();await page.locator('[data-view="runners"]').click();
  await page.getByRole('button',{name:'Revoke '+name,exact:true}).waitFor();
  assert.equal(await page.locator('code.token').count(),0,'reload never retrieves a secret');
  await checkPanel(width);
  const revoked=page.waitForResponse(r=>r.url().includes('/api/metrics/keys/')&&r.request().method()==='DELETE');
  await page.getByRole('button',{name:'Revoke '+name,exact:true}).click();assert.equal((await revoked).status(),200);
  const refused=await fetch(origin+'/api/v1/metrics',{headers});assert.ok([401,403].includes(refused.status),'revocation refuses metrics immediately');
  token='';headers.authorization='';
  await page.reload();await page.locator('html.signed-in').waitFor();await page.locator('[data-view="runners"]').click();
  await page.locator('#metrics-key-list').getByRole('heading',{name,exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Revoke '+name,exact:true}).count(),0,'revocation persists on reload');
  await checkPanel(width,'revoked');
  await page.getByRole('link',{name:'Metrics guide',exact:true}).click();
  await page.getByRole('heading',{level:1}).waitFor();assert.equal(new URL(page.url()).pathname,'/docs/metrics');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);await page.screenshot({path:join(output,'metrics-guide-'+width+'.png')});
 }
 console.log('PASS METRICS-001 emitted Worker/browser: owner key custody, native clipboard, Escape cleanup/focus, read-only authority, immediate revocation, persisted list, expiry validation, 1440/390 reflow/axe/tree and metrics guide.');
}finally{await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
