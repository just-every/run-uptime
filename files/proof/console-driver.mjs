import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {browserSignIn,testAuthBindings} from './auth-test-support.mjs';
const origin='http://127.0.0.1:15482',out=process.env.UPTIME_UI_EVIDENCE;
const packet='/home/agent/rer-consolidation/work/main-uptime-plain-monitor-text-1/packet';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),findings={};
await mkdir(out,{recursive:true});
try{
 await browserSignIn(page,origin,{bootstrap:false,bindings:{...testAuthBindings,OWNER_EMAIL:process.env.UPTIME_OPERATOR_OWNER_EMAIL}});
 await page.locator('.editor-context-ready').waitFor();
 await page.getByRole('button',{name:'Paste many URLs or a CSV',exact:true}).click();
 const panel=page.locator('.way-panel[data-way=paste]');
 await panel.getByLabel('URLs or CSV',{exact:true}).fill('https://93.184.216.34/synthetic-uptime-one\nhttps://93.184.216.34/synthetic-uptime-two');
 await panel.getByRole('button',{name:'Preview',exact:true}).click();await panel.getByRole('heading',{name:'Review the plan'}).waitFor();
 findings.preview=await panel.locator('.catalog-preview').innerText();
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:join(packet,`after-preview-${width}.png`),fullPage:true})}
 const response=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'Synthetic plain monitor',url:'http://127.0.0.1:15481/health',intervalMs:5000,timeoutMs:2000,retries:0,confirmSlots:1,recoverSlots:1,freshnessMs:15000,assertions:{status:['200-299']},enabled:true}});
 assert.equal(response.status(),201);const monitor=await response.json();
 await page.goto(origin+'/app/monitors/'+monitor.id+'#details');await page.locator('#monitor-state').filter({hasText:'Healthy'}).waitFor({timeout:30000});
 await page.locator('#details[open]').waitFor();findings.details=await page.locator('#details').innerText();
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.locator('#details').scrollIntoViewIfNeeded();await page.screenshot({path:join(packet,`after-details-${width}.png`),fullPage:true})}
 assert.equal((await fetch('http://127.0.0.1:15481/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'failing'})})).status,200);
 await page.locator('#monitor-state').filter({hasText:'Failing'}).waitFor({timeout:30000});
 await page.evaluate(()=>{location.hash='incidents'});await page.locator('#monitor-incidents').getByText('Incident evidence',{exact:true}).first().click();
 findings.incident=await page.locator('#monitor-incidents').innerText();
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:join(packet,`after-incident-${width}.png`),fullPage:true})}
 await page.evaluate(()=>{location.hash='reports'});await page.locator('#report-bucket').selectOption('raw');await page.locator('#report-generate').click();
 await page.locator('#report-status').getByText('Report generated.',{exact:true}).waitFor();
 await page.locator('#report-results').getByText('Incident evidence',{exact:true}).first().click();
 findings.report=await page.locator('#report-results').innerText();
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:join(packet,`after-report-${width}.png`),fullPage:true})}
 await writeFile(join(packet,'AFTER.json'),JSON.stringify(findings,null,2)+'\n');
 await writeFile(join(out,'RESULTS.json'),JSON.stringify({externalNetwork:false,findings},null,2));
 console.log('Public-door reproduction completed: preview, details, real scheduled 503 incident.');
}finally{await context.close();await browser.close()}
