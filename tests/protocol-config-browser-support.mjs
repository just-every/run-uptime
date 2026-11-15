import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {admissionRuntime} from './admission-runtime.mjs';
import {signInOwner} from './auth-test-support.mjs';

// Configuration portion of the existing native protocol journey, in its own installation.
export async function proveProtocolConfig(){
 let app,browser;
 const evidence=process.env.UPTIME_PROTOCOL_CONFIG_EVIDENCE;
 if(evidence)await mkdir(evidence,{recursive:true});
 try{
  app=await admissionRuntime();const cookie=await signInOwner(app.origin,{finishFirstRun:true});
  browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--use-mock-keychain','--password-store=basic']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),[name,...value]=cookie.split('=');await context.addCookies([{name,value:value.join('='),url:app.origin}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===app.origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const shots=async label=>{
   if(!evidence)return;
   for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);await page.screenshot({path:join(evidence,`${label}-${width}.png`),fullPage:true})}
   await page.setViewportSize({width:1440,height:1000});
  };
  for(const type of ['dns','tls','http']){
   await page.goto(app.origin+'/app/monitors/new');await page.getByRole('button',{name:'Fill in the form yourself',exact:true}).click();await page.locator('html.editor-context-ready').waitFor();await page.locator('[name=checkType]').selectOption(type);
   const name=`Synthetic ${type} configuration`;await page.locator('[name=name]').fill(name);
   if(type==='dns'){
    await page.locator('[name=dnsName]').fill('shop.synthetic.example');await page.locator('[name=dnsNameserver]').fill('ns1.synthetic.example');for(const box of await page.locator('[name=dnsResolver]').all())await box.uncheck();await page.locator('[name=dnsExpected]').fill('192.0.2.10');
   }else if(type==='tls'){
    await page.locator('[name=tlsHost]').fill('shop.synthetic.example');await page.locator('[name=tlsFailBeforeDays]').fill('30');
   }else{
    await page.locator('[name=url]').fill('https://api.synthetic.example/health');await page.locator('.advanced-fold > summary').click();await page.locator('[name=timeoutSeconds]').fill('60');
   }
   await shots(type+'-configuration');
   const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/monitors'&&r.request().method()==='POST');await page.getByRole('button',{name:'Save monitor',exact:true}).click();assert.equal((await response).status(),201);
   const view=await(await app.call('/api/overview',undefined,{cookie})).json(),monitor=view.monitors.find(m=>m.definition.name===name);assert.ok(monitor);
   if(type==='dns'){assert.deepEqual(monitor.definition.dns.resolvers,['nameserver']);assert.equal(monitor.definition.dns.nameserver,'ns1.synthetic.example');assert.deepEqual(monitor.definition.dns.expect.values,['192.0.2.10'])}
   if(type==='tls')assert.equal(monitor.definition.tls.failBeforeDays,30);
   if(type==='http')assert.equal(monitor.definition.timeoutMs,60000);
   await page.waitForURL(app.origin+'/app/monitors/'+monitor.id);await page.locator('.signed-in').waitFor();await shots(type+'-saved');
   await page.goto(app.origin+'/app/monitors/'+monitor.id+'/edit');await page.locator('html.editor-context-ready').waitFor();
   assert.equal(await page.locator(type==='dns'?'[name=dnsNameserver]':type==='tls'?'[name=tlsFailBeforeDays]':'[name=timeoutSeconds]').inputValue(),type==='dns'?'ns1.synthetic.example':type==='tls'?'30':'60');await shots(type+'-reopened');
  }
  assert.deepEqual(errors,[]);console.log('PROTOCOL-CONFIG PASS: named DNS server, certificate failure window and 60-second HTTP timeout save and reopen through the console.');
 }finally{await browser?.close();await app?.close()}
}
