import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
// Extends the drill's real send/restore journey; all states come from public owner reads.
export async function proveAlertPresentation({origin,cookie,notes,mode,destinationId}){
 const browser=await chromium.launch({headless:true,...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 const output=process.env.UPTIME_PLAIN_STATES_PROOF_DIR;
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const separator=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:origin}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.name));
 try{
  await page.goto(origin+'/app');
  if(new URL(page.url()).pathname==='/setup'){await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(url=>url.pathname.startsWith('/app'))}
  await page.goto(origin+'/app/settings/alerts');await page.locator('.sent-row').first().waitFor();
  const all=page.locator('#all-sent-alerts');if(await all.count()&&!await all.evaluate(e=>e.open))await all.locator(':scope > summary').click();
  const own=notes.deliveries.filter(d=>mode==='imported'||d.destinationId===destinationId&&d.code===(mode==='development'?'mail_development':d.code)&&d.state==='accepted');
  assert.ok(own.length,'the presentation proof has actual deliveries');
  if(mode==='development'){
   assert.equal(notes.mailSuppressed,true,'uses the real development mail adapter');
   const notice=await page.locator('.alert-clauses').innerText();assert.match(notice,/simulat/i);assert.match(notice,/no email.*(?:leaves|sent)/i);
   assert.ok(own.some(d=>d.event.kind==='test'));assert.ok(own.some(d=>d.event.kind==='trigger'));assert.ok(own.some(d=>d.event.kind==='recovery'));
  }
  for(const delivery of own){
   const row=page.locator(`[data-key="delivery-${delivery.id}"]`);await row.waitFor();
   const pill=await row.locator('.ui-pill').innerText();assert.ok(pill.trim());assert.notEqual(pill,delivery.state,'stored state codes are translated');assert.doesNotMatch(pill,/[_-]/);
   await row.locator('summary').click();const reason=await row.locator('.sent-body').innerText();
   if(mode==='development'){assert.match(pill,/simulat/i);assert.match(reason,/no email.*(?:left|sent)/i)}
   if(mode==='imported'){assert.equal(delivery.state,'imported-inactive');assert.match(reason,/import|restor/i);assert.match(reason,/held|will not.*sent|replay/i);assert.ok(!reason.includes(delivery.state))}
   if(mode==='hosted'){assert.doesNotMatch(pill,/simulat/i);assert.doesNotMatch(reason,/no email.*(?:left|sent)/i)}
  }
  if(mode==='development'){
   const destination=page.locator(`[data-key="destination-${destinationId}"]`);assert.match(await destination.innerText(),/simulat/i);assert.match(await destination.innerText(),/no email.*sent/i);
  }
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'alerts fit at the assertion width');
  if(output){await mkdir(output,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:join(output,`${mode}-alerts-${width}.png`),fullPage:true})}await page.setViewportSize({width:1440,height:1000})}
  if(mode==='development'){
   await page.locator(`[data-edit-destination="${destinationId}"]`).click();const dialog=page.getByRole('dialog');await dialog.locator('.latest-test > summary').first().click();
   const facts=await dialog.locator('.drill-lines > div').evaluateAll(rows=>rows.map(row=>row.innerText));assert.equal(facts.length,3);assert.match(facts[1],/simulat/i);assert.match(facts[1],/no email.*(?:left|sent)/i);assert.match(facts[2],/not confirmed/i);
   if(output)for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:join(output,`development-drill-${width}.png`),fullPage:true})}
  }
  assert.deepEqual(errors,[]);
  if(output)await writeFile(join(output,`${mode}-alerts.json`),JSON.stringify({journey:'proveAlertPresentation',mode,result:'passed',assertionWidth:1440,proofWidths:[1440,390],deliveries:own.length,overflow:false,axeViolations:0,recipientReceiptSeparate:true},null,2)+'\n');
 }finally{await context.close();await browser.close()}
}
