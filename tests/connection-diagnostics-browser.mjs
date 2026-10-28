import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
export async function diagnosticBrowser(f,monitor){
 const output=resolve(process.env.UPTIME_SCREENSHOTS??join(f.directory,'screens'));await mkdir(output,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,f.origin);
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(f.origin+`/app/monitors/${monitor.id}`);await page.evaluate(()=>{location.hash='snapshots'});const panel=page.locator('#failure-snapshots');await panel.locator('.failure-snapshot summary').click();await panel.getByRole('heading',{name:'Connection phases'}).waitFor();assert.ok((await panel.innerText()).includes('100%'));assert.ok((await panel.innerText()).includes('TCP connect'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual(await panel.evaluate(async node=>(await axe.run(node)).violations.map(v=>v.id)),[]);await panel.screenshot({path:join(output,`connection-diagnostics-${width}.png`)});
   await page.evaluate(()=>{location.hash='incidents'});const incident=page.locator('#monitor-incidents');await incident.getByText('Incident evidence',{exact:true}).click();await incident.getByRole('button',{name:'Load incident failure snapshots'}).click();await incident.locator('.failure-snapshot summary').click();await incident.getByRole('heading',{name:'Route diagnostics · timeout'}).waitFor();assert.ok((await incident.ariaSnapshot()).includes('Connection diagnostics'));await incident.screenshot({path:join(output,`incident-diagnostics-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(await incident.evaluate(async node=>(await axe.run(node)).violations.map(v=>v.id)),[]);
  }
 }finally{await browser.close()}
}

// Browser proof for the existing incident section's native-protocol rendering.
// Assertions run at 1440; the same section is captured once at each width.
export async function protocolDiagnosticBrowser(f,monitor){
 const output=resolve(process.env.UPTIME_SCREENSHOTS??join(f.directory,'screens'));await mkdir(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.UPTIME_BROWSER_EXECUTABLE,args:['--use-mock-keychain','--password-store=basic',...(process.env.UPTIME_BROWSER_EXECUTABLE?['--no-sandbox']:[])]});
 try{
  const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,f.origin);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   await page.goto(f.origin+'/app/monitors/'+monitor.id);await page.evaluate(()=>{location.hash='incidents'});
   const incident=page.locator('#monitor-incidents');
   await incident.getByText('Incident evidence',{exact:true}).click();
   await incident.getByRole('button',{name:'Load incident failure snapshots'}).click();
   await incident.locator('.failure-snapshot summary').first().waitFor();
   for(const summary of await incident.locator('.failure-snapshot summary').all())await summary.click();
   await incident.getByRole('heading',{name:'Route diagnostics · timeout'}).first().waitFor();
   if(width===1440){
    const text=await incident.innerText();assert.ok(text.includes('TCP failure'));assert.ok(text.includes('Route diagnostic unavailable: blocked'));
    assert.ok(text.includes('Healthy locations in the same check'));assert.ok(text.includes('local-b'));assert.ok(text.includes('pass'));assert.ok(text.includes('100%'));
    assert.equal(await incident.locator('[aria-label^="Connection diagnostics"]').count(),2);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
    assert.deepEqual(await incident.evaluate(async node=>(await axe.run(node)).violations.map(v=>v.id)),[]);
    assert.ok((await incident.ariaSnapshot()).includes('Connection diagnostics'));
   }
   await incident.screenshot({path:join(output,'protocol-incident-diagnostics-'+width+'.png')});
  }
 }finally{await browser.close()}
}
