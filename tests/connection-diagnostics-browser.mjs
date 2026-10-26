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
