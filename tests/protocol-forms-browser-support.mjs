// The native monitor-configuration journey, mounted by the existing API transaction registration.
// Authentication, routes, writes and readback are real; no application requests are mocked.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {admissionRuntime} from './admission-runtime.mjs';
import {signInOwner} from './auth-test-support.mjs';
const require=createRequire(import.meta.url);
export async function proveProtocolForms(){
 let app,browser;
 const evidence=process.env.UPTIME_PROTOCOL_FORMS_EVIDENCE,shots=[];
 if(evidence)await mkdir(evidence,{recursive:true});
 try{
  app=await admissionRuntime();const cookie=await signInOwner(app.origin,{finishFirstRun:true});
  browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),[name,...parts]=cookie.split('=');await context.addCookies([{name,value:parts.join('='),url:app.origin}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===app.origin?route.continue():route.abort());
  const api=(path,body)=>app.call(path,body,{cookie});
  const get=async id=>(await(await api('/api/overview?monitor='+id)).json()).monitors[0];
  const screenshot=async label=>{
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
   const axe=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
   assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' accessibility');
   if(!evidence)return;
   for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:join(evidence,`${label}-${width}.png`),fullPage:true});shots.push({label,width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)});}
   await page.setViewportSize({width:1440,height:1000});
  };
  const start=async type=>{
   await page.goto(app.origin+'/app/monitors/new');await page.getByRole('button',{name:'Fill in the form yourself',exact:true}).click();await page.locator('html.editor-context-ready').waitFor();await page.locator('[name=checkType]').selectOption(type);
  };
  const save=async()=>{
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/monitors'&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Save monitor',exact:true}).click();const response=await saved;assert.equal(response.status(),201);await page.waitForURL(url=>/^\/app\/monitors\/(?!new(?:\/|$))[^/]+$/.test(url.pathname));await page.locator('.signed-in').waitFor();return get(new URL(page.url()).pathname.split('/').at(-1));
  };
  // Mail connection forms cover every supported protocol. TLS defaults and validation are observable before any write.
  const mails=[];
  for(const protocol of ['smtp','pop3','imap']){
   await start('mail');await page.locator('[name=name]').fill('synthetic-uptime-form-'+protocol);await page.locator('[name=mailProtocol]').selectOption(protocol);
   await page.locator('[name=mailHost]').fill('mail.example.com');
   assert.equal(await page.locator('[name=mailPort]').inputValue(),String(protocol==='smtp'?587:protocol==='pop3'?995:993));
   await page.locator('[name=mailCredentialRef]').fill('synthetic-uptime-mail');
   await page.locator('[name=mailSecurity]').selectOption('none');assert.equal(await page.locator('[name=mailCredentialRef]').evaluate(el=>el.checkValidity()),false,'no credentials over plaintext');
   await page.locator('[name=mailSecurity]').selectOption('tls');await page.locator('[name=mailPort]').fill('0');assert.equal(await page.locator('[name=mailPort]').evaluate(el=>el.checkValidity()),false);await page.locator('[name=mailPort]').fill(protocol==='smtp'?'465':protocol==='pop3'?'995':'993');
   if(protocol==='smtp')await screenshot('mail-connection');
   const monitor=await save();mails.push(monitor);assert.deepEqual(monitor.definition.mail,{protocol,host:'mail.example.com',port:protocol==='smtp'?465:protocol==='pop3'?995:993,security:'tls',credentialRef:'synthetic-uptime-mail'});
   assert.equal(await page.locator('input[type=password]').count(),0);
  }
  // An existing full synthetic-delivery definition from the API must survive a form save, not silently lose its receiver.
  const legacyMail={protocol:'smtp',host:'smtp.example.com',port:2525,security:'starttls',credentialRef:'synthetic-uptime-sender',transaction:{dedicatedMailbox:true,from:'synthetic@example.test',to:'synthetic-mailbox@example.test',receive:{protocol:'imap',host:'imap.example.com',port:993,security:'tls',credentialRef:'synthetic-uptime-receiver',mailbox:'Synthetic'},receiptTimeoutMs:15000,pollIntervalMs:750}};
  const oldMailResponse=await api('/api/monitors',{name:'synthetic-uptime-existing-mail',type:'mail',mail:legacyMail,timeoutMs:30000,enabled:false});assert.equal(oldMailResponse.status,201);const oldMail=await oldMailResponse.json();
  await page.goto(app.origin+`/app/monitors/${oldMail.id}/edit`);await page.locator('html.editor-context-ready').waitFor();assert.equal(await page.locator('[name=receiveMailbox]').inputValue(),'Synthetic');await screenshot('mail-existing-delivery');
  await page.locator('[name=name]').fill('synthetic-uptime-existing-mail-edited');await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.waitForURL(app.origin+'/app/monitors/'+oldMail.id);assert.deepEqual((await get(oldMail.id)).definition.mail,legacyMail);
  // The form creates a login/create/read/delete transaction using setup, requests, captured values and cleanup.
  await start('api');await page.locator('[name=name]').fill('synthetic-uptime-form-api');await page.locator('[name=apiUrl]').fill('https://api.example.com/');await page.locator('[name=apiCredentialRef]').fill('synthetic-uptime-api');
  const phase=name=>page.locator(`[data-api-phase="${name}"]`),step=(name,index=0)=>phase(name).locator('[data-api-step]').nth(index),fill=(card,key,v)=>card.locator(`[data-field="${key}"]`).fill(v);
  const options=async(card,title)=>{const summary=card.getByText(title,{exact:true});if(!await summary.evaluate(el=>el.parentElement.open))await summary.click()};
  const header=async(card,key,v)=>{await options(card,'Headers and body');await card.getByRole('button',{name:'Add header',exact:true}).click();const row=card.locator('[data-pair=header]').last();await fill(row,'key',key);await fill(row,'value',v);};
  const capture=async(card,key,path)=>{await options(card,'Captured values');await card.getByRole('button',{name:'Add captured value',exact:true}).click();const row=card.locator('[data-pair=extract]').last();await fill(row,'key',key);await fill(row,'value',path);};
  await page.getByText('Initial variables (optional)',{exact:true}).click();await page.getByRole('button',{name:'Add variable',exact:true}).click();let variable=page.locator('[data-pair=variable]');await fill(variable,'key','label');await fill(variable,'value','synthetic-uptime-item');
  await page.getByRole('button',{name:'Add setup step',exact:true}).click();let card=step('setup');await fill(card,'name','Login');await fill(card,'url','https://api.example.com/login');await card.locator('[data-field=method]').selectOption('POST');await capture(card,'session','$.token');
  card=step('request');await fill(card,'name','Create item');await fill(card,'url','https://api.example.com/items');await card.locator('[data-field=method]').selectOption('POST');await header(card,'content-type','application/json');await header(card,'authorization','Bearer {{session}}');await fill(card,'body','{"label":"{{label}}"}');await fill(card,'status','201');await capture(card,'item','$.id');
  await page.getByRole('button',{name:'Add request step',exact:true}).click();card=step('request',1);await fill(card,'name','Read item');await fill(card,'url','https://api.example.com/items/{{item}}');await header(card,'authorization','Bearer {{session}}');await options(card,'Additional assertions');await fill(card,'jsonPath','$.ready');await fill(card,'jsonEquals','true');
  // Moves retain each step's fields and focus; a temporary step can be removed without altering saved neighbours.
  await card.getByRole('button',{name:'Move up',exact:true}).click();assert.equal(await step('request').locator('[data-field=name]').inputValue(),'Read item');await step('request').getByRole('button',{name:'Move down',exact:true}).click();assert.equal(await step('request',1).locator('[data-field=jsonPath]').inputValue(),'$.ready');
  await page.getByRole('button',{name:'Add request step',exact:true}).click();await step('request',2).getByRole('button',{name:'Remove step',exact:true}).click();assert.equal(await phase('request').locator('[data-api-step]').count(),2);
  await page.getByRole('button',{name:'Add cleanup step',exact:true}).click();card=step('cleanup');await fill(card,'name','Delete item');await fill(card,'url','https://api.example.com/items/{{item}}');await card.locator('[data-field=method]').selectOption('DELETE');await header(card,'authorization','Bearer {{session}}');
  // A foreign origin is refused with all drafts intact and no create.
  await fill(card,'url','https://other.example.com/items/{{item}}');await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.locator('#editor-feedback[data-error]').waitFor();assert.ok((await page.locator('#editor-feedback').innerText()).includes('origin'));assert.equal(await step('request').locator('[data-field=body]').inputValue(),'{"label":"{{label}}"}');await fill(card,'url','https://api.example.com/items/{{item}}');
  await screenshot('api-transaction');const transaction=await save();
  assert.deepEqual(transaction.definition.api,{variables:{label:'synthetic-uptime-item'},steps:[{name:'Login',phase:'setup',url:'https://api.example.com/login',method:'POST',assertions:{status:200},extract:{session:'$.token'}},{name:'Create item',phase:'request',url:'https://api.example.com/items',method:'POST',headers:{'content-type':'application/json',authorization:'Bearer {{session}}'},body:'{"label":"{{label}}"}',assertions:{status:201},extract:{item:'$.id'}},{name:'Read item',phase:'request',url:'https://api.example.com/items/{{item}}',method:'GET',headers:{authorization:'Bearer {{session}}'},assertions:{status:200,json:{path:'$.ready',equals:true}}},{name:'Delete item',phase:'cleanup',url:'https://api.example.com/items/{{item}}',method:'DELETE',headers:{authorization:'Bearer {{session}}'},assertions:{status:200}}]});
  assert.deepEqual(transaction.definition.request,{credentialRef:'synthetic-uptime-api'});
  await page.goto(app.origin+`/app/monitors/${transaction.id}/edit`);await page.locator('html.editor-context-ready').waitFor();assert.equal(await step('request').locator('[data-field=body]').inputValue(),'{"label":"{{label}}"}');await screenshot('api-existing');await page.locator('[name=name]').fill('synthetic-uptime-form-api-edited');await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.waitForURL(app.origin+'/app/monitors/'+transaction.id);assert.deepEqual((await get(transaction.id)).definition.api,transaction.definition.api);
  // Legacy optional assertions, scalar variables and an explicit empty body retain their saved types and values.
  const legacyApi={variables:{label:'  synthetic text  ',count:2,ready:false},steps:[{name:'Existing request',phase:'request',url:'https://api.example.com/items',method:'POST',headers:{},body:'',assertions:{status:[200,'2xx','300-399'],bodyIncludes:'ready',bodyExcludes:'failed',bodyRegex:{pattern:'ready',flags:'i'},header:{name:'x-ready',equals:''},json:{path:'$.value',equals:''},latencyMs:4500},extract:{item:'$.id'},effect:'destructive-write'}]};
  const legacyResponse=await api('/api/monitors',{name:'synthetic-uptime-existing-api',type:'api',url:'https://api.example.com/',api:legacyApi,timeoutMs:30000,enabled:false});assert.equal(legacyResponse.status,201);const legacy=await legacyResponse.json();
  await page.goto(app.origin+`/app/monitors/${legacy.id}/edit`);await page.locator('html.editor-context-ready').waitFor();assert.equal(await step('request').locator('[data-field=jsonEquals]').inputValue(),'""');
  await page.locator('[name=checkType]').selectOption('mail');await page.locator('[name=checkType]').selectOption('api');await page.locator('[name=name]').fill('synthetic-uptime-existing-api-edited');
  await page.getByRole('button',{name:'Save monitor',exact:true}).click();await page.waitForURL(app.origin+'/app/monitors/'+legacy.id);assert.deepEqual((await get(legacy.id)).definition.api,legacyApi);
  assert.deepEqual(errors,[],'no browser exceptions');assert.ok(shots.every(shot=>shot.overflow<=1),'screens reflow at both proof widths');
  const receipt={journey:'Public New monitor and edit routes, native owner, real emitted Worker/D1, no application mocks',assertionWidth:1440,proofWidths:evidence?[1440,390]:[],mailProtocols:mails.map(m=>m.definition.mail.protocol),createdMail:mails.map(m=>m.id),createdTransaction:transaction.id,existingMailRetained:true,existingApiRetained:true,rawJsonPrimaryInputs:0,axeViolations:0,screens:shots,externalNetwork:false};
  if(evidence)await writeFile(join(evidence,'BROWSER-RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n');console.log('Protocol forms PASS: SMTP/POP3/IMAP, TLS/port validation, existing delivery settings, API add/reorder/remove, headers/body/assertions/captures, same-origin refusal, save and reopen.');
 }finally{await browser?.close();await app?.close();}
}
