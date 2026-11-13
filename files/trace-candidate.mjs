import {createRequire} from 'node:module';
import {appendFile,writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(new URL('./run-uptime/package.json',import.meta.url));
const {chromium}=require('playwright');
const out=new URL('./packet/candidate-network.jsonl',import.meta.url),launch=chromium.launch.bind(chromium),started=Date.now();
chromium.launch=async options=>{
 const browser=await launch(options),newContext=browser.newContext.bind(browser);
 browser.newContext=async options=>{
  const context=await newContext(options);
  context.on('page',page=>{
   const reloadPage=page.reload.bind(page);
   page.reload=async options=>{
    const capture=await page.locator('[data-key-list]').textContent().then(text=>text.includes('synthetic-uptime-604')&&text.includes('synthetic-uptime-606')).catch(()=>false);
    const response=await reloadPage(options);
    if(capture){
     const row=page.locator('[data-credential-id]').filter({hasText:'synthetic-uptime-604'});
     await row.waitFor();await row.locator('summary').click();
     await mkdir(new URL('./packet/proof',import.meta.url),{recursive:true});
     for(const width of [1440,390]){
      await page.setViewportSize({width,height:width===390?844:1000});await row.scrollIntoViewIfNeeded();
      await page.screenshot({path:new URL('./packet/proof/credential-readiness-'+width+'.png',import.meta.url).pathname,mask:[page.locator('[data-secret-once]'),page.locator('[data-totp-secret]'),page.locator('[data-totp-qr]'),page.locator('[data-totp-uri]')]});
     }
     await page.setViewportSize({width:1440,height:1000});await row.locator('summary').click();
    }
    return response;
   };
   const events=[];let reload=0;
   page.on('response',response=>{
    const url=new URL(response.url()),row={atMs:Date.now()-started,path:url.pathname,status:response.status(),type:response.request().resourceType()};events.push(row);void appendFile(out,JSON.stringify(row)+'\n');
    if(url.pathname==='/app/settings/people'&&++reload===3){
     setTimeout(async()=>{if(page.isClosed())return;try{await writeFile(new URL('./packet/candidate-readiness.json',import.meta.url),JSON.stringify(await page.evaluate(()=>({path:location.pathname,signedIn:document.documentElement.classList.contains('signed-in'),panels:document.querySelectorAll('#security-controls').length,keys:document.querySelectorAll('[data-credential-id]').length,factorState:document.querySelector('[data-factor-state]')?.textContent,keyList:document.querySelector('[data-key-list]')?.textContent?.includes('could not be loaded')})),null,2)+'\n')}catch{}} ,20000).unref();
    }
   });
   page.on('requestfailed',request=>{void appendFile(out,JSON.stringify({atMs:Date.now()-started,path:new URL(request.url()).pathname,failure:request.failure()?.errorText})+'\n')});
   page.on('pageerror',error=>{void appendFile(out,JSON.stringify({atMs:Date.now()-started,pageError:error.name})+'\n')});
  });return context;
 };return browser;
};
await import('./run-uptime/tests/operator-security.mjs');
