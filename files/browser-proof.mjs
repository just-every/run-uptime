import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {admissionRuntime} from './admission-runtime.mjs';
import {browserSignIn} from './auth-test-support.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const packet=process.env.HOME+'/rer-consolidation/work/sd-uptime-practice-1/packet';
const grant=JSON.parse(await readFile('.wrangler/state/synthetic-grant.json','utf8'));
const target=`http://127.0.0.1:${grant.port}/health`;
const app=await admissionRuntime({UPTIME_SYNTHETIC_PORT:String(grant.port)});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const before=process.argv.includes('--before'),rows=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}});
  try{
   const page=await context.newPage();await browserSignIn(page,app.origin);
   await page.goto(app.origin+'/app/monitors/new');await page.locator('.editor-context-ready').waitFor();
   await page.getByLabel('Website URL',{exact:true}).fill(target);
   await page.getByRole('button',{name:'Check',exact:true}).click();
   await page.locator('#discovery-problem').waitFor();
   await page.screenshot({path:`${packet}/${before?'before':'after'}-result-${width}.png`,fullPage:true});
   const link=page.locator('#discovery-problem a');
   const result=await page.locator('#discovery-problem').innerText();
   await link.click();await page.locator('.editor-context-ready').waitFor();
   await page.locator('[name=name]').fill('Local practice');
   await page.screenshot({path:`${packet}/${before?'before':'after'}-form-${width}.png`,fullPage:true});
   if(before){
    await page.getByRole('button',{name:'Save monitor',exact:true}).click();
    assert.equal(await page.locator('[name=privateGrantRef]').evaluate(n=>n.validity.valueMissing),true);
    assert.equal((await (await page.request.get(app.origin+'/api/overview')).json()).monitors.length,0);
    rows.push({width,result,network:await page.locator('[name=networkScope]').inputValue(),blockedByRequiredGrant:true,saved:false});
   }else{
    assert.equal(await page.locator('[name=url]').inputValue(),target);
    assert.equal(await page.locator('[name=networkScope]').inputValue(),'public');
    assert.equal(await page.locator('[name=privateGrantRef]').isEnabled(),false);
    // One real location needs an independent external check, exactly as the README route does.
    await page.request.post(app.origin+'/api/external-check',{headers:{origin:app.origin},data:{url:'https://example.com/'}});
    const save=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/monitors'&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Save monitor',exact:true}).click();
    const response=await save;assert.equal(response.status(),201);
    await page.waitForURL(url=>/^\/app\/monitors\/[^/]+$/.test(url.pathname));
    const id=new URL(page.url()).pathname.split('/').at(-1);
    const monitor=(await (await page.request.get(app.origin+'/api/overview')).json()).monitors.find(m=>m.id===id);
    assert.equal(monitor.definition.network,'synthetic');assert.equal(monitor.definition.privateGrantRef,undefined);
    rows.push({width,result,network:monitor.definition.network,saved:true,monitorId:monitor.id});
   }
  }finally{await context.close()}
 }
 await writeFile(`${packet}/${before?'before':'after'}-browser.json`,JSON.stringify({at:new Date().toISOString(),target,rows},null,2)+'\n');
}finally{await browser.close();await app.close()}
