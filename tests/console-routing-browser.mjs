import assert from 'node:assert/strict';
import {test} from 'node:test';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';

test('console paths survive bookmarks, navigation, copied links, history and reload',async()=>{
 const directory=await runtimeDirectory();let worker,browser;
 try{
  const [port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
  ({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
  browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--disable-back-forward-cache'],args:['--use-mock-keychain','--password-store=basic']});
  const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
  const created=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'Storefront availability',url:'https://example.com/',canaryUrl:'https://example.org/',enabled:false}});
  assert.equal(created.status(),201);const {id}=await created.json(),detail=`/app/monitors/${encodeURIComponent(id)}`,edit=detail+'/edit';
  const aliases=[['/app','/app/monitors'],['/app/','/app/monitors'],['/monitor','/app/monitors/new'],['/monitor/?monitor='+encodeURIComponent(id),edit],['/app/monitor?monitor='+encodeURIComponent(id),edit],['/app/monitor/?first=1','/app/monitors/new']];
  for(const [old,to]of aliases){const response=await page.request.get(origin+old,{maxRedirects:0});assert.equal(response.status(),308,old);assert.equal(response.headers().location,to);}
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});
   for(const [old,to]of [['locations','locations'],['runners','locations'],['notifications','notifications'],['archive','archive'],['definitions','archive'],['settings','settings'],['monitors','monitors']]){
    await page.goto(origin+'/app#'+old);await page.waitForURL(origin+'/app/'+to);await page.locator('html.signed-in').waitFor();
    assert.equal(await page.locator('.sidebar nav a[aria-current=page]').getAttribute('href'),'/app/'+to);
   }
   await page.getByRole('link',{name:'Locations',exact:true}).click();await page.waitForURL(origin+'/app/locations');await page.locator('html.signed-in').waitFor();
   await page.getByRole('link',{name:'Monitors',exact:true}).click();await page.locator('.catalog-rows .monitor-link').click();await page.waitForURL(origin+detail);await page.locator('#monitor-state').waitFor();
   await page.getByRole('link',{name:'Edit rules',exact:true}).click();await page.waitForURL(origin+edit);await page.locator('html.editor-context-ready').waitFor();
   assert.equal(await page.locator('[name=name]').inputValue(),'Storefront availability');
   const copied=page.url(),copy=await context.newPage();assert.equal((await copy.goto(copied)).status(),200);await copy.locator('html.editor-context-ready').waitFor();assert.equal(await copy.locator('[name=name]').inputValue(),'Storefront availability');await copy.close();
   await page.reload();await page.locator('html.editor-context-ready').waitFor();assert.equal(page.url(),copied);
   await page.goBack();await page.waitForURL(origin+detail);await page.locator('#monitor-state').waitFor();
   await page.goForward();await page.waitForURL(origin+edit);await page.locator('html.editor-context-ready').waitFor();
   assert.equal(new URL(page.url()).search,'');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
 }finally{await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
});
