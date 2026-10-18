import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';import {join,resolve} from 'node:path';
import {chromium} from 'playwright';import {browserSignIn} from './auth-test-support.mjs';import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
const dir=await runtimeDirectory(),out=resolve(process.env.UPTIME_SCREENSHOTS??join(dir,'screens'));await mkdir(out,{recursive:true});let worker,browser;
try{
 const [port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;({worker}=await migratedWorker({port,persist:join(dir,'worker')}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
 const created=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'Nightly backup — Montréal',type:'heartbeat',heartbeat:{maxAgeMs:5000,graceMs:0,maxRunDurationMs:30000,outputMasks:['company-private']},canaryUrl:'https://example.org/',intervalMs:60000,enabled:true}});assert.equal(created.status(),201);const monitor=await created.json();
 const issue=await page.request.post(origin+`/api/monitors/${monitor.id}/heartbeat-key`,{headers:{origin},data:{}});assert.equal(issue.status(),200);const {token}=await issue.json();let sequence=0;
 const ping=async(state,data={})=>{const response=await page.request.post(origin+`/api/heartbeats/${monitor.id}/${state}`,{headers:{origin,authorization:`Bearer ${token}`,'x-heartbeat-sequence':String(++sequence)},data});assert.equal(response.status(),200)};
 for(let i=0;i<26;i++){await ping('start');if(i===0)await page.waitForTimeout(5200);await ping(i>0&&i%3===0?'fail/3':'success',i>0&&i%3===0?{output:'Backup upload refused. token=planted-secret company-private <script>alert(1)</script>'}:{});}
 console.log('Report fixture: receipt lifecycle completed.');
 const total=(await(await page.request.get(origin+`/api/v1/monitors/${monitor.id}/report`)).json()).jobRuns.length;assert.equal(total,sequence);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+`/app/monitors/${monitor.id}`);await page.locator('#report-generate').waitFor();await page.locator('#report-use-sla').check();await page.locator('#report-generate').click();await page.locator('#report-job-runs tbody tr').first().waitFor();
  const shot=async(name,selector)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);assert.ok((await page.locator('#monitor-report').ariaSnapshot()).includes('Job runs'));await page.locator(selector).screenshot({path:join(out,`${name}-${width}.png`)})};
  await shot('job-runs','#report-job-runs');const observed=[];
  for(;;){observed.push(...await page.locator('#report-job-runs tbody tr').allTextContents());if(await page.locator('#report-jobs-next').isDisabled())break;await page.locator('#report-jobs-next').click();assert.equal(await page.locator('#report-job-runs button:enabled').evaluateAll(nodes=>nodes.includes(document.activeElement)),true);}
  assert.equal(observed.length,total);assert.ok(observed.some(text=>text.includes('fail')));assert.ok(observed.some(text=>text.includes('success')));assert.equal(await page.locator('#report-job-runs script').count(),0);assert.ok(observed.every(text=>!text.includes('planted-secret')&&!text.includes('company-private')&&!text.includes(token)));
  await shot('job-runs-last','#report-job-runs');const retained=await page.locator('#report-job-runs').textContent();await page.waitForTimeout(5500);assert.equal(await page.locator('#report-job-runs').textContent(),retained);await shot('report-summary','.report-snapshot');
  const [json]=await Promise.all([page.waitForEvent('download'),page.locator('#report-json').click()]);await json.saveAs(join(out,`report-${width}.json`));
  const pdfResponse=page.waitForResponse(r=>r.url().includes('/report?')&&r.url().includes('format=pdf'));
  const download=page.waitForEvent('download',{timeout:30000}).catch(()=>null);await page.locator('#report-pdf').click();const response=await pdfResponse;assert.equal(response.status(),200,response.ok()?'':await response.text());const pdf=await download;assert.ok(pdf,'successful PDF response downloads');await pdf.saveAs(join(out,`report-${width}.pdf`));
  const text=await page.locator('#report-job-runs').textContent();assert.ok(!text.includes('planted-secret'));
  console.log(`REPORT-001 browser ${width}: all ${total} receipt records paged, focus and snapshot retained, escaped/masked output, PDF/JSON downloaded, axe/reflow passed.`);
 }
}finally{await browser?.close();await worker?.dispose();await cleanupDirectory(dir)}
