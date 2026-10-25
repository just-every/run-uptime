import assert from 'node:assert/strict';
import {join} from 'node:path';
export async function proveReportScheduleControls({page,origin,monitor,destination,width,out}){
 const panel=page.locator('#report-schedule-controls');await panel.getByText('Schedule a report',{exact:true}).click();
 const form=panel.locator('form');await form.getByLabel('Monitor',{exact:true}).selectOption(monitor.id);await form.getByLabel('Destination',{exact:true}).selectOption(destination.id);
 const local=new Date(Date.now()+600000);local.setMinutes(local.getMinutes()-local.getTimezoneOffset());const due=local.toISOString().slice(0,16);
 await form.getByLabel('Send at (local time)',{exact:true}).fill(due);await form.getByLabel('Report time zone',{exact:true}).fill('America/New_York');
 await page.waitForTimeout(5500);assert.equal(await form.getByLabel('Report time zone',{exact:true}).inputValue(),'America/New_York','polling retains schedule draft');
 await panel.screenshot({path:join(out,`report-schedule-form-${width}.png`)});
 await form.getByRole('button',{name:'Schedule report',exact:true}).click();await panel.getByRole('status').filter({hasText:'Report scheduled.'}).waitFor();
 const schedules=await(await page.request.get(origin+`/api/monitors/${monitor.id}/report-schedules`)).json();const saved=schedules.find(s=>s.dueAt===new Date(due).getTime());assert.ok(saved);assert.equal(saved.state,'queued');
 await panel.getByRole('button',{name:'Cancel scheduled report',exact:true}).click();await panel.getByRole('status').filter({hasText:'Report cancelled.'}).waitFor();
 await page.reload();await panel.locator(`[data-report-id="${saved.id}"]`).getByText(/Cancelled by owner/).waitFor();
 const retained=await(await page.request.get(origin+`/api/monitors/${monitor.id}/report-schedules/${saved.id}`)).json();assert.equal(retained.code,'report_cancelled');assert.equal(retained.attempts,0);
 await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth));
 await panel.screenshot({path:join(out,`schedule-cancelled-${width}.png`)});
}

// Inspector used by the existing reporting browser registration's real recurring
// fixture, so API/CLI/provider outcomes and console rows describe the same runs.
export async function proveRecurringReportConsole({f,monitors,email,destination,schedules,phase}){
 const {chromium}=await import('playwright'),{finishSetup}=await import('./auth-test-support.mjs'),{mkdir,readFile}=await import('node:fs/promises');await finishSetup(f.origin,f.cookie);
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const context=await browser.newContext(),[name,...parts]=f.cookie.split('=');await context.addCookies([{name,value:parts.join('='),url:f.origin}]);const page=await context.newPage();await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort());
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(f.origin+'/app/notifications');await page.locator('html.signed-in').waitFor();const panel=page.locator('#report-schedule-controls');
   if(phase==='frozen'){
    for(const schedule of schedules){const row=panel.locator(`[data-report-id="${schedule.id}"]`);await row.getByRole('button',{name:'Show report runs',exact:true}).click();await row.getByText(new RegExp(schedule.runs[0].state)).waitFor();const download=page.waitForEvent('download');await row.getByRole('button',{name:'Download report JSON',exact:true}).click();const saved=JSON.parse(await readFile(await(await download).path(),'utf8'));assert.deepEqual(saved.availability,schedule.runs[0].report.availability);if(saved.service)assert.deepEqual(saved.service,schedule.runs[0].report.service)}
    await panel.getByText('Schedule a report',{exact:true}).click();const form=panel.locator('form');await form.getByLabel('Monitor',{exact:true}).selectOption(monitors[0].id);await form.getByLabel('Destination',{exact:true}).selectOption(email.id);await form.getByLabel('Report time zone',{exact:true}).fill('America/New_York');
    for(const frequency of ['daily','weekly','monthly']){
     await form.getByLabel('Frequency',{exact:true}).selectOption(frequency);await form.getByLabel('Aggregate this monitor’s service',{exact:true}).setChecked(frequency!=='daily');
     await form.getByLabel('Send at (local time)',{exact:true}).fill('2026-10-31T13:15');const preview=page.waitForResponse(r=>r.url().endsWith('/report-schedules/preview')&&r.request().method()==='POST');await form.getByRole('button',{name:'Preview schedule dates',exact:true}).click();assert.equal((await preview).status(),200);await form.locator('[data-report-preview]').getByText(/America\/New_York/).waitFor();
     const local=new Date(Date.now()+600000);local.setMinutes(local.getMinutes()-local.getTimezoneOffset());await form.getByLabel('Send at (local time)',{exact:true}).fill(local.toISOString().slice(0,16));
     const created=page.waitForResponse(r=>r.url().endsWith(`/api/monitors/${monitors[0].id}/report-schedules`)&&r.request().method()==='POST');await form.getByRole('button',{name:'Schedule report',exact:true}).click();const response=await created;assert.equal(response.status(),201);const schedule=await response.json();assert.equal(schedule.frequency,frequency);assert.equal(schedule.service,frequency==='daily'?null:monitors[0].definition.service);const row=panel.locator(`[data-report-id="${schedule.id}"]`);await row.getByRole('button',{name:'Cancel recurring report',exact:true}).click();await panel.getByText('Recurring report cancelled.',{exact:true}).waitFor();await row.getByText(/Cancelled by owner/).waitFor();
    }
   }else for(const schedule of schedules)await panel.locator(`[data-report-id="${schedule.id}"]`).getByText(new RegExp({report_cancelled:'Cancelled by owner',report_initiator_revoked:'Stopped: owner authority changed',report_destination_revoked:'Stopped: destination unavailable'}[schedule.code])).waitFor();
   await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth));
   if(process.env.UPTIME_SCREENSHOTS){await mkdir(process.env.UPTIME_SCREENSHOTS,{recursive:true});await panel.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`recurring-report-${phase}-${width}.png`)})}
   if(phase==='frozen')for(const [slug,title] of [['scheduled-reports','Scheduled reports'],['security','Security'],['read-api','Monitoring API and CSV'],['definitions','Definition files']]){await page.goto(f.origin+'/docs/'+slug);await page.getByRole('heading',{name:title,exact:true}).first().waitFor();await page.addScriptTag({path:new URL('../node_modules/axe-core/axe.min.js',import.meta.url).pathname});assert.deepEqual((await page.evaluate(()=>axe.run(document))).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(process.env.UPTIME_SCREENSHOTS)await page.screenshot({path:join(process.env.UPTIME_SCREENSHOTS,`guide-${slug}-${width}.png`)})}
  }
 }finally{await browser.close()}
 console.log(`REPORT-001 recurring console ${phase} PASS at 1440/390: named cadence/zone/service, frozen download/outcome, cancellation/revocation reasons, axe/reflow.`);
}
