import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
// A proof group loads several complete documents. Start each group in a fresh
// public-admission window so the harness respects the production asset budget.
const nextAdmissionWindow=()=>new Promise(resolve=>setTimeout(resolve,60000-Date.now()%60000));
export async function flowProfilesBrowser({origin,monitors,mobile,directory}){
 const out=resolve(process.env.UPTIME_SCREENSHOTS??join(directory,'profile-screens'));await mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
  const shot=async(name,selector)=>{await page.locator(selector).first().scrollIntoViewIfNeeded();if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)){await page.screenshot({path:join(out,'overflow.png'),fullPage:true});console.log('FLOW layout '+JSON.stringify(await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>innerWidth+1).slice(0,16)}))))}assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page reflows');await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);await page.locator(selector).first().screenshot({path:join(out,name+'.png')})};
  for(const width of [1440,390]){
   await nextAdmissionWindow();await page.setViewportSize({width,height:1000});await page.goto(origin+`/app/monitors/${mobile.id}`);await page.locator('#flow-profile-settings').waitFor();
   assert.match(await page.locator('#flow-selected-profile').textContent(),/Chromium.*Mobile/);assert.ok((await page.locator('.flow').ariaSnapshot()).includes('Device profile'));await shot(`mobile-profile-${width}`,'.flow');
   const details=page.locator('#raw-history details[data-slot]').first();if(!await details.evaluate(node=>node.open))await details.locator('summary').click();await shot(`mobile-failure-${width}`,'.flow-trace-wrap');
   await page.locator('#report-generate').click();await page.locator('section[aria-labelledby="report-browser-profiles"]').waitFor();await shot(`profile-report-${width}`,'section[aria-labelledby="report-browser-profiles"]');
   const pdf=await page.request.get(origin+`/api/v1/monitors/${mobile.id}/report?period=24h&format=pdf`);assert.equal(pdf.status(),200);assert.match(pdf.headers()['content-type'],/application\/pdf/);
   if(process.env.UPTIME_SCREENSHOTS){const {writeFile}=await import('node:fs/promises');await writeFile(join(out,'mobile-profile-report.pdf'),await pdf.body())}
   await page.goto(origin+`/app/monitors/${monitors[0].id}`);await page.locator('#flow-browser').waitFor();const selected=width===1440?'firefox':'webkit';
   await page.locator('#flow-browser').selectOption(selected);await page.locator('#flow-device').selectOption('mobile');await page.locator('#save-flow-profile').click();await page.getByText('Browser and device saved in a new revision. New scheduled evidence is required.',{exact:true}).waitFor();await page.reload();await page.locator('#flow-browser').waitFor();assert.equal(await page.locator('#flow-browser').inputValue(),selected);assert.equal(await page.locator('#flow-device').inputValue(),'mobile');await shot(`saved-profile-${width}`,'.flow');
   await page.goto(origin+'/app/locations');await page.locator('#locations-table').waitFor();await shot(`locations-${width}`,'#locations-table');
   await page.goto(origin+'/app/archive');await page.locator('#definition-text').waitFor();await page.locator('#definition-text').fill(JSON.stringify({format:'uptime.monitors',version:5,monitors:[{name:'Acme mobile purchase',type:'flow',url:'https://shop.example.test/checkout',flow:{browser:'webkit',device:'mobile',intent:'Confirm sandbox purchase',steps:[{kind:'goto',url:'https://shop.example.test/checkout'}],outcomes:[{id:'confirmation',what:'text',value:'Order confirmed'}]}}]}));await page.locator('#definition-preview').click();await page.getByText('Acme mobile purchase',{exact:true}).waitFor();await shot(`profile-import-${width}`,'#definition-result');
   await page.goto(origin+'/docs/browser-flows');await page.getByRole('heading',{name:'Browser journeys and devices',exact:true}).waitFor();await shot(`profile-guide-${width}`,'main');
   console.log(`FLOW-004 browser ${width}: real mobile failure/evidence/report, profile save/reload, engine visibility, reviewed import, guide, axe and reflow passed.`);
  }
 }finally{await browser.close()}
}

export async function flowMissingBrowser({origin,missing,directory}){
 const out=resolve(process.env.UPTIME_SCREENSHOTS??join(directory,'profile-screens'));await mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
  await nextAdmissionWindow();for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(origin+`/app/monitors/${missing.id}`);await page.locator('#flow-no-browser').waitFor();assert.match(await page.locator('#flow-no-browser').textContent(),/WebKit.*Unknown/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);await page.locator('.flow').screenshot({path:join(out,`missing-engine-${width}.png`)})}
 }finally{await browser.close()}
}
