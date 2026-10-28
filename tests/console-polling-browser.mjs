// The console's five-second refresh updates data in place: on a monitor's page an open fold and the disclosure inside it,
// Full check details, and an open rule editor with the value typed in it all stay open, the page keeps its nodes and its
// scroll position, and a change made elsewhere (a pause) still appears without a reload. The monitor list keeps its
// filters folded behind Filter and its selection actions out of sight until a monitor is ticked; an open filter panel
// and a ticked monitor survive the refresh. In Settings the sidebar is the Settings menu: a refresh keeps it, a typed
// invitation and an open fold, and switching between the menus and areas rebuilds neither menu and loads no document.
// At 1440 and 390.
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
// A monitor page's regions, which a refresh must update in place rather than rebuild.
const panels=['#monitor-page','#status-card','#rules-card','#edit-latencyMs','#recent-checks','#raw-history','#folds-card','details#alerts','#alert-route-summary','details#details','#monitor-incidents'];
try{
 const [port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
 const created=await page.request.post(origin+'/api/monitors',{headers:{origin},data:{name:'Checkout',url:'https://example.com/checkout',canaryUrl:'https://example.org/',intervalMs:60000,assertions:{status:200,latencyMs:3000},enabled:true}});
 assert.equal(created.status(),201);const monitor=await created.json();
 const enable=async enabled=>{const {monitors}=await(await page.request.get(origin+'/api/overview')).json(),current=monitors.find(m=>m.id===monitor.id);assert.equal((await page.request.patch(origin+`/api/monitors/${monitor.id}`,{headers:{origin},data:{...current.definition,enabled}})).status(),200)};
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(origin+`/app/monitors/${monitor.id}`);await page.locator('html.signed-in').waitFor();
  await page.locator('details#alerts > summary').click();await page.locator('#alert-route-summary details').waitFor();await page.locator('#alert-route-summary details > summary').click();
  await page.locator('details#details > summary').click();
  await page.locator('#edit-latencyMs > summary').click();await page.locator('#edit-latencyMs input[name=seconds]').fill('7');
  await page.locator('#edit-latencyMs').evaluate(details=>details.scrollIntoView({block:'center'}));
  const scrolled=await page.evaluate(()=>scrollY);assert.ok(scrolled>0,'the monitor page scrolls');
  const disclosuresOpen=async()=>{
   assert.ok(await page.locator('details#alerts').evaluate(details=>details.open),'the Alerts fold stays open');
   assert.ok(await page.locator('#alert-route-summary details').evaluate(details=>details.open),'the disclosure inside it stays open');
   assert.ok(await page.locator('details#details').evaluate(details=>details.open),'Full check details stays open');
   assert.ok(await page.locator('#edit-latencyMs').evaluate(details=>details.open),'the rule editor stays open');
   assert.equal(await page.locator('#edit-latencyMs input[name=seconds]').inputValue(),'7','the typed value stays');
  };
  const panelsKept=async()=>assert.deepEqual(await page.evaluate(selectors=>selectors.filter((selector,i)=>window.__panels[i]!==document.querySelector(selector)),panels),[],'monitor page regions stay mounted');
  await page.evaluate(selectors=>{window.__panels=selectors.map(selector=>document.querySelector(selector))},panels);
  // Steady refreshes: nothing moves.
  const began=Date.now();do{await twoPolls(page);await disclosuresOpen();await panelsKept();assert.equal(await page.evaluate(()=>scrollY),scrolled,'scroll holds through 60 seconds of polls')}while(Date.now()-began<60000);
  assert.equal(await page.evaluate(()=>scrollY),scrolled,'the monitor page keeps its scroll position');
  // A pause made elsewhere changes the state, its notes and the history; it shows without a reload, in place.
  await enable(false);await twoPolls(page);
  assert.equal(await page.locator('#monitor-state').textContent(),'Paused','a pause made elsewhere shows without a reload');
  await disclosuresOpen();await panelsKept();
  await enable(true);
  await page.goto(origin+'/app/settings/alerts');await page.locator('html.signed-in').waitFor();const help=page.locator('.email-setup:visible');await help.waitFor();
  await help.locator('summary').click();await mark(page);await twoPolls(page);
  assert.ok(await help.evaluate(details=>details.open),'the help disclosure stays open');
  assert.deepEqual(await replaced(page),[],'notifications view keeps every node');
  await page.goto(origin+'/app/settings/people');await page.locator('#operators .operator-row').first().waitFor();
  // Each area's one-time reads finish within the first refreshes; only then are its nodes marked.
  await page.locator('#invite-email').fill('synthetic-uptime-9@example.test');await twoPolls(page);await mark(page);await twoPolls(page);
  assert.deepEqual(await replaced(page),[],'an area keeps every node');assert.ok(await page.locator('.nav-settings').isVisible(),'the Settings menu stays');
  assert.equal(await page.locator('#invite-email').inputValue(),'synthetic-uptime-9@example.test','the typed invitation stays');
  await page.evaluate(()=>{window.__menus=[...document.querySelectorAll('.sidebar *')]});
  let loads=0;const load=request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())loads++};page.on('request',load);
  for(const [name,path]of [['Monitors','/app/monitors'],['Settings','/app/settings/alerts'],['Backup and files','/app/settings/backup']]){await page.locator('.sidebar nav').getByRole('link',{name,exact:true}).click();await page.waitForURL(origin+path)}
  await page.getByText('Restoring an older backup',{exact:true}).click();await twoPolls(page);await mark(page);await twoPolls(page);
  assert.ok(await page.locator('details.archive-older').evaluate(details=>details.open),'the open fold stays open');assert.deepEqual(await replaced(page),[],'Backup and files keeps every node');
  await page.locator('.sidebar nav').getByRole('link',{name:'Monitors',exact:true}).click();await page.waitForURL(origin+'/app/monitors');page.off('request',load);
  assert.equal(loads,0,'switching menus and areas loads no document');assert.deepEqual(await page.evaluate(()=>window.__menus.filter(element=>!element.isConnected).length),0,'neither menu is rebuilt');
  await page.goto(origin+'/app/monitors');await page.locator('.catalog-rows .monitor-row').first().waitFor();
  const filter=page.getByRole('button',{name:'Filter',exact:true}),panel=page.locator('#catalog-filters');
  assert.ok(await panel.isHidden(),'the filters start folded');
  assert.equal(await page.getByRole('button',{name:'Pause',exact:true}).count(),0,'nothing acts on a selection before a monitor is ticked');
  await filter.click();await page.locator('#catalog-filter-state').focus();await page.keyboard.press('Escape');
  assert.ok(await panel.isHidden(),'Escape folds the filters');assert.ok(await filter.evaluate(button=>document.activeElement===button),'Escape returns focus to Filter');
  await filter.click();await page.getByRole('checkbox',{name:'Select monitor',exact:true}).check();
  await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
  await mark(page);await twoPolls(page);
  assert.deepEqual(await replaced(page),[],'monitor list keeps every row');
  assert.ok(await panel.isVisible(),'the open filters stay open');assert.equal(await page.locator('.catalog-selected').textContent(),'1 selected','the ticked monitor stays ticked');
  console.log(`CONSOLE-POLL ${width}: folds, a typed rule edit, disclosures, scroll and nodes survive 60 seconds of refreshes; a background pause still shows.`);
 }
}finally{await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}
