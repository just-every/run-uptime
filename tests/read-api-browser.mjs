import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {metricsFixture} from './metrics-fixture.mjs';
const directory=await runtimeDirectory(),out=resolve(process.env.UPTIME_SCREENSHOTS??join(directory,'screens'));await mkdir(out,{recursive:true});let worker,browser;
try{
 const [port]=await availablePorts(1),origin='http://127.0.0.1:'+port;let DB;
 ({worker,DB}=await migratedWorker({port,persist:join(directory,'worker')}));const {ids}=await metricsFixture(DB,origin);
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
 const check=async(name,selector)=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);await page.locator(selector).screenshot({path:join(out,name+'.png')})};
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/app/monitors/'+ids[0]);await page.locator('#report-period').waitFor();
  assert.ok((await page.locator('#monitor-report').ariaSnapshot()).includes('Month to date'));
  for(const period of ['last-month','ytd']){
   await page.locator('#report-period').selectOption(period);await page.locator('#report-zone').fill('America/New_York');await page.locator('#report-bucket').selectOption('1d');
   const ready=page.waitForResponse(r=>r.url().includes('/report?')&&r.request().method()==='GET');await page.locator('#report-generate').click();const response=await ready;assert.equal(response.status(),200);const report=await response.json();
   await page.getByText('Report generated.',{exact:true}).waitFor();assert.equal(report.period.period,period);assert.equal(report.period.timeZone,'America/New_York');
   await check('calendar-'+period+'-'+width,'#monitor-report');
   const query=new URLSearchParams({from:String(report.period.from),to:String(report.period.to),timeZone:report.period.timeZone,monitor:ids[0]});
   const bulk=await page.request.get(origin+'/api/v1/uptime?'+query);assert.equal(bulk.status(),200);assert.deepEqual((await bulk.json()).monitors[0].availability,report.availability);
   const csv=await page.request.get(origin+'/api/v1/uptime?'+query,{headers:{accept:'text/csv'}});assert.equal(csv.status(),200);assert.match(await csv.text(),/observed_seconds/);
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#report-json').click()]);const file=join(directory,'snapshot-'+width+'.json');await download.saveAs(file);assert.deepEqual(JSON.parse(await readFile(file,'utf8')).availability,report.availability);
  }
  await page.reload();await page.locator('#report-period').waitFor();
  await page.getByRole('link',{name:'Monitoring API and CSV guide',exact:true}).click();await page.getByRole('heading',{level:1,name:'Monitoring API and CSV',exact:true}).waitFor();
  await check('api-guide-'+width,'main');
  await page.getByRole('heading',{name:'Calendar periods and time zones',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'api-calendar-guide-'+width+'.png')});
  const specResponse=await fetch(origin+'/api/v1/openapi.json');assert.equal(specResponse.status,200,'OpenAPI requires no owner credential');const spec=await specResponse.json();assert.ok(spec.paths['/api/v1/uptime']);
  const incidents=await page.request.get(origin+'/api/v1/incidents?limit=1',{headers:{accept:'text/csv'}});assert.equal(incidents.status(),200);assert.match(incidents.headers()['content-type'],/text\/csv/);assert.ok(incidents.headers()['x-next-cursor']);
 }
 await context.clearCookies();const denied=await page.request.get(origin+'/api/v1/monitors');assert.equal(denied.status(),401);
 console.log('READAPI-001 browser subset PASS calendar report selections/downloads, exact bulk parity, paged incident CSV, anonymous OpenAPI and signed-out refusal; inspected 1440/390 reflow/axe/tree.');
}finally{await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
