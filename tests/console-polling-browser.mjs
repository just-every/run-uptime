// The console's five-second refresh updates data in place: an open disclosure stays open, the page keeps its nodes and
// its scroll position, and a change made elsewhere (a pause) still appears without a reload. At 1440 and 390.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
const directory=await runtimeDirectory();let worker,browser;
const overviewRead=response=>new URL(response.url()).pathname==='/api/overview'&&response.request().method()==='GET'&&response.ok();
// Two completed refreshes, each followed by its redraw and the reads it starts.
async function twoPolls(page){for(let i=0;i<2;i++){await page.waitForResponse(overviewRead,{timeout:12000});await page.waitForLoadState('networkidle')}}
// Marks every element under the console now, then later counts the marked ones the refresh replaced.
const mark=page=>page.evaluate(()=>{window.__marked=[...document.querySelectorAll('.app *')]});
const replaced=page=>page.evaluate(()=>window.__marked.filter(element=>!element.isConnected).map(element=>element.id||element.className||element.localName));
// A monitor page's panels, which a refresh must update in place rather than rebuild.
const panels=['#monitor-page','#monitor-report','#monitor-incidents','#raw-history','#alert-route-summary','#assertion-definition','#coverage-heading'];
try{
 const [port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
 const created=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'Nightly backup',type:'heartbeat',heartbeat:{maxAgeMs:60000,graceMs:0,maxRunDurationMs:30000},canaryUrl:'https://example.org/',intervalMs:60000,enabled:true}});
 assert.equal(created.status(),201);const monitor=await created.json();
 const enable=async enabled=>{const {monitors}=await(await page.request.get(origin+'/api/overview')).json(),current=monitors.find(m=>m.id===monitor.id);assert.equal((await page.request.patch(origin+`/api/monitors/${monitor.id}`,{headers:{origin},data:{...current.definition,enabled}})).status(),200)};
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(origin+`/app/monitors/${monitor.id}`);await page.locator('html.signed-in').waitFor();await page.locator('#alert-route-summary details').waitFor();
  await page.locator('#assertion-definition-summary').click();await page.locator('#alert-route-summary summary').click();
  await page.locator('#more-menu > summary').click();
  await page.locator('#assertion-definition').evaluate(details=>details.scrollIntoView({block:'center'}));
  const scrolled=await page.evaluate(()=>scrollY);assert.ok(scrolled>0,'the monitor page scrolls');
  const disclosuresOpen=async()=>{assert.ok(await page.locator('#assertion-definition').evaluate(details=>details.open),'check details stay open');assert.ok(await page.locator('#alert-route-summary details').evaluate(details=>details.open),'alert recipients stay open');assert.ok(await page.locator('#more-menu').evaluate(details=>details.open),'the action menu stays open')};
  const panelsKept=async()=>assert.deepEqual(await page.evaluate(selectors=>selectors.filter((selector,i)=>window.__panels[i]!==document.querySelector(selector)),panels),[],'monitor page panels stay mounted');
  await page.evaluate(selectors=>{window.__panels=selectors.map(selector=>document.querySelector(selector))},panels);
  // Steady refreshes: nothing moves.
  const began=Date.now();do{await twoPolls(page);await disclosuresOpen();await panelsKept();assert.equal(await page.evaluate(()=>scrollY),scrolled,'scroll holds through 60 seconds of polls')}while(Date.now()-began<60000);
  assert.equal(await page.evaluate(()=>scrollY),scrolled,'the monitor page keeps its scroll position');
  // A pause made elsewhere changes the state, its notes and the history; it shows without a reload, in place.
  await enable(false);await twoPolls(page);
  assert.equal(await page.locator('#monitor-state').textContent(),'Paused','a pause made elsewhere shows without a reload');
  await disclosuresOpen();await panelsKept();
  await enable(true);
  await page.goto(origin+'/app/notifications');await page.locator('html.signed-in').waitFor();const help=page.locator('.email-setup:visible');await help.waitFor();
  await help.locator('summary').click();await mark(page);await twoPolls(page);
  assert.ok(await help.evaluate(details=>details.open),'the help disclosure stays open');
  assert.deepEqual(await replaced(page),[],'notifications view keeps every node');
  await page.goto(origin+'/app/monitors');await page.locator('.catalog-rows tr').first().waitFor();
  await mark(page);await twoPolls(page);
  assert.deepEqual(await replaced(page),[],'monitor list keeps every row');
  console.log(`CONSOLE-POLL ${width}: menus, disclosures, scroll and nodes survive 60 seconds of refreshes; a background pause still shows.`);
 }
}finally{await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
