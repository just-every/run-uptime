// WEBHOOK-001: an owner imports, repairs, previews and delivers custom requests.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {webhookFixture} from './webhook-custom-support.mjs';
import {browserSignIn} from './auth-test-support.mjs';
const screens=process.env.UPTIME_SCREENSHOTS,headerSecret='test-only-browser-header-value';
let edge,browser;
try{
 edge=await webhookFixture();const {f,records}=edge,url=new URL(edge.url);url.search='';
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,f.origin,{bindings:f.bindings});
 if(screens)await mkdir(screens,{recursive:true});
 const shot=async name=>{if(screens)await page.screenshot({path:join(screens,name+'.png'),mask:await page.locator('#webhook-preview-title').count()?[]:[page.locator('[name=webhookHeaders]')],fullPage:false})};
 const audit=async()=>{await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});const result=await page.evaluate(()=>axe.run(document));assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'console reflows');};
 const notes=async()=>{const r=await f.request('/api/notifications');assert.equal(r.status,200);return r.data};
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(f.origin+'/app/notifications');await page.locator('html.signed-in').waitFor();await page.locator('#add-destination').waitFor();
  await page.locator('#add-destination').click();let dialog=page.locator('dialog[aria-labelledby=destination-dialog-title]');await dialog.getByLabel('Type',{exact:true}).selectOption('webhook');
  await dialog.locator('summary').filter({hasText:'Import a saved UptimeRobot'}).click();
  const source={type:'Webhook',data:{friendlyName:`Payments receiver ${width}`,urlToNotify:url.href,postValue:'{"name":"*monitorFriendlyName*","type":*alertType*,"reason":"*alertDetails*","event":"{{event.id}}"}',sendAsQueryString:false,sendAsJSON:true,sendAsPostParameters:false,customHeaders:{'X-Api-Key':'source-value-discarded'}}};
  await dialog.getByLabel('Saved webhook JSON').fill(JSON.stringify(source));await dialog.getByRole('button',{name:'Read source definition'}).click();await dialog.getByLabel('Name (optional)',{exact:true}).waitFor();
  await page.waitForFunction(name=>document.querySelector('[name=name]')?.value===name,source.data.friendlyName);
  assert.equal(await dialog.getByLabel('Custom header values (JSON)').inputValue(),'');
  await dialog.getByLabel('Custom header values (JSON)').fill(JSON.stringify({'X-Api-Key':headerSecret+'\r\nInjected: true'}));
  await dialog.getByLabel('Enabled for all monitors').uncheck();await dialog.getByRole('button',{name:'Create destination',exact:true}).click();
  await dialog.locator('.form-error').filter({hasText:/header.*CR|CR.*header|header.*line|line.*header/i}).waitFor();
  assert.ok(!(await dialog.locator('.form-error').allTextContents()).join(' ').includes(headerSecret));await shot(`webhook-error-${width}`);await audit();
  await dialog.getByLabel('Custom header values (JSON)').fill(JSON.stringify({'X-Api-Key':headerSecret}));
  await dialog.evaluate(el=>el.scrollTop=0);await shot(`webhook-editor-${width}`);
  const preview=async label=>{
   await dialog.getByRole('button',{name:'Preview sample requests'}).click();const modal=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Request preview',exact:true})});await modal.waitFor();
   assert.equal(await page.evaluate(()=>document.activeElement?.id),'webhook-preview-title');assert.equal(await modal.evaluate(el=>el.scrollTop),0);assert.match(await modal.ariaSnapshot(),/Request preview/);
   assert.ok((await modal.textContent()).includes('[masked]'));assert.ok(!(await modal.textContent()).includes(headerSecret));await shot(`webhook-preview-${label}-${width}`);await audit();
   await modal.getByRole('button',{name:'Close preview'}).click();await modal.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Preview sample requests');
  };
  await preview('json');
  const createdResponse=page.waitForResponse(r=>r.url()===f.origin+'/api/notifications/destinations'&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Create destination',exact:true}).click();const response=await createdResponse;assert.equal(response.status(),201);const destination=await response.json();
  await page.getByRole('button',{name:'I saved it — close'}).click();await page.locator('.one-time-secret').waitFor({state:'detached'});
  const test=async(method,mode)=>{
   const queued=page.waitForResponse(r=>r.url().endsWith(`/destinations/${destination.id}/test`));await page.locator(`[data-test-destination="${destination.id}"]`).click();assert.equal((await queued).status(),202);const before=records.length;await f.run(f.first);assert.equal(records.length,before+1);const wire=records.at(-1);assert.equal(wire.method,method);assert.equal(wire.headers['x-api-key'],headerSecret);
   if(mode==='json')assert.equal(JSON.parse(wire.body).name,'Test notification');else if(mode==='query'){assert.equal(wire.body,'');assert.equal(new URL(wire.path,url).searchParams.get('name'),'Test notification')}else assert.equal(new URLSearchParams(wire.body).get('name'),'Test notification');
   const rows=await notes();assert.ok(rows.deliveries.some(d=>d.destinationId===destination.id&&d.state==='accepted'));assert.ok(!JSON.stringify(rows).includes(headerSecret));
  };
  await test('POST','json');
  for(const [method,mode] of [['GET','query'],['PUT','form']]){
   await page.locator(`[data-edit-destination="${destination.id}"]`).click();dialog=page.locator('dialog[aria-labelledby=destination-dialog-title]');await dialog.getByLabel('HTTP method').selectOption(method);await dialog.getByLabel('Delivery mode').selectOption(mode);await dialog.getByLabel('Payload or parameter template').fill('{"name":"{{monitor.name}}","event":"{{event.id}}"}');await preview(mode);
   await dialog.getByRole('button',{name:'Save destination',exact:true}).click();await dialog.waitFor({state:'detached'});await page.getByRole('button',{name:'I saved it — close'}).click();await test(method,mode);
  }
  await page.reload();await page.locator('html.signed-in').waitFor();await page.locator('#add-destination').waitFor();await page.locator('.delivery-card').filter({hasText:'Accepted'}).first().waitFor();await page.locator('.notification-history').evaluate(el=>el.scrollIntoView({block:'start'}));await shot(`webhook-delivery-${width}`);await audit();
 }
 console.log('WEBHOOK-001 passed: imported JSON, actionable refusal, masked focus-safe previews, GET/query and PUT/form real receiver delivery at 1440/390.');
}finally{await browser?.close();await edge?.close()}
