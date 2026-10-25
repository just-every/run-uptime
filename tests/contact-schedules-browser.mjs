import {fixture} from './resilience/support.mjs';
import {proveOwnIncidentCorrelation} from './incident-correlation-support.mjs';
import {proveOwnIncidentCorrelationConsole} from './incident-correlation-browser-support.mjs';
// ROUTING-002: reviewed schedules through the real console at desktop and phone widths.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
const directory=await runtimeDirectory(),screens=process.env.UPTIME_SCREENSHOTS??join(directory,'screens'),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
let worker,browser;
try{
 ({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext(),page=await context.newPage();await browserSignIn(page,origin);
 const post=async(path,data)=>{const r=await page.request.post(origin+path,{headers:{origin},data});assert.ok(r.ok(),`${path}: ${r.status()}`);return r.json()};
 const a=await post('/api/notifications/destinations',{name:'Checkout operations',kind:'email',address:'operations@example.test'}),b=await post('/api/notifications/destinations',{name:'Payments escalation',kind:'webhook',url:'https://alerts.example.com/checkout'});
 const monitor=await post('/api/monitors',{name:'Checkout API',url:'https://example.com/checkout',enabled:false,service:'Storefront',group:'Production'});
 await mkdir(screens,{recursive:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+`/app/monitors/${monitor.id}`);await page.locator('html.signed-in').waitFor();
  await page.getByRole('button',{name:'Edit alert route',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Recipient policy',{exact:true}).selectOption('selected');
  for(const id of [a.id,b.id])await dialog.locator(`[name=destination][value="${id}"]`).check();
  const row=dialog.locator('[data-route-contact]').filter({has:page.locator(`[name=destination][value="${b.id}"]`)});
  await row.getByLabel('Delay (minutes)',{exact:true}).fill('10');await row.getByLabel('Repeat every (minutes; 0 = off)',{exact:true}).fill('30');await row.getByLabel('Maximum repeats (blank = unlimited)',{exact:true}).fill('3');await row.getByLabel('Stop repeats on acknowledgement',{exact:true}).check();
  await dialog.locator('#route-scope').scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`schedule-form-${width}.png`),fullPage:true});
  await row.scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`schedule-fields-${width}.png`),fullPage:true});
  await dialog.getByRole('button',{name:'Preview route',exact:true}).click();await dialog.locator('#route-preview').waitFor({state:'visible'});
  assert.match(await dialog.locator('#route-preview').textContent(),/\+10 minutes after confirmation; repeat every 30 minutes \(max 3\)/);
  await dialog.locator('#route-preview h3').first().scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`schedule-preview-${width}.png`),fullPage:true});
  await dialog.locator('#route-preview .route-recipients > li').filter({hasText:'Payments escalation'}).scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`schedule-reviewed-contact-${width}.png`),fullPage:true});
  await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);
  assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth));
  await dialog.getByRole('button',{name:'Apply reviewed route',exact:true}).click();await dialog.waitFor({state:'detached'});
  await page.reload();await page.locator('html.signed-in').waitFor();await page.locator('#alert-route-summary details').evaluate(e=>e.open=true);await page.locator('#alert-route-summary').scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`schedule-saved-${width}.png`),fullPage:true});
  assert.match(await page.locator('#alert-route-summary').textContent(),/\+10 minutes after confirmation/);
  await page.getByRole('button',{name:'Edit alert route',exact:true}).click();const imported=page.getByRole('dialog');
  await imported.getByText('Import a saved contact schedule',{exact:true}).click();await imported.getByLabel('Saved source JSON',{exact:true}).fill(JSON.stringify({assignedAlertContacts:[{alertContactId:123,threshold:10,recurrence:30}]}));await imported.getByLabel('Source contact ID',{exact:true}).fill('123');await imported.locator('#route-import-destination-0').selectOption(b.id);await imported.getByRole('button',{name:'Preview imported schedule',exact:true}).click();await imported.locator('#route-preview').waitFor({state:'visible'});
  assert.match(await imported.locator('#route-preview').textContent(),/repeat every 30 minutes \(unlimited\)/);await imported.locator('#route-preview h3').first().scrollIntoViewIfNeeded();await page.screenshot({path:join(screens,`schedule-import-${width}.png`),fullPage:true});
  await imported.getByRole('button',{name:'Close',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const [slug,heading] of [['notifications','Contact delays and reminders'],['monitors','Incident notes and follow-up']]){await page.goto(origin+'/docs/'+slug);await page.getByRole('heading',{name:heading,exact:true}).evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:join(screens,`${slug}-guide-${width}.png`)});if(width===390){await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.screenshot({path:join(screens,`${slug}-guide-end-${width}.png`)})}assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 }
 console.log(`ROUTING-002 desktop/phone journeys passed; screenshots: ${screens}`);
}finally{await browser?.close();await worker?.dispose();await cleanupDirectory(directory)}

// Keep browser execution in this existing matrix.browser=true journey.
const correlation=await fixture();
try{await proveOwnIncidentCorrelation(correlation,proveOwnIncidentCorrelationConsole)}finally{await correlation.close()}

const {proveCombinedIncident}=await import('./incident-combined-support.mjs');
const {proveCombinedIncidentConsole}=await import('./incident-correlation-browser-support.mjs');
await proveCombinedIncident(proveCombinedIncidentConsole);
